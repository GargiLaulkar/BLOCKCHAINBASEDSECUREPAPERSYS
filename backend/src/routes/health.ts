import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import type { Config } from "../config.js";

export function createHealthRouter(
  getConfigFn: () => Config,
  customProvider?: ethers.Provider
) {
  const router = Router();

  router.get("/health", async (_req: Request, res: Response) => {
    try {
      const cfg = getConfigFn();
      const provider = customProvider || new ethers.JsonRpcProvider(cfg.RPC_URL);

      const currentBlock = await provider.getBlockNumber();

      res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        chain: {
          connected: true,
          chainId: cfg.CHAIN_ID,
          contractAddress: cfg.CONTRACT_ADDRESS,
          latestBlock: currentBlock,
        },
      });
    } catch (err: any) {
      res.status(503).json({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Chain node unreachable or unhealthy",
          details: err?.message || String(err),
        },
      });
    }
  });

  return router;
}
