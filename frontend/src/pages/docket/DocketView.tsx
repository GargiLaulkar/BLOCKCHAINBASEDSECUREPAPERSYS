import React, { useState } from 'react';
import {
  LedgerTable,
  Column,
  Button,
  Serial,
  CustodyBubbles,
  EmptyState,
  ExamState as CustodyExamState,
} from '@sigil/ui';
import { ExamSummary } from '../../hooks/useExams';

export interface DocketViewProps {
  exams: ExamSummary[];
  isLoading?: boolean;
  error?: Error | string | null;
  permissionDenied?: boolean;
  stateFilter: string | 'ALL';
  onStateFilterChange: (state: string | 'ALL') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onCreateExam?: () => void;
  onRowClick?: (exam: ExamSummary) => void;
  onRetry?: () => void;
  panelHolders?: Record<string, number>;
}

export const STATE_INT_MAP: Record<number, CustodyExamState> = {
  0: 'Draft',
  1: 'Collecting',
  2: 'Sealed',
  3: 'Released',
  4: 'Concluded',
  5: 'Cancelled',
};

export function formatTimestamp(raw: string | number): string {
  if (!raw) return '—';
  try {
    const s = Number(raw);
    const ms = s > 1e11 ? s : s * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return String(raw);
    return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  } catch {
    return String(raw);
  }
}

