import { describe, it, expect } from 'vitest';
import { decodeContractError } from '../src/utils/errors';
import { ExamVaultABI } from '@sigil/contracts-types';
import { Interface } from 'ethers';

describe('FA-08: Contract Error Decoder', () => {
  const iface = new Interface(ExamVaultABI);

  const allExpectedErrors = [
    'NotAssigned',
    'WrongState',
    'TooEarly',
    'TooLate',
    'InvalidTimes',
    'InvalidThreshold',
    'InvalidPanel',
    'DuplicateEntry',
    'InvalidKeyFormat',
    'InvalidShare',
    'InvalidReveal',
    'AlreadySubmitted',
    'QuotaNotMet',
    'MissingCommitment',
    'ZeroValue',
    'HolderInLiveExam',
    'InvalidRole',
    'CannotGrantAdmin',
    'ExamNotFound',
    'InvalidQuotas',
    'BatchNotFound',
    'CopyMismatch',
    'AccessControlUnauthorizedAccount',
  ];

  it('correctly maps every section 7.4 and ExamVault.sol custom error from error string', () => {
    for (const errorName of allExpectedErrors) {
      const decoded = decodeContractError(`execution reverted: ${errorName}()`);
      expect(decoded.name).toBe(errorName);
      expect(decoded.message.length).toBeGreaterThan(10);
      expect(decoded.action.length).toBeGreaterThan(10);
      expect(decoded.formatted).toContain(decoded.message);
      // No apologies rule
      expect(decoded.formatted.toLowerCase()).not.toContain('sorry');
      expect(decoded.formatted.toLowerCase()).not.toContain('apologize');
    }
  });

  it('correctly decodes ABI-encoded revert data via ethers interface', () => {
    // 1. QuotaNotMet(0, 10, 45)
    const quotaData = iface.encodeErrorResult('QuotaNotMet', [0, 10, 45]);
    const quotaDecoded = decodeContractError({ data: quotaData });
    expect(quotaDecoded.name).toBe('QuotaNotMet');
    expect(quotaDecoded.formatted).toContain('section 0');
    expect(quotaDecoded.formatted).toContain('10 of 45');

    // 2. WrongState(2, 1) -> Sealed expected, but actual is Collecting
    const stateData = iface.encodeErrorResult('WrongState', [2, 1]);
    const stateDecoded = decodeContractError({ data: stateData });
    expect(stateDecoded.name).toBe('WrongState');
    expect(stateDecoded.formatted).toContain('expected Sealed, but actual is Collecting');

    // 3. NotAssigned
    const notAssignedData = iface.encodeErrorResult('NotAssigned', []);
    const notAssignedDecoded = decodeContractError({ data: notAssignedData });
    expect(notAssignedDecoded.name).toBe('NotAssigned');
    expect(notAssignedDecoded.formatted).toContain('not assigned');

    // 4. InvalidThreshold
    const thresholdData = iface.encodeErrorResult('InvalidThreshold', []);
    const thresholdDecoded = decodeContractError({ data: thresholdData });
    expect(thresholdDecoded.name).toBe('InvalidThreshold');
    expect(thresholdDecoded.formatted).toContain('strict majority');

    // 5. MissingCommitment
    const holderAddr = '0x0000000000000000000000000000000000001234';
    const missingData = iface.encodeErrorResult('MissingCommitment', [holderAddr]);
    const missingDecoded = decodeContractError({ data: missingData });
    expect(missingDecoded.name).toBe('MissingCommitment');
    expect(missingDecoded.formatted).toContain(holderAddr);
  });

  it('handles user rejection in wallet gracefully', () => {
    const userRejected = decodeContractError(new Error('User denied transaction signature'));
    expect(userRejected.name).toBe('UserRejected');
    expect(userRejected.formatted).toContain('rejected in your wallet');
  });

  it('provides safe fallback for unknown errors', () => {
    const unknown = decodeContractError('Some arbitrary internal EVM panic 0x4e');
    expect(unknown.name).toBe('UnknownError');
    expect(unknown.formatted).toContain('unexpected transaction error');
  });
});
