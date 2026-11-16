import { Router, type Request, type Response } from "express";
import { ethers } from "ethers";
import { schemas } from "@sigil/core";
import { prisma } from "../db.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_NAMES = new Set([
  "seed",
  "share",
  "secret",
  "private",
  "passphrase",
  "reveal",
  "ciphertext",
  "keymaterial",
  "key_material",
  "secretvalue",
  "secret_value",
  "privatekey",
  "private_key",
  "sharedata",
  "share_data",
  "encryptionkey",
  "encryption_key",
  "secret_share",
  "share_value",
  "secret_key",
  "private_key_material",
  "encryption_key_material",
  "key_material",
  "private_key_share",
]);

function normalizeKeyName(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKeyName(key);
  if (!normalized) return false;

  if (normalized === "encrypted_envelope" || normalized === "encryptedenvelope") {
    return false;
  }

  return SENSITIVE_KEY_NAMES.has(normalized);
}

interface EventCursor {
  blockNumber: bigint;
  logIndex: number;
}

function sanitizePublicEventPayload(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePublicEventPayload(item, seen));
  }
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return REDACTED;
    seen.add(obj);

    const safePayload: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(obj)) {
      if (isSensitiveKey(key)) {
        safePayload[key] = REDACTED;
        continue;
      }
      safePayload[key] = sanitizePublicEventPayload(nestedValue, seen);
    }
    return safePayload;
  }

  return REDACTED;
}

function sanitizePublicEventRecord(event: any) {
  return {
    id: event.id,
    blockNumber: event.blockNumber.toString(),
    logIndex: Number(event.logIndex),
    txHash: event.txHash,
    examId: event.examId,
    type: event.type,
    actor: event.actor,
    payloadJson: sanitizePublicEventPayload(event.payloadJson ?? {}),
    blockTimestamp: event.blockTimestamp.toString(),
  };
}

function parseTimestamp(value: string): bigint | null {
  if (/^\d+$/.test(value)) return BigInt(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return BigInt(Math.floor(date.getTime() / 1000));
}

function parseCursor(value: string): EventCursor | null {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("blockNumber" in decoded) ||
      !("logIndex" in decoded) ||
      typeof decoded.blockNumber !== "string" ||
      !/^\d+$/.test(decoded.blockNumber) ||
      typeof decoded.logIndex !== "number" ||
      !Number.isSafeInteger(decoded.logIndex) ||
      decoded.logIndex < 0
    ) {
      return null;
    }
    return { blockNumber: BigInt(decoded.blockNumber), logIndex: decoded.logIndex };
  } catch {
    return null;
  }
}

function encodeCursor(event: { blockNumber: bigint; logIndex: number }): string {
  return Buffer.from(
    JSON.stringify({ blockNumber: event.blockNumber.toString(), logIndex: event.logIndex })
  ).toString("base64url");
}

export function createEventsRouter() {
  const router = Router();

  router.get("/events", async (req: Request, res: Response) => {
    const parsedQuery = schemas.EventsQuerySchema.strict().safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        error: { code: "INVALID_FILTER", message: "Invalid event query parameters", details: parsedQuery.error.issues },
      });
    }
    const query = parsedQuery.data;
    const examId = query.exam;
    const type = query.type;
    const actorInput = query.actor;
    const fromInput = query.from;
    const toInput = query.to;
    const limitInput = query.limit;
    const cursorInput = query.cursor;
    if (
      ["exam", "type", "actor", "from", "to", "limit", "cursor"].some(
        (key) => req.query[key] !== undefined && typeof req.query[key] !== "string"
      )
    ) {
      return res.status(400).json({
        error: { code: "INVALID_FILTER", message: "Each query parameter must be provided once as text" },
      });
    }

    let actor: string | undefined;
    if (actorInput !== undefined) {
      try {
        actor = ethers.getAddress(actorInput);
      } catch {
        return res.status(400).json({
          error: { code: "INVALID_FILTER", message: "actor must be a valid Ethereum address" },
        });
      }
    }

    const from = fromInput === undefined ? undefined : parseTimestamp(fromInput);
    const to = toInput === undefined ? undefined : parseTimestamp(toInput);
    if ((fromInput !== undefined && from === null) || (toInput !== undefined && to === null)) {
      return res.status(400).json({
        error: {
          code: "INVALID_FILTER",
          message: "from and to must be Unix seconds or ISO-8601 timestamps",
        },
      });
    }
    if (from !== undefined && from !== null && to !== undefined && to !== null && from > to) {
      return res.status(400).json({
        error: { code: "INVALID_FILTER", message: "from must be less than or equal to to" },
      });
    }

    const limit = limitInput === undefined ? DEFAULT_LIMIT : Number(limitInput);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return res.status(400).json({
        error: {
          code: "INVALID_LIMIT",
          message: `limit must be an integer between 1 and ${MAX_LIMIT}`,
        },
      });
    }

    const cursor = cursorInput === undefined ? undefined : parseCursor(cursorInput);
    if (cursorInput !== undefined && !cursor) {
      return res.status(400).json({
        error: { code: "INVALID_CURSOR", message: "cursor is not a valid event cursor" },
      });
    }

    const where: Record<string, unknown> = {};
    if (examId !== undefined) where.examId = examId;
    if (type !== undefined) where.type = type;
    if (actor !== undefined) where.actor = actor;
    if ((from !== undefined && from !== null) || (to !== undefined && to !== null)) {
      where.blockTimestamp = {
        ...(from !== undefined && from !== null ? { gte: from } : {}),
        ...(to !== undefined && to !== null ? { lte: to } : {}),
      };
    }
    if (cursor) {
      where.OR = [
        { blockNumber: { lt: cursor.blockNumber } },
        { blockNumber: cursor.blockNumber, logIndex: { lt: cursor.logIndex } },
      ];
    }

    try {
      const records = await prisma.chainEvent.findMany({
        where,
        orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }],
        take: limit + 1,
      });
      const hasMore = records.length > limit;
      const page = hasMore ? records.slice(0, limit) : records;
      const events = page.map((event: any) => sanitizePublicEventRecord(event));
      const lastEvent = page.at(-1);

      return res.status(200).json(schemas.EventsResponseSchema.parse({
        events,
        nextCursor: hasMore && lastEvent ? encodeCursor(lastEvent) : null,
      }));
    } catch {
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Failed to retrieve indexed events" },
      });
    }
  });

  return router;
}
