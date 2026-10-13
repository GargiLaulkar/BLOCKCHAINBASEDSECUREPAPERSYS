import { Router, Request, Response } from "express";
import { generateNonce, SiweMessage } from "siwe";
import { ethers } from "ethers";
import { schemas } from "@sigil/core";
import type { Config } from "../config.js";
import { getRolesForAddress } from "../services/roles.js";

declare module "express-session" {
  interface SessionData {
    nonce?: string;
    address?: string;
    roles?: string[];
  }
}

export function createAuthRouter(
  getConfigFn: () => Config,
  customContract?: ethers.Contract
) {
  const router = Router();

  // GET /api/auth/nonce
  router.get("/nonce", (req: Request, res: Response) => {
    const nonce = generateNonce();
    req.session.nonce = nonce;
    res.status(200).json({ nonce });
  });

  // POST /api/auth/verify
  router.post("/verify", async (req: Request, res: Response) => {
    try {
      const cfg = getConfigFn();
      const parseResult = schemas.AuthVerifyPayloadSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({
          error: {
            code: "BAD_REQUEST",
            message: "Invalid request payload",
            details: parseResult.error.issues,
          },
        });
      }

      const { message, signature } = parseResult.data;
      const siweMessage = new SiweMessage(message);

      // 1. Verify Nonce matches session (and is present)
      const sessionNonce = req.session.nonce;
      if (!sessionNonce || siweMessage.nonce !== sessionNonce) {
        // Clear nonce on failed attempt as well
        req.session.nonce = undefined;
        return res.status(400).json({
          error: {
            code: "INVALID_NONCE",
            message: "Nonce does not match or has already been used",
          },
        });
      }

      // Immediately clear nonce to prevent replay attacks
      req.session.nonce = undefined;

      // 2. Verify Domain matches frontend origin
      const expectedDomain = new URL(cfg.FRONTEND_ORIGIN).host;
      if (siweMessage.domain !== expectedDomain) {
        return res.status(400).json({
          error: {
            code: "INVALID_DOMAIN",
            message: `Domain mismatch: expected ${expectedDomain}, got ${siweMessage.domain}`,
          },
        });
      }

      // 3. Verify Signature
      let verificationResult;
      try {
        verificationResult = await siweMessage.verify({
          signature,
          domain: expectedDomain,
        });
      } catch (verifyErr: any) {
        return res.status(401).json({
          error: {
            code: "INVALID_SIGNATURE",
            message: "SIWE signature verification failed",
            details: verifyErr?.message || String(verifyErr),
          },
        });
      }

      if (!verificationResult.success) {
        return res.status(401).json({
          error: {
            code: "INVALID_SIGNATURE",
            message: "SIWE signature verification failed",
            details: verificationResult.error?.type,
          },
        });
      }

      const address = ethers.getAddress(verificationResult.data.address);

      // 4. Query chain-derived roles
      const roles = await getRolesForAddress(address, cfg, customContract);

      // 5. Store in Session
      req.session.address = address;
      req.session.roles = roles;

      res.status(200).json({
        address,
        roles,
      });
    } catch (err: any) {
      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: err?.message || "Failed to verify SIWE message",
        },
      });
    }
  });

  // GET /api/auth/me
  router.get("/me", (req: Request, res: Response) => {
    if (!req.session.address) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Not authenticated",
        },
      });
    }

    res.status(200).json({
      address: req.session.address,
      roles: req.session.roles || [],
    });
  });

  // POST /api/auth/logout
  router.post("/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({
          error: {
            code: "LOGOUT_FAILED",
            message: "Failed to destroy session",
          },
        });
      }
      res.clearCookie("connect.sid");
      res.status(200).json({ success: true });
    });
  });

  return router;
}
