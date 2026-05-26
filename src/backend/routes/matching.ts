import { Router } from "express";
import { runMatching, AgentStep } from "../services/matchingEngine.ts";
import db from "../db/connection.ts";

const router = Router();

const MATCH_QUERY = `SELECT m.id as match_id, m.match_score, m.match_reason, j.id, j.title, j.company, j.location, j.description, j.requirements, j.responsibilities, j.salary_min, j.salary_max, j.salary_currency, j.deadline, j.job_type, j.industry, j.role_type, j.source_url, j.created_at FROM matches m JOIN jobs j ON m.job_id = j.id WHERE m.user_id = ? AND m.status = 'pending' ORDER BY m.match_score DESC, m.created_at DESC LIMIT ?`;

router.get("/recommendations", async (req, res, next) => {
  try {
    const userId = (req as any).user.id;
    const limit = Number(req.query.limit ?? 10);
    const existing = db.prepare(MATCH_QUERY).all(userId, limit) as any[];
    if (existing.length > 0) { res.json({ recommendations: existing }); return; }
    await runMatching(userId, { limit });
    const fresh = db.prepare(MATCH_QUERY).all(userId, limit) as any[];
    res.json({ recommendations: fresh });
  } catch (e) { next(e); }
});

router.post("/run", async (req, res, next) => {
  try {
    const userId = (req as any).user.id;
    const limit = Number(req.body.limit ?? 10);
    await runMatching(userId, { limit, force: true });
    const fresh = db.prepare(MATCH_QUERY).all(userId, limit) as any[];
    res.json({ recommendations: fresh });
  } catch (e) { next(e); }
});

// SSE streaming endpoint — pushes Agent steps in real-time
router.get("/stream", async (req, res) => {
  const userId = (req as any).user.id;
  const limit = Number(req.query.limit ?? 5);
  const force = req.query.force !== "0"; // default true, pass 0 to use cached
  const chatContext = req.query.chatContext ? String(req.query.chatContext) : undefined;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: any) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  const onStep = (step: AgentStep) => send(step);

  try {
    const results = await runMatching(userId, { limit, force, onStep, chatContext });
    // Fetch full job data for recommendations
    if (results.length > 0) {
      const jobIds = results.map(r => r.jobId);
      const ph = jobIds.map(() => "?").join(",");
      const rows = db.prepare(`SELECT m.id as match_id, m.match_score, m.match_reason, j.id as job_id, j.title, j.company, j.location, j.description, j.requirements, j.responsibilities, j.salary_min, j.salary_max, j.salary_currency, j.deadline, j.job_type, j.industry, j.role_type, j.source_url FROM matches m JOIN jobs j ON m.job_id = j.id WHERE m.user_id = ? AND j.id IN (${ph})`).all(userId, ...jobIds) as any[];
      send({ type: "result", recommendations: rows });
    } else {
      send({ type: "result", recommendations: [] });
    }
  } catch (e: any) {
    send({ type: "error", message: e.message || "Matching failed" });
  }
  res.end();
});

export default router;
