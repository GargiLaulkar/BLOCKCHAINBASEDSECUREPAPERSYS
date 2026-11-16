import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLeakReports } from './api';

describe('Leak report event history', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('displays only actual indexed LeakReported event records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ events: [
      {
        blockNumber: '44', logIndex: 2, txHash: `0x${'aa'.repeat(32)}`, blockTimestamp: '1700000000',
        payloadJson: {
          examId: '7', auditor: '0x1111111111111111111111111111111111111111',
          evidenceHash: `0x${'bb'.repeat(32)}`, suspectCentre: '0x0000000000000000000000000000000000000000',
          matchedVariantHash: `0x${'cc'.repeat(32)}`,
        },
      }, { payloadJson: { examId: 'not-a-leak-event' } },
    ] }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const reports = await fetchLeakReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ examId: '7', blockNumber: '44', evidenceHash: `0x${'bb'.repeat(32)}` });
    expect(reports[0]?.id).toBe(`${'0x' + 'aa'.repeat(32)}:2`);
  });

  it('does not synthesize history when the indexer is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(fetchLeakReports()).rejects.toThrow('temporarily unavailable');
  });
});
