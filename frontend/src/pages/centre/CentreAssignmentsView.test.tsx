import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { CentreAssignmentsContainer } from './CentreAssignmentsContainer';
import { CentreAssignmentsView } from './CentreAssignmentsView';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { fetchExamMetadata } from '../holder/api';
import { useExams } from '../../hooks/useExams';

vi.mock('../../auth/useAuthGuard', () => ({
  useAuthGuard: vi.fn(),
}));

vi.mock('../../contracts/useExamVaultContract', () => ({
  useExamVaultContract: vi.fn(),
}));

vi.mock('../../hooks/useExams', () => ({
  useExams: vi.fn(),
}));

vi.mock('../holder/api', () => ({
  fetchExamMetadata: vi.fn(),
}));

const mockUseAuthGuard = vi.mocked(useAuthGuard);
const mockUseExamVaultContract = vi.mocked(useExamVaultContract);
const mockUseExams = vi.mocked(useExams);
const mockFetchExamMetadata = vi.mocked(fetchExamMetadata);

vi.mock('../../auth/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../auth/AuthContext')>('../../auth/AuthContext');
  return {
    ...actual,
    AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useAuth: () => ({
      account: '0x1111111111111111111111111111111111111111',
      chainId: '0x7a69',
      isNetworkCorrect: true,
      isAuthenticated: true,
      roles: ['CENTRE'],
      chainTime: 1_700_000_000,
      pendingTxCount: 0,
      isConnecting: false,
      isLoggingIn: false,
      error: null,
      connectWallet: vi.fn(),
      switchNetwork: vi.fn(),
      loginSIWE: vi.fn(),
      logout: vi.fn(),
      incrementPendingTx: vi.fn(),
      decrementPendingTx: vi.fn(),
    }),
  };
});

