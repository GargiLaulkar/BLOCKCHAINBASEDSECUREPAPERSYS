import { ethers } from "ethers";
import type { LogDescription, Log } from "ethers";
import type { Config } from "../config.js";

const ROLE_NAMES: Record<number, string> = {
  1: "AUTHORITY",
  2: "SETTER",
  3: "HOLDER",
  4: "CENTRE",
  5: "AUDITOR",
};

/**
 * Dispatches a decoded event log to its specific idempotent handler, updating derived tables.
 */
export async function handleEvent(
  parsed: LogDescription,
  log: Log,
  tx: any,
  cfg: Config
): Promise<void> {
  const name = parsed.name;
  const args = parsed.args;

  switch (name) {
    case "ParticipantRegistered": {
      const account = ethers.getAddress(args.account);
      const roleId = Number(args.role);
      const roleName = ROLE_NAMES[roleId] || `ROLE_${roleId}`;
      const profileHash = args.profileHash !== ethers.ZeroHash ? args.profileHash : null;

      const existing = await tx.participant.findUnique({
        where: { address: account },
      });

      if (existing) {
        const existingRoles = Array.isArray(existing.roles) ? (existing.roles as string[]) : [];
        const nextRoles = Array.from(new Set([...existingRoles, roleName]));
        await tx.participant.update({
          where: { address: account },
          data: {
            roles: nextRoles,
            profileHash: profileHash || existing.profileHash,
          },
        });
      } else {
        await tx.participant.create({
          data: {
            address: account,
            roles: [roleName],
            profileHash,
          },
        });
      }
      break;
    }

    case "ParticipantRevoked": {
      const account = ethers.getAddress(args.account);
      const roleId = Number(args.role);
      const roleName = ROLE_NAMES[roleId] || `ROLE_${roleId}`;

      const existing = await tx.participant.findUnique({
        where: { address: account },
      });

      if (existing) {
        const existingRoles = Array.isArray(existing.roles) ? (existing.roles as string[]) : [];
        const nextRoles = existingRoles.filter((r) => r !== roleName);
        await tx.participant.update({
          where: { address: account },
          data: { roles: nextRoles },
        });
      }
      break;
    }

    case "ExamCreated": {
      const examId = args.examId.toString();
      await tx.exam.upsert({
        where: { examId },
        create: {
          chainId: cfg.CHAIN_ID,
          examId,
          metaHash: args.metaHash,
          state: 0, // Draft
          releaseOpensAt: BigInt(args.releaseOpensAt),
          examStartsAt: BigInt(args.examStartsAt),
          examEndsAt: BigInt(args.examEndsAt),
          threshold: Number(args.threshold),
        },
        update: {
          metaHash: args.metaHash,
          releaseOpensAt: BigInt(args.releaseOpensAt),
          examStartsAt: BigInt(args.examStartsAt),
          examEndsAt: BigInt(args.examEndsAt),
          threshold: Number(args.threshold),
        },
      });
      break;
    }

    case "PanelAssigned": {
      const examId = args.examId.toString();
      const holders: string[] = args.holders || [];
      const setters: string[] = args.setters || [];
      const centres: string[] = args.centres || [];

      for (const h of holders) {
        const addr = ethers.getAddress(h);
        await tx.panelMember.upsert({
          where: {
            examId_address_kind: { examId, address: addr, kind: "holder" },
          },
          create: { examId, address: addr, kind: "holder" },
          update: {},
        });
      }

      for (const s of setters) {
        const addr = ethers.getAddress(s);
        await tx.panelMember.upsert({
          where: {
            examId_address_kind: { examId, address: addr, kind: "setter" },
          },
          create: { examId, address: addr, kind: "setter" },
          update: {},
        });
      }

      for (const c of centres) {
        const addr = ethers.getAddress(c);
        await tx.panelMember.upsert({
          where: {
            examId_address_kind: { examId, address: addr, kind: "centre" },
          },
          create: { examId, address: addr, kind: "centre" },
          update: {},
        });
      }
      break;
    }

    case "CollectionOpened": {
      const examId = args.examId.toString();
      // Only advance forward if current state is < 1 (Collecting)
      await tx.exam.updateMany({
        where: { examId, state: { lt: 1 } },
        data: { state: 1 },
      });
      break;
    }

    case "BatchSubmitted": {
      const examId = args.examId.toString();
      const sectionId = Number(args.sectionId);
      const ciphertextHash = args.ciphertextHash;
      const batchId = BigInt(args.batchId);
      const startInSection = Number(args.startInSection);
      const questionCount = Number(args.questionCount);
      const setter = ethers.getAddress(args.setter);

      // Check if a pending batch exists with matching (examId, sectionId, ciphertextHash)
      const existing = await tx.batch.findUnique({
        where: {
          examId_sectionId_ciphertextHash: {
            examId,
            sectionId,
            ciphertextHash,
          },
        },
      });

      if (existing) {
        await tx.batch.update({
          where: { id: existing.id },
          data: {
            status: "confirmed",
            batchId,
            startInSection,
            txHash: log.transactionHash,
          },
        });
      } else {
        await tx.batch.create({
          data: {
            examId,
            sectionId,
            ciphertextHash,
            batchId,
            startInSection,
            questionCount,
            setter,
            blobPath: "",
            status: "confirmed",
            txHash: log.transactionHash,
          },
        });
      }
      break;
    }

    case "ExamSealed": {
      const examId = args.examId.toString();
      const bankHash = args.bankHash;

      await tx.exam.updateMany({
        where: { examId, state: { lt: 2 } },
        data: { state: 2, bankHash },
      });

      // Ensure bankHash is stored even if state was already updated
      await tx.exam.updateMany({
        where: { examId },
        data: { bankHash },
      });
      break;
    }

    case "PaperReleased": {
      const examId = args.examId.toString();
      const seed = args.seed;

      await tx.exam.updateMany({
        where: { examId, state: { lt: 3 } },
        data: { state: 3, seed },
      });

      await tx.exam.updateMany({
        where: { examId },
        data: { seed },
      });
      break;
    }

    case "ExamConcluded": {
      const examId = args.examId.toString();
      await tx.exam.updateMany({
        where: { examId, state: { lt: 4 } },
        data: { state: 4 },
      });
      break;
    }

    case "ExamCancelled": {
      const examId = args.examId.toString();
      await tx.exam.updateMany({
        where: { examId },
        data: { state: 5 }, // Cancelled
      });
      break;
    }

    default:
      // Other events (EncryptionKeySet, RandomnessCommitted, ShareSubmitted, etc.)
      // are captured directly in the ChainEvent log table
      break;
  }
}
