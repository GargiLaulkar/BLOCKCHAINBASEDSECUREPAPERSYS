import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { schemas } from "@sigil/core";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../db.js";

const EXAM_STATES = ["draft", "collecting", "sealed", "released", "concluded", "cancelled"] as const;
const PARTICIPANT_ROLES = ["ADMIN", "AUTHORITY", "SETTER", "HOLDER", "CENTRE", "AUDITOR"] as const;

function emptyCounts<T extends readonly string[]>(keys: T): Record<T[number], number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T[number], number>;
}

export function createStatsRouter() {
  const router = Router();
  router.param("id", (req, res, next, value) => {
    const parsed = z.string().regex(/^\d+$/).safeParse(value);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "INVALID_EXAM_ID", message: "Exam id must be a non-negative integer" },
      });
    }
    next();
  });

  router.get("/stats/overview", requireAuth, async (_req: Request, res: Response) => {
    try {
      const [totalExams, examGroups, eventCount, batchGroups, participants] = await Promise.all([
        prisma.exam.count(),
        prisma.exam.groupBy({ by: ["state"], _count: { _all: true } }),
        prisma.chainEvent.count(),
        prisma.batch.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.participant.findMany({ select: { roles: true } }),
      ]);

      const examsByState = emptyCounts(EXAM_STATES);
      for (const group of examGroups) {
        const stateName = EXAM_STATES[group.state];
        if (stateName) examsByState[stateName] = group._count._all;
      }

      const batchesByStatus = { pending: 0, confirmed: 0 };
      for (const group of batchGroups) {
        if (group.status === "pending" || group.status === "confirmed") {
          batchesByStatus[group.status] = group._count._all;
        }
      }

      const participantsByRole = emptyCounts(PARTICIPANT_ROLES);
      for (const participant of participants) {
        if (!Array.isArray(participant.roles)) continue;
        for (const role of new Set(participant.roles)) {
          if (typeof role === "string" && PARTICIPANT_ROLES.includes(role as (typeof PARTICIPANT_ROLES)[number])) {
            participantsByRole[role as (typeof PARTICIPANT_ROLES)[number]]++;
          }
        }
      }

      return res.status(200).json(schemas.StatsOverviewResponseSchema.parse({
        totalExams,
        examsByState,
        totalEvents: eventCount,
        batchesByStatus,
        participantsByRole,
      }));
    } catch {
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Failed to retrieve indexed statistics" },
      });
    }
  });

  router.get(
    "/stats/exams/:id/readiness",
    requireAuth,
    async (req: Request, res: Response) => {
      const examId = req.params.id;
      if (!/^\d+$/.test(examId)) {
        return res.status(400).json({
          error: { code: "INVALID_EXAM_ID", message: "Exam id must be a non-negative integer" },
        });
      }

      try {
        const exam = await prisma.exam.findUnique({ where: { examId } });
        if (!exam) {
          return res.status(404).json({
            error: { code: "EXAM_NOT_FOUND", message: `Indexed exam ${examId} not found` },
          });
        }

        const panel = await prisma.panelMember.findMany({
          where: { examId, kind: { in: ["holder", "setter"] } },
          orderBy: { address: "asc" },
        });
        const assignedHolders = panel.filter((member: any) => member.kind === "holder");
        const assignedSetters = panel.filter((member: any) => member.kind === "setter");
        const indexedEvents = await prisma.chainEvent.findMany({
          where: {
            OR: [
              {
                type: "EncryptionKeySet",
                actor: { in: assignedHolders.map((member: any) => member.address) },
              },
              { examId, type: { in: ["RandomnessCommitted", "BatchSubmitted"] } },
            ],
          },
          select: { type: true, examId: true, actor: true },
        });
        const holderAddresses = new Set(assignedHolders.map((member: any) => member.address.toLowerCase()));
        const setterAddresses = new Set(assignedSetters.map((member: any) => member.address.toLowerCase()));
        const keysRegistered = new Set<string>();
        const randomnessCommitted = new Set<string>();
        const submittedBatchCounts = new Map<string, number>();

        for (const event of indexedEvents) {
          if (!event.actor) continue;
          const actor = event.actor.toLowerCase();
          if (event.type === "EncryptionKeySet" && holderAddresses.has(actor)) {
            keysRegistered.add(actor);
          } else if (
            event.examId === examId &&
            event.type === "RandomnessCommitted" &&
            holderAddresses.has(actor)
          ) {
            randomnessCommitted.add(actor);
          } else if (
            event.examId === examId &&
            event.type === "BatchSubmitted" &&
            setterAddresses.has(actor)
          ) {
            submittedBatchCounts.set(actor, (submittedBatchCounts.get(actor) || 0) + 1);
          }
        }

        return res.status(200).json(schemas.ExamReadinessResponseSchema.parse({
          examId,
          holders: assignedHolders.map((member: any) => ({
            address: member.address,
            steps: {
              keyRegistered: keysRegistered.has(member.address.toLowerCase()),
              randomnessCommitted: randomnessCommitted.has(member.address.toLowerCase()),
            },
          })),
          setters: assignedSetters.map((member: any) => {
            const batchCount = submittedBatchCounts.get(member.address.toLowerCase()) || 0;
            return {
              address: member.address,
              steps: { batchesSubmitted: batchCount > 0, batchCount },
            };
          }),
          notTrackedByServer: ["shareVerified"],
        }));
      } catch {
        return res.status(500).json({
          error: { code: "INTERNAL_ERROR", message: "Failed to retrieve exam readiness" },
        });
      }
    }
  );

  return router;
}
