import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DashboardView, type DashboardExam } from './DashboardView';
import type { DashboardEvent, DashboardStats } from './api';

const exams: DashboardExam[] = [
  { examId: '11', state: 0, releaseOpensAt: 1_900_000_000, examStartsAt: 1_900_000_100, examEndsAt: 1_900_000_200, threshold: 2, randomnessCommitted: true, shareSubmitted: false },
  { examId: '12', state: 3, releaseOpensAt: 1_700_000_000, examStartsAt: 1_700_000_100, examEndsAt: 1_700_000_200, threshold: 2, randomnessCommitted: false, shareSubmitted: true },
  { examId: '13', state: 4, releaseOpensAt: 1_600_000_000, examStartsAt: 1_600_000_100, examEndsAt: 1_600_000_200, threshold: 2 },
];
const stats: DashboardStats = {
  totalExams: 3,
  examsByState: { draft: 1, collecting: 0, sealed: 0, released: 1, concluded: 1, cancelled: 0 },
  totalEvents: 6,
  batchesByStatus: { pending: 0, confirmed: 0 },
  participantsByRole: { ADMIN: 1, AUTHORITY: 1, SETTER: 2, HOLDER: 5, CENTRE: 2, AUDITOR: 1 },
};
const event: DashboardEvent = { id: 'e1', blockNumber: '27', logIndex: 0, txHash: `0x${'12'.repeat(32)}`, examId: '12', type: 'PaperReleased', actor: '0x1111111111111111111111111111111111111111', blockTimestamp: '1700000000' };
const props = {
  pageState: 'ready' as const, exams, stats, events: [event], leakEvents: [{ ...event, type: 'LeakReported' }], chainTime: 1_800_000_000,
  error: null, dataWarning: null, userRoles: ['AUTHORITY', 'ADMIN', 'AUDITOR'], onRetry: vi.fn(),
};
const renderRole = (role: 'AUTHORITY' | 'CENTRE' | 'HOLDER' | 'AUDITOR') => render(<MemoryRouter><DashboardView {...props} role={role} /></MemoryRouter>);

describe('Role dashboards', () => {
  it('renders Authority metrics from supplied real-data summary and exposes supported actions', () => {
    renderRole('AUTHORITY');
    expect(screen.getByRole('heading', { name: 'Authority dashboard' })).toBeInTheDocument();
    expect(screen.getByText(/Registered Centres/).parentElement).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: 'Create examination' })).toHaveAttribute('href', '/authority/create');
    expect(screen.getByRole('link', { name: 'Manage participants' })).toHaveAttribute('href', '/admin/participants');
    expect(screen.getByText('PaperReleased')).toBeInTheDocument();
  });

  it('renders Centre status and truthfully labels paper generation unavailable', () => {
    renderRole('CENTRE');
    expect(screen.getByRole('heading', { name: 'Centre dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Paper station').parentElement).toHaveTextContent('Unavailable');
    expect(screen.getByRole('link', { name: /Assigned examinations & paper station/ })).toHaveAttribute('href', '/centre/station');
  });

  it('renders Holder commitments and share submission status without any secret material', () => {
    renderRole('HOLDER');
    expect(screen.getByRole('heading', { name: 'Holder dashboard' })).toBeInTheDocument();
    expect(screen.getByText(/Randomness committed/)).toBeInTheDocument();
    expect(screen.getByText(/Share submitted/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/private key|plaintext share|private scalar/i);
  });

  it('shows audit-eligible exam states and indexed leak event activity', () => {
    renderRole('AUDITOR');
    expect(screen.getByRole('heading', { name: 'Auditor dashboard' })).toBeInTheDocument();
    expect(screen.getByText('LeakReported')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Exam 11' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Exam 12' })).toHaveAttribute('href', '/auditor/tracer');
  });

  it('shows loading, retryable error, and empty assignment states', () => {
    const { rerender } = render(<MemoryRouter><DashboardView {...props} role="AUTHORITY" pageState="loading" /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading verified dashboard data');
    rerender(<MemoryRouter><DashboardView {...props} role="AUTHORITY" pageState="error" error="Offline" /></MemoryRouter>);
    expect(screen.getByText('Offline')).toBeInTheDocument();
    rerender(<MemoryRouter><DashboardView {...props} role="CENTRE" exams={[]} pageState="empty" /></MemoryRouter>);
    expect(screen.getByText('No examinations found')).toBeInTheDocument();
  });
});
