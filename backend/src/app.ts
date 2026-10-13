import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import session from "express-session";
import { fileURLToPath } from "node:url";
import { pinoHttp } from "pino-http";
import { rateLimit } from "express-rate-limit";
import { createHealthRouter } from "./routes/health.js";
import { createAuthRouter } from "./routes/auth.js";
import { createExamsRouter } from "./routes/exams.js";
import { createEventsRouter } from "./routes/events.js";
import { createStatsRouter } from "./routes/stats.js";
import { createAuditRouter } from "./routes/audit.js";
import { createProfilesRouter } from "./routes/profiles.js";
import { errorHandler } from "./middleware/errors.js";
import { validateRequestShape } from "./middleware/validate-request.js";
import { logger } from "./logger.js";
import type { Config } from "./config.js";
import type { Provider, Contract } from "ethers";

export function createApp(
  cfg: Config,
  customProvider?: Provider,
  customContract?: Contract
) {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || origin === new URL(cfg.FRONTEND_ORIGIN).origin) return callback(null, true);
        const error = new Error("Origin is not allowed") as Error & { code: string };
        error.code = "CORS_FORBIDDEN";
        return callback(error);
      },
      credentials: true,
    })
  );
  app.use(pinoHttp({
    logger,
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "silent";
    },
  }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use("/api", validateRequestShape);
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

  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 120,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: { code: "RATE_LIMITED", message: "Too many requests" } },
    })
  );
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: { code: "RATE_LIMITED", message: "Too many authentication requests" } },
    })
  );
  app.use(
    "/api/exams/:id/batches",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 5,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: { code: "RATE_LIMITED", message: "Too many batch upload requests" } },
    })
  );

  // Mount endpoints
  app.use("/api", createHealthRouter(() => cfg, customProvider));
  app.use("/api/auth", createAuthRouter(() => cfg, customContract));
  app.use("/api", createEventsRouter());
  app.use("/api", createStatsRouter());
  app.use("/api", createAuditRouter(() => cfg, customContract));
  app.use("/api", createProfilesRouter());
  app.use("/api/exams", createExamsRouter(() => cfg, customContract));
  app.get("/api/openapi.json", (_req, res, next) => {
    res.sendFile(fileURLToPath(new URL("../../docs/api/openapi.json", import.meta.url)), (err) => {
      if (err) next(err);
    });
  });

  // 404 Handler
  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Endpoint not found",
      },
    });
  });

  app.use(errorHandler);
  return app;
}
