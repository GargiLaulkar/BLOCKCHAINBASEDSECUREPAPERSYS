export interface DashboardStats {
  totalExams: number;
  examsByState: Record<'draft' | 'collecting' | 'sealed' | 'released' | 'concluded' | 'cancelled', number>;
  totalEvents: number;
  batchesByStatus: { pending: number; confirmed: number };
  participantsByRole: Record<'ADMIN' | 'AUTHORITY' | 'SETTER' | 'HOLDER' | 'CENTRE' | 'AUDITOR', number>;
}

export interface DashboardEvent {
  id: string;
  blockNumber: string;
  logIndex: number;
  txHash: string;
  examId: string | null;
  type: string;
  actor: string | null;
  blockTimestamp: string;
}

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:4000';

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    credentials: 'include', headers: { Accept: 'application/json' }, signal,
  });
  if (!response.ok) throw new Error(`Dashboard data is unavailable (HTTP ${response.status}).`);
  return response.json() as Promise<T>;
}

export function fetchDashboardStats(signal?: AbortSignal) {
  return getJson<DashboardStats>('/api/stats/overview', signal);
}

export async function fetchDashboardEvents(options: { type?: string; actor?: string | null; limit?: number; signal?: AbortSignal } = {}) {
  const query = new URLSearchParams({ limit: String(options.limit ?? 8) });
  if (options.type) query.set('type', options.type);
  if (options.actor) query.set('actor', options.actor);
  const payload = await getJson<{ events: DashboardEvent[] }>(`/api/events?${query}`, options.signal);
  return payload.events;
}
