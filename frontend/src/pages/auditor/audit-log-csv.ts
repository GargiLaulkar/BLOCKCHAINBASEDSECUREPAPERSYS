import type { AuditEvent } from './audit-log-api';
import { eventSafeSummary } from './audit-log-api';

const CSV_COLUMNS = ['timestamp', 'event type', 'exam ID', 'actor', 'transaction hash', 'block number', 'sanitized summary'];

function eventTimestamp(timestamp: string): string {
  const value = new Date(Number(timestamp) * 1000);
  return Number.isNaN(value.getTime()) ? '' : value.toISOString();
}

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\t\r]/.test(text) || /^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildAuditCsv(events: readonly AuditEvent[]): string {
  const rows = [CSV_COLUMNS, ...events.map((event) => [
    eventTimestamp(event.blockTimestamp),
    event.type,
    event.examId ?? '',
    event.actor ?? '',
    event.txHash,
    event.blockNumber,
    eventSafeSummary(event),
  ])];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function auditCsvFilename(now = new Date()): string {
  return `sigil-audit-logs-${now.toISOString().slice(0, 10)}.csv`;
}
