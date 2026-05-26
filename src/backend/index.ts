import express, { Request, Response } from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV } from "./config/env.ts";
import { initSchema } from "./db/init.ts";
import { seedAdmin } from "./db/seed-admin.ts";
import { errorHandler } from "./middleware/errorHandler.ts";
import { localeDetector } from "./middleware/localeDetector.ts";
import { authGuard } from "./middleware/authGuard.ts";

import authRoutes from "./routes/auth.ts";
import profileRoutes from "./routes/profiles.ts";
import preferenceRoutes from "./routes/preferences.ts";
import jobRoutes from "./routes/jobs.ts";
import matchingRoutes from "./routes/matching.ts";
import feedbackRoutes from "./routes/feedback.ts";
import chatRoutes from "./routes/chat.ts";
import eventRoutes from "./routes/events.ts";
import matchRoutes from "./routes/matches.ts";
import resumeRoutes from "./routes/resumeOptimization.ts";
import adminRoutes from "./routes/admin/index.ts";
import bossRoutes from "./routes/boss.ts";

initSchema();
seedAdmin();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors({ origin: ENV.FRONTEND_URL }));
app.use(express.json());
app.use(localeDetector);

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, env: ENV.NODE_ENV });
});

app.use("/api/auth", authRoutes);
app.use("/api/profiles", authGuard, profileRoutes);
app.use("/api/preferences", authGuard, preferenceRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/matching", authGuard, matchingRoutes);
app.use("/api/feedback", authGuard, feedbackRoutes);
app.use("/api/chat", authGuard, chatRoutes);
app.use("/api/matches", authGuard, matchRoutes);
app.use("/api/resume", authGuard, resumeRoutes);
app.use("/api/events", authGuard, eventRoutes);
app.use("/api/boss", authGuard, bossRoutes);
app.use("/api/admin", adminRoutes);

// Serve frontend static files from built dist/ (relative to backend dir -> ../frontend/dist)
const frontendDist = path.join(__dirname, "../frontend/dist");
app.use(express.static(frontendDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

app.use(errorHandler as any);

app.listen(ENV.PORT, () => {
  console.log(`[Server] Jobro backend running on http://localhost:${ENV.PORT}`);
  console.log(`[Config] AI: ${ENV.OPENAI_API_KEY ? `cv=${ENV.OPENAI_CV_MODEL}, matching=${ENV.OPENAI_MATCHING_MODEL} @ ${ENV.OPENAI_BASE_URL || "openai"}` : "disabled"}`);
});
