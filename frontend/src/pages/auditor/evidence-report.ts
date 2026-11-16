import type { AuditEvent } from './audit-log-api';

export interface IndexedLeakEvidence {
  id: string;
  examId: string;
  auditor: string;
  evidenceHash: string;
  suspectCentre: string;
  matchedVariantHash: string;
  txHash: string;
  blockNumber: string;
  timestamp: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toIndexedLeakEvidence(event: AuditEvent): IndexedLeakEvidence | null {
  if (event.type !== 'LeakReported' || !isRecord(event.payloadJson)) return null;
  const payload = event.payloadJson;
  const required = ['examId', 'auditor', 'evidenceHash', 'suspectCentre', 'matchedVariantHash'];
  if (required.some((field) => typeof payload[field] !== 'string')) return null;
  if (event.examId !== payload.examId || !/^0x[0-9a-f]{40}$/i.test(String(payload.auditor)) ||
    !/^0x[0-9a-f]{40}$/i.test(String(payload.suspectCentre)) ||
    !/^0x[0-9a-f]{64}$/i.test(String(payload.evidenceHash)) ||
    !/^0x[0-9a-f]{64}$/i.test(String(payload.matchedVariantHash)) ||
    !/^0x[0-9a-f]{64}$/i.test(event.txHash)) return null;
  return {
    id: `${event.txHash}:${event.logIndex}`,
    examId: String(payload.examId),
    auditor: String(payload.auditor),
    evidenceHash: String(payload.evidenceHash),
    suspectCentre: String(payload.suspectCentre),
    matchedVariantHash: String(payload.matchedVariantHash),
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    timestamp: event.blockTimestamp,
  };
}

function pdfText(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, '?').replace(/([\\()])/g, '\\$1');
}

function timestampLabel(timestamp: string): string {
  const date = new Date(Number(timestamp) * 1000);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toISOString();
}

/** Creates a minimal, valid, uncompressed PDF containing only public indexed event metadata. */
export function buildEvidencePdf(report: IndexedLeakEvidence, generatedAt = new Date()): Uint8Array {
  const lines = [
    'SIGIL - Leak Evidence Report',
    `Generated: ${generatedAt.toISOString()}`,
    'Source: indexed on-chain LeakReported event metadata',
    `Exam ID: ${report.examId}`,
    `Reported at: ${timestampLabel(report.timestamp)}`,
    `Auditor wallet: ${report.auditor}`,
    `Evidence hash: ${report.evidenceHash}`,
    `Matched variant hash: ${report.matchedVariantHash}`,
    `Suspected Centre: ${report.suspectCentre}`,
    `Transaction hash: ${report.txHash}`,
    `Block number: ${report.blockNumber}`,
    '',
    'Verification status: Event metadata is present in the application indexer.',
    'This report does not establish that the underlying allegation is true.',
    'A hash can support integrity comparison; it does not prove evidence authenticity.',
    'The original evidence file or report description is not stored or included here.',
  ];
  const commands = ['BT', '/F1 10 Tf', '50 790 Td'];
  lines.forEach((line, index) => {
    if (index > 0) commands.push('0 -19 Td');
    commands.push(`(${pdfText(line)}) Tj`);
  });
  commands.push('ET');
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n%SIGIL\n';
  const offsets = [0];
  for (const [index, body] of objects.entries()) {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

export function evidencePdfFilename(report: IndexedLeakEvidence): string {
  return `sigil-evidence-exam-${report.examId}-${report.txHash.slice(2, 10)}.pdf`;
}
