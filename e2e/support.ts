import type { Page, Route } from '@playwright/test';

export const TEST_ADDRESS = '0x1111111111111111111111111111111111111111';

export interface PublicExamFixture {
  examId: string;
  chainId: number;
  state: number;
  metaHash: string;
  releaseOpensAt: string;
  examStartsAt: string;
  examEndsAt: string;
  threshold: number;
  bankHash: string | null;
}

export const publicExam: PublicExamFixture = {
  examId: '17', chainId: 31337, state: 3,
  metaHash: `0x${'a1'.repeat(32)}`, bankHash: `0x${'b2'.repeat(32)}`,
  releaseOpensAt: '1790000000', examStartsAt: '1790003600', examEndsAt: '1790007200', threshold: 2,
};

export const leakEvent = {
  id: 'e2e-leak-event', blockNumber: '24', logIndex: 0,
  txHash: `0x${'c3'.repeat(32)}`, examId: '17', type: 'LeakReported', actor: TEST_ADDRESS,
  blockTimestamp: '1780000000',
  payloadJson: {
    examId: '17', auditor: TEST_ADDRESS,
    evidenceHash: `0x${'d4'.repeat(32)}`, matchedVariantHash: `0x${'e5'.repeat(32)}`,
    suspectCentre: '0x2222222222222222222222222222222222222222',
  },
};

export const dashboardStats = {
  totalExams: 0,
  examsByState: { draft: 0, collecting: 0, sealed: 0, released: 0, concluded: 0, cancelled: 0 },
  totalEvents: 0,
  batchesByStatus: { pending: 0, confirmed: 0 },
  participantsByRole: { ADMIN: 0, AUTHORITY: 0, SETTER: 0, HOLDER: 0, CENTRE: 0, AUDITOR: 0 },
};

export async function installApiDefaults(page: Page, role?: string) {
  // Every backend request is intercepted; no test calls an external or production API.
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/health') {
      return route.fulfill({ status: 200, json: { status: 'ok', timestamp: '2026-01-01T00:00:00.000Z' } });
    }
    if (url.pathname === '/api/auth/me') {
      return role
        ? route.fulfill({ status: 200, json: { address: TEST_ADDRESS, roles: [role] } })
        : route.fulfill({ status: 401, json: { error: { message: 'Authentication required.' } } });
    }
    if (url.pathname === '/api/exams' || /^\/api\/exams\/\d+$/.test(url.pathname)) {
      return route.fulfill({ status: 200, json: url.pathname === '/api/exams' ? [] : publicExam });
    }
    if (url.pathname === '/api/stats/overview') return route.fulfill({ status: 200, json: dashboardStats });
    if (url.pathname === '/api/events') return route.fulfill({ status: 200, json: { events: [], nextCursor: null } });
    return route.fulfill({ status: 503, json: { error: { message: 'Deterministic E2E API fixture: endpoint unavailable.' } } });
  });
}

export async function installReadOnlyWallet(page: Page) {
  // Test-only EIP-1193 shim. It permits reads and has no signing/private-key capability.
  await page.addInitScript((address) => {
    const result = `0x${'0'.repeat(63)}1`;
    Object.defineProperty(window, 'ethereum', {
      configurable: true,
      value: {
        isMetaMask: false,
        request: async ({ method }: { method: string }) => {
          if (method === 'eth_chainId') return '0x7a69';
          if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [address];
          if (method === 'eth_call') return result;
          if (method === 'eth_blockNumber') return '0x1';
          if (method === 'eth_getBlockByNumber') return {
            number: '0x1', hash: `0x${'0'.repeat(64)}`, timestamp: '0x6955b900',
            parentHash: `0x${'0'.repeat(64)}`, nonce: '0x0000000000000000', difficulty: '0x0',
            gasLimit: '0x1c9c380', gasUsed: '0x0', miner: address, extraData: '0x',
            transactions: [],
          };
          throw new Error(`Read-only test wallet does not implement ${method}`);
        },
        on: () => undefined,
        removeListener: () => undefined,
      },
    });
  }, TEST_ADDRESS);
}

export async function openAsRole(page: Page, role: string, path: string) {
  await installApiDefaults(page, role);
  await installReadOnlyWallet(page);
  await page.goto(path);
}
