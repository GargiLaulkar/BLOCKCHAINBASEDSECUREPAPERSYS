import { describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { registerDecoyOnChain, type DecoyContract } from './decoy-registration';

function fakeContract(status = 1, emitsExpected = true) {
  const hash = `0x${'ab'.repeat(32)}`;
  const channelLabel = ethers.encodeBytes32String('vault-copy');
  const contract: DecoyContract = {
    getFunction: vi.fn(() => vi.fn(async () => ({ hash, wait: async () => ({ status, logs: emitsExpected ? [{ topics: [], data: '0x' }] : [] }) }))) as unknown as DecoyContract['getFunction'],
    interface: { parseLog: vi.fn(() => emitsExpected ? { name: 'DecoyRegistered', args: { examId: 3n, decoyHash: hash, channelLabel } } : null) },
  };
  return { contract, hash };
}

describe('decoy registration client', () => {
  it('calls the real ABI method and requires a successful receipt with matching event', async () => {
    const { contract, hash } = fakeContract();
    const result = await registerDecoyOnChain(contract, { examId: '3', decoyHash: hash, channelLabel: 'vault-copy' });
    expect(contract.getFunction).toHaveBeenCalledWith('registerDecoy');
    expect(result.txHash).toBe(hash);
    expect(result.channelLabel).toBe(ethers.encodeBytes32String('vault-copy'));
  });

  it('rejects invalid hash, an unsuccessful receipt, and a receipt missing the registration event', async () => {
    const { contract, hash } = fakeContract();
    await expect(registerDecoyOnChain(contract, { examId: '3', decoyHash: 'not-a-hash', channelLabel: 'label' })).rejects.toThrow('Keccak-256');
    await expect(registerDecoyOnChain(fakeContract(0).contract, { examId: '3', decoyHash: hash, channelLabel: 'vault-copy' })).rejects.toThrow('did not confirm');
    await expect(registerDecoyOnChain(fakeContract(1, false).contract, { examId: '3', decoyHash: hash, channelLabel: 'vault-copy' })).rejects.toThrow('did not contain');
  });
});
