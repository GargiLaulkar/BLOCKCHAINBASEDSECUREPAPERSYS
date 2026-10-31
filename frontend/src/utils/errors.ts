import { ExamVaultABI } from '@sigil/contracts-types';
import { Interface } from 'ethers';

export interface DecodedContractError {
  name: string;
  message: string;
  action: string;
  formatted: string;
}

const contractInterface: Interface = new Interface(ExamVaultABI);

const STATE_NAMES: Record<number, string> = {
  0: 'Draft',
  1: 'Collecting',
  2: 'Sealed',
  3: 'Released',
  4: 'Concluded',
  5: 'Cancelled',
};

const ERROR_MAP: Record<string, (args?: any) => { message: string; action: string }> = {
  NotAssigned: () => ({
    message: 'Your account is not assigned to this examination panel or role.',
    action: 'Verify your connected wallet address or contact the Exam Authority.',
  }),
  WrongState: (args) => {
    const expected = args?.expected !== undefined ? (STATE_NAMES[Number(args.expected)] ?? String(args.expected)) : 'required';
    const actual = args?.actual !== undefined ? (STATE_NAMES[Number(args.actual)] ?? String(args.actual)) : 'current';
    return {
      message: `The exam is in the wrong lifecycle state for this operation (expected ${expected}, but actual is ${actual}).`,
      action: 'Wait for the required state transition before retrying.',
    };
  },
  TooEarly: (args) => {
    return {
      message: 'The scheduled time window for this action has not opened yet.',
      action: 'Check the countdown clock and submit once the window opens.',
    };
  },
  TooLate: (args) => {
    return {
      message: 'The deadline for this on-chain action has passed.',
      action: 'Check the exam schedule; no further submissions can be accepted.',
    };
  },
  InvalidTimes: () => ({
    message: 'The provided exam schedule timestamps are invalid.',
    action: 'Ensure release opens after the lead time and precedes exam start and end.',
  }),
  InvalidThreshold: () => ({
    message: 'The key threshold must be a strict majority of key holders (t > n/2) and within allowed limits.',
    action: 'Adjust the threshold count to meet the majority requirement.',
  }),
  InvalidPanel: () => ({
    message: 'The participant panel configuration is invalid or contains unauthorized accounts.',
    action: 'Verify that all holders, setters, and centres are registered with matching roles.',
  }),
  DuplicateEntry: () => ({
    message: 'A duplicate participant address or quota identifier was submitted.',
    action: 'Remove duplicate entries and ensure each address appears only once.',
  }),
  InvalidKeyFormat: () => ({
    message: 'The public encryption key format is invalid.',
    action: 'Ensure the key is an uncompressed P-256 public key (65 bytes with prefix 0x04).',
  }),
  InvalidShare: () => ({
    message: 'The submitted decryption share does not match the commitment recorded during key ceremony.',
    action: 'Check that you unlocked the correct keystore file for this examination.',
  }),
  InvalidReveal: () => ({
    message: 'The submitted randomness reveal does not match your registered on-chain commitment.',
    action: 'Unlock the correct keystore to re-derive the deterministic reveal value.',
  }),
  AlreadySubmitted: () => ({
    message: 'Your share or randomness commitment has already been registered on-chain for this exam.',
    action: 'No further action needed; multiple submissions are rejected.',
  }),
  QuotaNotMet: (args) => {
    const sec = args?.sectionId !== undefined ? Number(args.sectionId) : 'designated';
    const have = args?.have !== undefined ? Number(args.have) : '?';
    const need = args?.need !== undefined ? Number(args.need) : '?';
    return {
      message: `Question quota for section ${sec} has not been met (${have} of ${need} questions submitted).`,
      action: 'Collect and submit all required question batches before sealing the exam.',
    };
  },
  MissingCommitment: (args) => {
    const holder = args?.holder ? ` for holder ${args.holder}` : '';
    return {
      message: `A key holder commitment is missing${holder}.`,
      action: 'Wait for all assigned key holders to submit commitments before sealing.',
    };
  },
  ZeroValue: () => ({
    message: 'A required parameter, address, or hash was empty or zero.',
    action: 'Provide valid non-zero values for all required fields.',
  }),
  HolderInLiveExam: () => ({
    message: 'This key holder is currently participating in an active exam.',
    action: 'Conclude or cancel live exams before revoking roles or updating keys.',
  }),
  InvalidRole: (args) => {
    const roleId = args?.role !== undefined ? ` (role ID: ${args.role})` : '';
    return {
      message: `The specified participant role identifier is invalid${roleId}.`,
      action: 'Select a valid role from the participant management interface.',
    };
  },
  CannotGrantAdmin: () => ({
    message: 'The administrator role cannot be granted via this function.',
    action: 'Admin accounts must be assigned during contract deployment.',
  }),
  ExamNotFound: () => ({
    message: 'The requested examination record does not exist on the ledger.',
    action: 'Verify the exam serial number or hash before proceeding.',
  }),
  InvalidQuotas: () => ({
    message: 'The section quota configuration is invalid.',
    action: 'Specify between 1 and 8 sections with question quotas greater than zero.',
  }),
  BatchNotFound: () => ({
    message: 'The referenced question batch was not found in the exam registry.',
    action: 'Upload the batch ciphertext and confirm submission on-chain.',
  }),
  CopyMismatch: () => ({
    message: 'The centre variant hash does not match the registered variant copy.',
    action: 'Check question bank decryption and re-run deterministic variant selection.',
  }),
  AccessControlUnauthorizedAccount: (args) => {
    const acc = args?.account ? ` Account ${args.account}` : 'Your account';
    return {
      message: `${acc} lacks the required smart contract authorization for this call.`,
      action: 'Switch to an account authorized with the appropriate role.',
    };
  },
};

