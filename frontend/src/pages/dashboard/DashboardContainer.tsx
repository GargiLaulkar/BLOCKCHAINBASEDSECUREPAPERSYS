import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ethers } from 'ethers';
import { useAuth } from '../../auth/AuthContext';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { useExams } from '../../hooks/useExams';
import { fetchDashboardEvents, fetchDashboardStats, type DashboardEvent, type DashboardStats } from './api';
import { DashboardView, type DashboardExam, type DashboardRole } from './DashboardView';
import './dashboard.css';

const zeroHash = ethers.ZeroHash;

export function DashboardContainer({ role }: { role: DashboardRole }) {
  const guard = useAuthGuard([role]);
  const auth = useAuth();
  const contractState = useExamVaultContract();
  const contract = contractState.contract;
  const examState = useExams({ enabled: guard.isAuthorized });
  const [examRows, setExamRows] = useState<DashboardExam[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [leakEvents, setLeakEvents] = useState<DashboardEvent[]>([]);
  const [loadingChain, setLoadingChain] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataWarning, setDataWarning] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const refresh = useCallback(async () => {
    setError(null);
    setDataWarning(null);
    try { await examState.refetch(); } catch { /* the hook exposes its error */ }
    setRefreshVersion((version) => version + 1);
  }, [examState.refetch]);

  useEffect(() => {
    if (!guard.isAuthorized) return;
    const controller = new AbortController();
    void Promise.allSettled([
      fetchDashboardStats(controller.signal),
      fetchDashboardEvents({ limit: 8, actor: role === 'CENTRE' || role === 'HOLDER' ? guard.account : null, signal: controller.signal }),
      fetchDashboardEvents({ type: 'LeakReported', limit: 8, signal: controller.signal }),
    ]).then(([statsResult, eventsResult, leaksResult]) => {
      if (controller.signal.aborted) return;
      const failures: string[] = [];
      if (statsResult.status === 'fulfilled') setStats(statsResult.value);
      else { setStats(null); failures.push('aggregate statistics'); }
      if (eventsResult.status === 'fulfilled') setEvents(eventsResult.value);
      else { setEvents([]); failures.push('recent indexed events'); }
      if (leaksResult.status === 'fulfilled') setLeakEvents(leaksResult.value);
      else { setLeakEvents([]); failures.push('leak report events'); }
      setDataWarning(failures.length ? `Some data is unavailable: ${failures.join(', ')}. The indexer or statistics service may be delayed.` : null);
    });
    return () => controller.abort();
  }, [guard.account, guard.isAuthorized, refreshVersion, role]);

  const panelContract = useMemo(() => contract ? {
    getPanel: async (id: bigint) => contract.getFunction('getPanel')(id),
    getExam: async (id: bigint) => contract.getFunction('getExam')(id),
  } : null, [contract]);

  useEffect(() => {
    let active = true;
    async function read() {
      if (!guard.isAuthorized) { setLoadingChain(false); return; }
      if (contractState.isLoading || examState.isLoading) return;
      if (examState.error || !contract || !panelContract) {
        setError(examState.error?.message ?? contractState.error?.message ?? 'A wallet-backed contract connection is required.');
        setLoadingChain(false);
        return;
      }
      setLoadingChain(true);
      setError(null);
      try {
        const roleHash = await contract.getFunction(`${role}_ROLE`)();
        const hasRole = await contract.getFunction('hasRole')(roleHash, guard.account);
        if (!hasRole) throw new Error(`The connected wallet no longer has the ${role} role on-chain.`);
        const rows = await Promise.all(examState.exams.map(async (summary) => {
          const id = BigInt(summary.examId);
          const [exam, panel] = await Promise.all([panelContract.getExam(id), panelContract.getPanel(id)]);
          const [holders, , centres] = panel;
          const authority = String(exam.authority ?? exam[2]).toLowerCase();
          const account = guard.account?.toLowerCase() ?? '';
          const allowed = role === 'AUTHORITY' ? authority === account
            : role === 'HOLDER' ? holders.some((address: string) => address.toLowerCase() === account)
              : role === 'CENTRE' ? centres.some((address: string) => address.toLowerCase() === account)
                : true;
          if (!allowed) return null;
          const row: DashboardExam = {
            examId: summary.examId,
            state: Number(exam.state ?? exam[1]),
            releaseOpensAt: Number(exam.releaseOpensAt ?? exam[4]),
            examStartsAt: Number(exam.examStartsAt ?? exam[5]),
            examEndsAt: Number(exam.examEndsAt ?? exam[6]),
            threshold: Number(exam.threshold ?? exam[7]),
            holderCount: holders.length,
          };
          if (role === 'HOLDER' && guard.account) {
            const [commitment, submitted] = await Promise.all([
              contract.getFunction('getRandomnessCommitment')(id, guard.account),
              contract.getFunction('hasSubmittedShare')(id, guard.account),
            ]);
            row.randomnessCommitted = String(commitment).toLowerCase() !== zeroHash.toLowerCase();
            row.shareSubmitted = Boolean(submitted);
          }
          return row;
        }));
        if (active) setExamRows(rows.filter((row): row is DashboardExam => row !== null));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'On-chain role and examination data could not be read.');
      } finally {
        if (active) setLoadingChain(false);
      }
    }
    void read();
    return () => { active = false; };
  }, [contract, contractState.error, contractState.isLoading, examState.error, examState.exams, examState.isLoading, guard.account, guard.isAuthorized, panelContract, refreshVersion, role]);

  const pageState = !guard.isAuthorized ? 'error'
    : contractState.isLoading || examState.isLoading || loadingChain ? 'loading'
      : error || examState.error || contractState.error ? 'error'
        : examRows.length === 0 ? 'empty' : 'ready';

  if (!guard.isAuthorized) return <main className="dashboard-page"><section className="dashboard-card" role="alert"><h1>Role access required</h1><p>{guard.error ?? `An authenticated ${role} account is required.`}</p></section></main>;
  return <DashboardView role={role} pageState={pageState} exams={examRows} stats={stats} events={events} leakEvents={leakEvents} chainTime={auth.chainTime} error={error ?? examState.error?.message ?? contractState.error?.message ?? null} dataWarning={dataWarning} userRoles={auth.roles} onRetry={() => void refresh()} />;
}

export function DashboardLanding() {
  const { roles: userRoles } = useAuth();
  const destinations: Array<[DashboardRole, string, string]> = [
    ['AUTHORITY', 'Authority', 'Exam portfolio, participant counts and recent activity.'],
    ['CENTRE', 'Centre', 'Assigned exams, release windows and paper station status.'],
    ['HOLDER', 'Holder', 'Assigned exams and on-chain ceremony responsibilities.'],
    ['AUDITOR', 'Auditor', 'Audit-ready exams and indexed leak reports.'],
  ];
  const available = destinations.filter(([role]) => userRoles.includes(role));
  return <main className="dashboard-page"><p className="eyebrow">SIGIL · Role workspaces</p><h1>Dashboard</h1>{available.length === 0 ? <section className="dashboard-card"><h2>No role dashboard available</h2><p>Sign in with an Authority, Centre, Holder, or Auditor account to open its workspace.</p><Link to="/">Return home</Link></section> : <div className="dashboard-role-grid">{available.map(([role, label, description]) => <Link className="dashboard-role-card" key={role} to={`/dashboard/${role.toLowerCase()}`}><strong>{label} dashboard</strong><span>{description}</span><span className="dashboard-role-open">Open workspace →</span></Link>)}</div>}</main>;
}
