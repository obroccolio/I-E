import { Router } from "express";
import * as svc from "../../services/adminJobService.ts";
import { AppError } from "../../utils/AppError.ts";
import { logAction } from "../../services/adminSystemService.ts";
import { dedupAll, dedupCompany } from "../../services/jobDedup.ts";

const router = Router();

router.get("/jobs", (req, res, next) => {
  try {
    const result = svc.listJobs({
      page: Number(req.query.page) || undefined,
      limit: Number(req.query.limit) || undefined,
      sort: req.query.sort as string || undefined,
      order: req.query.order as any || undefined,
      status: req.query.status as string || undefined,
      search: req.query.search as string || undefined,
      company: req.query.company as string || undefined,
      industry: req.query.industry as string || undefined,
    });
    res.json(result);
  } catch (e) { next(e); }
});

router.get("/jobs/:id", (req, res, next) => {
  try {
    const job = svc.getJob(Number(req.params.id));
    if (!job) throw new AppError("job.not_found", 404);
    res.json({ job });
  } catch (e) { next(e); }
});

router.post("/jobs", (req, res, next) => {
  try {
    if (!req.body.title) throw new AppError("job.title_required", 400);
    if (!req.body.company) throw new AppError("job.company_required", 400);

    const job = svc.createJob(req.body);
    logAction((req as any).user.id, "job.create", "job", job.id);
    res.status(201).json({ job });
  } catch (e) { next(e); }
});

router.put("/jobs/:id", (req, res, next) => {
  try {
    const existing = svc.getJob(Number(req.params.id));
    if (!existing) throw new AppError("job.not_found", 404);

    const job = svc.updateJob(Number(req.params.id), req.body);
    logAction((req as any).user.id, "job.update", "job", Number(req.params.id), req.body);
    res.json({ job });
  } catch (e) { next(e); }
});

router.delete("/jobs/:id", (req, res, next) => {
  try {
    const existing = svc.getJob(Number(req.params.id));
    if (!existing) throw new AppError("job.not_found", 404);

    svc.deleteJob(Number(req.params.id));
    logAction((req as any).user.id, "job.delete", "job", Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.patch("/jobs/:id/status", (req, res, next) => {
  try {
    const { status } = req.body;
    const valid = ["active", "paused", "closed", "archived"];
    if (!valid.includes(status)) throw new AppError("job.invalid_status", 400);

    const job = svc.updateJobStatus(Number(req.params.id), status);
    if (!job) throw new AppError("job.not_found", 404);

    logAction((req as any).user.id, "job.status_update", "job", Number(req.params.id), { status });
    res.json({ job });
  } catch (e) { next(e); }
});

// POST /api/admin/jobs/dedup — trigger LLM cross-platform dedup
router.post("/jobs/dedup", async (_req, res, next) => {
  try {
    const result = await dedupAll((msg) => console.log("[Dedup]", msg));
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

// POST /api/admin/jobs/dedup/:company — trigger dedup for a single company
router.post("/jobs/dedup/:company", async (req, res, next) => {
  try {
    const company = decodeURIComponent(req.params.company);
    const updated = await dedupCompany(company);
    res.json({ ok: true, company, jobsUpdated: updated });
  } catch (e) { next(e); }
});

export default router;
