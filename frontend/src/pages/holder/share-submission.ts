import { shareCommitment } from '@sigil/core/shares';
import type { Address } from '@sigil/core/types';

export const ATTESTATION_UNAVAILABLE_MESSAGE =
  'Threshold release is blocked until the authorized attestation service is configured. No share was submitted.';

export const PUBLIC_REVEAL_OVERLOAD_BLOCKED_MESSAGE =
  'Share submission is disabled because the deployed contract still requires a public Holder reveal. No transaction was sent.';

export interface ShareSubmissionInput {
  examId: bigint;
  holder: Address;
  share: Uint8Array;
  expectedCommitment: string;
  readOnChainCommitment: () => Promise<string>;
  readReleaseState: () => Promise<{ state: number; threshold: number }>;
  readSubmissionCount: () => Promise<bigint>;
  readHasSubmitted: () => Promise<boolean>;
}

export type ShareSubmissionResult = 'attestation-required' | 'contract-upgrade-required';

function equalHex(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/** Verifies the Holder share without calling the currently reveal-bearing contract overload. */
export async function submitHolderShareCommitment(
  input: ShareSubmissionInput,
): Promise<ShareSubmissionResult> {
  const computedCommitment = shareCommitment(input.examId, input.holder, input.share);
  if (!equalHex(computedCommitment, input.expectedCommitment)) {
    throw new Error('The decrypted share failed its local commitment check.');
  }

  const [onChainCommitment, releaseState, submissionCount, alreadySubmitted] = await Promise.all([
    input.readOnChainCommitment(),
    input.readReleaseState(),
    input.readSubmissionCount(),
    input.readHasSubmitted(),
  ]);
  if (!equalHex(computedCommitment, onChainCommitment)) {
    throw new Error('The decrypted share does not match its on-chain commitment.');
  }
  if (alreadySubmitted) throw new Error('This holder has already submitted a share.');
  if (releaseState.state !== 2 && releaseState.state !== 3) {
    throw new Error('Share submission is unavailable in the current exam state.');
  }

  if (
    releaseState.state === 2 &&
    (releaseState.threshold < 1 || submissionCount + 1n >= BigInt(releaseState.threshold))
  ) {
    return 'attestation-required';
  }

  return 'contract-upgrade-required';
}
