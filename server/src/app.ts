import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import compression from "compression";
import pinoHttp from "pino-http";
import mongoose from "mongoose";
import { corsOrigins, env, isProduction } from "./config/env";
import { logger } from "./config/logger";
import { requestId } from "./middleware/requestId";
import { csrfProtection } from "./middleware/csrf";
import { apiLimiter } from "./middleware/rateLimit";
import { errorHandler, notFoundHandler, AppError } from "./middleware/error";
import { authRouter } from "./routes/auth.routes";
import { grievanceRouter } from "./routes/grievance.routes";
import { documentRouter } from "./routes/document.routes";
import { fileRouter } from "./routes/file.routes";
import { applicationRouter } from "./routes/application.routes";
import { notificationRouter } from "./routes/notification.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { adminRouter } from "./routes/admin.routes";
import { feedbackRouter } from "./routes/feedback.routes";
import { meetingRouter, taskRouter } from "./routes/meeting.routes";
import { incidentRouter, weatherRouter } from "./routes/disaster.routes";
import { roadRouter } from "./routes/road.routes";
import { referenceRouter } from "./routes/reference.routes";
import { chatRouter, helpdeskRouter } from "./routes/helpdesk.routes";
import { reportRouter } from "./routes/report.routes";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      customLogLevel(_req, res, error) {
        if (error || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      customSuccessMessage(_req, res) {
        return `request completed with ${res.statusCode}`;
      },
    }),
  );
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "same-site" },
      frameguard: { action: "deny" },
    }),
  );
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(
          origin,
        );
        if (corsOrigins.includes(origin) || (!isProduction && isLocal)) {
          return callback(null, true);
        }
        return callback(
          new AppError(403, "Request origin is not allowed", "CORS_REJECTED"),
        );
      },
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    const states = ["disconnected", "connected", "connecting", "disconnecting"];
    res.json({
      success: true,
      data: {
        status: "ok",
        database: states[mongoose.connection.readyState] ?? "unknown",
        environment: env.NODE_ENV,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.use("/api", apiLimiter);
  app.use(csrfProtection);

  const api = express.Router();
  api.use("/auth", authRouter);
  api.use("/grievances", grievanceRouter);
  api.use("/documents", documentRouter);
  api.use("/files", fileRouter);
  api.use("/applications", applicationRouter);
  api.use("/notifications", notificationRouter);
  api.use("/dashboard", dashboardRouter);
  api.use("/admin", adminRouter);
  api.use("/feedback", feedbackRouter);
  api.use("/meetings", meetingRouter);
  api.use("/tasks", taskRouter);
  api.use("/incidents", incidentRouter);
  api.use("/weather-alerts", weatherRouter);
  api.use("/roads", roadRouter);
  api.use("/chat", chatRouter);
  api.use("/helpdesk", helpdeskRouter);
  api.use("/reports", reportRouter);
  api.use("/reference", referenceRouter);
  app.use("/api/v1", api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
