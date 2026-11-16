import React, { useEffect, useMemo, useState } from 'react';
import { Button, CountdownLock, EmptyState, Serial, StateStamp } from '@sigil/ui';
import type { CentreAssignmentsViewProps, CentreExamAssignment } from './types';
import './centre.css';

function PageState({
  state,
  error,
  retry,
}: {
  state: CentreAssignmentsViewProps['pageState'];
  error?: Error | null;
  retry?: () => void;
}) {
  if (state === 'loading') {
    return (
      <section className="centre-state centre-state--loading" aria-label="Loading centre assignments">
        <div className="centre-skeleton" />
        <div className="centre-skeleton centre-skeleton--table" />
      </section>
    );
  }

  if (state === 'permission') {
    return (
      <section className="centre-state" role="alert">
        <h1>Centre role required</h1>
        <p>This wallet is not authorized to view the release monitor.</p>
      </section>
    );
  }

  if (state === 'empty') {
    return (
      <EmptyState
        title="No centre assignments"
        description="Examinations assigned to this centre will appear here with their release times."
      />
    );
  }

  if (state === 'error') {
    return (
      <section className="centre-state" role="alert">
        <h1>Unable to load centre station</h1>
        <p>{error?.message ?? 'The release-monitor data could not be loaded.'}</p>
        <Button type="button" onClick={retry}>Retry connection</Button>
      </section>
    );
  }

  return null;
}

function isValidTimestamp(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(value);
}

