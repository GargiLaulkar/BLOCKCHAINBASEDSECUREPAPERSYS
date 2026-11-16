import React from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState } from '@sigil/ui';
import type { DashboardEvent, DashboardStats } from './api';

export type DashboardRole = 'AUTHORITY' | 'CENTRE' | 'HOLDER' | 'AUDITOR';
export interface DashboardExam {
  examId: string;
  state: number;
  releaseOpensAt: number;
  examStartsAt: number;
  examEndsAt: number;
  threshold: number;
  holderCount?: number;
  randomnessCommitted?: boolean;
  shareSubmitted?: boolean;
}
interface Props {
  role: DashboardRole;
  pageState: 'loading' | 'error' | 'empty' | 'ready';
  exams: DashboardExam[];
  stats: DashboardStats | null;
  events: DashboardEvent[];
  leakEvents: DashboardEvent[];
  chainTime: number | null;
  error: string | null;
  dataWarning: string | null;
  userRoles: readonly string[];
  onRetry: () => void;
}

const STATES = ['Draft', 'Collecting', 'Sealed', 'Released', 'Concluded', 'Cancelled'];
const stateKey = ['draft', 'collecting', 'sealed', 'released', 'concluded', 'cancelled'] as const;
function formatTime(value: number) {
  return Number.isFinite(value) && value > 0 ? new Date(value * 1000).toLocaleString() : 'Not available';
}

