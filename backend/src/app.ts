import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createHealthRouter } from "./routes/health.js";
import type { Config } from "./config.js";
import type { Provider } from "ethers";

export function createApp(cfg: Config, customProvider?: Provider) {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: cfg.FRONTEND_ORIGIN,
      credentials: true,
    })
  );
  app.use(express.json());

  // Mount health endpoint
  app.use("/api", createHealthRouter(() => cfg, customProvider));

  // 404 Handler
  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Endpoint not found",
      },
    });
  });

  return app;
}
