import app from "./app";
import { logger } from "./lib/logger";
import { runNotificationSweep } from "./routes/notifications";
import { backfillLegacyRevenueAmounts } from "./lib/legacyRevenue";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void backfillLegacyRevenueAmounts().catch((err) => {
    logger.error({ err }, "Legacy revenue amount backfill failed");
  });
  let sweepRunning = false;
  const sweep = async () => {
    if (sweepRunning) return;
    sweepRunning = true;
    try {
      await runNotificationSweep();
    } catch (err) {
      logger.error({ err }, "Notification sweep failed");
    } finally {
      sweepRunning = false;
    }
  };
  setTimeout(() => void sweep(), 5_000).unref();
  setInterval(() => void sweep(), 15 * 60 * 1000).unref();
});
