import { ethers } from "ethers";
import { ExamVaultABI } from "@sigil/contracts-types";
import type { Config } from "../config.js";

// Role byte hashes as defined in ExamVault.sol
export const ROLE_HASHES = {
  ADMIN: ethers.ZeroHash, // DEFAULT_ADMIN_ROLE is bytes32(0) in OpenZeppelin
  AUTHORITY: ethers.keccak256(ethers.toUtf8Bytes("AUTHORITY_ROLE")),
  SETTER: ethers.keccak256(ethers.toUtf8Bytes("SETTER_ROLE")),
  HOLDER: ethers.keccak256(ethers.toUtf8Bytes("HOLDER_ROLE")),
  CENTRE: ethers.keccak256(ethers.toUtf8Bytes("CENTRE_ROLE")),
  AUDITOR: ethers.keccak256(ethers.toUtf8Bytes("AUDITOR_ROLE")),
} as const;

export type SystemRole = keyof typeof ROLE_HASHES;

interface CachedRoles {
  roles: SystemRole[];
  cachedAt: number;
}

const roleCache = new Map<string, CachedRoles>();
const ROLE_CACHE_TTL_MS = 60 * 1000; // 60 seconds

export async function getRolesForAddress(
  address: string,
  cfg: Config,
  customContract?: ethers.Contract
): Promise<SystemRole[]> {
  const normalizedAddr = ethers.getAddress(address);
  const now = Date.now();

  const cached = roleCache.get(normalizedAddr);
  if (cached && now - cached.cachedAt < ROLE_CACHE_TTL_MS) {
    return cached.roles;
  }

  let contract = customContract;
  if (!contract) {
    const provider = new ethers.JsonRpcProvider(cfg.RPC_URL);
    contract = new ethers.Contract(cfg.CONTRACT_ADDRESS, ExamVaultABI, provider);
  }

  const roleChecks: { role: SystemRole; check: Promise<boolean> }[] = [
    { role: "ADMIN", check: contract.hasRole(ROLE_HASHES.ADMIN, normalizedAddr) },
    { role: "AUTHORITY", check: contract.hasRole(ROLE_HASHES.AUTHORITY, normalizedAddr) },
    { role: "SETTER", check: contract.hasRole(ROLE_HASHES.SETTER, normalizedAddr) },
    { role: "HOLDER", check: contract.hasRole(ROLE_HASHES.HOLDER, normalizedAddr) },
    { role: "CENTRE", check: contract.hasRole(ROLE_HASHES.CENTRE, normalizedAddr) },
    { role: "AUDITOR", check: contract.hasRole(ROLE_HASHES.AUDITOR, normalizedAddr) },
  ];

  const results = await Promise.all(
    roleChecks.map(async ({ role, check }) => {
      try {
        const has = await check;
        return has ? role : null;
      } catch {
        return null;
      }
    })
  );

  const activeRoles = results.filter((r): r is SystemRole => r !== null);
  roleCache.set(normalizedAddr, { roles: activeRoles, cachedAt: now });
  return activeRoles;
}

export function clearRoleCache(address?: string) {
  if (address) {
    roleCache.delete(ethers.getAddress(address));
  } else {
    roleCache.clear();
  }
}
