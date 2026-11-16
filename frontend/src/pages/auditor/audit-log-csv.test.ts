import { describe, expect, it } from 'vitest';
import { auditCsvFilename, buildAuditCsv, csvCell } from './audit-log-csv';
import type { AuditEvent } from './audit-log-api';

describe('audit CSV export', () => {
  it('quotes fields, doubles quotes, preserves multiline cells, and prevents spreadsheet formula execution', () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    for (const unsafe of ['=1+1', '+SUM(A1)', '-2+3', '@command', '\t=1+1', '\r@cmd']) {
      expect(csvCell(unsafe).startsWith('"\'' )).toBe(true);
    }
  });

  it('exports indexed event fields with safe allowlisted summary and a meaningful date filename', () => {
    const event: AuditEvent = {
      id: 'event-1', blockNumber: '88', logIndex: 4, txHash: `0x${'aa'.repeat(32)}`,
      examId: '9', type: 'LeakReported', actor: '0x1111111111111111111111111111111111111111',
      blockTimestamp: '1760000000', payloadJson: { evidenceHash: `0x${'bb'.repeat(32)}`, questionText: 'must never appear', questionCount: 12 },
    };
    const csv = buildAuditCsv([event]);
    expect(csv.startsWith('\uFEFF"timestamp","event type"')).toBe(true);
    expect(csv).toContain('questionCount: 12');
    expect(csv).not.toContain('must never appear');
    expect(csv).toContain(event.txHash);
    expect(auditCsvFilename(new Date('2026-07-04T15:00:00Z'))).toBe('sigil-audit-logs-2026-07-04.csv');
  });
});
