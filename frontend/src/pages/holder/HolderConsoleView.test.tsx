import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HolderConsoleActions, HolderConsoleSnapshot } from './types';
import { ATTESTATION_UNAVAILABLE_MESSAGE } from './share-submission';
import { HolderConsoleView } from './HolderConsoleView';

describe('HolderConsoleView release authorization state', () => {
  it('shows a blocked status and disables threshold submission without an attestation service', () => {
    const releaseOpensAt = 2_000_000_000;
    const snapshot: HolderConsoleSnapshot = {
      exam: {
        examId: '1',
        title: 'Test examination',
        state: 'Sealed',
        rosetteHash: `0x${'11'.repeat(32)}`,
        releaseOpensAt,
        examStartsAt: releaseOpensAt + 3600,
        examEndsAt: releaseOpensAt + 7200,
        threshold: 2,
        holderCount: 3,
        sections: [{ name: 'Section A', quota: 1 }],
      },
      keyRegistered: true,
      shareUnlocked: true,
      shareVerified: true,
      randomnessCommitted: true,
      shareSubmitted: false,
      submissionCount: 1,
      chainTime: releaseOpensAt,
    };
    const actions: HolderConsoleActions = {
      setupPassphrase: '',
      releasePassphrase: '',
      isGeneratingKeystore: false,
      hasGeneratedKeystore: false,
      hasDownloadedKeystore: true,
      hasKeystoreFile: true,
      isRegisteringKey: false,
      isUnlocking: false,
      isCommittingRandomness: false,
      isSubmittingShare: false,
      isTransactionPending: false,
      actionMessage: null,
      actionError: null,
      onSetupPassphraseChange: vi.fn(),
      onGenerateKeystore: vi.fn(),
      onDownloadKeystore: vi.fn(),
      onRegisterKey: vi.fn(),
      onKeystoreFile: vi.fn(),
      onReleasePassphraseChange: vi.fn(),
      onUnlockShare: vi.fn(),
      onCommitRandomness: vi.fn(),
      onSubmitShare: vi.fn(),
      onClearSecrets: vi.fn(),
      onRetry: vi.fn(),
    };

    render(<HolderConsoleView pageState="ready" snapshot={snapshot} actions={actions} />);

    expect(screen.getAllByText(ATTESTATION_UNAVAILABLE_MESSAGE)).toHaveLength(1);
    expect(screen.getByText(/deployed contract still requires a public Holder reveal/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share submission unavailable' })).toBeDisabled();
  });
});
