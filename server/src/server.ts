import { createApp } from "./app";
import { connectDB, disconnectDB } from "./config/db";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { startScheduledJobs, stopScheduledJobs } from "./services/job.service";

async function main(): Promise<void> {
  await connectDB();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "SDAS API listening");
  });
  startScheduledJobs();

  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down SDAS API");
    stopScheduledJobs();
    server.close(() => {
      void disconnectDB().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 15_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled promise rejection");
  });
  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception");
    shutdown("uncaughtException");
  });
}

void main().catch((error) => {
  logger.fatal({ err: error }, "Failed to start SDAS API");
  process.exit(1);
});
