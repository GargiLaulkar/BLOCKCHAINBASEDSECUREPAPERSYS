import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { LeakTracerContainer } from './LeakTracerContainer';
import { fetchLeakReports } from './api';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { useExams } from '../../hooks/useExams';
import { useTransaction } from '../../shell/AppShell';

vi.mock('../../auth/useAuthGuard', () => ({ useAuthGuard: vi.fn() }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ account: '0x1111111111111111111111111111111111111111' }) }));
vi.mock('../../contracts/useExamVaultContract', () => ({ useExamVaultContract: vi.fn() }));
vi.mock('../../hooks/useExams', () => ({ useExams: vi.fn() }));
vi.mock('../../shell/AppShell', () => ({ useTransaction: vi.fn() }));
vi.mock('./api', () => ({ fetchLeakReports: vi.fn().mockResolvedValue([]) }));

const guardMock = vi.mocked(useAuthGuard);
const contractMock = vi.mocked(useExamVaultContract);
const examsMock = vi.mocked(useExams);
const transactionMock = vi.mocked(useTransaction);
const historyMock = vi.mocked(fetchLeakReports);

describe('Auditor leak tracer workflow', () => {
  const reportLeak = vi.fn();
  const setTxPending = vi.fn();
  const setTxConfirmed = vi.fn();
  const setTxFailed = vi.fn();
  const clearTx = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
    guardMock.mockReturnValue({ isAuthorized: true, guardState: 'authorized', account: '0x1111111111111111111111111111111111111111', chainId: '0x7a69', roles: ['AUDITOR'], error: null });
    const contract = {
      getFunction: vi.fn((name: string) => {
        if (name === 'AUDITOR_ROLE') return async () => 'auditor-role';
        if (name === 'hasRole') return async () => true;
        if (name === 'reportLeak') return reportLeak;
        throw new Error(`Unexpected contract method: ${name}`);
      }),
    };
    contractMock.mockReturnValue({ contract: contract as never, error: null, isLoading: false });
    examsMock.mockReturnValue({ exams: [{ examId: '7', chainId: 31337, state: 3, metaHash: ethers.ZeroHash, releaseOpensAt: '1', examStartsAt: '2', examEndsAt: '3', threshold: 2, bankHash: null }], isLoading: false, error: null, refetch: vi.fn().mockResolvedValue([]) });
    transactionMock.mockReturnValue({ activeTx: null, setActiveTx: vi.fn(), startTx: vi.fn(), setTxAwaitingSignature: vi.fn(), setTxPending, setTxConfirmed, setTxFailed, clearTx } as never);
    reportLeak.mockResolvedValue({ hash: `0x${'cd'.repeat(32)}`, wait: vi.fn().mockResolvedValue({ status: 1 }) });
    historyMock.mockResolvedValue([]);
  });

  it('shows explicit unauthorized state when the active on-chain role check fails', async () => {
    contractMock.mockReturnValueOnce({
      contract: { getFunction: vi.fn((name: string) => name === 'AUDITOR_ROLE' ? async () => 'role' : async () => false) } as never,
      error: null, isLoading: false,
    });
    render(<LeakTracerContainer />);
    expect(await screen.findByText('Auditor access required')).toBeInTheDocument();
  });

  it('submits the real four-argument reportLeak call and displays the confirmed hash', async () => {
    render(<LeakTracerContainer />);
    await screen.findByLabelText('Examination');
    fireEvent.change(screen.getByLabelText('Examination'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Evidence description'), { target: { value: 'Observed leak report detail.' } });
    fireEvent.change(screen.getByLabelText('Matched registered variant hash'), { target: { value: `0x${'ab'.repeat(32)}` } });
    fireEvent.click(screen.getByRole('button', { name: 'Review report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and submit on-chain' }));

    await waitFor(() => expect(reportLeak).toHaveBeenCalledWith(
      7n,
      ethers.keccak256(ethers.toUtf8Bytes('Observed leak report detail.')),
      ethers.ZeroAddress,
      `0x${'ab'.repeat(32)}`,
    ));
    expect(await screen.findByText(/Transaction confirmed on-chain/)).toHaveTextContent(`0x${'cd'.repeat(32)}`);
    expect(setTxPending).toHaveBeenCalledWith(`0x${'cd'.repeat(32)}`);
    expect(setTxConfirmed).toHaveBeenCalledWith(`0x${'cd'.repeat(32)}`);
    expect(historyMock).toHaveBeenCalledTimes(2);
  });
});
