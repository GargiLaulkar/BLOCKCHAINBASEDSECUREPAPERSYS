import pino, { type DestinationStream } from "pino";

const sensitiveLogKeys = new Set([
  "authorization",
  "cookie",
  "cookies",
  "ciphertext",
  "envelope",
  "share",
  "shares",
  "privatekey",
  "keystore",
]);

function sanitizeLogValue(value: unknown, ancestors = new WeakSet<object>()): unknown {
  if (value instanceof Uint8Array) return "[REDACTED]";
  if (value instanceof Error) {
    return { type: value.name, message: "[REDACTED]" };
  }
  if (typeof value !== "object" || value === null) return value;
  if (ancestors.has(value)) return "[Circular]";
  ancestors.add(value);
  if (Array.isArray(value)) {
    const sanitizedArray = value.map((item) => sanitizeLogValue(item, ancestors));
    ancestors.delete(value);
    return sanitizedArray;
  }
  const sanitizedObject: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    sanitizedObject[key] = sensitiveLogKeys.has(key.toLowerCase())
      ? "[REDACTED]"
      : sanitizeLogValue(item, ancestors);
  }
  ancestors.delete(value);
  return sanitizedObject;
}

export function createLogger(destination?: DestinationStream) {
  const options: pino.LoggerOptions = {
    level: process.env.LOG_LEVEL || "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.url",
        "url",
        "headers.authorization",
        "headers.cookie",
        "authorization",
        "cookie",
        "cookies",
        "ciphertext",
        "envelope",
        "share",
        "shares",
        "body.ciphertext",
        "body.envelope",
        "body.share",
        "body.shares",
        "req.body",
        "res.body",
        "*.authorization",
        "*.cookie",
        "*.cookies",
        "*.ciphertext",
        "*.envelope",
        "*.share",
        "*.shares",
        "*.body",
      ],
      censor: "[REDACTED]",
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    hooks: {
      logMethod(args, method) {
        const sanitizedArgs = args.map((arg) => sanitizeLogValue(arg));
        method.apply(this, sanitizedArgs as Parameters<pino.LogFn>);
      },
    },
  };
  return destination ? pino(options, destination) : pino(options);
}

export const logger = createLogger();
