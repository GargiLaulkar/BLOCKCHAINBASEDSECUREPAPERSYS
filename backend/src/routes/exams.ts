import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { ExamVaultABI } from "@sigil/contracts-types";
import { canonical, schemas } from "@sigil/core";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { prisma } from "../db.js";
import type { Config } from "../config.js";

async function isUserAssignedOrCreator(
  examId: string,
  userAddress: string,
  contract: ethers.Contract
): Promise<boolean> {
  const normUser = ethers.getAddress(userAddress);

  // 1. Check database PanelMember
  const member = await prisma.panelMember.findFirst({
    where: { examId, address: normUser },
  });
  if (member) return true;

  // 2. Check on-chain exam authority and panel members
  try {
    const onChainExam = await contract.getExam(BigInt(examId));
    if (ethers.getAddress(onChainExam.authority) === normUser) {
      return true;
    }
    const [holders, setters, centres] = await contract.getPanel(BigInt(examId));
    const all = [
      ...holders.map((h: string) => ethers.getAddress(h)),
      ...setters.map((s: string) => ethers.getAddress(s)),
      ...centres.map((c: string) => ethers.getAddress(c)),
    ];
    if (all.includes(normUser)) {
      return true;
    }
  } catch {
    // contract read failed or exam not on chain
  }

  return false;
}

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
  // Authenticated: filtered to exams the caller is assigned to or created
  // Unauthenticated: public summary variant without secrets
  router.get("/", async (req: Request, res: Response) => {
    try {
      const isAuthenticated = Boolean(req.session?.address);
      const exams = await prisma.exam.findMany({
        orderBy: { createdAt: "desc" },
      });

      if (!isAuthenticated) {
        // Public summary variant: exposes no secrets (Section 4.3 public data only)
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

      // Authenticated view - filtered to exams the caller is assigned to or created
      const callerAddr = ethers.getAddress(req.session!.address!);
      const contract = getContract();

      const filtered: typeof exams = [];
      for (const e of exams) {
        if (await isUserAssignedOrCreator(e.examId, callerAddr, contract)) {
          filtered.push(e);
        }
      }

      const mapped = filtered.map((e) => ({
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

  // GET /api/exams/:id/shares/me - return assigned holder's own envelope
  router.get(
    "/:id/shares/me",
    requireAuth,
    requireRole("HOLDER"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const caller = ethers.getAddress(req.session!.address!);
        const contract = getContract();

        // 1. Verify caller is an assigned holder for this exam
        let panelHolders: string[] = [];
        try {
          const [holders] = await contract.getPanel(BigInt(id));
          panelHolders = holders.map((h: string) => ethers.getAddress(h));
        } catch {
          // Fallback to database PanelMember if on-chain call fails
          const dbHolders = await prisma.panelMember.findMany({
            where: { examId: id, kind: "holder" },
          });
          panelHolders = dbHolders.map((m) => ethers.getAddress(m.address));
        }

        if (!panelHolders.includes(caller)) {
          return res.status(403).json({
            error: {
              code: "FORBIDDEN",
              message: "Caller is not an assigned holder for this exam",
            },
          });
        }

        // 2. Fetch holder's share from DB
        const share = await prisma.encryptedShare.findUnique({
          where: {
            examId_holder: {
              examId: id,
              holder: caller,
            },
          },
        });

        if (!share) {
          return res.status(404).json({
            error: {
              code: "SHARE_NOT_FOUND",
              message: "Encrypted share not found for this exam",
            },
          });
        }

        // Return ONLY that holder's own envelope as hex
        return res.status(200).json({
          examId: share.examId,
          holder: share.holder,
          envelope: "0x" + Buffer.from(share.envelope).toString("hex"),
        });
      } catch (err: any) {
        return res.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: err?.message || "Failed to retrieve encrypted share",
          },
        });
      }
    }
  );

  // PUT /api/exams/:id/shares - store one encrypted share envelope per panel holder
  // Creating AUTHORITY only, only when exam is in Draft
  router.put(
    "/:id/shares",
    requireAuth,
    requireRole("AUTHORITY"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const caller = ethers.getAddress(req.session!.address!);
        const contract = getContract();

        // 1. Read exam state and authority from the chain (authoritative)
        let onChainExam;
        try {
          onChainExam = await contract.getExam(BigInt(id));
        } catch {
          return res.status(404).json({
            error: {
              code: "EXAM_NOT_FOUND",
              message: `Exam ${id} not found on chain`,
            },
          });
        }

        // 2. Verify caller is the creating authority
        if (ethers.getAddress(onChainExam.authority) !== caller) {
          return res.status(403).json({
            error: {
              code: "FORBIDDEN",
              message: "Only the creating Authority can upload shares",
            },
          });
        }

        // 3. Verify exam state is Draft (state 0)
        if (Number(onChainExam.state) !== 0) {
          return res.status(400).json({
            error: {
              code: "WRONG_STATE",
              message: `Shares can only be stored when exam is in Draft state (current state is ${onChainExam.state})`,
            },
          });
        }

        // 4. Read panel holders from the contract
        let panelHolders: string[] = [];
        try {
          const [holders] = await contract.getPanel(BigInt(id));
          panelHolders = holders.map((h: string) => ethers.getAddress(h));
        } catch {
          const dbHolders = await prisma.panelMember.findMany({
            where: { examId: id, kind: "holder" },
          });
          panelHolders = dbHolders.map((m) => ethers.getAddress(m.address));
        }

        // 5. Parse and validate shares payload
        const rawShares = Array.isArray(req.body)
          ? req.body
          : Array.isArray(req.body?.shares)
          ? req.body.shares
          : null;

        if (!rawShares || !Array.isArray(rawShares)) {
          return res.status(400).json({
            error: {
              code: "VALIDATION_FAILED",
              message: "Payload must contain an array of shares or { shares: [...] }",
            },
          });
        }

        // Check holder count
        if (rawShares.length !== panelHolders.length) {
          return res.status(400).json({
            error: {
              code: "INVALID_HOLDER_COUNT",
              message: `Expected exactly ${panelHolders.length} shares for panel holders, got ${rawShares.length}`,
            },
          });
        }

        const seenHolders = new Set<string>();
        const parsedShares: Array<{ holder: string; envelopeBytes: Buffer }> = [];

        for (const item of rawShares) {
          if (!item.holder || !item.envelope) {
            return res.status(400).json({
              error: {
                code: "VALIDATION_FAILED",
                message: "Each share must specify 'holder' and 'envelope'",
              },
            });
          }

          let holderAddr: string;
          try {
            holderAddr = ethers.getAddress(item.holder);
          } catch {
            return res.status(400).json({
              error: {
                code: "INVALID_HOLDER",
                message: `Invalid Ethereum address: ${item.holder}`,
              },
            });
          }

          if (seenHolders.has(holderAddr)) {
            return res.status(400).json({
              error: {
                code: "DUPLICATE_HOLDER",
                message: `Duplicate share for holder: ${holderAddr}`,
              },
            });
          }
          seenHolders.add(holderAddr);

          if (!panelHolders.includes(holderAddr)) {
            return res.status(400).json({
              error: {
                code: "NON_PANEL_HOLDER",
                message: `Address ${holderAddr} is not an assigned holder in this exam panel`,
              },
            });
          }

          // Parse envelope
          let envBuf: Buffer;
          if (typeof item.envelope === "string") {
            const clean = item.envelope.startsWith("0x") ? item.envelope.slice(2) : item.envelope;
            if (/^[0-9a-fA-F]+$/.test(clean)) {
              envBuf = Buffer.from(clean, "hex");
            } else {
              envBuf = Buffer.from(item.envelope, "base64");
            }
          } else if (Buffer.isBuffer(item.envelope)) {
            envBuf = item.envelope;
          } else if (item.envelope instanceof Uint8Array || Array.isArray(item.envelope)) {
            envBuf = Buffer.from(item.envelope);
          } else {
            return res.status(400).json({
              error: {
                code: "INVALID_ENVELOPE",
                message: "Envelope must be a hex string or bytes",
              },
            });
          }

          // Validate envelope format: leading byte 0x01, minimum length 94 bytes (1 prefix + 65 epk + 12 iv + 16 tag)
          if (envBuf.length < 94 || envBuf[0] !== 0x01) {
            return res.status(400).json({
              error: {
                code: "INVALID_ENVELOPE",
                message: "Envelope must start with 0x01 and be at least 94 bytes (epk + iv + tag)",
              },
            });
          }

          parsedShares.push({ holder: holderAddr, envelopeBytes: envBuf });
        }

        // Verify no panel holders are missing
        for (const h of panelHolders) {
          if (!seenHolders.has(h)) {
            return res.status(400).json({
              error: {
                code: "MISSING_HOLDER",
                message: `Missing share for panel holder ${h}`,
              },
            });
          }
        }

        // 6. Transactionally store envelopes (never log envelope bytes)
        await prisma.$transaction(async (tx) => {
          for (const s of parsedShares) {
            await tx.encryptedShare.upsert({
              where: {
                examId_holder: {
                  examId: id,
                  holder: s.holder,
                },
              },
              create: {
                examId: id,
                holder: s.holder,
                envelope: s.envelopeBytes,
              },
              update: {
                envelope: s.envelopeBytes,
              },
            });
          }
        });

        return res.status(200).json({
          examId: id,
          storedCount: parsedShares.length,
        });
      } catch (err: any) {
        return res.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: err?.message || "Failed to store encrypted shares",
          },
        });
      }
    }
  );

  // GET /api/exams/:id - exam detail
  // Authenticated: requires user to be assigned to or creator of exam
  // Unauthenticated: public summary variant without secrets
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

      const callerAddr = ethers.getAddress(req.session!.address!);
      const contract = getContract();
      const isAssigned = await isUserAssignedOrCreator(id, callerAddr, contract);
      if (!isAssigned) {
        return res.status(403).json({
          error: {
            code: "FORBIDDEN",
            message: "You are not assigned to or creator of this exam",
          },
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
        } catch {
          return res.status(404).json({
            error: {
              code: "EXAM_NOT_FOUND",
              message: `Exam ${id} not found on chain`,
            },
          });
        }

        // 4. Verify caller is creating AUTHORITY
        const callerAddress = ethers.getAddress(req.session.address!);
        if (
          ethers.getAddress(onChainExam.authority) !== callerAddress
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
