import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { useExams } from '../../hooks/useExams';
import { useTransaction } from '../../shell/AppShell';
import { fetchLeakReports, type IndexedLeakReport } from './api';
import { LeakTracerView, type LeakDraft } from './LeakTracerView';
import { leakEvidenceHash, submitLeakReportOnChain, type LeakReportContract } from './submission';

const HASH32 = /^0x[0-9a-f]{64}$/i;
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const initialDraft: LeakDraft = { examId: '', description: '', suspectCentre: '', matchedVariantHash: '' };

export function LeakTracerContainer() {
  const guard = useAuthGuard(['AUDITOR']);
  const { account } = useAuth();
  const contractState = useExamVaultContract();
  const contract = contractState.contract;
  const examsState = useExams({ enabled: guard.isAuthorized });
  const transaction = useTransaction();
  const [reports, setReports] = useState<IndexedLeakReport[]>([]);
  const [draft, setDraft] = useState(initialDraft);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const exams = useMemo(() => examsState.exams.map((exam) => ({ examId: exam.examId, title: `Examination ${exam.examId}` })), [examsState.exams]);
  const evidenceHash = useMemo(() => {
    try { return leakEvidenceHash(draft.description); } catch { return ''; }
  }, [draft.description]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setReports(await fetchLeakReports());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Leak report history is temporarily unavailable.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setIsLoading(true);
      if (!guard.isAuthorized || !contract || !account) {
        setIsLoading(false);
        return;
      }
      try {
        const role = await contract.getFunction('AUDITOR_ROLE')();
        const hasRole = await contract.getFunction('hasRole')(role, account);
        if (active) setAuthorized(Boolean(hasRole));
        if (hasRole) {
          const list = await fetchLeakReports();
          if (active) setReports(list);
        }
      } catch {
        if (active) setError('Auditor role or indexed report history could not be verified. Retry.');
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [account, contract, guard.isAuthorized]);

  const submit = async () => {
    setError(null);
    setTxHash(null);
    if (!contract || !account || !authorized) {
      setError('An active on-chain Auditor role and connected wallet are required.');
      return;
    }
    if (!/^\d+$/.test(draft.examId) || draft.examId === '0' || !evidenceHash || !HASH32.test(draft.matchedVariantHash)) {
      setError('Select an examination, provide a description, and enter a valid 32-byte variant hash.');
      return;
    }
    if (draft.suspectCentre && !ADDRESS.test(draft.suspectCentre)) {
      setError('The suspected Centre must be a valid Ethereum address.');
      return;
    }
    if (!window.confirm('Submit this leak report to the blockchain? The evidence hash and report fields will be public.')) return;

    setIsSubmitting(true);
    transaction.startTx('Submit leak report');
    let transactionPending = false;
    try {
      transaction.setTxAwaitingSignature();
      const { response } = await submitLeakReportOnChain(contract as unknown as LeakReportContract, {
        examId: draft.examId,
        evidenceDescription: draft.description,
        suspectCentre: draft.suspectCentre,
        matchedVariantHash: draft.matchedVariantHash,
      });
      transaction.setTxPending(response.hash);
      transactionPending = true;
      const receipt = await response.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Transaction was not confirmed successfully.');
      setTxHash(response.hash);
      transaction.setTxConfirmed(response.hash);
      setReviewing(false);
      setDraft(initialDraft);
      await refresh();
    } catch (cause) {
      const message = cause instanceof Error && /user rejected|ACTION_REJECTED/i.test(cause.message)
        ? 'Wallet signature was cancelled.'
        : 'Leak report transaction failed. Check the exam, Centre assignment, variant hash, and exam state.';
      setError(message);
      if (transactionPending) transaction.setTxFailed(message);
      else transaction.clearTx();
    } finally {
      setIsSubmitting(false);
    }
  };

  const pageState = !guard.isAuthorized || authorized === false ? 'unauthorized' : isLoading || examsState.isLoading || contractState.isLoading ? 'loading' : (error || examsState.error || contractState.error) && reports.length === 0 ? 'error' : reports.length === 0 ? 'empty' : 'ready';
  return <LeakTracerView pageState={pageState} reports={reports} exams={exams} draft={draft} evidenceHash={evidenceHash} error={error ?? examsState.error?.message ?? contractState.error?.message ?? null} txHash={txHash} isSubmitting={isSubmitting} reviewing={reviewing} onDraftChange={setDraft} onReview={() => { setError(null); setReviewing(true); }} onCancelReview={() => setReviewing(false)} onSubmit={() => void submit()} onRetry={() => { void examsState.refetch(); void refresh(); }} onRefresh={() => void refresh()} />;
}
