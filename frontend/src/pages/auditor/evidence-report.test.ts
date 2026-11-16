import { describe, expect, it } from 'vitest';
import type { AuditEvent } from './audit-log-api';
import { buildEvidencePdf, evidencePdfFilename, toIndexedLeakEvidence } from './evidence-report';

const event: AuditEvent = {
  id: 'chain-event-id', blockNumber: '41', logIndex: 2, txHash: `0x${'ab'.repeat(32)}`, examId: '7', type: 'LeakReported',
  actor: '0x1111111111111111111111111111111111111111', blockTimestamp: '1760000000',
  payloadJson: { examId: '7', auditor: '0x1111111111111111111111111111111111111111', evidenceHash: `0x${'cd'.repeat(32)}`, suspectCentre: '0x2222222222222222222222222222222222222222', matchedVariantHash: `0x${'ef'.repeat(32)}`, questionText: 'sensitive paper text', privateKey: 'must not be included' },
};

describe('indexed leak evidence PDF', () => {
  it('creates genuine PDF bytes with supported event fields and verification limitations', () => {
    const report = toIndexedLeakEvidence(event)!;
    const pdf = new TextDecoder().decode(buildEvidencePdf(report, new Date('2026-01-02T03:04:05.000Z')));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('xref');
    expect(pdf).toContain('Exam ID: 7');
    expect(pdf).toContain(report.evidenceHash);
    expect(pdf).toContain(report.matchedVariantHash);
    expect(pdf).toContain(report.txHash);
    expect(pdf).toContain('does not establish that the underlying allegation is true');
    expect(pdf).not.toContain('sensitive paper text');
    expect(pdf).not.toContain('must not be included');
    expect(evidencePdfFilename(report)).toBe('sigil-evidence-exam-7-abababab.pdf');
  });

  it('rejects events that are not complete indexed LeakReported records', () => {
    expect(toIndexedLeakEvidence({ ...event, type: 'ShareSubmitted' })).toBeNull();
    expect(toIndexedLeakEvidence({ ...event, payloadJson: { examId: '7' } })).toBeNull();
  });
});
