import { z } from "zod";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export const QuestionSchema = z.object({
  text: z.string().min(10).max(2000),
  options: z.tuple([z.string().min(1).max(500), z.string().min(1).max(500), z.string().min(1).max(500), z.string().min(1).max(500)]).superRefine((options, ctx) => {
    const trimmed = options.map((x) => x.trim());
    if (new Set(trimmed).size !== 4) ctx.addIssue({ code: "custom", message: "Options must be unique" });
  }),
  correctIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  explanation: z.string().max(2000).optional()
});

export const BatchPlainSchema = z.object({
  v: z.literal(1),
  examId: z.string().min(1),
  sectionId: z.number().int().min(0).max(7),
  setter: address,
  questions: z.array(QuestionSchema).min(1).max(500)
});

export const ExamMetaSchema = z.object({
  title: z.string().trim().min(5).max(120),
  sections: z.array(z.object({ name: z.string().trim().min(2).max(40), quota: z.number().int().min(1).max(500) })).min(1).max(8),
  releaseOpensAt: z.number().int().nonnegative(),
  examStartsAt: z.number().int().nonnegative(),
  examEndsAt: z.number().int().nonnegative()
});

export const VariantItemSchema = z.object({
  qid: z.string().regex(/^\d+:\d+$/),
  opts: z.tuple([z.literal(0).or(z.literal(1)).or(z.literal(2)).or(z.literal(3)), z.literal(0).or(z.literal(1)).or(z.literal(2)).or(z.literal(3)), z.literal(0).or(z.literal(1)).or(z.literal(2)).or(z.literal(3)), z.literal(0).or(z.literal(1)).or(z.literal(2)).or(z.literal(3))]).superRefine((opts, ctx) => {
    if (new Set(opts).size !== 4) ctx.addIssue({ code: "custom", message: "Option order must be a permutation" });
  })
});

export const VariantSchema = z.object({
  v: z.literal(1),
  examId: z.string().regex(/^\d+$/),
  centre: address,
  sections: z.array(z.object({ sectionId: z.number().int().nonnegative(), items: z.array(VariantItemSchema) }))
});

export const HashSchema = hex32;
export const AddressSchema = address;
export const APIErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) });

export const MatchReportSchema = z.object({
  matches: z.array(z.object({
    variantHash: hex32,
    centre: address,
    score: z.number().min(0).max(1),
    evidence: z.array(z.string())
  }))
});

export const ChainEventResponseSchema = z.object({
  id: z.string(),
  blockNumber: z.string().regex(/^\d+$/),
  logIndex: z.number().int().nonnegative(),
  txHash: hex32,
  examId: z.string().nullable(),
  type: z.string(),
  actor: address.nullable(),
  payloadJson: z.unknown(),
  blockTimestamp: z.string().regex(/^\d+$/)
});
export const EventsResponseSchema = z.object({
  events: z.array(ChainEventResponseSchema),
  nextCursor: z.string().nullable()
});

export const StatsOverviewResponseSchema = z.object({
  totalExams: z.number().int().nonnegative(),
  examsByState: z.object({
    draft: z.number().int().nonnegative(),
    collecting: z.number().int().nonnegative(),
    sealed: z.number().int().nonnegative(),
    released: z.number().int().nonnegative(),
    concluded: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative()
  }),
  totalEvents: z.number().int().nonnegative(),
  batchesByStatus: z.object({
    pending: z.number().int().nonnegative(),
    confirmed: z.number().int().nonnegative()
  }),
  participantsByRole: z.object({
    ADMIN: z.number().int().nonnegative(),
    AUTHORITY: z.number().int().nonnegative(),
    SETTER: z.number().int().nonnegative(),
    HOLDER: z.number().int().nonnegative(),
    CENTRE: z.number().int().nonnegative(),
    AUDITOR: z.number().int().nonnegative()
  })
});

export const ExamReadinessResponseSchema = z.object({
  examId: z.string().regex(/^\d+$/),
  holders: z.array(z.object({
    address,
    steps: z.object({
      keyRegistered: z.boolean(),
      randomnessCommitted: z.boolean()
    })
  })),
  setters: z.array(z.object({
    address,
    steps: z.object({
      batchesSubmitted: z.boolean(),
      batchCount: z.number().int().nonnegative()
    })
  })),
  notTrackedByServer: z.array(z.literal("shareVerified"))
});

export const CreateExamPayloadSchema = z.object({ metaHash: hex32, releaseOpensAt: z.number().int(), examStartsAt: z.number().int(), examEndsAt: z.number().int(), threshold: z.number().int().min(2), holders: z.array(address), setters: z.array(address), centres: z.array(address), quotas: z.array(z.number().int().min(1).max(500)).min(1).max(8) });
export const BatchUploadPayloadSchema = z.object({ examId: z.string(), sectionId: z.number().int(), ciphertextHash: hex32, questionCount: z.number().int().min(1).max(500) });
export const LeakTracePayloadSchema = z.object({ examId: z.string().regex(/^\d+$/), evidenceHash: hex32, result: MatchReportSchema });

export const Question = QuestionSchema;
export const BatchPlain = BatchPlainSchema;
export const ExamMeta = ExamMetaSchema;
export const Variant = VariantSchema;
