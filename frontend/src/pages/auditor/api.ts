export interface IndexedLeakReport {
  id: string;
  blockNumber: string;
  txHash: string;
  examId: string;
  auditor: string;
  evidenceHash: string;
  suspectCentre: string;
  matchedVariantHash: string;
  timestamp: string;
}

const apiOrigin = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:4000';

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function fetchLeakReports(signal?: AbortSignal): Promise<IndexedLeakReport[]> {
  const response = await fetch(
    `${apiOrigin}/api/events?type=LeakReported&limit=100`,
    { credentials: 'include', headers: { Accept: 'application/json' }, signal },
  );
  if (!response.ok) throw new Error('Leak report history is temporarily unavailable.');
  const payload = record(await response.json());
  const events = Array.isArray(payload?.events) ? payload.events : [];
  return events.flatMap((raw) => {
    const event = record(raw);
    const args = record(event?.payloadJson);
    const textFields = ['examId', 'auditor', 'evidenceHash', 'suspectCentre', 'matchedVariantHash'];
    if (!event || !args || textFields.some((key) => typeof args[key] !== 'string')) return [];
    return [{
      id: `${String(event.txHash)}:${String(event.logIndex)}`,
      blockNumber: String(event.blockNumber),
      txHash: String(event.txHash),
      examId: String(args.examId),
      auditor: String(args.auditor),
      evidenceHash: String(args.evidenceHash),
      suspectCentre: String(args.suspectCentre),
      matchedVariantHash: String(args.matchedVariantHash),
      timestamp: String(event.blockTimestamp),
    }];
  });
}
