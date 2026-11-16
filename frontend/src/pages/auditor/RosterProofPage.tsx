import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { Button, EmptyState } from '@sigil/ui';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { fetchAuditEventPage, type AuditEvent, type AuditLogFilters } from './audit-log-api';
import { buildRosterProofCsv, type RosterProofHolder } from './roster-proof';
import './auditor.css';

const ZERO = ethers.ZeroHash;
function eventPayload(event: AuditEvent): Record<string, unknown> { return event.payloadJson && typeof event.payloadJson === 'object' && !Array.isArray(event.payloadJson) ? event.payloadJson as Record<string, unknown> : {}; }

async function getIndexedEvents(examId: string): Promise<AuditEvent[]> {
  const events: AuditEvent[] = [];
  const filters: AuditLogFilters = { examId, eventType: '', actor: '', fromDate: '', toDate: '' };
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await fetchAuditEventPage(filters, cursor);
    events.push(...page.events);
    const next = page.nextCursor;
    if (next && (next === cursor || cursors.has(next))) throw new Error('The indexed event cursor repeated; retry after the indexer catches up.');
    if (next) cursors.add(next);
    cursor = next;
  } while (cursor);
  return events;
}

export function RosterProofPage() {
  const guard = useAuthGuard(['AUDITOR']);
  const contractState = useExamVaultContract();
  const contract = contractState.contract;
  const [examId, setExamId] = useState('');
  const [examIds, setExamIds] = useState<string[]>([]);
  const [examListLoading, setExamListLoading] = useState(true);
  const [examListError, setExamListError] = useState<string | null>(null);
  const [holders, setHolders] = useState<RosterProofHolder[]>([]);
  const [threshold, setThreshold] = useState(0);
  const [rosterRoot, setRosterRoot] = useState(ZERO);
  const [rosterRootStatus, setRosterRootStatus] = useState('Not published');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const [listRefresh, setListRefresh] = useState(0);

  useEffect(() => {
    if (!guard.isAuthorized) { setExamListLoading(false); return; }
    if (contractState.isLoading) return;
    if (!contract || !guard.account) { setExamListError(contractState.error?.message ?? 'Connect a wallet to read the examination contract.'); setExamListLoading(false); return; }
    let active = true;
    void (async () => {
      setExamListLoading(true); setExamListError(null);
      try {
        const [role, nextId] = await Promise.all([contract.getFunction('AUDITOR_ROLE')(), contract.getFunction('nextExamId')()]);
        if (!await contract.getFunction('hasRole')(role, guard.account)) throw new Error('The connected wallet no longer has the on-chain Auditor role.');
        const end = BigInt(nextId);
        const ids: string[] = [];
        for (let start = 1n; start < end; start += 20n) {
          const batch = Array.from({ length: Number(end - start > 20n ? 20n : end - start) }, (_, index) => start + BigInt(index));
          const exams = await Promise.all(batch.map(async (id) => {
            try { await contract.getFunction('getExam')(id); return id.toString(); }
            catch { return null; }
          }));
          ids.push(...exams.filter((id): id is string => id !== null));
        }
        if (active) setExamIds(ids.reverse());
      } catch (cause) { if (active) setExamListError(cause instanceof Error ? cause.message : 'On-chain examination list could not be loaded.'); }
      finally { if (active) setExamListLoading(false); }
    })();
    return () => { active = false; };
  }, [contract, contractState.error, contractState.isLoading, guard.account, guard.isAuthorized, listRefresh]);

  const load = useCallback(async (selectedId: string) => {
    if (!contract || !selectedId || !/^\d+$/.test(selectedId)) return;
    const requestId = ++requestRef.current;
    setLoading(true); setError(null); setHolders([]);
    try {
      const [exam, panel, events, root] = await Promise.all([
        contract.getFunction('getExam')(BigInt(selectedId)),
        contract.getFunction('getPanel')(BigInt(selectedId)),
        getIndexedEvents(selectedId),
        contract.getFunction('getRosterRoot')(BigInt(selectedId)),
      ]);
      const assigned = panel[0] as string[];
      const selectedThreshold = Number(exam.threshold ?? exam[7]);
      if (requestId !== requestRef.current) return;
      setThreshold(selectedThreshold);
      setRosterRoot(String(root));
      const rootEvent = events.find((event) => event.type === 'RosterPublished');
      const indexedRoot = rootEvent ? eventPayload(rootEvent).merkleRoot : null;
      setRosterRootStatus(String(root).toLowerCase() === ZERO.toLowerCase()
        ? 'Not published'
        : typeof indexedRoot === 'string' && indexedRoot.toLowerCase() === String(root).toLowerCase()
          ? `Matches indexed RosterPublished event (${rootEvent?.txHash})`
          : rootEvent ? 'Mismatch between chain getter and indexed event' : 'On-chain root present; event not indexed');

      const shareEvents = events.filter((event) => event.type === 'ShareSubmitted');
      const rows = await Promise.all(assigned.map(async (address) => {
        const [randomness, hasRandomness, submitted, shareCommitment] = await Promise.all([
          contract.getFunction('getRandomnessCommitment')(BigInt(selectedId), address),
          contract.getFunction('hasCommittedRandomness')(BigInt(selectedId), address),
          contract.getFunction('hasSubmittedShare')(BigInt(selectedId), address),
          contract.getFunction('getShareCommitment')(BigInt(selectedId), address),
        ]);
        const submittedEvent = shareEvents.find((event) => (event.actor ?? String(eventPayload(event).holder ?? '')).toLowerCase() === address.toLowerCase());
        const indexedShare = submittedEvent ? eventPayload(submittedEvent).shareCommitment : null;
        let verificationStatus: string;
        if (!Boolean(submitted)) verificationStatus = 'No submitted share to verify';
        else if (String(shareCommitment).toLowerCase() === ZERO.toLowerCase()) verificationStatus = 'On-chain getter mismatch: submitted but empty commitment';
        else if (!submittedEvent) verificationStatus = 'On-chain getter confirms submission; ShareSubmitted event not indexed';
        else if (typeof indexedShare === 'string' && indexedShare.toLowerCase() === String(shareCommitment).toLowerCase()) verificationStatus = 'Share commitment matches indexed event and on-chain getter';
        else verificationStatus = 'Mismatch or missing commitment in indexed event';
        return {
          address,
          randomnessStatus: Boolean(hasRandomness) !== (String(randomness).toLowerCase() !== ZERO.toLowerCase())
            ? 'On-chain getter mismatch' as const
            : Boolean(hasRandomness) ? 'Committed on-chain' as const : 'No on-chain commitment' as const,
          shareStatus: Boolean(submitted) ? 'Submitted on-chain' as const : 'Not submitted' as const,
          verificationStatus,
          randomnessCommitment: String(randomness),
          shareCommitment: String(shareCommitment),
          submissionTxHash: submittedEvent?.txHash ?? '',
          submissionBlock: submittedEvent?.blockNumber ?? '',
        };
      }));
      if (requestId === requestRef.current) setHolders(rows);
    } catch (cause) { if (requestId === requestRef.current) setError(cause instanceof Error ? cause.message : 'On-chain roster data could not be verified.'); }
    finally { if (requestId === requestRef.current) setLoading(false); }
  }, [contract]);

  useEffect(() => {
    if (examId) void load(examId);
    else { requestRef.current += 1; setHolders([]); setThreshold(0); setRosterRoot(ZERO); setRosterRootStatus('Not published'); setLoading(false); setError(null); }
  }, [examId, load]);
  const exportCsv = () => {
    if (!examId || holders.length === 0) return;
    const blob = new Blob([buildRosterProofCsv(examId, threshold, holders, rosterRoot)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `sigil-roster-proof-exam-${examId}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  if (!guard.isAuthorized) return <main className="auditor-page"><section className="auditor-card" role="alert"><h1>Auditor access required</h1><p>An authenticated Auditor role is required to view roster proofs.</p></section></main>;
  return <main className="auditor-page" aria-labelledby="roster-proof-title">
    <header className="auditor-heading"><div><p className="eyebrow">Auditor workspace</p><h1 id="roster-proof-title">Roster proof</h1><p>Compare the assigned Holder panel with current contract getters and indexed event references.</p></div><Button variant="secondary" onClick={() => examId ? void load(examId) : setListRefresh((value) => value + 1)} disabled={loading || examListLoading}>Refresh</Button></header>
    <label className="auditor-card">Examination<select value={examId} disabled={examListLoading} onChange={(event) => setExamId(event.currentTarget.value)}><option value="">Select examination</option>{examIds.map((id) => <option key={id} value={id}>Exam {id}</option>)}</select></label>
    {examListLoading && <p role="status">Loading on-chain examinations…</p>}
    {examListError && <p role="alert" className="auditor-error">Exam list could not be loaded: {examListError}</p>}
    {error && <div role="alert" className="auditor-error"><p>{error}</p><Button variant="secondary" onClick={() => void load(examId)}>Retry</Button></div>}
    {loading && <p role="status">Reading assigned panel and commitment status from the contract…</p>}
    {!loading && examId && !error && <>
      <section className="auditor-proof-summary"><article><span>Exam</span><strong>{examId}</strong></article><article><span>Panel size</span><strong>{holders.length}</strong></article><article><span>Share threshold</span><strong>{threshold} of {holders.length}</strong></article><article><span>Share submissions</span><strong>{holders.filter((holder) => holder.shareStatus === 'Submitted on-chain').length} / {holders.length}</strong></article></section>
      <section className="auditor-card"><h2>Candidate roster root</h2><p><code>{rosterRoot}</code></p><p>{rosterRootStatus}</p><p className="auditor-note">The contract exposes the roster root but no candidate inclusion proof or roster contents. A root match confirms only that the indexed event matches the contract getter.</p></section>
      {holders.length === 0 ? <EmptyState title="No assigned Holders" description="The selected exam has no Holder panel in the contract." /> : <><div className="auditor-actions"><Button onClick={exportCsv}>Export roster summary (CSV)</Button></div><div className="auditor-table-wrap" role="region" aria-label="Holder roster proof table" tabIndex={0}><table className="auditor-table"><thead><tr><th>Assigned Holder</th><th>Randomness status</th><th>Share status</th><th>Commitment verification</th><th>Share event reference</th></tr></thead><tbody>{holders.map((holder) => <tr key={holder.address}><td><code>{holder.address}</code></td><td>{holder.randomnessStatus}{holder.randomnessStatus === 'Committed on-chain' && <small><code>{holder.randomnessCommitment}</code></small>}</td><td>{holder.shareStatus}{holder.shareStatus === 'Submitted on-chain' && <small><code>{holder.shareCommitment}</code></small>}</td><td>{holder.verificationStatus}</td><td>{holder.submissionTxHash ? <><code>{holder.submissionTxHash}</code><small>Block {holder.submissionBlock}</small></> : 'No indexed reference'}</td></tr>)}</tbody></table></div></>}
      <p className="auditor-note">A commitment is a hash, not proof that a Shamir share is mathematically valid. The UI never reads or displays plaintext shares. Share submission is a chain status only; protected reconstruction and full release authorization are not proven by this view.</p>
    </>}
    {!examId && !examListLoading && !examListError && examIds.length === 0 && <EmptyState title="No examinations available" description="No on-chain examination records are available to inspect." />}
  </main>;
}