export function DashboardView({ role, pageState, exams, stats, events, leakEvents, chainTime, error, dataWarning, userRoles, onRetry }: Props) {
  if (pageState === 'loading') return <main className="dashboard-page"><p role="status">Loading verified dashboard data…</p><div className="dashboard-skeleton" /></main>;
  if (pageState === 'error') return <main className="dashboard-page"><section className="dashboard-card" role="alert"><h1>Dashboard data unavailable</h1><p>{error ?? 'The requested data could not be loaded.'}</p><Button onClick={onRetry}>Retry</Button></section></main>;
  const counts = exams.reduce((result, exam) => { const key = stateKey[exam.state]; if (key) result[key]++; return result; }, { draft: 0, collecting: 0, sealed: 0, released: 0, concluded: 0, cancelled: 0 });
  const upcoming = chainTime === null ? null : exams.filter((exam) => exam.examStartsAt > chainTime && exam.state < 3);
  const title = { AUTHORITY: 'Authority dashboard', CENTRE: 'Centre dashboard', HOLDER: 'Holder dashboard', AUDITOR: 'Auditor dashboard' }[role];
  const detailPath = (examId: string) => role === 'AUTHORITY' ? `/authority/exams/${examId}` : role === 'HOLDER' ? `/holder/exams/${examId}` : role === 'CENTRE' ? '/centre/station' : '/auditor/tracer';
  const stateCard = (key: typeof stateKey[number], label: string) => <Link className="dashboard-metric" to={role === 'AUTHORITY' ? `/authority/docket?state=${key}` : role === 'CENTRE' ? '/centre/station' : role === 'HOLDER' ? '/holder/console' : '/auditor/tracer'} key={key}><span>{label}</span><strong>{counts[key]}</strong></Link>;
  const visibleExams = role === 'AUDITOR' ? exams.filter((exam) => [3, 4, 5].includes(exam.state)) : exams;

  return <main className="dashboard-page" aria-labelledby="dashboard-title">
    <header className="dashboard-heading"><div><p className="eyebrow">SIGIL · Role workspace</p><h1 id="dashboard-title">{title}</h1><p>Live summaries from indexed examination records and on-chain state.</p></div><Button variant="secondary" onClick={onRetry}>Refresh data</Button></header>
    {dataWarning && <p className="dashboard-warning" role="status">{dataWarning}</p>}
    <section className="dashboard-metrics" aria-label="Examination metrics">
      {role === 'AUTHORITY' ? <>
        <article className="dashboard-metric"><span>Examinations assigned to this Authority</span><strong>{exams.length}</strong></article>
        {stateCard('draft', 'Draft')}{stateCard('collecting', 'Collecting')}{stateCard('sealed', 'Scheduled / sealed')}{stateCard('released', 'Released')}{stateCard('concluded', 'Concluded')}
        <article className="dashboard-metric"><span>Registered Centres (system-wide)</span><strong>{stats ? stats.participantsByRole.CENTRE : 'Not available'}</strong></article>
        <article className="dashboard-metric"><span>Registered Holders (system-wide)</span><strong>{stats ? stats.participantsByRole.HOLDER : 'Not available'}</strong></article>
      </> : role === 'CENTRE' ? <>
        <article className="dashboard-metric"><span>Assigned examinations</span><strong>{exams.length}</strong></article>
        <article className="dashboard-metric"><span>Upcoming</span><strong>{upcoming === null ? 'Not available' : upcoming.length}</strong></article>
        {stateCard('released', 'Released')}{stateCard('concluded', 'Concluded')}
        <article className="dashboard-metric dashboard-metric--note"><span>Paper station</span><strong>Unavailable</strong><small>Protected generation and managed print services are not configured.</small></article>
      </> : role === 'HOLDER' ? <>
        <article className="dashboard-metric"><span>Assigned examinations</span><strong>{exams.length}</strong></article>
        <article className="dashboard-metric"><span>Randomness commitments</span><strong>{exams.filter((exam) => exam.randomnessCommitted).length} / {exams.length}</strong></article>
        <article className="dashboard-metric"><span>Recorded share submissions</span><strong>{exams.filter((exam) => exam.shareSubmitted).length} / {exams.length}</strong></article>
        <article className="dashboard-metric dashboard-metric--note"><span>Share submission</span><strong>Restricted</strong><small>The current deployed interface blocks the reveal-bearing transaction path.</small></article>
      </> : <>
        <article className="dashboard-metric"><span>Examinations available to audit</span><strong>{exams.filter((exam) => [3, 4, 5].includes(exam.state)).length}</strong></article>
        <article className="dashboard-metric"><span>Latest leak-report events</span><strong>{leakEvents.length}</strong><small>At most 8 indexed events on this page</small></article>
        <article className="dashboard-metric"><span>Indexed events</span><strong>{stats?.totalEvents ?? 'Not available'}</strong></article>
      </>}
    </section>

    <nav className="dashboard-actions" aria-label="Dashboard quick actions">
      {role === 'AUTHORITY' && <><Link to="/authority/create">Create examination</Link><Link to="/authority/docket">View examinations</Link>{userRoles.includes('ADMIN') && <Link to="/admin/participants">Manage participants</Link>}{userRoles.includes('AUDITOR') && <Link to="/auditor/tracer">Leak Tracer</Link>}<Link to="/verify">Public verifier</Link></>}
      {role === 'CENTRE' && <><Link to="/centre/station">Assigned examinations & paper station</Link><Link to="/verify">Public verifier</Link></>}
      {role === 'HOLDER' && <><Link to="/holder/console">Holder console</Link><Link to="/verify">Public verifier</Link></>}
      {role === 'AUDITOR' && <><Link to="/auditor/tracer">Open Leak Tracer</Link><Link to="/auditor/audit-logs">Audit Log Explorer</Link><Link to="/auditor/evidence-report">Evidence PDF reports</Link><Link to="/auditor/decoys">Decoy monitor</Link><Link to="/auditor/roster-proof">Roster proof</Link><Link to="/verify">Public verifier</Link></>}
    </nav>

    <div className="dashboard-columns">
      <section className="dashboard-card"><h2>{role === 'CENTRE' ? 'Assigned examinations' : role === 'HOLDER' ? 'Holder assignments' : role === 'AUDITOR' ? 'Examinations for review' : 'Examination overview'}</h2>
        {visibleExams.length === 0 ? <EmptyState title="No examinations found" description="No matching on-chain examination records are currently available for this role." /> : <div className="dashboard-table-wrap" role="region" aria-label="Examination overview table" tabIndex={0}><table className="dashboard-table"><thead><tr><th>Exam</th><th>State</th><th>Release opens</th><th>Exam window</th>{role === 'HOLDER' && <th>Responsibilities</th>}</tr></thead><tbody>{visibleExams.map((exam) => <tr key={exam.examId}><td><Link to={detailPath(exam.examId)}>Exam {exam.examId}</Link></td><td><span className={`dashboard-state dashboard-state--${STATES[exam.state]?.toLowerCase() ?? 'unknown'}`}>{STATES[exam.state] ?? 'Unknown'}</span></td><td>{formatTime(exam.releaseOpensAt)}</td><td>{formatTime(exam.examStartsAt)} – {formatTime(exam.examEndsAt)}</td>{role === 'HOLDER' && <td>{exam.randomnessCommitted ? 'Randomness committed' : 'Commitment pending'} · {exam.shareSubmitted ? 'Share submitted' : 'No share submission recorded'}</td>}</tr>)}</tbody></table></div>}
      </section>
      <section className="dashboard-card"><h2>{role === 'AUDITOR' ? 'Recent leak reports' : 'Recent blockchain activity'}</h2>{(role === 'AUDITOR' ? leakEvents : events).length === 0 ? <EmptyState title="No indexed activity" description="No matching indexed events are available yet. The indexer may still be catching up." /> : <ul className="dashboard-event-list">{(role === 'AUDITOR' ? leakEvents : events).map((event) => <li key={event.id}><Link to={event.examId ? detailPath(event.examId) : role === 'AUDITOR' ? '/auditor/tracer' : '/dashboard'}><strong>{event.type}</strong>{event.examId && <span>Exam {event.examId}</span>}</Link><time>{formatTime(Number(event.blockTimestamp))}</time><small>Block {event.blockNumber} · {event.txHash.slice(0, 10)}…</small></li>)}</ul>}</section>
    </div>
    {role === 'AUTHORITY' && <p className="dashboard-footnote">The examination table and status counts are limited to exams owned by this Authority. Participant totals are system-wide indexed account counts.</p>}
  </main>;
}
