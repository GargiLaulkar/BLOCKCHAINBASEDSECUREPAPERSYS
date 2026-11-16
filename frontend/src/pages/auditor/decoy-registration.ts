import { ethers } from 'ethers';

export interface DecoyContract {
  interface: { parseLog: (log: { topics: readonly string[]; data: string }) => { name: string; args: Record<string, unknown> } | null };
  getFunction(name: 'registerDecoy'): (examId: bigint, decoyHash: string, channelLabel: string) => Promise<{
    hash: string;
    wait: () => Promise<{ status: number | null; logs: Array<{ topics: readonly string[]; data: string }> } | null>;
  }>;
}

export async function registerDecoyOnChain(contract: DecoyContract, input: { examId: string; decoyHash: string; channelLabel: string }) {
  if (!/^\d+$/.test(input.examId) || BigInt(input.examId) === 0n) throw new Error('Select a valid examination.');
  if (!/^0x[0-9a-f]{64}$/i.test(input.decoyHash) || input.decoyHash === ethers.ZeroHash) throw new Error('A non-zero Keccak-256 content hash is required.');
  const label = input.channelLabel.trim();
  if (!label) throw new Error('A distribution channel label is required.');
  let encodedLabel: string;
  try { encodedLabel = ethers.encodeBytes32String(label); }
  catch { throw new Error('The channel label must fit in 31 UTF-8 bytes.'); }

  const response = await contract.getFunction('registerDecoy')(BigInt(input.examId), input.decoyHash, encodedLabel);
  const receipt = await response.wait();
  if (!receipt || receipt.status !== 1) throw new Error('Decoy registration transaction did not confirm successfully.');
  const event = receipt.logs.map((log) => {
    try { return contract.interface.parseLog(log); } catch { return null; }
  }).find((log) => log?.name === 'DecoyRegistered' &&
    String(log.args.examId) === input.examId &&
    String(log.args.decoyHash).toLowerCase() === input.decoyHash.toLowerCase() &&
    String(log.args.channelLabel).toLowerCase() === encodedLabel.toLowerCase());
  if (!event) throw new Error('The confirmed receipt did not contain the expected DecoyRegistered event.');
  return { txHash: response.hash, channelLabel: encodedLabel };
}
