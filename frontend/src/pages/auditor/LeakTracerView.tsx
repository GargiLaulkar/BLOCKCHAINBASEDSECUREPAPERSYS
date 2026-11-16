import React from 'react';
import { Button, EmptyState, HashChip, Serial } from '@sigil/ui';
import type { IndexedLeakReport } from './api';
import './auditor.css';

export interface LeakDraft {
  examId: string;
  description: string;
  suspectCentre: string;
  matchedVariantHash: string;
}

interface Props {
  pageState: 'loading' | 'error' | 'empty' | 'ready' | 'unauthorized';
  reports: IndexedLeakReport[];
  exams: ReadonlyArray<{ examId: string; title: string }>;
  draft: LeakDraft;
  evidenceHash: string;
  error: string | null;
  txHash: string | null;
  isSubmitting: boolean;
  reviewing: boolean;
  onDraftChange: (draft: LeakDraft) => void;
  onReview: () => void;
  onCancelReview: () => void;
  onSubmit: () => void;
  onRetry: () => void;
  onRefresh: () => void;
}

export function LeakTracerView(props: Props) {
  const {
    pageState, reports, exams, draft, evidenceHash, error, txHash, isSubmitting,
    reviewing, onDraftChange, onReview, onCancelReview, onSubmit, onRetry, onRefresh,
  } = props;

  if (pageState === 'unauthorized') return <section className="auditor-card" role="alert"><h1>Auditor access required</h1><p>This wallet does not have an active Auditor role.</p></section>;
  if (pageState === 'loading') return <section className="auditor-card" aria-label="Loading leak reports"><p role="status">Loading examinations and on-chain leak reports…</p></section>;
  if (pageState === 'error' && reports.length === 0 && exams.length === 0) return <section className="auditor-card" role="alert"><h1>Leak tracer unavailable</h1><p>{error}</p><Button onClick={onRetry}>Retry</Button></section>;

  const set = (key: keyof LeakDraft, value: string) => onDraftChange({ ...draft, [key]: value });
  return (
    <section className="auditor-page" aria-labelledby="leak-tracer-title">
      <header className="auditor-heading"><div><p className="eyebrow">Auditor workspace</p><h1 id="leak-tracer-title">Leak tracer</h1><p>Submit a suspected leak against the registered Centre variant and review confirmed on-chain reports.</p></div><Button variant="secondary" onClick={onRefresh}>Refresh history</Button></header>
      {error && <p role="alert" className="auditor-error">{error}</p>}
      {txHash && <p role="status" className="auditor-success">Transaction confirmed on-chain: <code>{txHash}</code>. The indexer may take a moment to add it to history.</p>}
      <div className="auditor-layout">
        <form className="auditor-card" onSubmit={(event) => { event.preventDefault(); reviewing ? onSubmit() : onReview(); }}>
          <h2>Report suspected leak</h2>
          <label>Examination<select required value={draft.examId} disabled={reviewing} onChange={(event) => set('examId', event.target.value)}><option value="">Select examination</option>{exams.map((exam) => <option key={exam.examId} value={exam.examId}>No. {exam.examId} · {exam.title}</option>)}</select></label>
          <label>Evidence description<textarea required minLength={10} maxLength={4000} value={draft.description} disabled={reviewing} onChange={(event) => set('description', event.target.value)} placeholder="Describe what was observed. Do not include confidential question text unless policy permits." /></label>
          <p className="auditor-note">No protected evidence-file storage is configured. The description is hashed locally; only its hash is sent on-chain. The text is not uploaded or saved by this screen. A hash supports integrity comparison; it does not prove the evidence is true or authentic.</p>
          <label>Suspected Centre address (optional)<input value={draft.suspectCentre} disabled={reviewing} onChange={(event) => set('suspectCentre', event.target.value)} placeholder="Leave blank for unattributed report" /></label>
          <label>Matched registered variant hash<input required value={draft.matchedVariantHash} disabled={reviewing} onChange={(event) => set('matchedVariantHash', event.target.value)} placeholder="0x… (32-byte hash)" /></label>
          {reviewing && <div className="auditor-review" role="group" aria-label="Confirm report details"><h3>Review before wallet signing</h3><p>Evidence hash: <code>{evidenceHash}</code></p><p>Contract will validate the exam state, Auditor role, Centre assignment and registered variant hash. The evidence description itself is not stored on-chain.</p></div>}
          <div className="auditor-actions">{reviewing && <Button type="button" variant="secondary" onClick={onCancelReview}>Edit report</Button>}<Button type="submit" disabled={isSubmitting || exams.length === 0}>{isSubmitting ? 'Waiting for confirmation…' : reviewing ? 'Confirm and submit on-chain' : 'Review report'}</Button></div>
        </form>
        <section className="auditor-card" aria-labelledby="report-history-title"><div className="auditor-card-heading"><h2 id="report-history-title">Confirmed reports</h2><span>Latest 100 indexed events</span></div>{reports.length === 0 ? <EmptyState title="No indexed leak reports" description="Confirmed LeakReported events will appear here after the indexer processes them." /> : <div className="auditor-table-wrap" role="region" aria-label="Confirmed leak reports table" tabIndex={0}><table className="auditor-table"><thead><tr><th>Report</th><th>Exam</th><th>Reporter</th><th>Evidence / variant</th><th>Submitted</th><th>Transaction</th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td><Serial id={report.id.slice(-10)} /></td><td>{report.examId}</td><td><HashChip hash={report.auditor} /></td><td><div><small>Evidence</small><HashChip hash={report.evidenceHash} /></div><div><small>Variant</small><HashChip hash={report.matchedVariantHash} /></div><div><small>Centre</small>{report.suspectCentre === '0x0000000000000000000000000000000000000000' ? 'Unattributed' : <HashChip hash={report.suspectCentre} />}</div></td><td>{new Date(Number(report.timestamp) * 1000).toLocaleString()}</td><td><a id={`tx-${report.txHash}`} href={`#tx-${report.txHash}`}>{report.txHash.slice(0, 10)}…</a><small>Block {report.blockNumber}</small></td></tr>)}</tbody></table></div>}</section>
      </div>
      {pageState === 'error' && <p role="alert" className="auditor-error">History refresh failed. <Button variant="secondary" onClick={onRetry}>Retry</Button></p>}
    </section>
  );
}
