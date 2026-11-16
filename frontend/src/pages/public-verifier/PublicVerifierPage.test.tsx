import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PublicVerifierPage, sanitizePublicEventPayload } from './PublicVerifierPage';

describe('sanitizePublicEventPayload', () => {
  it('redacts secret-bearing keys without destroying the rest of the payload', () => {
    const input = {
      seed: 'secret-seed',
      examId: '7',
      payload: { share: 'encrypted-share', note: 'public' },
    };

    expect(sanitizePublicEventPayload(input)).toEqual({
      seed: '[REDACTED]',
      examId: '7',
      payload: { share: '[REDACTED]', note: 'public' },
    });
  });

  it('keeps public counters and timestamps visible while redacting keys and nested secrets', () => {
    const input = {
      shareholderCount: 3,
      sharedAt: 1700000000,
      seed: 'secret-seed',
      shareData: 'top-secret-share',
      encryptedEnvelope: {
        type: 'sealed',
        encryptionKey: 'hidden-key',
        ok: true,
        publicNote: 'visible',
      },
      nested: {
        encryptionKey: 'nested-key',
        publicFlag: true,
        shareData: 'nested-secret',
      },
    };

    expect(sanitizePublicEventPayload(input)).toEqual({
      shareholderCount: 3,
      sharedAt: 1700000000,
      seed: '[REDACTED]',
      shareData: '[REDACTED]',
      encryptedEnvelope: {
        type: 'sealed',
        encryptionKey: '[REDACTED]',
        ok: true,
        publicNote: 'visible',
      },
      nested: {
        encryptionKey: '[REDACTED]',
        publicFlag: true,
        shareData: '[REDACTED]',
      },
    });
  });
});

