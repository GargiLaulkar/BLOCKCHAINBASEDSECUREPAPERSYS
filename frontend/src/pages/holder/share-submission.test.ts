import { FunctionFragment, Interface, type InterfaceAbi } from 'ethers';
import { describe, expect, it, vi } from 'vitest';
import ExamVaultArtifact from '../../../../packages/contracts-types/abi/ExamVault.json';
import { shareCommitment } from '@sigil/core/shares';
import { PUBLIC_REVEAL_OVERLOAD_BLOCKED_MESSAGE, submitHolderShareCommitment } from './share-submission';

const examId = 7n;
const holder = '0x1111111111111111111111111111111111111111' as const;
const share = new Uint8Array(32).fill(0x5a);
const expectedCommitment = shareCommitment(examId, holder, share);

function makeInput(overrides: Partial<Parameters<typeof submitHolderShareCommitment>[0]> = {}) {
  return {
    examId,
    holder,
    share,
    expectedCommitment,
    readOnChainCommitment: async () => expectedCommitment,
    readReleaseState: async () => ({ state: 2, threshold: 2 }),
    readSubmissionCount: async () => 0n,
    readHasSubmitted: async () => false,
    ...overrides,
  };
}

describe('Holder share submission safety', () => {
  it('verifies the local and on-chain commitment but blocks the reveal-bearing deployed overload', async () => {
    const transaction = vi.fn();
    await expect(submitHolderShareCommitment(makeInput())).resolves.toBe('contract-upgrade-required');
    expect(transaction).not.toHaveBeenCalled();
    expect(PUBLIC_REVEAL_OVERLOAD_BLOCKED_MESSAGE).toMatch(/No transaction was sent/);
  });

  it('rechecks the local commitment against the on-chain commitment before blocking', async () => {
    await expect(submitHolderShareCommitment(makeInput({
      readOnChainCommitment: async () => `0x${'00'.repeat(32)}`,
    }))).rejects.toThrow(/on-chain commitment/);
  });

  it('blocks threshold release while the authorized attestation service is unavailable', async () => {
    await expect(submitHolderShareCommitment(makeInput({ readSubmissionCount: async () => 1n })))
      .resolves.toBe('attestation-required');
  });

  it('also blocks post-release submissions rather than publishing a reveal', async () => {
    await expect(submitHolderShareCommitment(makeInput({
      readReleaseState: async () => ({ state: 3, threshold: 2 }),
      readSubmissionCount: async () => 2n,
    }))).resolves.toBe('contract-upgrade-required');
  });

  it('confirms the deployed third submitShare argument is a reveal and must not be called', () => {
    const contractInterface = new Interface(ExamVaultArtifact as InterfaceAbi);
    const submit = contractInterface.fragments
      .filter((fragment) => fragment.type === 'function')
      .map((fragment) => fragment as FunctionFragment)
      .find((fragment) => fragment.format('sighash') === 'submitShare(uint256,bytes32,bytes32)');
    expect(submit?.inputs[2]?.name).toBe('reveal');
  });
});
