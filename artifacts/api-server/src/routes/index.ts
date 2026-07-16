import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import partnersRouter from "./partners";
import contractsRouter from "./contracts";
import contentRouter from "./content";
import revenueRouter from "./revenue";
import royaltiesRouter from "./royalties";
import rightsCheckRouter from "./rights-check";
import dashboardRouter from "./dashboard";
import auditLogsRouter from "./audit-logs";
import importRouter from "./import";
import reportsRouter from "./reports";

const router = Router();

router.use("/", healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/partners", partnersRouter);
router.use("/contracts", contractsRouter);
// Revenue routes mount at /contracts and /revenue-reports
router.use("/", revenueRouter);
router.use("/royalties", royaltiesRouter);
router.use("/content", contentRouter);
router.use("/rights-check", rightsCheckRouter);
router.use("/dashboard", dashboardRouter);
router.use("/audit-logs", auditLogsRouter);
router.use("/import", importRouter);
router.use("/reports", reportsRouter);

export default router;
