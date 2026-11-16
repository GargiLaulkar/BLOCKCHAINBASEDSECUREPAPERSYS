import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogExplorer } from './AuditLogExplorer';
import { useAuthGuard } from '../../auth/useAuthGuard';

vi.mock('../../auth/useAuthGuard', () => ({ useAuthGuard: vi.fn() }));
const guardMock = vi.mocked(useAuthGuard);
const tx = (byte: string) => `0x${byte.repeat(32)}`;
const events = [
  { id: 'evt-a', blockNumber: '10', logIndex: 0, txHash: tx('a'), examId: '8', type: 'PaperReleased', actor: '0x1111111111111111111111111111111111111111', blockTimestamp: '1760000000', payloadJson: { releasedAt: 1760000000, questionText: 'Do not show this confidential payload' } },
  { id: 'evt-b', blockNumber: '9', logIndex: 1, txHash: tx('b'), examId: '8', type: 'LeakReported', actor: null, blockTimestamp: '1750000000', payloadJson: { evidenceHash: tx('c') } },
];

function page(items: typeof events, nextCursor: string | null) {
  return new Response(JSON.stringify({ events: items, nextCursor }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Audit Log Explorer', () => {
  beforeEach(() => {
    guardMock.mockReturnValue({ isAuthorized: true, guardState: 'authorized', account: '0x1111111111111111111111111111111111111111', chainId: '0x7a69', roles: ['AUDITOR'], error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(page([events[0]!], 'cursor-2')));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows only indexed data, supports event details, retry/empty/error and unauthorized states', async () => {
    render(<AuditLogExplorer />);
    expect(await screen.findByText('PaperReleased')).toBeInTheDocument();
    expect(screen.queryByText('Do not show this confidential payload')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'PaperReleased' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Allowlisted summary');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Do not show this confidential payload');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    guardMock.mockReturnValue({ isAuthorized: false, guardState: 'no-role', account: null, chainId: null, roles: [], error: 'Auditor role required' });
    const { unmount } = render(<AuditLogExplorer />);
    expect(screen.getByText('Auditor access required')).toBeInTheDocument();
    unmount();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    guardMock.mockReturnValue({ isAuthorized: true, guardState: 'authorized', account: '0x1111111111111111111111111111111111111111', chainId: '0x7a69', roles: ['AUDITOR'], error: null });
    render(<AuditLogExplorer />);
    expect(await screen.findByText(/Event request failed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it('validates filters, applies and clears them, and navigates cursor pages without losing filters', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(page([events[0]!], 'cursor-2'))
      .mockResolvedValueOnce(page([events[0]!], 'cursor-2'))
      .mockResolvedValueOnce(page([events[1]!], null))
      .mockResolvedValueOnce(page([events[0]!], 'cursor-2'))
      .mockResolvedValueOnce(page([], null));
    vi.stubGlobal('fetch', fetchMock);
    render(<AuditLogExplorer />);
    await screen.findByText('PaperReleased');
    fireEvent.change(screen.getByLabelText('Exam ID'), { target: { value: 'x9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent('digits only');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Exam ID'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-02-02' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-02-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent('on or before');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await screen.findByText('PaperReleased');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('exam=8');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('LeakReported')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('PaperReleased')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain('exam=8');

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(String(fetchMock.mock.calls[4]?.[0])).not.toContain('exam=');
  });

  it('exports all filtered cursor pages and reports progress without truncating', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(page([events[0]!], 'cursor-2'))
      .mockResolvedValueOnce(page([events[0]!], 'cursor-2'))
      .mockResolvedValueOnce(page([events[1]!], null));
    vi.stubGlobal('fetch', fetchMock);
    let downloadedBlob: Blob | undefined;
    let downloadedFilename = '';
    const objectUrl = vi.fn((blob: Blob) => { downloadedBlob = blob; return 'blob:export'; });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: objectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadedFilename = this.download;
    });

    render(<AuditLogExplorer />);
    await screen.findByText('PaperReleased');
    fireEvent.click(screen.getByRole('button', { name: /Export all filtered results/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(objectUrl).toHaveBeenCalledOnce();
    expect(downloadedBlob).toBeInstanceOf(Blob);
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(downloadedBlob!);
    });
    expect(content).toContain('PaperReleased');
    expect(content).toContain('LeakReported');
    expect(content).toContain('"timestamp","event type"');
    expect(await screen.findByRole('status')).toHaveTextContent('CSV download started with 2 filtered events');
    expect(downloadedFilename).toMatch(/^sigil-audit-logs-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('shows the empty state when the indexed event query has no matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(page([], null)));
    render(<AuditLogExplorer />);
    expect(await screen.findByText('No matching events')).toBeInTheDocument();
  });
});
