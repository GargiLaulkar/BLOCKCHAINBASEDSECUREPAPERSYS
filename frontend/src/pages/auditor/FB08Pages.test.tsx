import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvidenceReportPage } from './EvidenceReportPage';
import { RosterProofPage } from './RosterProofPage';
import { DecoyManagerPage } from './DecoyManagerPage';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { useExams } from '../../hooks/useExams';
import { useAuth } from '../../auth/AuthContext';

vi.mock('../../auth/useAuthGuard', () => ({ useAuthGuard: vi.fn() }));
vi.mock('../../contracts/useExamVaultContract', () => ({ useExamVaultContract: vi.fn() }));
vi.mock('../../hooks/useExams', () => ({ useExams: vi.fn() }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../shell/AppShell', () => ({ useTransaction: () => ({ startTx: vi.fn(), setTxAwaitingSignature: vi.fn(), setTxPending: vi.fn(), setTxConfirmed: vi.fn(), setTxFailed: vi.fn(), clearTx: vi.fn() }) }));

const mocks = {
  guard: vi.mocked(useAuthGuard), contract: vi.mocked(useExamVaultContract), exams: vi.mocked(useExams), auth: vi.mocked(useAuth),
};
const address = '0x1111111111111111111111111111111111111111';
const event = {
  id: 'indexed-1', blockNumber: '42', logIndex: 1, txHash: `0x${'aa'.repeat(32)}`, examId: '2', type: 'LeakReported', actor: address,
  blockTimestamp: '1760000000', payloadJson: { examId: '2', auditor: address, evidenceHash: `0x${'bb'.repeat(32)}`, suspectCentre: '0x0000000000000000000000000000000000000000', matchedVariantHash: `0x${'cc'.repeat(32)}`, questionText: 'do not display' },
};
function response(events: unknown[]) { return new Response(JSON.stringify({ events, nextCursor: null }), { status: 200 }); }

describe('FB-08 Auditor tools', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
  const authorize = (roles: string[] = ['AUDITOR']) => {
    mocks.guard.mockReturnValue({ isAuthorized: true, guardState: 'authorized', account: address, chainId: '0x7a69', roles: roles as never, error: null });
  };
  const examList = () => mocks.exams.mockReturnValue({ exams: [{ examId: '2', chainId: 31337, state: 2, metaHash: `0x${'11'.repeat(32)}`, releaseOpensAt: '1', examStartsAt: '2', examEndsAt: '3', threshold: 2, bankHash: null }], isLoading: false, error: null, refetch: vi.fn() });

  it('loads actual indexed evidence and exposes a PDF download action without raw payload text', async () => {
    authorize();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([event])));
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:pdf') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<EvidenceReportPage />);
    expect(await screen.findByText('0x' + 'bb'.repeat(32))).toBeInTheDocument();
    expect(screen.queryByText('do not display')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(click).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent('Evidence PDF download started');
  });

  it('shows the role gate for unauthorised auditors', () => {
    mocks.guard.mockReturnValue({ isAuthorized: false, guardState: 'no-role', account: null, chainId: null, roles: [], error: 'Auditor required' });
    render(<EvidenceReportPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Auditor access required');
  });

  it('compares the on-chain Holder panel, commitment getter and indexed submission reference', async () => {
    authorize();
    const h1 = address;
    const h2 = '0x2222222222222222222222222222222222222222';
    const randomness = `0x${'aa'.repeat(32)}`;
    const share = `0x${'bb'.repeat(32)}`;
    const calls: Record<string, (...args: unknown[]) => Promise<unknown>> = {
      AUDITOR_ROLE: async () => 'auditor-role',
      hasRole: async () => true,
      nextExamId: async () => 3n,
      getExam: async () => ({ threshold: 2, 7: 2 }),
      getPanel: async () => [[h1, h2], [], []],
      getRosterRoot: async () => `0x${'dd'.repeat(32)}`,
      getRandomnessCommitment: async (_id, holder) => holder === h1 ? randomness : `0x${'00'.repeat(32)}`,
      hasCommittedRandomness: async (_id, holder) => holder === h1,
      hasSubmittedShare: async (_id, holder) => holder === h1,
      getShareCommitment: async (_id, holder) => holder === h1 ? share : `0x${'00'.repeat(32)}`,
    };
    mocks.contract.mockReturnValue({ contract: { getFunction: (name: string) => calls[name] }, error: null, isLoading: false } as never);
    const shareEvent = { ...event, type: 'ShareSubmitted', actor: h1, payloadJson: { examId: '2', holder: h1, shareCommitment: share } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([shareEvent])));
    render(<RosterProofPage />);
    await screen.findByRole('option', { name: 'Exam 2' });
    fireEvent.change(screen.getByLabelText('Examination'), { target: { value: '2' } });
    expect(await screen.findByText('Share commitment matches indexed event and on-chain getter')).toBeInTheDocument();
    expect(screen.getByText('Committed on-chain')).toBeInTheDocument();
    expect(screen.getByText('Not submitted')).toBeInTheDocument();
    expect(screen.getByText(/not proof that a Shamir share is mathematically valid/i)).toBeInTheDocument();
  });

  it('renders the on-chain decoy manager in read-only mode for an Auditor and reports empty indexed history', async () => {
    authorize(); mocks.auth.mockReturnValue({ account: address, roles: ['AUDITOR'] } as never); examList();
    const calls: Record<string, (...args: unknown[]) => Promise<unknown>> = {
      AUDITOR_ROLE: async () => 'auditor-role', AUTHORITY_ROLE: async () => 'authority-role',
      hasRole: async (_role) => _role === 'auditor-role',
    };
    mocks.contract.mockReturnValue({ contract: { getFunction: (name: string) => calls[name] }, error: null, isLoading: false } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([])));
    render(<DecoyManagerPage />);
    expect(await screen.findByText('No indexed decoy registrations')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Register on-chain' })).not.toBeInTheDocument();
  });
});
