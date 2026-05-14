import { openai } from "./openaiClient.ts";
import { ENV } from "../config/env.ts";
import {
  scoreResume, scoreImproved, detectFabricatedNumbers, detectRedFlags,
  checkProjectContext, type ResumeScore, type FabricationWarning, type RedFlag,
} from "./resumeScorer.ts";

export interface OptimizationStep {
  section: string;
  before: string;
  after: string;
  dimensionChanges: string[];
  accepted: boolean;
}

export interface ValueExtraction {
  originalBullet: string;
  deliverable: string;
  result: string;
  missingQuantification: string;
  rewriteDirection: string;
}

export interface OptimizationResult {
  originalText: string;
  optimizedText: string;
  originalScore: ResumeScore;
  finalScore: ResumeScore;
  steps: OptimizationStep[];
  summary: string;
  fabricationWarnings: FabricationWarning[];
  verdict: string;
  redFlags: RedFlag[];
  valueExtractions: ValueExtraction[];
  projectContext: { hasContext: boolean; projectsWithoutContext: number; suggestion: string };
  onePageVersion: string | null;
}

const SECTIONS = [
  { key: "summary", zh: "个人总结/求职意向", prompt: "个人总结或求职意向部分" },
  { key: "experience", zh: "经历描述", prompt: "实习/项目经历（下面有详细改写规则）" },
  { key: "skills", zh: "技能列表", prompt: "技能部分" },
  { key: "education", zh: "教育背景", prompt: "教育背景" },
];

function countBullets(text: string): string[] {
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
  const bullets = lines.filter(l =>
    /^[•·\-*●○◆◇➤►▸▪▫]/.test(l) ||
    /^\d+[.、．]/.test(l) ||
    /^[（(]\d+[)）]/.test(l)
  );
  return bullets.length >= 2 ? bullets : lines.filter(l => l.length > 10 && l.length < 300);
}

function detectWeakBullets(bullets: string[]): string[] {
  const weakStarters = ["负责", "参与", "协助", "了解", "熟悉", "接触"];
  return bullets.filter(b => {
    const first = b.trim().split(/[\s,，、]/)[0];
    return weakStarters.includes(first);
  });
}

// ── Main optimization flow ──

