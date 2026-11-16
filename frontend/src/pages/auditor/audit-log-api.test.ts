import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEventQuery, fetchAuditEventPage, type AuditLogFilters } from './audit-log-api';

const filters: AuditLogFilters = {
  examId: '12', eventType: 'LeakReported', actor: '0x1111111111111111111111111111111111111111',
  fromDate: '2026-02-01', toDate: '2026-02-02',
};

describe('audit event API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds filters, full-day UTC date bounds, page size, and cursor from existing API parameters', () => {
    const query = new URLSearchParams(buildEventQuery(filters, 'next-page'));
    expect(query.get('exam')).toBe('12');
    expect(query.get('type')).toBe('LeakReported');
    expect(query.get('actor')).toBe(filters.actor);
    expect(query.get('from')).toBe('2026-02-01T00:00:00.000Z');
    expect(query.get('to')).toBe('2026-02-02T23:59:59.000Z');
    expect(query.get('limit')).toBe('100');
    expect(query.get('cursor')).toBe('next-page');
  });

  it('returns indexed page data and safely reports expired cursor errors', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ events: [], nextCursor: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'INVALID_CURSOR', message: 'Cursor is invalid' } }), { status: 400 })));
    await expect(fetchAuditEventPage(filters)).resolves.toEqual({ events: [], nextCursor: null });
    await expect(fetchAuditEventPage(filters, 'stale')).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
  });
});
