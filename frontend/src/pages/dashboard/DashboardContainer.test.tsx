import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { useExams } from '../../hooks/useExams';
import { DashboardContainer } from './DashboardContainer';

vi.mock('../../auth/useAuthGuard', () => ({ useAuthGuard: vi.fn() }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ account: '0x1111111111111111111111111111111111111111', roles: ['HOLDER'], chainTime: 1_800_000_000 }) }));
vi.mock('../../contracts/useExamVaultContract', () => ({ useExamVaultContract: vi.fn() }));
vi.mock('../../hooks/useExams', () => ({ useExams: vi.fn() }));

const guardMock = vi.mocked(useAuthGuard);
const contractMock = vi.mocked(useExamVaultContract);
const examsMock = vi.mocked(useExams);
afterEach(() => vi.unstubAllGlobals());

describe('Dashboard role and assignment data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guardMock.mockReturnValue({ isAuthorized: true, guardState: 'authorized', account: '0x1111111111111111111111111111111111111111', chainId: '0x7a69', roles: ['HOLDER'], error: null });
    const contract = {
      getFunction: vi.fn((name: string) => {
        if (name === 'HOLDER_ROLE') return async () => 'holder-role';
        if (name === 'hasRole') return async () => true;
        if (name === 'getExam') return async (id: bigint) => ({ id, state: 1, authority: '0x2222222222222222222222222222222222222222', releaseOpensAt: 1_900_000_000, examStartsAt: 1_900_000_100, examEndsAt: 1_900_000_200, threshold: 2 });
        if (name === 'getPanel') return async (id: bigint) => id === 1n
          ? [['0x1111111111111111111111111111111111111111'], [], ['0x3333333333333333333333333333333333333333']]
          : [['0x4444444444444444444444444444444444444444'], [], ['0x5555555555555555555555555555555555555555']];
        if (name === 'getRandomnessCommitment') return async () => `0x${'01'.repeat(32)}`;
        if (name === 'hasSubmittedShare') return async () => false;
        throw new Error(`Unexpected getter ${name}`);
      }),
    };
    contractMock.mockReturnValue({ contract: contract as never, error: null, isLoading: false });
    examsMock.mockReturnValue({
      exams: [1n, 2n].map((id) => ({ examId: id.toString(), chainId: 31337, state: 1, metaHash: `0x${'aa'.repeat(32)}`, releaseOpensAt: '1900000000', examStartsAt: '1900000100', examEndsAt: '1900000200', threshold: 2, bankHash: null })),
      isLoading: false, error: null, refetch: vi.fn().mockResolvedValue([]),
    });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string) => new Response(JSON.stringify(
      input.includes('/stats/overview') ? { totalExams: 2, examsByState: {}, totalEvents: 0, batchesByStatus: {}, participantsByRole: {} } : { events: [] },
    ), { status: 200, headers: { 'Content-Type': 'application/json' } })));
  });

  it('rejects a missing authenticated role and filters listed exams through the on-chain Holder panel', async () => {
    guardMock.mockReturnValue({ isAuthorized: false, guardState: 'no-role', account: '0x1111111111111111111111111111111111111111', chainId: '0x7a69', roles: [], error: 'Holder role required' });
    const denied = render(<MemoryRouter><DashboardContainer role="HOLDER" /></MemoryRouter>);
    expect(screen.getByText('Role access required')).toBeInTheDocument();
    denied.unmount();
    guardMock.mockReturnValue({ isAuthorized: true, guardState: 'authorized', account: '0x1111111111111111111111111111111111111111', chainId: '0x7a69', roles: ['HOLDER'], error: null });
    render(<MemoryRouter><DashboardContainer role="HOLDER" /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Holder dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Exam 1')).toBeInTheDocument();
    expect(screen.queryByText('Exam 2')).not.toBeInTheDocument();
  });
});