export async function optimizeResume(
  resumeText: string,
  targetJD?: string,
  onStep?: (step: OptimizationStep) => void
): Promise<OptimizationResult> {
  const originalScore = await scoreResume(resumeText, targetJD);
  const steps: OptimizationStep[] = [];
  let currentText = resumeText;

  if (!openai) {
    const redFlags = detectRedFlags(resumeText);
    const projectContext = checkProjectContext(resumeText);
    return {
      originalText: resumeText, optimizedText: resumeText,
      originalScore, finalScore: originalScore,
      steps: [], summary: "AI 服务不可用，无法优化",
      fabricationWarnings: [],
      verdict: "",
      redFlags,
      valueExtractions: [],
      projectContext,
      onePageVersion: null,
    };
  }

  // ── Step 0: Generate 30-second verdict ──
  const verdict = await generateVerdict(resumeText, targetJD, originalScore);

  // ── Step 1: Value extraction on weak bullets ──
  const valueExtractions = await extractValue(resumeText, targetJD);

  // ── Round 2: Section-by-section optimization ──
  const weakBullets = detectWeakBullets(countBullets(currentText));
  const weakSpecificity = originalScore.dimensions.find(d => d.label === "specificity")!;
  const weakVerbs = originalScore.dimensions.find(d => d.label === "verbs")!;
  const weakKeywords = originalScore.dimensions.find(d => d.label === "keywords")!;

  const sectionsToOptimize: typeof SECTIONS = [];
  if (weakSpecificity.score < 50 || weakVerbs.score < 40) {
    sectionsToOptimize.push(SECTIONS.find(s => s.key === "experience")!);
  }
  if (weakKeywords.score < 60 && targetJD) {
    sectionsToOptimize.push(SECTIONS.find(s => s.key === "skills")!);
  }
  const completeness = originalScore.dimensions.find(d => d.label === "completeness")!;
  if (completeness.score < 75) {
    sectionsToOptimize.push(SECTIONS.find(s => s.key === "summary")!);
  }
  sectionsToOptimize.push(SECTIONS.find(s => s.key === "education")!);

  const uniqueSections = sectionsToOptimize.filter(
    (s, i, arr) => arr.findIndex(x => x.key === s.key) === i
  );

  for (const section of uniqueSections) {
    const beforeScore = await scoreResume(currentText, targetJD);

    const prompt = buildRewritePrompt(section, currentText, targetJD, weakBullets, valueExtractions);
    const improved = await aiOptimize(prompt, section.zh);

    if (!improved || improved === currentText) continue;

    const afterScore = await scoreResume(improved, targetJD);
    const comparison = scoreImproved(beforeScore, afterScore);

    const step: OptimizationStep = {
      section: section.zh,
      before: currentText.slice(0, 200),
      after: improved.slice(0, 200),
      dimensionChanges: comparison.changes,
      accepted: comparison.improved,
    };

    if (comparison.improved) {
      currentText = improved;
    }
    onStep?.(step);
    steps.push(step);
  }

  // ── Round 3: Holistic polish ──
  const midScore = await scoreResume(currentText, targetJD);
  if (midScore.overall < 75) {
    const prompt = buildHolisticPrompt(currentText, targetJD, midScore);
    const polished = await aiOptimize(prompt, "全文润色");
    if (polished && polished !== currentText) {
      const afterScore = await scoreResume(polished, targetJD);
      const comparison = scoreImproved(midScore, afterScore);
      if (comparison.improved) {
        currentText = polished;
        steps.push({
          section: "全文润色",
          before: currentText.slice(0, 200),
          after: polished.slice(0, 200),
          dimensionChanges: comparison.changes,
          accepted: true,
        });
      }
    }
  }

  const finalScore = await scoreResume(currentText, targetJD);

  // Build summary
  const overallDelta = Math.round((finalScore.overall - originalScore.overall) * 100) / 100;
  const improvedDims = finalScore.dimensions
    .filter((d, i) => d.score - originalScore.dimensions[i].score > 2)
    .map(d => d.labelZh);

  let summary = "";
  if (overallDelta > 0) {
    summary = `优化完成，综合评分提升 ${overallDelta} 分（${originalScore.overall} → ${finalScore.overall}）。`;
    if (improvedDims.length > 0) summary += ` 主要改善：${improvedDims.join("、")}。`;
  } else if (overallDelta === 0) {
    summary = "你的简历基础不错，本轮优化保持了原有水平。建议提供目标岗位描述以获得针对性优化。";
  } else {
    summary = "优化后综合评分略有下降，已回退部分修改。建议手动调整后再试。";
  }

  const fabricationWarnings = detectFabricatedNumbers(resumeText, currentText);
  const redFlags = detectRedFlags(currentText);
  const projectContext = checkProjectContext(currentText);

  return {
    originalText: resumeText, optimizedText: currentText,
    originalScore, finalScore, steps, summary, fabricationWarnings,
    verdict, redFlags, valueExtractions, projectContext,
    onePageVersion: null,
  };
}

// ── Step 0: 30-second verdict ──

