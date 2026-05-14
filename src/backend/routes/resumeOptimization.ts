import { Router } from "express";
import { optimizeResume, compressToOnePage } from "../services/resumeOptimizer.ts";
import { scoreResume } from "../services/resumeScorer.ts";

const router = Router();

// POST /api/resume/score — score a resume without optimizing
router.post("/score", async (req, res, next) => {
  try {
    const { resumeText, targetJD } = req.body;
    if (!resumeText) {
      res.status(400).json({ error: "missing_resume_text", message: "请提供简历文本" });
      return;
    }
    const score = await scoreResume(String(resumeText), targetJD ? String(targetJD) : undefined);
    res.json(score);
  } catch (e) { next(e); }
});

// POST /api/resume/optimize — score + optimize with improvement gating
router.post("/optimize", async (req, res, next) => {
  try {
    const { resumeText, targetJD, includeOnePage } = req.body;
    if (!resumeText) {
      res.status(400).json({ error: "missing_resume_text", message: "请提供简历文本" });
      return;
    }

    const result = await optimizeResume(
      String(resumeText),
      targetJD ? String(targetJD) : undefined
    );

    // Optionally compress to one-page
    if (includeOnePage && result.optimizedText) {
      result.onePageVersion = await compressToOnePage(
        result.optimizedText,
        targetJD ? String(targetJD) : undefined
      );
    }

    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/resume/compress — compress a resume to one page
router.post("/compress", async (req, res, next) => {
  try {
    const { resumeText, targetJD } = req.body;
    if (!resumeText) {
      res.status(400).json({ error: "missing_resume_text", message: "请提供简历文本" });
      return;
    }
    const onePage = await compressToOnePage(
      String(resumeText),
      targetJD ? String(targetJD) : undefined
    );
    res.json({ onePageVersion: onePage });
  } catch (e) { next(e); }
});

export default router;