const FALLBACK_ERROR: DecodedContractError = {
  name: 'UnknownError',
  message: 'An unexpected transaction error occurred.',
  action: 'Verify your wallet network connection, balance, and transaction parameters.',
  formatted: 'An unexpected transaction error occurred. Verify your wallet network connection, balance, and transaction parameters.',
};

/**
 * Decodes any contract revert error into a clear, plain-language description.
 * No apologies, no raw hex strings, safe fallback for unknown errors.
 */
export function decodeContractError(error: unknown): DecodedContractError {
  if (!error) return FALLBACK_ERROR;

  // Case 1: Ethers revert data extraction
  let data: string | undefined;

  if (typeof error === 'object' && error !== null) {
    const anyErr = error as any;
    data = anyErr.data ?? anyErr.error?.data ?? anyErr.info?.error?.data ?? anyErr.receipt?.revertReason;
  }

  if (data && typeof data === 'string' && data.startsWith('0x') && data.length >= 10) {
    try {
      const parsed = contractInterface.parseError(data);
      if (parsed && ERROR_MAP[parsed.name]) {
        const { message, action } = ERROR_MAP[parsed.name](parsed.args);
        return {
          name: parsed.name,
          message,
          action,
          formatted: `${message} ${action}`,
        };
      }
    } catch {
      // Data wasn't an ABI-matching error, continue to pattern matching
    }
  }

  // Case 2: Named error on object
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as any;
    const name = anyErr.name ?? anyErr.errorName;
    if (typeof name === 'string' && ERROR_MAP[name]) {
      const { message, action } = ERROR_MAP[name](anyErr.args);
      return {
        name,
        message,
        action,
        formatted: `${message} ${action}`,
      };
    }
  }

  // Case 3: Error message string parsing (e.g. "execution reverted: QuotaNotMet(0, 10, 50)")
  const errString = typeof error === 'string' ? error : (error as any).message || String(error);

  for (const errorName of Object.keys(ERROR_MAP)) {
    if (errString.includes(errorName)) {
      // Try to parse arguments if present like QuotaNotMet(0, 10, 50)
      const match = new RegExp(`${errorName}\\(([^)]+)\\)`).exec(errString);
      let parsedArgs: any = undefined;
      if (match && match[1]) {
        const parts = match[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
        if (errorName === 'QuotaNotMet') {
          parsedArgs = { sectionId: parts[0], have: parts[1], need: parts[2] };
        } else if (errorName === 'WrongState') {
          parsedArgs = { expected: parts[0], actual: parts[1] };
        } else if (errorName === 'MissingCommitment') {
          parsedArgs = { holder: parts[0] };
        } else if (errorName === 'InvalidRole') {
          parsedArgs = { role: parts[0] };
        }
      }
      const { message, action } = ERROR_MAP[errorName](parsedArgs);
      return {
        name: errorName,
        message,
        action,
        formatted: `${message} ${action}`,
      };
    }
  }

  // User rejection in MetaMask
  if (errString.includes('user rejected') || errString.includes('User denied') || (error as any)?.code === 4001) {
    return {
      name: 'UserRejected',
      message: 'Transaction signature was rejected in your wallet.',
      action: 'Retry the action and confirm the signature in MetaMask.',
      formatted: 'Transaction signature was rejected in your wallet. Retry the action and confirm the signature in MetaMask.',
    };
  }

  return FALLBACK_ERROR;
}