async function generateVerdict(resumeText: string, targetJD?: string, score?: ResumeScore): Promise<string> {
  const prompt = `你是资深招聘专家。请用一句话给出这份简历的初判（不超过60字），回答三个问题：
1. 这份简历会让面试官继续看下去吗？
2. 最致命的一个问题是什么？
3. 最大的潜在亮点是什么？

格式：直接给出一句话结论，不要分条。

${targetJD ? `目标岗位：${targetJD.slice(0, 1000)}\n` : ""}
简历：${resumeText.slice(0, 3000)}`;

  try {
    const response = await openai!.chat.completions.create({
      model: ENV.OPENAI_CV_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
    });
    return (response.choices[0]?.message?.content || "").replace(/<think[\s\S]*?<\/think>/g, "").replace(/```/g, "").trim();
  } catch {
    return "简历需要优化（AI 初判生成失败，请参考下方评分）";
  }
}

// ── Step 1: Value extraction ──

async function extractValue(resumeText: string, targetJD?: string): Promise<ValueExtraction[]> {
  const prompt = `你是简历价值提炼专家。分析以下简历中的每条经历描述，提取：
- 原描述是什么
- 可识别产物（实际交付了什么？系统/平台/工具/流程/规范？）
- 可识别结果（谁受益了？流程变了吗？风险消除了吗？）
- 缺失的关键量化点（如果能找到数字会是什么？）
- 推荐改写方向（STAR公式 / 决策-权衡 / 产物导向 / 量化补强？）

输出格式：纯 JSON 数组，每个元素包含 originalBullet、deliverable、result、missingQuantification、rewriteDirection。只输出 JSON，不要其他文字。

${targetJD ? `目标岗位：${targetJD.slice(0, 1000)}\n` : ""}
简历：${resumeText.slice(0, 4000)}`;

  try {
    const response = await openai!.chat.completions.create({
      model: ENV.OPENAI_CV_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
    });
    const text = (response.choices[0]?.message?.content || "")
      .replace(/<think[\s\S]*?<\/think>/g, "")
      .replace(/```json/g, "").replace(/```/g, "").trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as ValueExtraction[];
  } catch (e) {
    console.error("[ValueExtraction] Failed:", (e as Error).message);
  }
  return [];
}

// ── Rewrite prompt (fully upgraded with narrative tools) ──

function buildRewritePrompt(
  section: typeof SECTIONS[number],
  resumeText: string,
  targetJD?: string,
  weakBullets?: string[],
  valueExtractions?: ValueExtraction[],
): string {
  let prompt = `你是站在求职者一侧的简历审计官。请重写以下简历的「${section.prompt}」。\n\n`;

  prompt += `## 重写规则（严格遵守）

### 核心原则
1. **不编造成果**：不能捏造项目背景、指标、头衔。缺失的信息用占位符标记：[待补：例如接口延迟从 XXms 降到 XXms]
2. **量化优先于形容**：优先用数字、范围、频率、规模来证明价值。没有准确数字时，用"从手工到自动化"、"从无法追踪到全链路可观测"这类变化来描述
3. **每条经历追问"所以呢"**：不能只写职责，必须写出"业务目标/技术挑战 → 你的关键动作 → 可感知结果"
4. **项目先有上下文，再有 bullet**：每段项目经历开头必须用一句话说明项目背景——系统定位 + 核心用户 + 解决的业务问题。缺少项目描述时用：[项目描述待补：例如面向XX用户的XX系统，用于解决XX问题]

### 改写公式（优先使用）

**STAR/CAR 公式**（最常用）：
\`\`\`
为了[业务目标或技术挑战]，我[采取了什么关键动作]，最终带来[可量化或可感知的结果]。
\`\`\`

**决策-权衡写法**（当经历涉及技术选型、架构决策时）：
\`\`\`
为解决[问题]，评估了[方案 A] 与 [方案 B]。我选择[方案]，因为[关键理由]，并通过[补偿措施]控制风险，最终实现[结果]。
\`\`\`

**产物导向模板**（当原文只有职责、没有交付物时）：
\`\`\`
为了解决[问题]，我设计/重构/落地了[产物]，被[团队/系统/用户]使用，最终带来[结果]。
\`\`\`

### 从职责改成成果（示例）
- 改前：负责用户模块开发和维护
- 改后：主导用户模块重构，拆分服务边界并补齐单测，使新功能交付周期从 2 周缩短到 3 天

### 从"做事"改成交付产物（示例）
- 改前：负责搭建内部工具
- 改后：设计并交付内部发布平台，将分散在多个脚本中的发布流程统一到一个可复用平台中，覆盖研发与测试团队日常发布操作

### 没有量化数据时的替代表达
- 建立了可复用标准
- 消除了某类线上风险
- 让某项流程从手工变成自动化
- 让排障/观测/发布更可控
- 让跨团队协作更顺畅
`;

  if (targetJD) {
    prompt += `\n### 目标岗位\n${targetJD.slice(0, 1500)}\n请围绕此 JD 调整关键词重点和项目顺序。\n`;
  }

  if (valueExtractions && valueExtractions.length > 0) {
    prompt += `\n### 价值提炼参考\n${valueExtractions.slice(0, 6).map(ve =>
      `- 原文："${ve.originalBullet}"\n  产物：${ve.deliverable}\n  结果：${ve.result}\n  方向：${ve.rewriteDirection}`
    ).join("\n")}\n`;
  }

  if (weakBullets && weakBullets.length > 0) {
    prompt += `\n### 弱表述优先重写\n${weakBullets.slice(0, 5).join("\n")}\n`;
  }

  prompt += `\n### 简历原文\n${resumeText.slice(0, 5000)}\n\n请直接输出改写后的完整简历，不要加任何解释或 Markdown 标记。`;

  return prompt;
}

// ── Holistic polish prompt ──

function buildHolisticPrompt(resumeText: string, targetJD?: string, score?: ResumeScore): string {
  let prompt = `你是顶级简历顾问。请对这份简历做最后的全文润色。只做微调，不要推翻重写。\n\n`;

  if (score) {
    const weakOnes = score.dimensions.filter(d => d.score < 60);
    if (weakOnes.length > 0) {
      prompt += `当前薄弱项：${weakOnes.map(d => `${d.labelZh}(${d.score}分)`).join("、")}\n`;
      prompt += `请重点改善这几个方面。\n\n`;
    }
    if (score.redFlags && score.redFlags.length > 0) {
      prompt += `当前风险项：${score.redFlags.map(r => `${r.category}：${r.suggestion}`).join("；")}\n\n`;
    }
  }

  if (targetJD) {
    prompt += `目标岗位：${targetJD.slice(0, 1000)}\n\n`;
  }

  prompt += `简历原文：\n${resumeText.slice(0, 5000)}\n\n直接输出改写后的完整简历。`;

  return prompt;
}

// ── AI call ──

async function aiOptimize(prompt: string, sectionLabel: string): Promise<string | null> {
  try {
    const response = await openai!.chat.completions.create({
      model: ENV.OPENAI_CV_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 3000,
    });

    let text = response.choices[0]?.message?.content || "";
    text = text
      .replace(/<think[\s>][\s\S]*?<\/think>/g, "")
      .replace(/<think[\s>][\s\S]*$/g, "")
      .replace(/^\s*<\/think>\s*/gm, "")
      .replace(/```[\s\S]*?```/g, "")
      .trim();

    if (!text || text.length < 50) return null;
    return text;
  } catch (err: any) {
    console.error(`[ResumeOptimizer] AI error optimizing ${sectionLabel}:`, err.message);
    return null;
  }
}

// ── One-page compression ──

export async function compressToOnePage(optimizedText: string, targetJD?: string): Promise<string> {
  if (!openai) return optimizedText;

  const prompt = `你是简历压缩专家。请将以下简历压缩为一份一页版简历。

## 压缩原则
1. 只保留最能支撑目标岗位的经历和成果
2. 每段经历压缩到 2-4 条高密度 bullet
3. 每条 bullet 必须包含"动作 + 产物 + 结果"
4. 删除空洞自评、弱相关项目、重复技能
5. 技能清单只保留 JD 中会被检索的核心关键词（6-12 个）
6. 即使压缩了，每个项目仍必须保留一句话的项目描述，可以压到一行，但不能省略
7. 一页版的目标是"提高面试转化率"，不是"完整存档"

${targetJD ? `目标岗位：${targetJD.slice(0, 1000)}\n` : ""}
简历：${optimizedText.slice(0, 5000)}\n\n直接输出压缩后的一页简历。`;

  try {
    const response = await openai!.chat.completions.create({
      model: ENV.OPENAI_CV_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 3000,
    });
    let text = response.choices[0]?.message?.content || "";
    text = text.replace(/<think[\s\S]*?<\/think>/g, "").replace(/```[\s\S]*?```/g, "").trim();
    return text || optimizedText;
  } catch {
    return optimizedText;
  }
}
