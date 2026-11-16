import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from '../src/components/EmptyState';
import { ErrorState, LoadingState, SuccessMessage } from '../src/components/AsyncState';

describe('accessible asynchronous states', () => {
  it('announces loading content and exposes busy state', () => {
    const html = renderToStaticMarkup(<LoadingState label="Loading exams…" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Loading exams');
  });

  it('renders a retry action only when a retry callback is provided', () => {
    const onRetry = vi.fn();
    const html = renderToStaticMarkup(<ErrorState message="Network unavailable" onRetry={onRetry} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Network unavailable');
    expect(html).toContain('Retry');
    expect(renderToStaticMarkup(<ErrorState message="Unavailable" />)).not.toContain('<button');
  });

  it('announces empty and success state content', () => {
    expect(renderToStaticMarkup(<EmptyState title="No exams" description="Create an exam to begin." />)).toContain('aria-live="polite"');
    const html = renderToStaticMarkup(<SuccessMessage>Exam saved</SuccessMessage>);
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('Exam saved');
  });
});