export const DocketView: React.FC<DocketViewProps> = ({
  exams,
  isLoading = false,
  error = null,
  permissionDenied = false,
  stateFilter,
  onStateFilterChange,
  searchQuery,
  onSearchChange,
  onCreateExam,
  onRowClick,
  onRetry,
  panelHolders = {},
}) => {
  // Filtered & searched data
  const filteredExams = React.useMemo(() => {
    return exams.filter((e) => {
      // 1. State filter
      if (stateFilter !== 'ALL') {
        const stateName = STATE_INT_MAP[e.state] ?? String(e.state);
        if (stateName.toLowerCase() !== stateFilter.toLowerCase()) return false;
      }
      // 2. Search query (examId, title, or metaHash)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const serialStr = String(e.examId).padStart(4, '0');
        const title = ((e as any).title ?? (e as any).metaJson?.title ?? '').toLowerCase();
        const meta = (e.metaHash ?? '').toLowerCase();
        if (!serialStr.includes(q) && !title.includes(q) && !meta.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [exams, stateFilter, searchQuery]);

  // Columns definition
  const columns: Column<ExamSummary>[] = [
    {
      key: 'examId',
      header: 'Serial',
      sortable: true,
      render: (row) => (
        <span style={{ fontFamily: 'var(--sigil-font-mono)' }}>
          <Serial id={row.examId} padLength={4} />
        </span>
      ),
    },
    {
      key: 'title',
      header: 'Examination Title',
      sortable: true,
      render: (row) => {
        const title = (row as any).title ?? (row as any).metaJson?.title ?? `Examination No. ${String(row.examId).padStart(4, '0')}`;
        return (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600, color: 'var(--sigil-color-ink)', fontSize: '13px' }}>
              {title}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--sigil-color-slate)', fontFamily: 'var(--sigil-font-mono)' }}>
              Chain #{row.chainId} · Hash {row.metaHash?.slice(0, 10)}...
            </span>
          </div>
        );
      },
    },
    {
      key: 'state',
      header: 'Custody State',
      sortable: true,
      render: (row) => {
        const stateName = STATE_INT_MAP[row.state] ?? 'Draft';
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CustodyBubbles currentState={stateName} variant="inline" />
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'var(--sigil-font-mono)',
                textTransform: 'uppercase',
                color: stateName === 'Cancelled' ? 'var(--sigil-color-alert)' : 'var(--sigil-color-ink)',
                fontWeight: 600,
              }}
            >
              {stateName}
            </span>
          </div>
        );
      },
    },
    {
      key: 'releaseOpensAt',
      header: 'Release Window',
      sortable: true,
      render: (row) => (
        <span style={{ fontSize: '12px', fontFamily: 'var(--sigil-font-mono)', color: 'var(--sigil-color-ink)' }}>
          {formatTimestamp(row.releaseOpensAt)}
        </span>
      ),
    },
    {
      key: 'threshold',
      header: 'Panel (Holders)',
      sortable: true,
      render: (row) => {
        const holdersCount = panelHolders[row.examId] ?? (row as any).holderCount;
        const panelText = holdersCount ? `${row.threshold} of ${holdersCount}` : `${row.threshold} required`;
        return (
          <span
            style={{
              fontSize: '12px',
              fontFamily: 'var(--sigil-font-mono)',
              fontWeight: 600,
              color: 'var(--sigil-color-ink)',
            }}
          >
            {panelText}
          </span>
        );
      },
    },
  ];

  // 1. Permission Denied State
  if (permissionDenied) {
    return (
      <div className="sigil-page-container" style={{ padding: '32px 0' }}>
        <div
          style={{
            border: '2px solid var(--sigil-color-alert)',
            backgroundColor: 'var(--sigil-color-sheet)',
            padding: '32px',
            maxWidth: '640px',
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '18px', color: 'var(--sigil-color-alert)', marginBottom: '8px' }}>
            Access restricted: Exam Authority role required
          </h2>
          <p style={{ color: 'var(--sigil-color-slate)', fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
            The examination docket requires the Exam Authority (AUTHORITY) role. Connect with an authorized authority wallet or ask the Administrator for panel assignment.
          </p>
        </div>
      </div>
    );
  }

  // 2. Loading Skeleton State
  if (isLoading && exams.length === 0) {
    return (
      <div className="sigil-page-container" style={{ padding: '32px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--sigil-color-ink)' }}>
              Examination docket
            </h1>
            <p style={{ color: 'var(--sigil-color-slate)', fontSize: '13px', margin: 0 }}>
              Loading on-chain examinations...
            </p>
          </div>
        </div>
        <div
          data-testid="docket-loading-skeleton"
          style={{
            border: '1px solid var(--sigil-color-hairline)',
            backgroundColor: 'var(--sigil-color-sheet)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ height: '36px', backgroundColor: 'var(--sigil-color-mist)', width: '100%', opacity: 0.6 }} />
          <div style={{ height: '48px', backgroundColor: 'var(--sigil-color-mist)', width: '100%', opacity: 0.4 }} />
          <div style={{ height: '48px', backgroundColor: 'var(--sigil-color-mist)', width: '100%', opacity: 0.4 }} />
          <div style={{ height: '48px', backgroundColor: 'var(--sigil-color-mist)', width: '100%', opacity: 0.4 }} />
        </div>
      </div>
    );
  }

  // 3. Error State
  if (error && exams.length === 0) {
    const errorText = typeof error === 'string' ? error : error?.message || 'Failed to load examinations';
    return (
      <div className="sigil-page-container" style={{ padding: '32px 0' }}>
        <div
          style={{
            border: '1px solid var(--sigil-color-alert)',
            backgroundColor: 'var(--sigil-color-sheet)',
            padding: '24px',
            maxWidth: '600px',
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '16px', color: 'var(--sigil-color-alert)', margin: '0 0 8px 0' }}>
            Unable to load examination docket
          </h2>
          <p style={{ color: 'var(--sigil-color-slate)', fontSize: '13px', margin: '0 0 16px 0' }}>
            {errorText}
          </p>
          {onRetry && (
            <Button variant="primary" onClick={onRetry}>
              Retry connection
            </Button>
          )}
        </div>
      </div>
    );
  }

  // 4. Main Page View
  const availableStates = ['ALL', 'Draft', 'Collecting', 'Sealed', 'Released', 'Concluded', 'Cancelled'];

  return (
    <div className="sigil-page-container" style={{ padding: '32px 0', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--sigil-color-ink)' }}>
            Examination docket
          </h1>
          <p style={{ color: 'var(--sigil-color-slate)', fontSize: '13px', margin: 0 }}>
            Authoritative registry of all scheduled, live, and concluded papers.
          </p>
        </div>
        {onCreateExam && (
          <Button variant="primary" onClick={onCreateExam}>
            Create exam
          </Button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          borderBottom: '1px solid var(--sigil-color-hairline)',
          paddingBottom: '14px',
        }}
      >
        {/* State Filter Tabs */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--sigil-color-slate)', fontWeight: 600 }}>
            State:
          </span>
          {availableStates.map((st) => {
            const isActive = stateFilter.toLowerCase() === st.toLowerCase();
            return (
              <button
                key={st}
                type="button"
                onClick={() => onStateFilterChange(st)}
                style={{
                  border: '1px solid',
                  borderColor: isActive ? 'var(--sigil-color-ink)' : 'var(--sigil-color-hairline)',
                  backgroundColor: isActive ? 'var(--sigil-color-ink)' : 'var(--sigil-color-sheet)',
                  color: isActive ? 'var(--sigil-color-sheet)' : 'var(--sigil-color-ink)',
                  fontSize: '11px',
                  fontFamily: 'var(--sigil-font-mono)',
                  padding: '4px 8px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {st}
              </button>
            );
          })}
        </div>

        {/* Search Field */}
        <div style={{ minWidth: '220px' }}>
          <input
            type="search"
            placeholder="Search serial, title..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="sigil-field__input"
            style={{ fontSize: '12px', padding: '6px 10px', height: '32px' }}
            aria-label="Search examinations"
          />
        </div>
      </div>

      {/* Table or Empty State */}
      {filteredExams.length === 0 ? (
        <EmptyState
          title={stateFilter === 'ALL' && !searchQuery ? 'No examinations scheduled' : 'No matching examinations'}
          description={
            stateFilter === 'ALL' && !searchQuery
              ? 'Create your first examination to configure the schedule, question bank, and key ceremony.'
              : 'Try clearing the search query or selecting a different lifecycle state filter.'
          }
          action={
            onCreateExam && stateFilter === 'ALL' && !searchQuery ? (
              <Button variant="primary" onClick={onCreateExam}>
                Create exam
              </Button>
            ) : undefined
          }
        />
      ) : (
        <LedgerTable
          caption="Scheduled and active examination papers"
          columns={columns}
          data={filteredExams}
          keyField={(row) => row.examId}
          onRowClick={onRowClick}
        />
      )}
    </div>
  );
};