describe('Centre route access and monitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('renders a no-role guard when the connected wallet does not hold CENTRE access', () => {
    window.history.pushState({}, '', '/centre/station');
    mockUseAuthGuard.mockReturnValue({
      isAuthorized: false,
      guardState: 'no-role',
      account: '0x2222222222222222222222222222222222222222',
      chainId: '0x7a69',
      roles: ['HOLDER'],
      error: 'Required role (CENTRE) not held by this account.',
    });

    render(<App />);

    expect(screen.getByText(/No authorized role assigned/i)).toBeInTheDocument();
  });

  it('filters out exams not assigned to the current centre wallet', async () => {
    mockUseAuthGuard.mockReturnValue({
      isAuthorized: true,
      guardState: 'authorized',
      account: '0x1111111111111111111111111111111111111111',
      chainId: '0x7a69',
      roles: ['CENTRE'],
      error: null,
    });

    mockUseExams.mockReturnValue({
      exams: [
        { examId: '1', chainId: 31337, state: 1, metaHash: '0x' + '11'.repeat(32), releaseOpensAt: '100', examStartsAt: '200', examEndsAt: '300', threshold: 2, bankHash: null },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const contract = {
      getFunction: vi.fn((name: string) => {
        if (name === 'getExam') return vi.fn();
        if (name === 'getPanel') {
          return async (id: bigint) => {
            if (id === 1n) return [[], [], ['0x1111111111111111111111111111111111111111']];
            return [[], [], ['0x2222222222222222222222222222222222222222']];
          };
        }
        return vi.fn();
      }),
    };

    mockUseExamVaultContract.mockReturnValue({
      contract: contract as any,
      error: null,
      isLoading: false,
    });

    mockFetchExamMetadata.mockImplementation(async (examId: string) => ({
      title: examId === '1' ? 'Alpha exam' : 'Bravo exam',
      sections: [{ name: 'Section A', quota: 3 }],
      bank: 'bank',
      description: 'desc',
    } as any));

    render(<CentreAssignmentsContainer />);

    await waitFor(() => expect(screen.getByText('Alpha exam')).toBeInTheDocument());
    expect(screen.queryByText('Bravo exam')).not.toBeInTheDocument();
  });

  it('shows the empty state for a centre with no assigned exams', () => {
    render(
      <CentreAssignmentsView
        pageState="empty"
        assignments={[]}
      />,
    );

    expect(screen.getByText(/No centre assignments/i)).toBeInTheDocument();
  });

  it('shows loading and error states', () => {
    const { rerender } = render(
      <CentreAssignmentsView
        pageState="loading"
        assignments={[]}
      />,
    );

    expect(screen.getByLabelText(/loading centre assignments/i)).toBeInTheDocument();

    rerender(
      <CentreAssignmentsView
        pageState="error"
        assignments={[]}
        error={new Error('Exam vault unavailable')}
      />,
    );

    expect(screen.getByText(/Unable to load centre station/i)).toBeInTheDocument();
    expect(screen.getByText(/Exam vault unavailable/i)).toBeInTheDocument();
  });

  it('shows paper generation and printing as unavailable until protected services are configured', () => {
    const now = Math.floor(Date.now() / 1000);
    const onPaperRequest = vi.fn();
    render(
      <CentreAssignmentsView
        pageState="ready"
        assignments={[{
          examId: '23',
          title: 'Protected release exam',
          state: 'Released',
          rosetteHash: `0x${'ab'.repeat(32)}`,
          releaseOpensAt: now - 30,
          examStartsAt: now,
          examEndsAt: now + 3600,
          threshold: 2,
        }]}
        onPaperRequest={onPaperRequest}
      />,
    );

    expect(screen.getByText(/Printing is not configured/i)).toBeInTheDocument();
    expect(screen.getByText(/Variant identifier: not issued/i)).toBeInTheDocument();
    expect(screen.getByText(/Print preview unavailable/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare paper' }));
    expect(onPaperRequest).toHaveBeenCalledWith('23', 'generate');

    const reason = screen.getByRole('textbox', { name: /Reprint reason/i });
    fireEvent.change(reason, { target: { value: 'Printer jam destroyed first copy' } });
    fireEvent.click(screen.getByRole('button', { name: /Request reprint authorization/i }));
    expect(onPaperRequest).toHaveBeenCalledWith('23', 'reprint', 'Printer jam destroyed first copy');
  });

  it('does not offer a paper request outside the release window', () => {
    render(
      <CentreAssignmentsView
        pageState="ready"
        assignments={[{
          examId: '24',
          title: 'Upcoming exam',
          state: 'Released',
          rosetteHash: `0x${'ac'.repeat(32)}`,
          releaseOpensAt: Math.floor(Date.now() / 1000) + 600,
          examStartsAt: Math.floor(Date.now() / 1000) + 900,
          examEndsAt: Math.floor(Date.now() / 1000) + 1800,
          threshold: 2,
        }]}
        onPaperRequest={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Prepare paper' })).toBeDisabled();
  });

  it('counts down before release opens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    render(
      <CentreAssignmentsView
        pageState="ready"
        assignments={[
          {
            examId: '42',
            title: 'Countdown exam',
            state: 'Draft',
            rosetteHash: '0x' + 'aa'.repeat(32),
            releaseOpensAt: Math.floor(Date.now() / 1000) + 60,
            examStartsAt: Math.floor(Date.now() / 1000) + 120,
            examEndsAt: Math.floor(Date.now() / 1000) + 180,
            threshold: 2,
          },
        ]}
      />,
    );

    expect(screen.getByText('00:01:00')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('00:00:59')).toBeInTheDocument();
  });

  it('stops the countdown once release has opened and shows released state', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    render(
      <CentreAssignmentsView
        pageState="ready"
        assignments={[
          {
            examId: '7',
            title: 'Released exam',
            state: 'Released',
            rosetteHash: '0x' + 'bb'.repeat(32),
            releaseOpensAt: Math.floor(Date.now() / 1000) - 60,
            examStartsAt: Math.floor(Date.now() / 1000) - 30,
            examEndsAt: Math.floor(Date.now() / 1000) + 120,
            threshold: 2,
          },
        ]}
      />,
    );

    expect(screen.getByRole('status', { name: /Exam status: Released/i })).toBeInTheDocument();
    expect(screen.getAllByText('Released').length).toBeGreaterThan(0);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('renders Unknown time for invalid timestamps without crashing', () => {
    render(
      <CentreAssignmentsView
        pageState="ready"
        assignments={[
          {
            examId: '9',
            title: 'Missing time exam',
            state: 'Draft',
            rosetteHash: '0x' + 'dd'.repeat(32),
            releaseOpensAt: Number.NaN,
            examStartsAt: Number.NaN,
            examEndsAt: Number.NaN,
            threshold: 2,
          },
        ]}
      />,
    );

    expect(screen.getAllByText('Unknown time').length).toBeGreaterThan(0);
  });

  it('uses refreshed exam data from refetch before rebuilding the assignment list', async () => {
    let currentExams = [
      { examId: '1', chainId: 31337, state: 1, metaHash: '0x' + '11'.repeat(32), releaseOpensAt: '100', examStartsAt: '200', examEndsAt: '300', threshold: 2, bankHash: null },
    ];
    const refetch = vi.fn(async () => {
      currentExams = [
        { examId: '2', chainId: 31337, state: 1, metaHash: '0x' + '22'.repeat(32), releaseOpensAt: '400', examStartsAt: '500', examEndsAt: '600', threshold: 2, bankHash: null },
      ];
    });

    mockUseAuthGuard.mockReturnValue({
      isAuthorized: true,
      guardState: 'authorized',
      account: '0x1111111111111111111111111111111111111111',
      chainId: '0x7a69',
      roles: ['CENTRE'],
      error: null,
    });

    mockUseExams.mockImplementation(() => ({
      exams: currentExams,
      isLoading: false,
      error: null,
      refetch: vi.fn(async () => currentExams),
    }));

    const contract = {
      getFunction: vi.fn((name: string) => {
        if (name === 'getExam') return vi.fn();
        if (name === 'getPanel') {
          return async () => [[], [], ['0x1111111111111111111111111111111111111111']];
        }
        return vi.fn();
      }),
    };

    mockUseExamVaultContract.mockReturnValue({
      contract: contract as any,
      error: null,
      isLoading: false,
    });

    mockFetchExamMetadata.mockImplementation(async (examId: string) => ({
      title: examId === '1' ? 'Alpha exam' : 'Beta exam',
      sections: [{ name: 'Section A', quota: 3 }],
      bank: 'bank',
      description: 'desc',
    } as any));

    const { rerender } = render(<CentreAssignmentsContainer />);

    await waitFor(() => expect(screen.getByText('Alpha exam')).toBeInTheDocument());

    await act(async () => {
      await refetch();
    });
    rerender(<CentreAssignmentsContainer />);

    await waitFor(() => expect(screen.getByText('Beta exam')).toBeInTheDocument());
    expect(screen.queryByText('Alpha exam')).not.toBeInTheDocument();
  });

  it('moves an upcoming exam into the in-window state when release opens', () => {
    vi.useFakeTimers();
    const releaseAt = Math.floor(Date.now() / 1000) + 30;

    render(
      <CentreAssignmentsView
        pageState="ready"
        assignments={[
          {
            examId: 'upcoming',
            title: 'Release window exam',
            state: 'Draft',
            rosetteHash: '0x' + 'ee'.repeat(32),
            releaseOpensAt: releaseAt,
            examStartsAt: releaseAt + 30,
            examEndsAt: releaseAt + 120,
            threshold: 2,
          },
        ]}
      />,
    );

    expect(screen.getByText('Upcoming')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    expect(screen.getAllByText('In window').length).toBeGreaterThan(0);
  });

  it('ignores stale asynchronous metadata results after a newer request wins', async () => {
    let currentExams = [
      { examId: 'old', chainId: 31337, state: 1, metaHash: '0x' + '11'.repeat(32), releaseOpensAt: '100', examStartsAt: '200', examEndsAt: '300', threshold: 2, bankHash: null },
    ];

    mockUseAuthGuard.mockReturnValue({
      isAuthorized: true,
      guardState: 'authorized',
      account: '0x1111111111111111111111111111111111111111',
      chainId: '0x7a69',
      roles: ['CENTRE'],
      error: null,
    });

    mockUseExams.mockImplementation(() => ({
      exams: currentExams,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }));

    const contract = {
      getFunction: vi.fn((name: string) => {
        if (name === 'getExam') return vi.fn();
        if (name === 'getPanel') {
          return async () => [[], [], ['0x1111111111111111111111111111111111111111']];
        }
        return vi.fn();
      }),
    };

    mockUseExamVaultContract.mockReturnValue({
      contract: contract as any,
      error: null,
      isLoading: false,
    });

    let resolveOld!: (value: any) => void;
    mockFetchExamMetadata.mockImplementation(async (examId: string) => {
      if (examId === 'old') {
        return await new Promise((resolve) => {
          resolveOld = resolve;
        });
      }

      return {
        title: 'Newest exam',
        sections: [{ name: 'Section A', quota: 3 }],
        bank: 'bank',
        description: 'desc',
      } as any;
    });

    const { rerender } = render(<CentreAssignmentsContainer />);
    await waitFor(() => expect(mockFetchExamMetadata).toHaveBeenCalledWith('old'));

    currentExams = [
      { examId: 'new', chainId: 31337, state: 1, metaHash: '0x' + '22'.repeat(32), releaseOpensAt: '400', examStartsAt: '500', examEndsAt: '600', threshold: 2, bankHash: null },
    ];
    rerender(<CentreAssignmentsContainer />);

    await waitFor(() => expect(screen.getByText('Newest exam')).toBeInTheDocument());

    await act(async () => {
      resolveOld({
        title: 'Old exam',
        sections: [{ name: 'Section A', quota: 3 }],
        bank: 'bank',
        description: 'desc',
      });
    });

    expect(screen.getByText('Newest exam')).toBeInTheDocument();
    expect(screen.queryByText('Old exam')).not.toBeInTheDocument();
  });

  it('cleans up the live clock interval on unmount', () => {
    vi.useFakeTimers();

    const { unmount } = render(
      <CentreAssignmentsView
        pageState="ready"
        assignments={[]}
      />,
    );

    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('renders safely under React StrictMode', () => {
    vi.useFakeTimers();

    expect(() =>
      render(
        <React.StrictMode>
          <CentreAssignmentsView
            pageState="ready"
            assignments={[
              {
                examId: 'strict',
                title: 'Strict mode exam',
                state: 'Draft',
                rosetteHash: '0x' + 'ff'.repeat(32),
                releaseOpensAt: Math.floor(Date.now() / 1000) + 20,
                examStartsAt: Math.floor(Date.now() / 1000) + 40,
                examEndsAt: Math.floor(Date.now() / 1000) + 120,
                threshold: 2,
              },
            ]}
          />
        </React.StrictMode>,
      ),
    ).not.toThrow();

    expect(screen.getByText('Upcoming')).toBeInTheDocument();
  });

  it('retries and refreshes the centre assignment list', async () => {
    const refetch = vi.fn().mockResolvedValue([]);

    const { rerender } = render(
      <CentreAssignmentsView
        pageState="error"
        assignments={[]}
        error={new Error('Initial failure')}
        onRetry={() => refetch()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Retry connection/i }));
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));

    rerender(
      <CentreAssignmentsView
        pageState="empty"
        assignments={[]}
      />,
    );

    expect(screen.getByText(/No centre assignments/i)).toBeInTheDocument();
  });
});
