import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { useExams, type ExamPanelContract } from '../../hooks/useExams';
import { examStateFromChain } from '../command-centre/logic';
import { fetchExamMetadata } from '../holder/api';
import { CentreAssignmentsView } from './CentreAssignmentsView';
import { requestCentrePaper, type CentrePaperIntent } from './api';
import type { CentreExamAssignment } from './types';

export function CentreAssignmentsContainer() {
  const guard = useAuthGuard(['CENTRE']);
  const contractState = useExamVaultContract();
  const rawContract = contractState.contract;
  const requestRef = useRef(0);
  const mountedRef = useRef(false);
  const pendingPaperRequests = useRef(new Set<string>());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const panelContract = useMemo<ExamPanelContract | null>(() => {
    if (!rawContract) return null;
    return {
      getExam: async (id) => {
        const result = await rawContract.getFunction('getExam')(id);
        return {
          authority: String(result.authority ?? result[2]),
          state: Number(result.state ?? result[1]),
        };
      },
      getPanel: async (id) => {
        const result = await rawContract.getFunction('getPanel')(id);
        return [
          Array.from(result[0], (address: unknown) => String(address)),
          Array.from(result[1], (address: unknown) => String(address)),
          Array.from(result[2], (address: unknown) => String(address)),
        ];
      },
    };
  }, [rawContract]);

  const exams = useExams({
    enabled: guard.isAuthorized && panelContract !== null,
    assignedOnly: true,
    userAddress: guard.account,
    contract: panelContract,
  });

  const [assignments, setAssignments] = useState<CentreExamAssignment[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<Error | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [paperRequestStatus, setPaperRequestStatus] = useState<Record<string, { state: 'pending' | 'blocked'; message?: string }>>({});

  const requestPaper = useCallback(async (requestedExamId: string, intent: CentrePaperIntent, reason?: string) => {
    if (pendingPaperRequests.current.has(requestedExamId)) return;
    pendingPaperRequests.current.add(requestedExamId);
    setPaperRequestStatus((current) => ({ ...current, [requestedExamId]: { state: 'pending' } }));
    try {
      await requestCentrePaper(requestedExamId, intent, reason);
      setPaperRequestStatus((current) => ({
        ...current,
        [requestedExamId]: { state: 'blocked', message: 'No paper artifact was returned.' },
      }));
    } catch (error) {
      setPaperRequestStatus((current) => ({
        ...current,
        [requestedExamId]: {
          state: 'blocked',
          message: error instanceof Error ? error.message : 'The paper request could not be completed.',
        },
      }));
    } finally {
      pendingPaperRequests.current.delete(requestedExamId);
    }
  }, []);

  const loadAssignments = useCallback(async () => {
    if (!guard.isAuthorized || !guard.account) {
      requestRef.current += 1;
      if (mountedRef.current) {
        setAssignments([]);
        setIsReading(false);
        setReadError(null);
      }
      return;
    }

    if (exams.error) {
      requestRef.current += 1;
      if (mountedRef.current) {
        setAssignments([]);
        setReadError(exams.error);
      }
      return;
    }

    if (!rawContract) {
      requestRef.current += 1;
      if (mountedRef.current) {
        setAssignments([]);
        setReadError(contractState.error ?? new Error('A connected wallet is required to read centre assignments.'));
      }
      return;
    }

    const requestId = ++requestRef.current;
    if (mountedRef.current) {
      setIsReading(true);
      setReadError(null);
    }

    try {
      const mapped = await Promise.all(
        exams.exams.map(async (summary) => {
          const state = examStateFromChain(summary.state);
          if (!state) {
            throw new Error(`Exam No. ${summary.examId.padStart(4, '0')} has an unknown chain state.`);
          }

          const metadata = await fetchExamMetadata(summary.examId);
          return {
            examId: summary.examId,
            title: metadata.title,
            state,
            rosetteHash: summary.metaHash,
            releaseOpensAt: Number(summary.releaseOpensAt),
            examStartsAt: Number(summary.examStartsAt),
            examEndsAt: Number(summary.examEndsAt),
            threshold: summary.threshold,
          } satisfies CentreExamAssignment;
        }),
      );

      if (!mountedRef.current || requestId !== requestRef.current) {
        return;
      }

      setAssignments(mapped);
    } catch (thrownError) {
      if (!mountedRef.current || requestId !== requestRef.current) {
        return;
      }

      setAssignments([]);
      setReadError(
        thrownError instanceof Error
          ? thrownError
          : new Error('Centre assignments could not be loaded.'),
      );
    } finally {
      if (mountedRef.current && requestId === requestRef.current) {
        setIsReading(false);
      }
    }
  }, [contractState.error, exams.error, exams.exams, guard.account, guard.isAuthorized, rawContract]);

  useEffect(() => {
    if (exams.isLoading || contractState.isLoading) return;
    void loadAssignments();
  }, [contractState.isLoading, exams.isLoading, loadAssignments, refreshVersion]);

  const retry = useCallback(async () => {
    setReadError(null);
    try {
      await exams.refetch();
      if (mountedRef.current) {
        setRefreshVersion((current) => current + 1);
      }
    } catch (thrownError) {
      if (!mountedRef.current) return;
      setReadError(
        thrownError instanceof Error
          ? thrownError
          : new Error('Centre assignments could not be refreshed.'),
      );
    }
  }, [exams.refetch]);

  const pageState = !guard.isAuthorized
    ? 'permission'
    : exams.isLoading || contractState.isLoading || isReading
      ? 'loading'
      : readError || contractState.error
        ? 'error'
        : assignments.length === 0
          ? 'empty'
          : 'ready';

  return (
    <CentreAssignmentsView
      pageState={pageState}
      assignments={assignments}
      error={readError ?? contractState.error}
      onRetry={() => void retry()}
      paperRequestStatus={paperRequestStatus}
      onPaperRequest={(requestedExamId, intent, reason) => void requestPaper(requestedExamId, intent, reason)}
    />
  );
}
