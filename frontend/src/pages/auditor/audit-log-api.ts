export interface AuditLogFilters {
  examId: string;
  eventType: string;
  actor: string;
  fromDate: string;
  toDate: string;
}

export interface AuditEvent {
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

export interface AuditEventPage {
  events: AuditEvent[];
  nextCursor: string | null;
}

export const AUDIT_PAGE_SIZE = 100;
const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:4000';

export function buildEventQuery(filters: AuditLogFilters, cursor?: string | null, limit = AUDIT_PAGE_SIZE): string {
  const query = new URLSearchParams({ limit: String(limit) });
  if (filters.examId.trim()) query.set('exam', filters.examId.trim());
  if (filters.eventType.trim()) query.set('type', filters.eventType.trim());
  if (filters.actor.trim()) query.set('actor', filters.actor.trim());
  if (filters.fromDate) query.set('from', `${filters.fromDate}T00:00:00.000Z`);
  if (filters.toDate) {
    const nextDay = new Date(`${filters.toDate}T00:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    query.set('to', new Date(nextDay.getTime() - 1000).toISOString());
  }
  if (cursor) query.set('cursor', cursor);
  return query.toString();
}

export class AuditEventsApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'AuditEventsApiError';
  }
}

export async function fetchAuditEventPage(
  filters: AuditLogFilters,
  cursor?: string | null,
  signal?: AbortSignal,
): Promise<AuditEventPage> {
  const response = await fetch(`${API_ORIGIN}/api/events?${buildEventQuery(filters, cursor)}`, {
    credentials: 'include', headers: { Accept: 'application/json' }, signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const error = root.error && typeof root.error === 'object' ? root.error as Record<string, unknown> : {};
    throw new AuditEventsApiError(
      typeof error.code === 'string' ? error.code : 'REQUEST_FAILED',
      typeof error.message === 'string' ? error.message : `Event request failed (HTTP ${response.status}).`,
    );
  }
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as Record<string, unknown>).events)) {
    throw new AuditEventsApiError('INVALID_RESPONSE', 'The indexed event response was malformed.');
  }
  const responseObject = payload as { events: AuditEvent[]; nextCursor: string | null };
  if (responseObject.nextCursor !== null && typeof responseObject.nextCursor !== 'string') {
    throw new AuditEventsApiError('INVALID_RESPONSE', 'The indexed event cursor was malformed.');
  }
  return responseObject;
}

export function eventSafeSummary(event: AuditEvent): string {
  const payload = event.payloadJson && typeof event.payloadJson === 'object' && !Array.isArray(event.payloadJson)
    ? event.payloadJson as Record<string, unknown>
    : {};
  const safeFields = [
    'state', 'releasedAt', 'registeredAt', 'threshold', 'batchId', 'sectionId',
    'questionCount', 'startInSection', 'ciphertextHash', 'bankHash', 'metaHash',
    'variantHash', 'suspectCentre', 'matchedVariantHash', 'evidenceHash',
    'decoyHash', 'channelLabel', 'merkleRoot', 'reasonHash', 'certificateId',
  ];
  const parts = safeFields.flatMap((key) => {
    const value = payload[key];
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return [];
    return [`${key}: ${String(value).slice(0, 180)}`];
  });
  return parts.length ? parts.join(' · ') : 'No safe summary fields available';
}
