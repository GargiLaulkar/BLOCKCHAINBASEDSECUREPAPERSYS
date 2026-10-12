import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { ExamVaultABI } from "@sigil/contracts-types";
import { canonical, schemas } from "@sigil/core";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { prisma } from "../db.js";
import type { Config } from "../config.js";

export function createExamsRouter(
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

  // GET /api/exams - list exams
  router.get("/", async (req: Request, res: Response) => {
    try {
      const isAuthenticated = Boolean(req.session?.address);
      const exams = await prisma.exam.findMany({
        orderBy: { createdAt: "desc" },
      });

      if (!isAuthenticated) {
        // Public summary variant
        const publicExams = exams.map((e) => ({
          examId: e.examId,
          chainId: e.chainId,
          state: e.state,
          metaHash: e.metaHash,
          releaseOpensAt: e.releaseOpensAt.toString(),
          examStartsAt: e.examStartsAt.toString(),
          examEndsAt: e.examEndsAt.toString(),
          threshold: e.threshold,
          bankHash: e.bankHash,
          seed: e.seed,
        }));
        return res.status(200).json(publicExams);
      }

      // Authenticated view
      const mapped = exams.map((e) => ({
        ...e,
        releaseOpensAt: e.releaseOpensAt.toString(),
        examStartsAt: e.examStartsAt.toString(),
        examEndsAt: e.examEndsAt.toString(),
      }));

      return res.status(200).json(mapped);
    } catch (err: any) {
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: err?.message || "Failed to list exams",
        },
      });
    }
  });

  // GET /api/exams/:id - exam detail
  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const isAuthenticated = Boolean(req.session?.address);

      let exam = await prisma.exam.findUnique({
        where: { examId: id },
      });

      // If not in DB, attempt lookup on-chain
      if (!exam) {
        try {
          const contract = getContract();
          const onChainExam = await contract.getExam(BigInt(id));
          if (onChainExam && onChainExam.authority !== ethers.ZeroAddress) {
            const cfg = getConfigFn();
            exam = await prisma.exam.create({
              data: {
                chainId: cfg.CHAIN_ID,
                examId: id,
                metaHash: onChainExam.metaHash,
                state: Number(onChainExam.state),
                releaseOpensAt: BigInt(onChainExam.releaseOpensAt),
                examStartsAt: BigInt(onChainExam.examStartsAt),
                examEndsAt: BigInt(onChainExam.examEndsAt),
                threshold: Number(onChainExam.threshold),
                bankHash: onChainExam.bankHash !== ethers.ZeroHash ? onChainExam.bankHash : null,
                seed: onChainExam.seed !== ethers.ZeroHash ? onChainExam.seed : null,
              },
            });
          }
        } catch {
          // not found on chain
        }
      }

      if (!exam) {
        return res.status(404).json({
          error: {
            code: "EXAM_NOT_FOUND",
            message: `Exam with id ${id} not found`,
          },
        });
      }

      if (!isAuthenticated) {
        return res.status(200).json({
          examId: exam.examId,
          chainId: exam.chainId,
          state: exam.state,
          metaHash: exam.metaHash,
          releaseOpensAt: exam.releaseOpensAt.toString(),
          examStartsAt: exam.examStartsAt.toString(),
          examEndsAt: exam.examEndsAt.toString(),
          threshold: exam.threshold,
          bankHash: exam.bankHash,
          seed: exam.seed,
        });
      }

      return res.status(200).json({
        ...exam,
        releaseOpensAt: exam.releaseOpensAt.toString(),
        examStartsAt: exam.examStartsAt.toString(),
        examEndsAt: exam.examEndsAt.toString(),
      });
    } catch (err: any) {
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: err?.message || "Failed to retrieve exam",
        },
      });
    }
  });

  // POST /api/exams/:id/meta - store metadata with hash verification
  router.post(
    "/:id/meta",
    requireAuth,
    requireRole("AUTHORITY"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const cfg = getConfigFn();

        // 1. Validate payload with core ExamMetaSchema
        const parsed = schemas.ExamMetaSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: {
              code: "VALIDATION_FAILED",
              message: "Invalid exam metadata schema",
              details: parsed.error.issues,
            },
          });
        }

        const metaJson = parsed.data;

        // 2. Compute canonical keccak256 hash using RFC 8785 canonicalize
        const computedHash = canonical.keccakJson(metaJson);

        // 3. Query on-chain exam
        const contract = getContract();
        let onChainExam;
        try {
          onChainExam = await contract.getExam(BigInt(id));
        } catch (err: any) {
          return res.status(404).json({
            error: {
              code: "EXAM_NOT_FOUND",
              message: `Exam ${id} not found on chain`,
            },
          });
        }

        // 4. Verify caller is creating AUTHORITY
        const callerAddress = req.session.address!;
        if (
          ethers.getAddress(onChainExam.authority) !==
          ethers.getAddress(callerAddress)
        ) {
          return res.status(403).json({
            error: {
              code: "FORBIDDEN",
              message: "Only the creating Authority can upload exam metadata",
            },
          });
        }

        // 5. Verify computed canonical hash equals on-chain metaHash
        if (computedHash.toLowerCase() !== onChainExam.metaHash.toLowerCase()) {
          return res.status(400).json({
            error: {
              code: "HASH_MISMATCH",
              message: `Computed canonical hash (${computedHash}) does not match on-chain metaHash (${onChainExam.metaHash})`,
            },
          });
        }

        // 6. Store in database
        const saved = await prisma.exam.upsert({
          where: { examId: id },
          create: {
            chainId: cfg.CHAIN_ID,
            examId: id,
            metaHash: onChainExam.metaHash,
            metaJson,
            state: Number(onChainExam.state),
            releaseOpensAt: BigInt(onChainExam.releaseOpensAt),
            examStartsAt: BigInt(onChainExam.examStartsAt),
            examEndsAt: BigInt(onChainExam.examEndsAt),
            threshold: Number(onChainExam.threshold),
            bankHash:
              onChainExam.bankHash !== ethers.ZeroHash ? onChainExam.bankHash : null,
            seed: onChainExam.seed !== ethers.ZeroHash ? onChainExam.seed : null,
          },
          update: {
            metaHash: onChainExam.metaHash,
            metaJson,
            state: Number(onChainExam.state),
          },
        });

        return res.status(200).json({
          examId: id,
          metaHash: saved.metaHash,
          metaJson: saved.metaJson,
        });
      } catch (err: any) {
        return res.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: err?.message || "Failed to save exam metadata",
          },
        });
      }
    }
  );

  return router;
}
