import React, { useCallback, useEffect, useState } from 'react';
import { Button, EmptyState, ErrorState, LoadingState, SuccessMessage } from '@sigil/ui';
import { useAuthGuard } from '../../auth/useAuthGuard';
import { AuditEventsApiError, fetchAuditEventPage, type AuditEvent } from './audit-log-api';
import { buildEvidencePdf, evidencePdfFilename, toIndexedLeakEvidence, type IndexedLeakEvidence } from './evidence-report';
import './auditor.css';

const FILTERS = { examId: '', eventType: 'LeakReported', actor: '', fromDate: '', toDate: '' };

export function EvidenceReportPage() {
  const guard = useAuthGuard(['AUDITOR']);
  const [reports, setReports] = useState<IndexedLeakEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadedReport, setDownloadedReport] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all: AuditEvent[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const page = await fetchAuditEventPage(FILTERS, cursor);
        all.push(...page.events);
        const next = page.nextCursor;
        if (next && (next === cursor || cursors.has(next))) throw new Error('The event cursor repeated. Retry after the indexer catches up.');
        if (next) cursors.add(next);
        cursor = next;
      } while (cursor);
      setReports(all.flatMap((event) => {
        const report = toIndexedLeakEvidence(event);
        return report ? [report] : [];
      }));
    } catch (cause) {
      const apiError = cause instanceof AuditEventsApiError ? cause.message : null;
      setError(apiError ?? (cause instanceof Error ? cause.message : 'Indexed leak report events could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (guard.isAuthorized) void load(); }, [guard.isAuthorized, load]);

  const download = (report: IndexedLeakEvidence) => {
    setDownloading(report.id);
    setDownloadedReport(null);
    setError(null);
    try {
      const bytes = buildEvidencePdf(report);
      const pdfBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = evidencePdfFilename(report);
      anchor.click();
      URL.revokeObjectURL(url);
      setDownloadedReport(report.id);
    } catch {
      setError('The evidence PDF could not be generated.');
    } finally {
      setDownloading(null);
    }
  };

  if (!guard.isAuthorized) return <main className="auditor-page"><section role="alert" className="auditor-card"><h1>Auditor access required</h1><p>An authenticated Auditor role is required to access evidence reports.</p></section></main>;
  return <main className="auditor-page" aria-labelledby="evidence-report-title">
    <header className="auditor-heading"><div><p className="eyebrow">Auditor workspace</p><h1 id="evidence-report-title">Evidence PDF reports</h1><p>Download a PDF summary of indexed LeakReported event metadata.</p></div><Button variant="secondary" onClick={() => void load()} disabled={loading}>Refresh</Button></header>
    <p className="auditor-note">Reports contain public event metadata only. The source event is indexed from the chain; the PDF does not authenticate the original evidence or establish that a leak allegation is true.</p>
    {error && <ErrorState title="Indexed leak reports unavailable" message={error} onRetry={() => void load()} />}
    {downloadedReport && <SuccessMessage>Evidence PDF download started for indexed report {downloadedReport}.</SuccessMessage>}
    {loading ? <LoadingState label="Loading indexed leak events…" /> : reports.length === 0 ? <EmptyState title="No indexed leak reports" description="Confirmed LeakReported events will appear after the existing indexer records them." /> : <div className="auditor-table-wrap" role="region" aria-label="Indexed evidence reports table" tabIndex={0}><table className="auditor-table"><thead><tr><th>Exam</th><th>Evidence hash</th><th>Variant hash</th><th>Suspected Centre</th><th>Transaction / block</th><th>Report</th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td>{report.examId}</td><td><code>{report.evidenceHash}</code></td><td><code>{report.matchedVariantHash}</code></td><td><code>{report.suspectCentre}</code></td><td><code>{report.txHash}</code><small>Block {report.blockNumber}</small></td><td><Button onClick={() => download(report)} disabled={downloading !== null}>{downloading === report.id ? 'Generating…' : 'Download PDF'}</Button></td></tr>)}</tbody></table></div>}
  </main>;
}
