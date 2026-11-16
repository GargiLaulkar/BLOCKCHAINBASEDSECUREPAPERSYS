import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeakTracerView, type LeakDraft } from './LeakTracerView';

const draft: LeakDraft = { examId: '', description: '', suspectCentre: '', matchedVariantHash: '' };
const baseProps = {
  pageState: 'empty' as const, reports: [], exams: [{ examId: '7', title: 'Examination 7' }], draft,
  evidenceHash: '', error: null, txHash: null, isSubmitting: false, reviewing: false,
  onDraftChange: vi.fn(), onReview: vi.fn(), onCancelReview: vi.fn(), onSubmit: vi.fn(), onRetry: vi.fn(), onRefresh: vi.fn(),
};

describe('Leak tracer view states', () => {
  it('shows access denial, loading, and retryable errors', () => {
    const { rerender } = render(<LeakTracerView {...baseProps} pageState="unauthorized" />);
    expect(screen.getByText('Auditor access required')).toBeInTheDocument();
    rerender(<LeakTracerView {...baseProps} pageState="loading" />);
    expect(screen.getByRole('status')).toHaveTextContent(/Loading examinations/);
    rerender(<LeakTracerView {...baseProps} pageState="error" error="Indexer offline" />);
    expect(screen.getByText('Indexer offline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(baseProps.onRetry).toHaveBeenCalled();
  });

  it('shows empty history and requires explicit review before confirmation', () => {
    const validDraft = {
      examId: '7', description: 'Observed copy at the exam entrance.', suspectCentre: '',
      matchedVariantHash: `0x${'ab'.repeat(32)}`,
    };
    const { rerender } = render(<LeakTracerView {...baseProps} draft={validDraft} />);
    expect(screen.getByText('No indexed leak reports')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review report' }));
    expect(baseProps.onReview).toHaveBeenCalled();
    rerender(<LeakTracerView {...baseProps} draft={validDraft} reviewing evidenceHash={`0x${'ab'.repeat(32)}`} />);
    expect(screen.getByRole('group', { name: 'Confirm report details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm and submit on-chain' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/evidence file/i)).not.toBeInTheDocument();
  });
});
