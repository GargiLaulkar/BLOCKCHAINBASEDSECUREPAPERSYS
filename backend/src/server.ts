import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { logger } from "./logger.js";

try {
  const cfg = loadConfig();
  const app = createApp(cfg);

  app.listen(cfg.PORT, () => {
    logger.info(`🚀 SIGIL Backend server listening on port ${cfg.PORT}`);
    logger.info(`Chain RPC: ${cfg.RPC_URL} (Chain ID: ${cfg.CHAIN_ID})`);
    logger.info(`Contract Address: ${cfg.CONTRACT_ADDRESS}`);
  });
} catch (err: any) {
  logger.error(`Fatal server boot failure: ${err.message}`);
  process.exit(1);
}
