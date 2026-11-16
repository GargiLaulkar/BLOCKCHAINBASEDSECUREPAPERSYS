import React, { useMemo, useRef, useState } from 'react';
import { Button, EmptyState, HashChip, Rosette, StateStamp } from '@sigil/ui';
import { examStateFromChain, selectRosetteHash } from '../command-centre/logic';

export interface PublicExamSummary {
  examId: string;
  chainId: number;
  state: number;
  metaHash: string;
  releaseOpensAt: string;
  examStartsAt: string;
  examEndsAt: string;
  threshold: number;
  bankHash: string | null;
}

interface PublicEventRecord {
  id: string;
  blockNumber: string;
  logIndex: number;
  txHash: string;
  examId: string | null;
  type: string;
  actor: string | null;
  payloadJson: unknown;
  blockTimestamp: string;
}

interface PublicEventResponse {
  events: PublicEventRecord[];
  nextCursor: string | null;
}

const EMPTY_BYTES32 = `0x${'0'.repeat(64)}`;
const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:4000';

const SENSITIVE_KEY_NAMES = new Set([
  'seed',
  'share',
  'secret',
  'private',
  'passphrase',
  'reveal',
  'ciphertext',
  'keymaterial',
  'key_material',
  'secretvalue',
  'secret_value',
  'privatekey',
  'private_key',
  'sharedata',
  'share_data',
  'encryptionkey',
  'encryption_key',
  'secret_share',
  'share_value',
  'secret_key',
  'private_key_material',
  'encryption_key_material',
  'key_material',
  'private_key_share',
]);

function normalizeKeyName(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKeyName(key);
  if (!normalized) {
    return false;
  }

  if (normalized === 'encrypted_envelope' || normalized === 'encryptedenvelope') {
    return false;
  }

  return SENSITIVE_KEY_NAMES.has(normalized);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sanitizePublicEventPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePublicEventPayload(item));
  }

  if (isPlainObject(value)) {
    const next: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        next[key] = '[REDACTED]';
        continue;
      }
      next[key] = sanitizePublicEventPayload(nestedValue);
    }
    return next;
  }

  return value;
}

function summarizePayload(payload: unknown): string {
  const clean = sanitizePublicEventPayload(payload);
  const text = JSON.stringify(clean, null, 2);
  if (!text || text === '{}') return 'No public payload details';
  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_ORIGIN}${path}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = typeof payload?.error?.message === 'string'
      ? payload.error.message
      : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function isExamHashMatch(exam: PublicExamSummary, lower: string): boolean {
  if (exam.metaHash.toLowerCase() === lower) return true;
  return Boolean(exam.bankHash && exam.bankHash.toLowerCase() === lower);
}

