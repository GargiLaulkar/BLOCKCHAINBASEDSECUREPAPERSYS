import { Router, type Request, type Response } from "express";
import { ethers } from "ethers";
import { canonical, schemas } from "@sigil/core";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../db.js";

export function createProfilesRouter() {
  const router = Router();

  router.post("/profiles", requireAuth, async (req: Request, res: Response) => {
    const parsed = schemas.ProfilePayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_FAILED", message: "Invalid profile", details: parsed.error.issues },
      });
    }

    try {
      const address = ethers.getAddress(req.session!.address!);
      const participant = await prisma.participant.findUnique({ where: { address } });
      if (!participant) {
        return res.status(404).json({
          error: { code: "PARTICIPANT_NOT_FOUND", message: "Authenticated participant is not registered" },
        });
      }
      const profileHash = canonical.keccakJson(parsed.data);
      const updated = await prisma.participant.update({
        where: { address },
        data: {
          displayName: parsed.data.displayName,
          organisation: parsed.data.organisation,
          profileHash,
        },
        select: { address: true, displayName: true, organisation: true, profileHash: true },
      });
      return res.status(200).json(schemas.ProfileResponseSchema.parse(updated));
    } catch {
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Failed to update profile" },
      });
    }
  });

  router.get("/profiles/:address", requireAuth, async (req: Request, res: Response) => {
    const parsedAddress = schemas.ChecksummedAddressSchema.safeParse(req.params.address);
    if (!parsedAddress.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_FAILED",
          message: "Address must be a valid checksummed Ethereum address",
          details: parsedAddress.error.issues,
        },
      });
    }

    try {
      const profile = await prisma.participant.findUnique({
        where: { address: parsedAddress.data },
        select: { address: true, displayName: true, organisation: true, profileHash: true },
      });
      if (!profile) {
        return res.status(404).json({
          error: { code: "PROFILE_NOT_FOUND", message: "Profile not found" },
        });
      }
      return res.status(200).json(schemas.ProfileResponseSchema.parse(profile));
    } catch {
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Failed to retrieve profile" },
      });
    }
  });

  return router;
}
