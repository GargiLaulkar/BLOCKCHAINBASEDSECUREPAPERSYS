import fs from "fs";
import path from "path";
import { logger } from "../logger.js";

export interface IndexerStateData {
  lastProcessedBlock: number;
  lastBlockHash?: string;
  updatedAt: string;
}

/**
 * Persists and restores indexer state across crashes and restarts.
 * Handles local Hardhat chain reorg / reset detection.
 */
export class IndexerStateManager {
  private stateFilePath: string;

  constructor(blobDir: string) {
    if (!fs.existsSync(blobDir)) {
      fs.mkdirSync(blobDir, { recursive: true });
    }
    this.stateFilePath = path.join(blobDir, ".indexer-state.json");
  }

  public getLastProcessedBlock(deployBlock: number): number {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (typeof parsed.lastProcessedBlock === "number") {
          return Math.max(parsed.lastProcessedBlock, deployBlock);
        }
      }
    } catch (err: any) {
      logger.warn(`Could not read indexer state file (${err.message}). Using deployBlock: ${deployBlock}`);
    }
    return deployBlock;
  }

  public setLastProcessedBlock(blockNumber: number, blockHash?: string): void {
    const data: IndexerStateData = {
      lastProcessedBlock: blockNumber,
      lastBlockHash: blockHash,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(this.stateFilePath, JSON.stringify(data, null, 2), "utf-8");
  }

  public clear(): void {
    if (fs.existsSync(this.stateFilePath)) {
      fs.unlinkSync(this.stateFilePath);
    }
  }
}
