import { csvCell } from './audit-log-csv';

export interface RosterProofHolder {
  address: string;
  randomnessStatus: 'Committed on-chain' | 'No on-chain commitment' | 'On-chain getter mismatch';
  shareStatus: 'Submitted on-chain' | 'Not submitted';
  verificationStatus: string;
  randomnessCommitment: string;
  shareCommitment: string;
  submissionTxHash: string;
  submissionBlock: string;
}

export function buildRosterProofCsv(examId: string, threshold: number, holders: readonly RosterProofHolder[], rosterRoot: string): string {
  const rows = [
    ['exam ID', examId],
    ['threshold', String(threshold)],
    ['roster root', rosterRoot],
    [],
    ['holder address', 'randomness status', 'share submission status', 'commitment verification', 'randomness commitment', 'share commitment', 'share event transaction', 'share event block'],
    ...holders.map((holder) => [holder.address, holder.randomnessStatus, holder.shareStatus, holder.verificationStatus, holder.randomnessCommitment, holder.shareCommitment, holder.submissionTxHash, holder.submissionBlock]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
