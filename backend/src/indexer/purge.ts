import fs from "fs";
import path from "path";
import { logger } from "../logger.js";

/**
 * 24-hour purge job for never-confirmed pending batches.
 * Deletes both the local ciphertext blob and the database row.
 *
 * @param prismaClient Prisma client instance
 * @param blobDir Directory where ciphertext blobs are stored
 * @param maxAgeMs Maximum age before purging (defaults to 24 hours)
 * @returns Count of purged batches
 */
export async function purgeUnconfirmedBatches(
  prismaClient: any,
  blobDir: string,
  maxAgeMs: number = 24 * 60 * 60 * 1000
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);

  const pendingBatches = await prismaClient.batch.findMany({
    where: {
      status: "pending",
      createdAt: { lt: cutoff },
    },
  });

  let purgedCount = 0;
  for (const batch of pendingBatches) {
    if (batch.blobPath) {
      try {
        const fullPath = path.isAbsolute(batch.blobPath)
          ? batch.blobPath
          : path.join(blobDir, batch.blobPath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } catch (err: any) {
        logger.warn(`Failed to delete blob file ${batch.blobPath}: ${err.message}`);
      }
    }

    await prismaClient.batch.delete({
      where: { id: batch.id },
    });
    purgedCount++;
  }

  if (purgedCount > 0) {
    logger.info(`Purged ${purgedCount} unconfirmed pending batch(es) older than ${maxAgeMs}ms`);
  }

  return purgedCount;
}