async function fetchExamBySearch(search: string): Promise<PublicExamSummary> {
  const trimmed = search.trim();
  if (!trimmed) {
    throw new Error('Enter an exam number or public hash to search.');
  }

  if (/^\d+$/.test(trimmed)) {
    try {
      return await requestJson<PublicExamSummary>(`/api/exams/${trimmed}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      if (message.toLowerCase().includes('not found')) {
        throw new Error(`No matching public exam found for "${trimmed}".`);
      }
      throw error;
    }
  }

  const lower = trimmed.toLowerCase();
  const exams = await requestJson<PublicExamSummary[]>('/api/exams');
  const match = exams.find((exam) => isExamHashMatch(exam, lower));

  if (!match) {
    throw new Error(`No matching public exam found for "${trimmed}".`);
  }

  return match;
}

async function fetchPublicTimeline(examId: string): Promise<PublicEventRecord[]> {
  const events: PublicEventRecord[] = [];
  let cursor: string | null = null;

  do {
    const query = new URLSearchParams({ exam: examId, limit: '100' });
    if (cursor) query.set('cursor', cursor);

    const response = await requestJson<PublicEventResponse>(`/api/events?${query.toString()}`);
    if (!Array.isArray(response.events)) {
      throw new Error('Event feed response was malformed.');
    }
    events.push(...response.events.map((event) => ({
      ...event,
      payloadJson: sanitizePublicEventPayload(event.payloadJson ?? {}),
    })));
    cursor = response.nextCursor;
  } while (cursor);

  return events;
}

function toSafeIsoDateTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';

  const cleaned = typeof value === 'string' ? value.trim() : value;
  if (cleaned === '') return '';

  if (typeof cleaned === 'string' && !/^\d+(?:\.\d+)?$/.test(cleaned)) {
    return '';
  }

  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) {
    return '';
  }

  const date = new Date(numeric * 1000);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString();
}

function formatTimestampSeconds(value: string | number | null | undefined): string {
  const iso = toSafeIsoDateTime(value);
  if (!iso) return 'Unknown time';
  return iso;
}

const statusText = {
  idle: 'Ready to verify',
  loading: 'Searching...',
  ready: 'Ready to verify',
  'not-found': 'No matching public exam found',
  error: 'Public verification unavailable',
} as const;

export function PublicVerifierPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [exam, setExam] = useState<PublicExamSummary | null>(null);
  const [events, setEvents] = useState<PublicEventRecord[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'not-found' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  const requestIdRef = useRef(0);

  const clearSearchState = () => {
    requestIdRef.current += 1;
    setExam(null);
    setEvents([]);
    setStatus('idle');
    setError('');
  };

  const handleSearch = async (event?: React.FormEvent) => {
    if (event) {
      event.preventDefault();
    }

    const trimmed = searchTerm.trim();
    if (!trimmed) {
      clearSearchState();
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    setStatus('loading');
    setError('');

    try {
      const nextExam = await fetchExamBySearch(trimmed);
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      const nextEvents = await fetchPublicTimeline(nextExam.examId);
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      setExam(nextExam);
      setEvents(nextEvents);
      setStatus('ready');
    } catch (caughtError) {
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      const message = caughtError instanceof Error ? caughtError.message : 'Unable to load the public verifier data.';
      setExam(null);
      setEvents([]);
      setStatus(message.toLowerCase().includes('not found') || message.toLowerCase().includes('match') ? 'not-found' : 'error');
      setError(message);
    }
  };

  const timeline = useMemo(
    () => [...events].sort((left, right) => Number(right.blockTimestamp) - Number(left.blockTimestamp)),
    [events]
  );

  if (status === 'idle' || status === 'not-found' || status === 'error') {
    return (
      <section className="public-verifier public-verifier--empty" aria-labelledby="public-verifier-title">
        <div className="public-verifier__intro">
          <p className="sigil-mono public-verifier__eyebrow">Public verifier</p>
          <h1 id="public-verifier-title">Verify an examination without a wallet</h1>
          <p>Search by exam number or any public hash connected to a published exam. Only public commitments and event history are displayed.</p>
        </div>

        <form className="public-verifier__search" onSubmit={handleSearch}>
          <label htmlFor="public-verifier-search">Search by exam ID or hash</label>
          <div className="public-verifier__search-row">
            <input
              id="public-verifier-search"
              type="text"
              value={searchTerm}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setSearchTerm(nextValue);
                if (nextValue.trim() === '') {
                  clearSearchState();
                }
              }}
              placeholder="e.g. 42 or 0x..."
              aria-describedby="public-verifier-search-help"
            />
            <Button type="submit">
              Search
            </Button>
          </div>
          <small id="public-verifier-search-help">Public data only: no wallet, no seed, no private share material.</small>
        </form>

        {error && (
          <div className="public-verifier__message public-verifier__message--alert" role="alert">
            {error}
          </div>
        )}

        <EmptyState
          title={statusText[status]}
          description={status === 'not-found'
            ? 'Try an exam number, metaHash, or bankHash from the chain.'
            : status === 'error'
              ? 'The public verification service could not complete that lookup. Please try again later.'
              : 'Use the search bar above to look up a public exam record and its event timeline.'}
        />
      </section>
    );
  }

  if (status === 'loading') {
    return (
      <section className="public-verifier" aria-live="polite" aria-busy="true">
        <div className="public-verifier__loading" />
        <div className="public-verifier__loading public-verifier__loading--body" />
      </section>
    );
  }

  if (!exam) {
    return null;
  }

  const stateName = examStateFromChain(Number(exam.state)) ?? 'Draft';
  const rosetteHash = selectRosetteHash(stateName, exam.metaHash, exam.bankHash ?? EMPTY_BYTES32);

  return (
    <section className="public-verifier public-verifier--ready" aria-labelledby="public-verifier-result-title">
      <header className="public-verifier__header">
        <div className="public-verifier__rosette-wrap">
          <Rosette hash={rosetteHash} size={54} title="Exam public checksum" />
        </div>
        <div className="public-verifier__title-block">
          <p className="sigil-mono public-verifier__eyebrow">Public verifier</p>
          <h1 id="public-verifier-result-title">Exam No. {exam.examId}</h1>
        </div>
        <StateStamp state={stateName} />
      </header>

      <form className="public-verifier__search public-verifier__search--inline" onSubmit={handleSearch}>
        <label htmlFor="public-verifier-search-ready">Search by exam ID or hash</label>
        <div className="public-verifier__search-row">
          <input
            id="public-verifier-search-ready"
            type="text"
            value={searchTerm}
            onChange={(event) => {
              const nextValue = event.currentTarget.value;
              setSearchTerm(nextValue);
              if (nextValue.trim() === '') {
                clearSearchState();
              }
            }}
            placeholder="e.g. 42 or 0x..."
          />
          <Button type="submit" variant="secondary">Search</Button>
        </div>
      </form>

      {error && (
        <div className="public-verifier__message public-verifier__message--alert" role="alert">
          {error}
        </div>
      )}

      <div className="public-verifier__grid">
        <article className="public-verifier__panel">
          <h2>Public exam record</h2>
          <dl className="public-verifier__facts">
            <div><dt>Chain</dt><dd>{exam.chainId}</dd></div>
            <div><dt>State</dt><dd>{stateName}</dd></div>
            <div><dt>Threshold</dt><dd>{exam.threshold}</dd></div>
            <div><dt>Release opens</dt><dd><time dateTime={toSafeIsoDateTime(exam.releaseOpensAt)}>{formatTimestampSeconds(exam.releaseOpensAt)}</time></dd></div>
            <div><dt>Exam starts</dt><dd><time dateTime={toSafeIsoDateTime(exam.examStartsAt)}>{formatTimestampSeconds(exam.examStartsAt)}</time></dd></div>
            <div><dt>Exam ends</dt><dd><time dateTime={toSafeIsoDateTime(exam.examEndsAt)}>{formatTimestampSeconds(exam.examEndsAt)}</time></dd></div>
          </dl>
        </article>

        <article className="public-verifier__panel">
          <h2>Public commitments</h2>
          <dl className="public-verifier__facts">
            <div><dt>metaHash</dt><dd><HashChip hash={exam.metaHash} leadLength={6} tailLength={4} /></dd></div>
            <div><dt>bankHash</dt><dd>{exam.bankHash ? <HashChip hash={exam.bankHash} leadLength={6} tailLength={4} /> : 'Not yet committed'}</dd></div>
            <div><dt>Rosette</dt><dd><HashChip hash={rosetteHash} leadLength={6} tailLength={4} /></dd></div>
            <div><dt>Panel size</dt><dd>Unavailable in current public data source</dd></div>
            <div><dt>Copy registry</dt><dd>Unavailable in current public data source</dd></div>
          </dl>
        </article>
      </div>

      <article className="public-verifier__panel public-verifier__panel--wide">
        <div className="public-verifier__section-header">
          <h2>Public event timeline</h2>
          <span>{timeline.length} event{timeline.length === 1 ? '' : 's'}</span>
        </div>

        {timeline.length === 0 ? (
          <p className="public-verifier__empty-text">No public events have been indexed for this exam yet.</p>
        ) : (
          <ol className="public-verifier__timeline">
            {timeline.map((event) => {
              const eventTime = toSafeIsoDateTime(event.blockTimestamp);
              return (
                <li key={`${event.id}-${event.logIndex}`} className="public-verifier__timeline-item">
                  <div className="public-verifier__timeline-top">
                    <strong>{event.type}</strong>
                    <time dateTime={eventTime}>{formatTimestampSeconds(event.blockTimestamp)}</time>
                  </div>
                  <div className="public-verifier__timeline-meta">
                    <span>Block {event.blockNumber}</span>
                    <span>Tx <HashChip hash={event.txHash} leadLength={6} tailLength={4} /></span>
                    {event.actor && <span>Actor <HashChip hash={event.actor} leadLength={6} tailLength={4} /></span>}
                  </div>
                  <pre className="public-verifier__payload">{summarizePayload(event.payloadJson)}</pre>
                </li>
              );
            })}
          </ol>
        )}
      </article>
    </section>
  );
}
