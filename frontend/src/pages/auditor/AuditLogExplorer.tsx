import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { Button, EmptyState, HashChip, LoadingState, SuccessMessage } from '@sigil/ui';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { AuditEventsApiError, eventSafeSummary, fetchAuditEventPage, type AuditEvent, type AuditLogFilters } from './audit-log-api';
import { auditCsvFilename, buildAuditCsv } from './audit-log-csv';
import './audit-log.css';

const EMPTY_FILTERS: AuditLogFilters = { examId: '', eventType: '', actor: '', fromDate: '', toDate: '' };

function validateFilters(filters: AuditLogFilters): string | null {
  if (filters.examId && !/^\d+$/.test(filters.examId.trim())) return 'Exam ID must contain digits only.';
  if (filters.eventType && !/^[A-Za-z][A-Za-z0-9]{0,99}$/.test(filters.eventType.trim())) return 'Event type must start with a letter and contain only letters and digits.';
  if (filters.actor && !ethers.isAddress(filters.actor.trim())) return 'Enter a valid Ethereum wallet address.';
  const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!validDate(filters.fromDate) || !validDate(filters.toDate)) return 'Enter valid calendar dates.';
  if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) return 'From date must be on or before To date.';
  return null;
}

function displayTime(timestamp: string): string {
  const date = new Date(Number(timestamp) * 1000);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString();
}

