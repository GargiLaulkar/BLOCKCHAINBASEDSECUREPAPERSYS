import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestCentrePaper } from './api';

describe('Centre paper station API', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps the server-side authorization block to a safe message without exposing response details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: { code: 'PROTECTED_PRINT_SERVICE_UNAVAILABLE', message: 'private key=should-not-appear' },
      }),
    } as Response);

    await expect(requestCentrePaper('42', 'generate')).rejects.toThrow(
      'Paper generation is pending configuration of the protected release, attestation, and managed print services.',
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/exams/42/centre-paper/request',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('sends a reason for controlled reprint requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);
    await requestCentrePaper('7', 'reprint', 'Printer jam destroyed the first copy');
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      intent: 'reprint',
      reason: 'Printer jam destroyed the first copy',
    });
  });
});