describe('PublicVerifierPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads a public exam by exam id and renders public timeline data without secrets', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/exams/42')) {
        return {
          ok: true,
          json: async () => ({
            examId: '42',
            chainId: 31337,
            state: 3,
            metaHash: '0x' + '11'.repeat(32),
            releaseOpensAt: '1700000000',
            examStartsAt: '1700003600',
            examEndsAt: '1700014400',
            threshold: 3,
            bankHash: '0x' + '22'.repeat(32),
          }),
        } as Response;
      }

      if (url.includes('/api/events')) {
        return {
          ok: true,
          json: async () => ({
            events: [
              {
                id: 'event-1',
                blockNumber: '13',
                logIndex: 0,
                txHash: '0x' + '33'.repeat(32),
                examId: '42',
                type: 'PaperReleased',
                actor: '0x1111111111111111111111111111111111111111',
                payloadJson: { seed: 'secret-seed', trigger: 'released' },
                blockTimestamp: '1700000700',
              },
            ],
            nextCursor: null,
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => [],
      } as Response;
    });

    render(<PublicVerifierPage />);
    fireEvent.change(screen.getByLabelText(/search by exam id or hash/i), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => expect(screen.getByText('Exam No. 42')).toBeInTheDocument());
    expect(screen.getByText(/PaperReleased/i)).toBeInTheDocument();
    expect(screen.getByText(/\[REDACTED\]/i)).toBeInTheDocument();
    expect(screen.queryByText(/secret-seed/i)).not.toBeInTheDocument();
  });

  it('loads a public exam by metadata hash and keeps the event timeline public', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/exams')) {
        return {
          ok: true,
          json: async () => [{
            examId: '7',
            chainId: 31337,
            state: 1,
            metaHash: '0x' + 'aa'.repeat(32),
            releaseOpensAt: '100',
            examStartsAt: '200',
            examEndsAt: '300',
            threshold: 2,
            bankHash: '0x' + 'bb'.repeat(32),
          }],
        } as Response;
      }

      if (url.includes('/api/events')) {
        return {
          ok: true,
          json: async () => ({ events: [{
            id: 'hash-event',
            blockNumber: '9',
            logIndex: 0,
            txHash: '0x' + 'ff'.repeat(32),
            examId: '7',
            type: 'PaperReleased',
            actor: '0x1111111111111111111111111111111111111111',
            payloadJson: { trigger: 'released', nested: { shareData: 'secret-share' } },
            blockTimestamp: '150',
          }], nextCursor: null }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => [],
      } as Response;
    });

    render(<PublicVerifierPage />);
    fireEvent.change(screen.getByLabelText(/search by exam id or hash/i), { target: { value: '0x' + 'aa'.repeat(32) } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => expect(screen.getByText('Exam No. 7')).toBeInTheDocument());
    expect(screen.queryByText(/secret-share/i)).not.toBeInTheDocument();
  });

  it('shows a not-found message for an unknown search term', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true,
      json: async () => [],
    }) as Response);

    render(<PublicVerifierPage />);
    fireEvent.change(screen.getByLabelText(/search by exam id or hash/i), { target: { value: 'missing' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/No matching public exam found/i));
  });

  it('shows a server error message without misclassifying it as a not-found', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Internal server error' } }),
    } as Response);

    render(<PublicVerifierPage />);
    fireEvent.change(screen.getByLabelText(/search by exam id or hash/i), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Internal server error/i));
    expect(screen.queryByText(/No matching public exam found/i)).not.toBeInTheDocument();
  });

  it('renders unknown time for empty and invalid timestamps and keeps public metadata visible', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/exams/999')) {
        return {
          ok: true,
          json: async () => ({
            examId: '999',
            chainId: 31337,
            state: 7,
            metaHash: '0x' + '88'.repeat(32),
            releaseOpensAt: ' ',
            examStartsAt: 'invalid',
            examEndsAt: '',
            threshold: 2,
            bankHash: '0x' + '99'.repeat(32),
          }),
        } as Response;
      }

      if (url.includes('/api/events')) {
        return {
          ok: true,
          json: async () => ({
            events: [{
              id: 'invalid-ts-event',
              blockNumber: '1',
              logIndex: 0,
              txHash: '0x' + 'aa'.repeat(32),
              examId: '999',
              type: 'ShareSubmitted',
              actor: '0x1111111111111111111111111111111111111111',
              payloadJson: { shareholderCount: 3, sharedAt: 'invalid', seed: 'secret-seed' },
              blockTimestamp: 'invalid',
            }],
            nextCursor: null,
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => [],
      } as Response;
    });

    render(<PublicVerifierPage />);
    fireEvent.change(screen.getByLabelText(/search by exam id or hash/i), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => expect(screen.getByText('Exam No. 999')).toBeInTheDocument());
    expect(screen.getAllByText('Unknown time').length).toBeGreaterThan(0);
    expect(screen.getByText(/shareholderCount/i)).toBeInTheDocument();
    expect(screen.getByText(/sharedAt/i)).toBeInTheDocument();
    expect(screen.queryByText(/secret-seed/i)).not.toBeInTheDocument();
  });

  it('clearing a completed search resets the verifier state without reusing stale data', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/exams/42')) {
        return {
          ok: true,
          json: async () => ({
            examId: '42',
            chainId: 31337,
            state: 3,
            metaHash: '0x' + '11'.repeat(32),
            releaseOpensAt: '1700000000',
            examStartsAt: '1700003600',
            examEndsAt: '1700014400',
            threshold: 3,
            bankHash: '0x' + '22'.repeat(32),
          }),
        } as Response;
      }

      if (url.includes('/api/events')) {
        return {
          ok: true,
          json: async () => ({ events: [{
            id: 'event-42',
            blockNumber: '13',
            logIndex: 0,
            txHash: '0x' + '33'.repeat(32),
            examId: '42',
            type: 'PaperReleased',
            actor: '0x1111111111111111111111111111111111111111',
            payloadJson: { trigger: 'released', publicNote: 'visible' },
            blockTimestamp: '1700000700',
          }], nextCursor: null }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => [],
      } as Response;
    });

    render(<PublicVerifierPage />);
    const input = screen.getByLabelText(/search by exam id or hash/i);
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => expect(screen.getByText('Exam No. 42')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/search by exam id or hash/i), { target: { value: '' } });

    await waitFor(() => expect(screen.getByText(/Ready to verify/i)).toBeInTheDocument());
    expect(screen.queryByText('Exam No. 42')).not.toBeInTheDocument();
  });
});
