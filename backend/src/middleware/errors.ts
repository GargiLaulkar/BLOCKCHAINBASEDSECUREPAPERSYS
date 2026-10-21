import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: "VALIDATION_FAILED", message: "Request validation failed", details: err.issues },
    });
  }
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === "LIMIT_FILE_SIZE";
    return res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? "FILE_TOO_LARGE" : "INVALID_MULTIPART",
        message: tooLarge ? "Uploaded file exceeds the size limit" : "Invalid multipart upload",
      },
    });
  }
  if (typeof err === "object" && err !== null && "type" in err && err.type === "entity.too.large") {
    return res.status(413).json({
      error: { code: "BODY_TOO_LARGE", message: "Request body exceeds the size limit" },
    });
  }
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      error: { code: "INVALID_JSON", message: "Request body must contain valid JSON" },
    });
  }
  if (typeof err === "object" && err !== null && "code" in err && err.code === "CORS_FORBIDDEN") {
    return res.status(403).json({
      error: { code: "CORS_FORBIDDEN", message: "Origin is not allowed" },
    });
  }

  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred" },
  });
};
