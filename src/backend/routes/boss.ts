import { Router } from "express";
import {
  greetJob,
  getGreetingTemplate,
  saveGreetingTemplate,
  saveCookies as saveBossCookies,
  getCookies as getBossCookies,
  checkCookieValid as checkBossCookieValid,
  scrapeBossJobs,
  type GreetStep,
  type ScrapeStep,
} from "../services/bossAutomation.ts";
import {
  scrapeLiepinJobs,
  saveLiepinCookies,
  getLiepinCookies,
  checkLiepinCookieValid,
} from "../services/liepinAutomation.ts";
import {
  scrapeZhaopinJobs,
  saveZhaopinCookies,
  getZhaopinCookies,
  checkZhaopinCookieValid,
} from "../services/zhaopinAutomation.ts";

const router = Router();

// GET /api/boss/settings — get greeting template and cookie status
router.get("/settings", (req, res, next) => {
  try {
    const userId = (req as any).user.id;
    const template = getGreetingTemplate(userId);
    const cookies = getBossCookies(userId);
    res.json({
      greetingTemplate: template,
      hasCookies: !!cookies,
      cookieValid: !!cookies,
    });
  } catch (e) { next(e); }
});

// PUT /api/boss/settings — save greeting template
router.put("/settings", (req, res, next) => {
  try {
    const userId = (req as any).user.id;
    const { greetingTemplate } = req.body;
    if (!greetingTemplate || typeof greetingTemplate !== "string") {
      res.status(400).json({ error: "missing_template", message: "请提供招呼语模板" });
      return;
    }
    saveGreetingTemplate(userId, greetingTemplate.trim());
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/boss/cookies — save platform cookies (platform: boss|liepin|zhaopin)
router.post("/cookies", (req, res, next) => {
  try {
    const userId = (req as any).user.id;
    const { cookies, platform } = req.body;
    if (!cookies || typeof cookies !== "string") {
      res.status(400).json({ error: "missing_cookies", message: "请提供Cookie JSON" });
      return;
    }
    try { JSON.parse(cookies); } catch {
      res.status(400).json({ error: "invalid_cookies", message: "Cookie格式不正确，应为JSON数组" });
      return;
    }
    const p = platform === "liepin" ? "liepin" : platform === "zhaopin" ? "zhaopin" : "boss";
    if (p === "liepin") saveLiepinCookies(userId, cookies.trim());
    else if (p === "zhaopin") saveZhaopinCookies(userId, cookies.trim());
    else saveBossCookies(userId, cookies.trim());
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/boss/cookies/status — check platform cookie validity
router.get("/cookies/status", async (req, res, next) => {
  try {
    const userId = (req as any).user.id;
    const platform = String(req.query.platform || "boss").toLowerCase();
    let cookies: string | null = null;
    if (platform === "liepin") cookies = getLiepinCookies(userId);
    else if (platform === "zhaopin") cookies = getZhaopinCookies(userId);
    else cookies = getBossCookies(userId);
    if (!cookies) {
      res.json({ valid: false, reason: "未配置Cookie" });
      return;
    }
    try {
      let valid = false;
      if (platform === "liepin") valid = await checkLiepinCookieValid(userId);
      else if (platform === "zhaopin") valid = await checkZhaopinCookieValid(userId);
      else valid = await checkBossCookieValid(userId);
      res.json({ valid, reason: valid ? "Cookie有效" : "Cookie已过期" });
    } catch {
      res.json({ valid: false, reason: "验证失败，请稍后重试" });
    }
  } catch (e) { next(e); }
});

// GET /api/boss/greet/:jobId — SSE stream for one-click greeting
router.get("/greet/:jobId", async (req, res) => {
  const userId = (req as any).user.id;
  const jobId = Number(req.params.jobId);
  if (!jobId || isNaN(jobId)) {
    res.status(400).json({ error: "invalid_job_id", message: "无效的岗位ID" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: any) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  const onStep = (step: GreetStep) => send(step);

  try {
    const result = await greetJob(userId, jobId, onStep);
    send({ type: "result", ...result });
  } catch (e: any) {
    send({ type: "error", label: "系统错误", detail: e.message || "未知错误" });
    send({ type: "result", success: false, message: e.message || "打招呼失败" });
  }
  res.end();
});

// GET /api/boss/scrape — SSE stream for scraping jobs (Boss / 猎聘 / 智联)
router.get("/scrape", async (req, res) => {
  const userId = (req as any).user.id;
  const platform = String(req.query.platform || "boss").toLowerCase();
  const keywords = req.query.keywords
    ? String(req.query.keywords).split(",").map(s => s.trim()).filter(Boolean)
    : [];
  const cities = req.query.cities
    ? String(req.query.cities).split(",").map(s => s.trim()).filter(Boolean)
    : [];
  const maxPer = Number(req.query.maxPer) || 15;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: any) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  try {
    let result: { total: number; inserted: number };
    if (platform === "liepin") {
      result = await scrapeLiepinJobs(userId, keywords, cities, maxPer, (step) => send(step));
    } else if (platform === "zhaopin") {
      result = await scrapeZhaopinJobs(userId, keywords, cities, maxPer, (step) => send(step));
    } else {
      result = await scrapeBossJobs(userId, keywords, cities, maxPer, (step) => send(step));
    }
    send({ type: "result", ...result });
  } catch (e: any) {
    send({ type: "error", label: "系统错误", detail: e.message || "未知错误" });
    send({ type: "result", total: 0, inserted: 0 });
  }
  res.end();
});

export default router;
