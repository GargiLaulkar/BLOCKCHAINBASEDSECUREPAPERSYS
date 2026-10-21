import type { Request, Response, NextFunction } from "express";
import type { SystemRole } from "../services/roles.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.address) {
    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
  }
  next();
}

export function requireRole(...allowedRoles: SystemRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.address) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
    }

    const userRoles = (req.session.roles || []) as SystemRole[];
    const hasRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: `Access denied. Required roles: [${allowedRoles.join(", ")}]`,
        },
      });
    }

    next();
  };
}
