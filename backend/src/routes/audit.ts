import { Router, type Request, type Response } from "express";
import { ethers } from "ethers";
import { ExamVaultABI } from "@sigil/contracts-types";
import { canonical, schemas } from "@sigil/core";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { prisma } from "../db.js";
import type { Config } from "../config.js";

export function createAuditRouter(
  getConfigFn: () => Config,
  customContract?: ethers.Contract
) {
  const router = Router();

  function getContract() {
    if (customContract) return customContract;
    const cfg = getConfigFn();
    const provider = new ethers.JsonRpcProvider(cfg.RPC_URL);
    return new ethers.Contract(cfg.CONTRACT_ADDRESS, ExamVaultABI, provider);
  }

  async function isCurrentAuditor(address: string): Promise<boolean> {
    return getContract().hasRole(ethers.id("AUDITOR_ROLE"), ethers.getAddress(address));
  }

  router.post(
    "/audit/traces",
    requireAuth,
    requireRole("AUDITOR"),
    async (req: Request, res: Response) => {
      try {
        const caller = ethers.getAddress(req.session!.address!);
        if (!(await isCurrentAuditor(caller))) {
          return res.status(403).json({
            error: { code: "FORBIDDEN", message: "An active AUDITOR role is required" },
          });
        }

        const parsed = schemas.LeakTracePayloadSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: {
              code: "VALIDATION_FAILED",
              message: "Invalid leak trace payload or MatchReport",
              details: parsed.error.issues,
            },
          });
        }

        const computedHash = canonical.keccakJson(parsed.data.result);
        if (computedHash.toLowerCase() !== parsed.data.evidenceHash.toLowerCase()) {
          return res.status(400).json({
            error: {
              code: "HASH_MISMATCH",
              message: `Computed evidence hash (${computedHash}) does not match evidenceHash`,
            },
          });
        }

        const exam = await prisma.exam.findUnique({
          where: { examId: parsed.data.examId },
          select: { examId: true },
        });
        if (!exam) {
          return res.status(404).json({
            error: {
              code: "EXAM_NOT_FOUND",
              message: `Indexed exam ${parsed.data.examId} not found`,
            },
          });
        }

        const trace = await prisma.leakTrace.create({
          data: {
            examId: parsed.data.examId,
            auditor: caller,
            evidenceHash: computedHash,
            resultJson: parsed.data.result,
          },
        });
        return res.status(201).json({
          id: trace.id,
          examId: trace.examId,
          auditor: trace.auditor,
          evidenceHash: trace.evidenceHash,
          resultJson: trace.resultJson,
          createdAt: trace.createdAt,
        });
      } catch {
        return res.status(500).json({
          error: { code: "INTERNAL_ERROR", message: "Failed to save audit trace" },
        });
      }
    }
  );

  router.get(
    "/audit/traces/:id",
    requireAuth,
    requireRole("AUDITOR"),
    async (req: Request, res: Response) => {
      try {
        const caller = ethers.getAddress(req.session!.address!);
        if (!(await isCurrentAuditor(caller))) {
          return res.status(403).json({
            error: { code: "FORBIDDEN", message: "An active AUDITOR role is required" },
          });
        }

        const trace = await prisma.leakTrace.findFirst({
          where: { id: req.params.id, auditor: caller },
        });
        if (!trace) {
          return res.status(404).json({
            error: { code: "TRACE_NOT_FOUND", message: "Audit trace not found" },
          });
        }
        return res.status(200).json({
          id: trace.id,
          examId: trace.examId,
          auditor: trace.auditor,
          evidenceHash: trace.evidenceHash,
          resultJson: trace.resultJson,
          createdAt: trace.createdAt,
        });
      } catch {
        return res.status(500).json({
          error: { code: "INTERNAL_ERROR", message: "Failed to retrieve audit trace" },
        });
      }
    }
  );

  return router;
}