function safeDateTime(value: number | null | undefined): string | null {
  if (!isValidTimestamp(value)) {
    return null;
  }

  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function formatTimestamp(value: number | null | undefined): string {
  const dateTime = safeDateTime(value);
  if (!dateTime) {
    return 'Unknown time';
  }

  return new Date(dateTime).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

function getCurrentCountdownTarget(exam: CentreExamAssignment, now: number): number | null {
  if (exam.state === 'Released' || exam.state === 'Concluded') {
    return null;
  }

  if (isValidTimestamp(exam.releaseOpensAt) && exam.releaseOpensAt > now) {
    return exam.releaseOpensAt;
  }

  return null;
}

function getStatusDetails(exam: CentreExamAssignment, now: number) {
  if (exam.state === 'Released') {
    return { label: 'Released', tone: 'released' };
  }

  if (exam.state === 'Concluded') {
    return { label: 'Concluded', tone: 'unavailable' };
  }

  if (!isValidTimestamp(exam.releaseOpensAt)) {
    return { label: 'Unavailable', tone: 'unavailable' };
  }

  if (exam.releaseOpensAt > now) {
    return { label: 'Upcoming', tone: 'upcoming' };
  }

  if (isValidTimestamp(exam.examEndsAt) && exam.examEndsAt < now) {
    return { label: 'Unavailable', tone: 'unavailable' };
  }

  return { label: 'In window', tone: 'active' };
}

export function CentreAssignmentsView({
  pageState,
  assignments,
  error,
  onRetry,
  paperRequestStatus = {},
  onPaperRequest,
}: CentreAssignmentsViewProps) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [reprintReasons, setReprintReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => window.clearInterval(tick);
  }, []);

  const rows = useMemo(() => assignments.map((assignment) => ({
    ...assignment,
    status: getStatusDetails(assignment, now),
    countdownTarget: getCurrentCountdownTarget(assignment, now),
  })), [assignments, now]);

  if (pageState !== 'ready') {
    return <PageState state={pageState} error={error} retry={onRetry} />;
  }

  return (
    <section className="centre-page" aria-labelledby="centre-station-title">
      <header className="centre-page__header">
        <p className="sigil-mono">CENTRE / PAPER STATION</p>
        <h1 id="centre-station-title">Centre paper station</h1>
        <p>Assigned examinations, release windows and protected paper-service readiness.</p>
      </header>

      <aside className="centre-paper-notice" role="note">
        <strong>Printing is not configured</strong>
        <p>The protected reconstruction and attestation service and managed local print agent are not available. This station will not create or download an unauthorized paper.</p>
      </aside>

      <div className="centre-table-scroll" role="region" aria-label="Assigned examination table" tabIndex={0}>
        <table className="centre-table">
          <thead>
            <tr>
              <th scope="col">Exam</th>
              <th scope="col">State</th>
              <th scope="col">Release opens</th>
              <th scope="col">Exam starts</th>
              <th scope="col">Exam ends</th>
              <th scope="col">Countdown</th>
              <th scope="col">Status</th>
              <th scope="col">Paper generation</th>
              <th scope="col">Printing</th>
              <th scope="col">Station action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((assignment) => {
              const releaseOpenDateTime = safeDateTime(assignment.releaseOpensAt);
              const examStartsDateTime = safeDateTime(assignment.examStartsAt);
              const examEndsDateTime = safeDateTime(assignment.examEndsAt);

              return (
                <tr key={assignment.examId}>
                  <th scope="row">
                    <div className="centre-table__serial">
                      <Serial id={assignment.examId} padLength={4} />
                    </div>
                    <span className="centre-table__title">{assignment.title}</span>
                  </th>
                  <td><StateStamp state={assignment.state} /></td>
                  <td>
                    <time dateTime={releaseOpenDateTime ?? undefined}>{formatTimestamp(assignment.releaseOpensAt)}</time>
                  </td>
                  <td>
                    <time dateTime={examStartsDateTime ?? undefined}>{formatTimestamp(assignment.examStartsAt)}</time>
                  </td>
                  <td>
                    <time dateTime={examEndsDateTime ?? undefined}>{formatTimestamp(assignment.examEndsAt)}</time>
                  </td>
                  <td>
                    {assignment.state === 'Released' ? (
                      <span className="centre-status centre-status--released">Released</span>
                    ) : assignment.countdownTarget === null ? (
                      <span className={`centre-status centre-status--${assignment.status.tone}`}>
                        {assignment.status.label}
                      </span>
                    ) : (
                      <CountdownLock
                        targetTimestamp={assignment.countdownTarget}
                        label="Opens in"
                      />
                    )}
                  </td>
                  <td>
                    <span className={`centre-status centre-status--${assignment.status.tone}`}>
                      {assignment.status.label}
                    </span>
                  </td>
                  <td>
                    <span className="centre-status centre-status--unavailable">Unavailable</span>
                    <small className="centre-paper-meta">Variant identifier: not issued</small>
                    <small className="centre-paper-meta">Artifact: none</small>
                  </td>
                  <td>
                    <span className="centre-status">Not printed</span>
                    <small className="centre-paper-meta">Print preview unavailable</small>
                  </td>
                  <td>
                    {(() => {
                      const request = paperRequestStatus[assignment.examId];
                      const inWindow = assignment.state === 'Released' && now >= assignment.releaseOpensAt && now <= assignment.examEndsAt;
                      return (
                        <div className="centre-paper-action">
                          <Button
                            type="button"
                            disabled={!inWindow || request?.state === 'pending' || !onPaperRequest}
                            onClick={() => onPaperRequest?.(assignment.examId, 'generate')}
                          >
                            {request?.state === 'pending' ? 'Checking authorization' : 'Prepare paper'}
                          </Button>
                          {!inWindow && <small>Available only during the released exam window.</small>}
                          {request?.message && <small role="status">{request.message}</small>}
                          <label>
                            Reprint reason
                            <input
                              type="text"
                              minLength={10}
                              maxLength={500}
                              placeholder="Required for a controlled reprint request"
                              aria-label={`Reprint reason for exam ${assignment.examId}`}
                              value={reprintReasons[assignment.examId] ?? ''}
                              onChange={(event) => setReprintReasons((current) => ({
                                ...current,
                                [assignment.examId]: event.currentTarget.value,
                              }))}
                            />
                          </label>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={!inWindow || request?.state === 'pending' || !onPaperRequest || (reprintReasons[assignment.examId]?.trim().length ?? 0) < 10}
                            onClick={() => onPaperRequest?.(assignment.examId, 'reprint', reprintReasons[assignment.examId]?.trim())}
                          >
                            Request reprint authorization
                          </Button>
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
