import { describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { leakEvidenceHash, submitLeakReportOnChain } from './submission';

describe('Auditor on-chain leak submission', () => {
  it('hashes the normalized description and calls the exact reportLeak ABI arguments', async () => {
    const submit = vi.fn().mockResolvedValue({ hash: `0x${'aa'.repeat(32)}`, wait: vi.fn() });
    const contract = { getFunction: vi.fn((name: string) => {
      expect(name).toBe('reportLeak');
      return submit;
    }) };
    const result = await submitLeakReportOnChain(contract, {
      examId: '19', evidenceDescription: '  Observed copy at entrance.  ',
      suspectCentre: '0x1111111111111111111111111111111111111111',
      matchedVariantHash: `0x${'ab'.repeat(32)}`,
    });
    expect(result.evidenceHash).toBe(ethers.keccak256(ethers.toUtf8Bytes('Observed copy at entrance.')));
    expect(submit).toHaveBeenCalledWith(
      19n, result.evidenceHash, '0x1111111111111111111111111111111111111111', `0x${'ab'.repeat(32)}`,
    );
  });

  it('uses zero address for an unattributed report and rejects invalid inputs', async () => {
    const submit = vi.fn().mockResolvedValue({ hash: '0x', wait: vi.fn() });
    const contract = { getFunction: () => submit };
    await submitLeakReportOnChain(contract, {
      examId: '1', evidenceDescription: 'Evidence notes with enough length',
      suspectCentre: '', matchedVariantHash: `0x${'01'.repeat(32)}`,
    });
    expect(submit.mock.calls[0]?.[2]).toBe(ethers.ZeroAddress);
    await expect(submitLeakReportOnChain(contract, {
      examId: '0', evidenceDescription: 'Evidence notes with enough length',
      suspectCentre: '', matchedVariantHash: `0x${'01'.repeat(32)}`,
    })).rejects.toThrow('Invalid exam identifier');
    expect(() => leakEvidenceHash('short')).toThrow('between 10 and 4000');
  });
});
