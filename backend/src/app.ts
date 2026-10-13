import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import session from "express-session";
import { createHealthRouter } from "./routes/health.js";
import { createAuthRouter } from "./routes/auth.js";
import { createExamsRouter } from "./routes/exams.js";
import { createEventsRouter } from "./routes/events.js";
import { createStatsRouter } from "./routes/stats.js";
import type { Config } from "./config.js";
import type { Provider, Contract } from "ethers";

export function createApp(
  cfg: Config,
  customProvider?: Provider,
  customContract?: Contract
) {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: cfg.FRONTEND_ORIGIN,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    session({
      secret: cfg.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: cfg.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );

  // Mount endpoints
  app.use("/api", createHealthRouter(() => cfg, customProvider));
  app.use("/api/auth", createAuthRouter(() => cfg, customContract));
  app.use("/api", createEventsRouter());
  app.use("/api", createStatsRouter());
  app.use("/api/exams", createExamsRouter(() => cfg, customContract));

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
