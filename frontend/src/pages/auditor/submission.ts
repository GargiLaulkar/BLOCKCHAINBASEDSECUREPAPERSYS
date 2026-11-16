import { ethers } from 'ethers';

export interface LeakReportInput {
  examId: string;
  evidenceDescription: string;
  suspectCentre: string;
  matchedVariantHash: string;
}

export interface LeakReportContract {
  getFunction(name: 'reportLeak'): (
    examId: bigint,
    evidenceHash: string,
    suspectCentre: string,
    matchedVariantHash: string,
  ) => Promise<{ hash: string; wait: () => Promise<{ status: number } | null> }>;
}

export function leakEvidenceHash(description: string): string {
  const normalized = description.trim();
  if (normalized.length < 10 || normalized.length > 4000) {
    throw new Error('Evidence description must contain between 10 and 4000 characters.');
  }
  return ethers.keccak256(ethers.toUtf8Bytes(normalized));
}

/** Calls the exact deployed ABI method. The contract remains authoritative for role/state/copy checks. */
export async function submitLeakReportOnChain(
  contract: LeakReportContract,
  input: LeakReportInput,
) {
  if (!/^\d+$/.test(input.examId) || BigInt(input.examId) === 0n) throw new Error('Invalid exam identifier.');
  if (!/^0x[0-9a-f]{64}$/i.test(input.matchedVariantHash)) throw new Error('Invalid matched variant hash.');
  let suspectCentre = ethers.ZeroAddress;
  if (input.suspectCentre) {
    try {
      suspectCentre = ethers.getAddress(input.suspectCentre);
    } catch {
      throw new Error('Invalid suspected Centre address.');
    }
  }
  const evidenceHash = leakEvidenceHash(input.evidenceDescription);
  const response = await contract.getFunction('reportLeak')(
    BigInt(input.examId), evidenceHash, suspectCentre, input.matchedVariantHash,
  );
  return { response, evidenceHash, suspectCentre };
}
