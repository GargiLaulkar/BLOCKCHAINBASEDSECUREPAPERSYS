import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { Button, EmptyState } from '@sigil/ui';
import { useAuth } from '../../auth/AuthContext';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { useExamVaultContract } from '../../contracts/useExamVaultContract';
import { useExams } from '../../hooks/useExams';
import { useTransaction } from '../../shell/AppShell';
import { fetchAuditEventPage, type AuditEvent, type AuditLogFilters } from './audit-log-api';
import { registerDecoyOnChain, type DecoyContract } from './decoy-registration';
import './auditor.css';

interface DecoyRecord { id: string; examId: string; decoyHash: string; channelLabel: string; txHash: string; blockNumber: string; timestamp: string; }
function eventToDecoy(event: AuditEvent): DecoyRecord | null {
  if (event.type !== 'DecoyRegistered' || !event.payloadJson || typeof event.payloadJson !== 'object') return null;
  const payload = event.payloadJson as Record<string, unknown>;
  if (typeof payload.examId !== 'string' || typeof payload.decoyHash !== 'string' || typeof payload.channelLabel !== 'string') return null;
  return { id: `${event.txHash}:${event.logIndex}`, examId: payload.examId, decoyHash: payload.decoyHash, channelLabel: payload.channelLabel, txHash: event.txHash, blockNumber: event.blockNumber, timestamp: event.blockTimestamp };
}

