import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDashboardEvents, fetchDashboardStats } from './api';

describe('dashboard data API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads actual statistics and recent indexed events with Centre/Holder actor filters', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ totalExams: 2 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ events: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await fetchDashboardStats();
    await fetchDashboardEvents({ actor: '0x1111111111111111111111111111111111111111', limit: 8 });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/stats/overview');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('actor=0x1111111111111111111111111111111111111111');
  });

  it('reports unavailable data instead of inventing dashboard records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(fetchDashboardEvents()).rejects.toThrow('unavailable');
  });
});
