import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

const querySchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())])
);
const bodySchema = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()),
]);

export function validateRequestShape(req: Request, res: Response, next: NextFunction) {
  const query = querySchema.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Query parameters must be plain text values",
        details: query.error.issues,
      },
    });
  }

  if (req.body !== undefined) {
    const body = bodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_FAILED",
          message: "Request body must be a JSON object or array",
          details: body.error.issues,
        },
      });
    }
  }
  next();
}