export function DecoyManagerPage() {
  const auth = useAuth();
  const guard = useAuthGuard(['AUDITOR', 'AUTHORITY']);
  const contractState = useExamVaultContract();
  const contract = contractState.contract;
  const examsState = useExams({ enabled: guard.isAuthorized });
  const transaction = useTransaction();
  const [records, setRecords] = useState<DecoyRecord[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [examId, setExamId] = useState('');
  const [channelLabel, setChannelLabel] = useState('');
  const [decoyHash, setDecoyHash] = useState('');
  const [isHashing, setIsHashing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedTx, setConfirmedTx] = useState<string | null>(null);
  const canRegister = auth.roles.includes('AUTHORITY');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const found: AuditEvent[] = [];
      const filters: AuditLogFilters = { examId: '', eventType: 'DecoyRegistered', actor: '', fromDate: '', toDate: '' };
      const cursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const page = await fetchAuditEventPage(filters, cursor);
        found.push(...page.events);
        const next = page.nextCursor;
        if (next && (next === cursor || cursors.has(next))) throw new Error('The event cursor repeated; retry after the indexer catches up.');
        if (next) cursors.add(next);
        cursor = next;
      } while (cursor);
      setRecords(found.flatMap((event) => { const item = eventToDecoy(event); return item ? [item] : []; }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Indexed decoy records could not be loaded.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!guard.isAuthorized) { setLoading(false); return; }
    if (contractState.isLoading) return;
    if (!contract || !auth.account) {
      setError(contractState.error?.message ?? 'Connect a wallet to verify the contract role and decoy records.');
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      setLoading(true); setError(null);
      try {
        const [auditorRole, authorityRole] = await Promise.all([contract.getFunction('AUDITOR_ROLE')(), contract.getFunction('AUTHORITY_ROLE')()]);
        const roles = await Promise.all([contract.getFunction('hasRole')(auditorRole, auth.account), contract.getFunction('hasRole')(authorityRole, auth.account)]);
        const allowed = roles.some(Boolean);
        if (!allowed) throw new Error('The connected wallet has no active Auditor or Authority role on-chain.');
        if (active) setAuthorized(allowed);
        await load();
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Role verification failed.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [auth.account, contract, contractState.error, contractState.isLoading, guard.isAuthorized, load]);

  const exams = useMemo(() => examsState.exams.filter((exam) => exam.state === 2 || exam.state === 3), [examsState.exams]);
  const hashFile = async (file: File | undefined) => {
    setDecoyHash('');
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError('Decoy PDF must be 20 MB or smaller for local hashing.'); return; }
    if (file.size === 0 || !file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) { setError('Select a non-empty PDF decoy document.'); return; }
    setIsHashing(true); setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('PDF header is missing.');
      setDecoyHash(ethers.keccak256(bytes));
    }
    catch { setError('The selected decoy file could not be hashed locally.'); }
    finally { setIsHashing(false); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null); setConfirmedTx(null);
    if (!canRegister || !authorized || !contract || !auth.account) { setError('Only a wallet with the on-chain Authority role can register a decoy.'); return; }
    if (!examId || !decoyHash || !channelLabel.trim()) { setError('Select an exam, hash a decoy file, and enter a channel label.'); return; }
    if (!window.confirm('Register this content hash on-chain? The hash, exam ID, channel label, wallet and transaction will be public. The file itself is not uploaded.')) return;
    setIsSubmitting(true); transaction.startTx('Register decoy hash'); transaction.setTxAwaitingSignature();
    let pending = false;
    try {
      const result = await registerDecoyOnChain(contract as unknown as DecoyContract, { examId, decoyHash, channelLabel });
      transaction.setTxPending(result.txHash); pending = true;
      transaction.setTxConfirmed(result.txHash); setConfirmedTx(result.txHash);
      setDecoyHash(''); setChannelLabel('');
      await load();
    } catch (cause) {
      const message = cause instanceof Error && /user rejected|ACTION_REJECTED/i.test(cause.message) ? 'Wallet signature was cancelled.' : cause instanceof Error ? cause.message : 'Decoy registration failed.';
      setError(message); if (pending) transaction.setTxFailed(message); else transaction.clearTx();
    } finally { setIsSubmitting(false); }
  };

  if (!guard.isAuthorized) return <main className="auditor-page"><section className="auditor-card" role="alert"><h1>Auditor or Authority access required</h1><p>This page requires an authenticated Auditor or Authority role.</p></section></main>;
  return <main className="auditor-page" aria-labelledby="decoy-manager-title">
    <header className="auditor-heading"><div><p className="eyebrow">Integrity controls</p><h1 id="decoy-manager-title">Decoy manager</h1><p>Monitor indexed decoy hash registrations. Only an Authority can register hashes because that is the contract's current access control.</p></div><Button variant="secondary" onClick={() => void load()} disabled={loading}>Refresh</Button></header>
    <p className="auditor-note">Registration proves only that a hash and label were recorded by the contract. It does not prove the decoy was generated, distributed, or leaked. The selected file is hashed locally and is never uploaded or stored by this page.</p>
    {!authorized && !loading && error && <p role="alert" className="auditor-error">{error}</p>}
    {canRegister && authorized && <form className="auditor-card" onSubmit={(event) => void submit(event)}>
      <h2>Register decoy content hash</h2>
      <label>Examination<select required value={examId} onChange={(event) => setExamId(event.currentTarget.value)}><option value="">Select examination</option>{exams.map((exam) => <option key={exam.examId} value={exam.examId}>Exam {exam.examId}</option>)}</select></label>
      {exams.length === 0 && <p role="status">Decoy hashes can be registered only for Sealed or Released exams owned by this Authority.</p>}
      <label>Decoy document (hashed locally)<input type="file" accept="application/pdf,.pdf" onChange={(event) => { void hashFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} /></label>
      {isHashing && <p role="status">Hashing locally…</p>}{decoyHash && <p>Keccak-256 content hash: <code>{decoyHash}</code></p>}
      <label>Distribution channel label<input required maxLength={31} value={channelLabel} onChange={(event) => setChannelLabel(event.currentTarget.value)} placeholder="e.g. courier-batch-1" /></label>
      <Button type="submit" disabled={!authorized || !decoyHash || isHashing || isSubmitting || exams.length === 0}>{isSubmitting ? 'Waiting for confirmation…' : 'Register on-chain'}</Button>
    </form>}
    {confirmedTx && <p className="auditor-success" role="status">Registration transaction confirmed: <code>{confirmedTx}</code>. The indexed history may take time to refresh.</p>}
    {error && <div className="auditor-error" role="alert"><p>{error}</p><Button variant="secondary" onClick={() => void load()}>Retry</Button></div>}
    {loading ? <p role="status">Loading indexed decoy registrations…</p> : records.length === 0 ? <EmptyState title="No indexed decoy registrations" description="DecoyRegistered events appear here after the existing indexer records them." /> : <div className="auditor-table-wrap" role="region" aria-label="Indexed decoy registrations table" tabIndex={0}><table className="auditor-table"><thead><tr><th>Exam</th><th>Decoy hash</th><th>Channel label</th><th>Indexed at</th><th>Transaction</th><th>Status</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td>{record.examId}</td><td><code>{record.decoyHash}</code></td><td><code>{record.channelLabel}</code></td><td>{new Date(Number(record.timestamp) * 1000).toLocaleString()}</td><td><code>{record.txHash}</code><small>Block {record.blockNumber}</small></td><td>Indexed on-chain event</td></tr>)}</tbody></table></div>}
    {examsState.error && <p className="auditor-error" role="alert">Exam list unavailable: {examsState.error.message}</p>}
  </main>;
}
