import { describe, expect, it } from 'vitest';
import { buildRosterProofCsv, type RosterProofHolder } from './roster-proof';

describe('roster proof export', () => {
  it('exports only roster status and public commitment references with CSV safety', () => {
    const holder: RosterProofHolder = {
      address: '0x1111111111111111111111111111111111111111',
      randomnessStatus: 'Committed on-chain', shareStatus: 'Submitted on-chain',
      verificationStatus: 'Share commitment matches indexed event and on-chain getter',
      randomnessCommitment: `0x${'aa'.repeat(32)}`, shareCommitment: `0x${'bb'.repeat(32)}`,
      submissionTxHash: `0x${'cc'.repeat(32)}`, submissionBlock: '9',
    };
    const csv = buildRosterProofCsv('4', 2, [holder], `0x${'dd'.repeat(32)}`);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain(holder.address);
    expect(csv).toContain('Committed on-chain');
    expect(csv).toContain(holder.submissionTxHash);
    expect(csv).not.toContain('private scalar');
  });
});