function safeDateTime(timestamp: string): string | undefined {
  const date = new Date(Number(timestamp) * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function hashOrUnavailable(value: string | null) {
  return value ? <HashChip hash={value} /> : <span>Unavailable</span>;
}

export function AuditLogExplorer() {
  const guard = useAuthGuard(['AUDITOR']);
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportedCount, setExportedCount] = useState(0);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const cursorHistory = useRef<Array<string | null>>([null]);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const detailDialogRef = useRef<HTMLElement | null>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!selected) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = detailDialogRef.current;
    const closeButton = dialog?.querySelector<HTMLButtonElement>('button');
    closeButton?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelected(null);
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog?.addEventListener('keydown', onKeyDown);
    return () => {
      dialog?.removeEventListener('keydown', onKeyDown);
      (detailTriggerRef.current ?? previouslyFocused)?.focus();
    };
  }, [selected]);

  const loadPage = useCallback(async (filters: AuditLogFilters, cursor: string | null, page: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestRef.current;
    setPageLoading(true);
    setError(null);
    try {
      const result = await fetchAuditEventPage(filters, cursor, controller.signal);
      if (requestId !== requestRef.current) return;
      setEvents(result.events);
      setNextCursor(result.nextCursor);
      setPageNumber(page);
    } catch (cause) {
      if (controller.signal.aborted || requestId !== requestRef.current) return;
      const apiError = cause instanceof AuditEventsApiError ? cause : null;
      setError(apiError?.code === 'INVALID_CURSOR'
        ? 'This page cursor is no longer valid. Restart from the first page to continue.'
        : cause instanceof Error ? cause.message : 'Indexed events could not be loaded.');
    } finally {
      if (!controller.signal.aborted && requestId === requestRef.current) setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (guard.isAuthorized) void loadPage(EMPTY_FILTERS, null, 1);
    return () => abortRef.current?.abort();
  }, [guard.isAuthorized, loadPage]);

  const update = (key: keyof AuditLogFilters, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    const issue = validateFilters(draft);
    setValidationError(issue);
    if (issue) return;
    const normalized = { ...draft, examId: draft.examId.trim(), eventType: draft.eventType.trim(), actor: draft.actor.trim() ? ethers.getAddress(draft.actor.trim()) : '' };
    cursorHistory.current = [null];
    setApplied(normalized);
    setExportError(null);
    void loadPage(normalized, null, 1);
  };

  const clearFilters = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setValidationError(null);
    setExportError(null);
    cursorHistory.current = [null];
    void loadPage(EMPTY_FILTERS, null, 1);
  };

  const goNext = () => {
    if (!nextCursor) return;
    cursorHistory.current = [...cursorHistory.current.slice(0, pageNumber), nextCursor];
    void loadPage(applied, nextCursor, pageNumber + 1);
  };
  const goPrevious = () => {
    if (pageNumber <= 1) return;
    const previousCursor = cursorHistory.current[pageNumber - 2] ?? null;
    void loadPage(applied, previousCursor, pageNumber - 1);
  };
  const restartFirstPage = () => {
    cursorHistory.current = [null];
    void loadPage(applied, null, 1);
  };

  const exportCsv = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportedCount(0);
    setExportError(null);
    setExportSuccess(null);
    try {
      const allEvents: AuditEvent[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const page = await fetchAuditEventPage(applied, cursor);
        allEvents.push(...page.events);
        setExportedCount(allEvents.length);
        const next = page.nextCursor;
        if (next && (next === cursor || seenCursors.has(next))) {
          throw new Error('The event cursor repeated during export. Narrow the filters and retry.');
        }
        if (next) seenCursors.add(next);
        cursor = next;
      } while (cursor);

      if (allEvents.length === 0) {
        setExportError('There are no matching events to export.');
        return;
      }
      const blob = new Blob([buildAuditCsv(allEvents)], { type: 'text/csv;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = auditCsvFilename();
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setExportSuccess(`CSV download started with ${allEvents.length} filtered event${allEvents.length === 1 ? '' : 's'}.`);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'CSV export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  if (!guard.isAuthorized) return <main className="audit-log-page"><section role="alert" className="audit-log-state"><h1>Auditor access required</h1><p>This wallet is not authorized to view indexed audit events.</p></section></main>;

  const activeFilterCount = Object.values(applied).filter(Boolean).length;
  return <main className="audit-log-page" aria-labelledby="audit-log-title">
    <header className="audit-log-heading"><div><p className="eyebrow">Auditor workspace</p><h1 id="audit-log-title">Audit Log Explorer</h1><p>Browse indexed blockchain events. Event payload summaries contain allowlisted metadata only.</p></div><Button variant="secondary" onClick={() => void loadPage(applied, cursorHistory.current[pageNumber - 1] ?? null, pageNumber)} disabled={pageLoading}>Refresh</Button></header>

    <form className="audit-log-filters" onSubmit={applyFilters} noValidate>
      <label>Exam ID<input inputMode="numeric" value={draft.examId} onChange={(e) => update('examId', e.currentTarget.value)} placeholder="e.g. 12" /></label>
      <label>Event type<input value={draft.eventType} onChange={(e) => update('eventType', e.currentTarget.value)} placeholder="e.g. LeakReported" /></label>
      <label>Actor wallet address<input value={draft.actor} onChange={(e) => update('actor', e.currentTarget.value)} placeholder="0x…" /></label>
      <label>From date<input type="date" value={draft.fromDate} onChange={(e) => update('fromDate', e.currentTarget.value)} /></label>
      <label>To date<input type="date" value={draft.toDate} onChange={(e) => update('toDate', e.currentTarget.value)} /></label>
      <div className="audit-log-filter-actions"><Button type="submit">Apply filters</Button><Button type="button" variant="secondary" onClick={clearFilters}>Clear filters</Button></div>
      {validationError && <p className="audit-log-error" role="alert">{validationError}</p>}
    </form>

    {activeFilterCount > 0 && <div className="audit-log-active-filters" aria-label="Active filters">{[
      applied.examId && `Exam: ${applied.examId}`,
      applied.eventType && `Type: ${applied.eventType}`,
      applied.actor && `Actor: ${applied.actor}`,
      applied.fromDate && `From: ${applied.fromDate}`,
      applied.toDate && `To: ${applied.toDate}`,
    ].filter(Boolean).map((label) => <span key={label}>{label}</span>)}</div>}

    <section className="audit-log-results" aria-labelledby="audit-log-results-title">
      <div className="audit-log-results-heading"><div><h2 id="audit-log-results-title">Indexed events</h2><p>{activeFilterCount ? `${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}` : 'No active filters'} · Page {pageNumber} · {events.length} event{events.length === 1 ? '' : 's'}{nextCursor ? ' · more results available' : ' · end of results'}</p></div><Button onClick={() => void exportCsv()} disabled={isExporting || pageLoading}>{isExporting ? `Exporting ${exportedCount}…` : 'Export all filtered results (CSV)'}</Button></div>
      {isExporting && <LoadingState label={`Retrieving all matching cursor pages. ${exportedCount} events collected so far…`} />}
      {exportSuccess && <SuccessMessage>{exportSuccess}</SuccessMessage>}
      {exportError && <p className="audit-log-error" role="alert">{exportError}</p>}
      {error && <div className="audit-log-error" role="alert"><p>{error}</p><div className="audit-log-inline-actions"><Button variant="secondary" onClick={() => void loadPage(applied, cursorHistory.current[pageNumber - 1] ?? null, pageNumber)}>Retry</Button>{error.includes('cursor') && <Button onClick={restartFirstPage}>Restart from first page</Button>}</div></div>}
      {pageLoading ? <LoadingState label={events.length ? 'Refreshing indexed events…' : 'Loading indexed events…'} />
        : !error && events.length === 0 ? <EmptyState title="No matching events" description="No indexed blockchain events match these filters." />
          : events.length > 0 && <div className="audit-log-table-wrap" role="region" aria-label="Indexed event results table" tabIndex={0}><table className="audit-log-table"><thead><tr><th>Event</th><th>Exam</th><th>Actor</th><th>Timestamp</th><th>Block</th><th>Transaction</th><th>Safe summary</th></tr></thead><tbody>{events.map((event) => <tr key={`${event.txHash}-${event.logIndex}`}><td><button className="audit-log-event-button" type="button" onClick={(clickEvent) => { detailTriggerRef.current = clickEvent.currentTarget; setSelected(event); }}>{event.type}</button></td><td>{event.examId ?? 'Unavailable'}</td><td>{hashOrUnavailable(event.actor)}</td><td><time dateTime={safeDateTime(event.blockTimestamp)}>{displayTime(event.blockTimestamp)}</time></td><td>{event.blockNumber}</td><td>{hashOrUnavailable(event.txHash)}</td><td>{eventSafeSummary(event)}</td></tr>)}</tbody></table></div>}
      <nav className="audit-log-pagination" aria-label="Event pages"><Button variant="secondary" onClick={goPrevious} disabled={pageLoading || pageNumber <= 1}>Previous</Button><span>Page {pageNumber}</span><Button variant="secondary" onClick={goNext} disabled={pageLoading || !nextCursor}>Next</Button></nav>
    </section>

    {selected && <div className="audit-log-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section ref={detailDialogRef} className="audit-log-modal" role="dialog" aria-modal="true" aria-labelledby="audit-event-title" tabIndex={-1}><header><div><p className="eyebrow">Indexed event details</p><h2 id="audit-event-title">{selected.type}</h2></div><Button variant="secondary" onClick={() => setSelected(null)}>Close</Button></header><dl><div><dt>Event record ID</dt><dd>{selected.id}</dd></div><div><dt>Exam ID</dt><dd>{selected.examId ?? 'Unavailable'}</dd></div><div><dt>Actor</dt><dd>{selected.actor ?? 'Unavailable'}</dd></div><div><dt>Timestamp</dt><dd>{displayTime(selected.blockTimestamp)}</dd></div><div><dt>Block number</dt><dd>{selected.blockNumber}</dd></div><div><dt>Log index</dt><dd>{selected.logIndex}</dd></div><div><dt>Transaction hash</dt><dd>{selected.txHash || 'Unavailable'}</dd></div><div><dt>Allowlisted summary</dt><dd>{eventSafeSummary(selected)}</dd></div></dl><p className="audit-log-detail-note">Raw event payload is not displayed. Values shown are indexed public metadata returned by the existing sanitized event API.</p></section></div>}
  </main>;
}
