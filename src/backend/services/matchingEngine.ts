import db from "../db/connection.ts";
import { openai } from "./openaiClient.ts";
import { ENV } from "../config/env.ts";

export interface MatchResult {
  jobId: number;
  score: number;
  reason: string;
}

export type AgentStep =
  | { type: "filter"; label: string; detail: string }
  | { type: "scan"; label: string; detail: string }
  | { type: "tool_call"; label: string; detail: string }
  | { type: "tool_result"; label: string; detail: string }
  | { type: "scoring"; label: string; detail: string }
  | { type: "done"; label: string; detail: string };

// ═══════════════════════════════════════════════
// Utility helpers (preserved from original)
// ═══════════════════════════════════════════════

function parseJsonField(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [String(value)];
  } catch {
    return value.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
  }
}

function isChinese(c: string): boolean {
  const code = c.charCodeAt(0);
  return (code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF);
}

/** Tokenize text: bigrams for Chinese, whitespace split for other languages */
function tokenize(text: string): string[] {
  if (!text) return [];
  const result: string[] = [];
  let i = 0;
  let currentWord = "";

  while (i < text.length) {
    const ch = text[i];
    if (isChinese(ch)) {
      if (currentWord) { result.push(currentWord.toLowerCase()); currentWord = ""; }
      if (i + 1 < text.length && isChinese(text[i + 1])) {
        result.push(ch + text[i + 1]);
        i += 2;
        // Also add single chars for 3+ char sequences
        if (i < text.length && isChinese(text[i])) result.push(ch + text[i]);
      } else {
        result.push(ch);
        i++;
      }
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      currentWord += ch;
      i++;
    } else {
      if (currentWord) { result.push(currentWord.toLowerCase()); currentWord = ""; }
      i++;
    }
  }
  if (currentWord) result.push(currentWord.toLowerCase());
  return result.filter(t => t.length >= 2 || isChinese(t[0]));
}

function buildJobText(job: any): string {
  return [
    job.title, job.title, job.title, // title ×3 weight
    job.company, job.location, job.industry, job.role_type,
    job.description, job.requirements, job.responsibilities,
    job.tags ?? "", job.job_type,
  ].filter(Boolean).join(" ");
}

function buildUserText(profileRow: any, prefRow: any): string {
  const parts: string[] = [];
  const skills = parseJsonField(profileRow?.skills);
  if (skills.length > 0) parts.push(skills.join(" "));
  const targetRoles = parseJsonField(prefRow?.target_roles);
  if (targetRoles.length > 0) parts.push(targetRoles.join(" "));
  const targetIndustries = parseJsonField(prefRow?.target_industries);
  if (targetIndustries.length > 0) parts.push(targetIndustries.join(" "));
  if (profileRow?.raw_resume_text) parts.push(profileRow.raw_resume_text);
  if (profileRow?.education) {
    try {
      const edu = JSON.parse(profileRow.education);
      if (Array.isArray(edu)) {
        for (const e of edu) {
          if (e.school) parts.push(e.school);
          if (e.degree) parts.push(e.degree);
          if (e.field) parts.push(e.field);
        }
      }
    } catch {}
  }
  if (profileRow?.experience) {
    try {
      const exp = JSON.parse(profileRow.experience);
      if (Array.isArray(exp)) {
        for (const e of exp) {
          if (e.company) parts.push(e.company);
          if (e.title) parts.push(e.title);
          if (e.description) parts.push(String(e.description));
        }
      }
    } catch {}
  }
  return parts.filter(Boolean).join(" ");
}

function computeStructuralBonus(profileRow: any, prefRow: any, job: any): number {
  let bonus = 0;
  const targetRoles = parseJsonField(prefRow?.target_roles);
  const jt = (job.title || "").toLowerCase();
  const rt = (job.role_type || "").toLowerCase();

  if (targetRoles.length > 0) {
    const matched = targetRoles.some(r => {
      const rl = r.toLowerCase();
      return jt.includes(rl) || rt.includes(rl) || rl.includes(jt) || rl.includes(rt);
    });
    if (matched) bonus += 0.5;
    else bonus -= 0.15;
  }

  const targetIndustries = parseJsonField(prefRow?.target_industries);
  if (targetIndustries.length > 0 && job.industry) {
    const ji = job.industry.toLowerCase();
    const matched = targetIndustries.some(ind => ji.includes(ind.toLowerCase()));
    if (matched) bonus += 0.15;
  }

  const skills: string[] = parseJsonField(profileRow?.skills);
  if (skills.length > 0) {
    const jt2 = (job.title + " " + (job.description || "") + " " + (job.requirements || "")).toLowerCase();
    const matched = skills.filter(s => jt2.includes(s.toLowerCase())).length;
    if (matched > 0) bonus += 0.1 * Math.min(matched / Math.max(skills.length, 1), 1);
  }

  const targetLocations = parseJsonField(prefRow?.target_locations);
  if (targetLocations.length > 0 && job.location) {
    const jl = job.location.toLowerCase();
    if (targetLocations.some(loc => jl.includes(loc.toLowerCase()))) bonus += 0.05;
  }

  return bonus;
}

function generateFallbackReason(profileRow: any, prefRow: any, job: any, topTerms?: string[]): string {
  const reasons: string[] = [];
  const jt = (job.title || "").toLowerCase();
  const ji = (job.industry || "").toLowerCase();
  const jl = (job.location || "").toLowerCase();

  const targetRoles = parseJsonField(prefRow?.target_roles);
  if (targetRoles.length > 0) {
    const m = targetRoles.filter(r => {
      const rl = r.toLowerCase();
      return jt.includes(rl) || rl.includes(jt) || (job.role_type && job.role_type.toLowerCase().includes(rl));
    });
    if (m.length > 0) reasons.push(`目标职位「${m[0]}」匹配`);
  }

  const targetIndustries = parseJsonField(prefRow?.target_industries);
  if (targetIndustries.length > 0 && job.industry) {
    if (targetIndustries.some(i => ji.includes(i.toLowerCase()))) {
      reasons.push(`行业「${job.industry}」匹配`);
    }
  }

  const skills: string[] = parseJsonField(profileRow?.skills);
  const jobFull = (job.title + " " + (job.description || "") + " " + (job.requirements || "")).toLowerCase();
  if (skills.length > 0) {
    const m = skills.filter(s => jobFull.includes(s.toLowerCase()));
    if (m.length > 0) reasons.push(`技能「${m.slice(0, 3).join("、")}」匹配`);
  }

  if (topTerms && topTerms.length > 0) {
    reasons.push(`关键词「${topTerms.slice(0, 3).join("、")}」高度相关`);
  }

  const targetLocations = parseJsonField(prefRow?.target_locations);
  if (targetLocations.length > 0 && job.location) {
    if (targetLocations.some(l => jl.includes(l.toLowerCase()))) {
      reasons.push(`地点「${job.location}」符合`);
    }
  }

  return reasons.length > 0 ? reasons.join("；") : `${job.title || "该岗位"}与你的背景有一定相关性`;
}

// ═══════════════════════════════════════════════
// TF-IDF + Cosine Similarity Engine
// ═══════════════════════════════════════════════

interface TfidfVector {
  terms: Map<string, number>; // term → weight
  norm: number;               // precomputed L2 norm
}

/** Global cache of job TF-IDF vectors. Rebuilt when jobs change. */
let vectorCacheVersion = 0;
let vectorCache: Map<number, TfidfVector> | null = null;

function getVectorCacheVersion(): number {
  const row = db.prepare("SELECT COUNT(*) as cnt, COALESCE(MAX(id), 0) as maxId FROM jobs WHERE status = 'active'").get() as any;
  return row.cnt * 1000000 + row.maxId;
}

/** Compute term frequency for a token list, with log normalization */
function computeTF(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  // log normalization
  for (const [term, count] of tf) {
    tf.set(term, Math.log(1 + count));
  }
  return tf;
}

/** Compute L2 norm of a sparse vector */
function computeNorm(vec: Map<string, number>): number {
  let sum = 0;
  for (const w of vec.values()) sum += w * w;
  return Math.sqrt(sum);
}

/** Build TF-IDF vectors for all active jobs. Results cached. */
function buildJobVectors(): Map<number, TfidfVector> {
  const version = getVectorCacheVersion();
  if (vectorCache && vectorCacheVersion === version) return vectorCache;

  const jobs = db.prepare("SELECT * FROM jobs WHERE status = 'active'").all() as any[];
  if (jobs.length === 0) { vectorCache = new Map(); vectorCacheVersion = version; return vectorCache; }

  // Phase 1: Tokenize all jobs and compute DF (document frequency)
  const N = jobs.length;
  const df = new Map<string, number>();
  const jobTokens: Map<number, string[]> = new Map();

  for (const job of jobs) {
    const text = buildJobText(job);
    const tokens = tokenize(text);
    jobTokens.set(job.id, tokens);
    const seen = new Set(tokens);
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
  }

  // Phase 2: Compute TF-IDF vectors
  const vectors = new Map<number, TfidfVector>();
  for (const job of jobs) {
    const tokens = jobTokens.get(job.id) || [];
    const tf = computeTF(tokens);
    const tfidf = new Map<string, number>();
    for (const [term, tfVal] of tf) {
      const dfVal = df.get(term) || 1;
      // BM25-style smooth IDF
      const idf = Math.log((N - dfVal + 0.5) / (dfVal + 0.5));
      const weight = tfVal * Math.max(0, idf);
      if (weight > 0) tfidf.set(term, weight);
    }
    vectors.set(job.id, { terms: tfidf, norm: computeNorm(tfidf) });
  }

  vectorCache = vectors;
  vectorCacheVersion = version;
  return vectors;
}

/** Compute cosine similarity between two sparse vectors */
function cosineSimilarity(a: TfidfVector, b: TfidfVector): number {
  if (a.norm === 0 || b.norm === 0) return 0;
  let dotProduct = 0;
  const [smaller, larger] = a.terms.size < b.terms.size ? [a, b] : [b, a];
  for (const [term, weight] of smaller.terms) {
    const otherWeight = larger.terms.get(term);
    if (otherWeight) dotProduct += weight * otherWeight;
  }
  return dotProduct / (a.norm * b.norm);
}

/** Build TF-IDF vector for user profile */
function buildUserVector(profileRow: any, prefRow: any, jobVectors: Map<number, TfidfVector>): TfidfVector {
  const text = buildUserText(profileRow, prefRow);
  const tokens = tokenize(text);
  const tf = computeTF(tokens);

  // Use IDF from the job corpus for consistent weighting
  const N = jobVectors.size;
  if (N === 0) {
    const tfidf = new Map<string, number>();
    for (const [term, tfVal] of tf) tfidf.set(term, tfVal);
    return { terms: tfidf, norm: computeNorm(tfidf) };
  }

  // Collect DF from job vectors
  const df = new Map<string, number>();
  for (const vec of jobVectors.values()) {
    for (const term of vec.terms.keys()) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }

  const tfidf = new Map<string, number>();
  for (const [term, tfVal] of tf) {
    const dfVal = df.get(term) || 1;
    const idf = Math.log((N - dfVal + 0.5) / (dfVal + 0.5));
    const weight = tfVal * Math.max(0, idf);
    if (weight > 0) tfidf.set(term, weight);
  }

  return { terms: tfidf, norm: computeNorm(tfidf) };
}

/** Get top contributing terms from cosine similarity match */
function getTopContributingTerms(userVec: TfidfVector, jobVec: TfidfVector, topN: number = 5): string[] {
  const contributions: Array<{ term: string; weight: number }> = [];
  for (const [term, userWeight] of userVec.terms) {
    const jobWeight = jobVec.terms.get(term);
    if (jobWeight) contributions.push({ term, weight: userWeight * jobWeight });
  }
  contributions.sort((a, b) => b.weight - a.weight);
  return contributions.slice(0, topN).map(c => c.term);
}

// ═══════════════════════════════════════════════
// AI Agent Reranking (preserved from original)
// ═══════════════════════════════════════════════

const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_job_detail",
      description: "获取指定岗位的完整详情，包括职责描述、任职要求等。当你需要深入了解某个岗位是否匹配候选人时调用此工具。",
      parameters: { type: "object", properties: { job_id: { type: "number", description: "岗位ID" } }, required: ["job_id"] },
    },
  },
];

async function runAgentMatching(
  profileRow: any, prefRow: any,
  scored: Array<{ job: any; score: number; structuralBonus: number; topTerms: string[] }>,
  limit: number, userId: number, onStep?: (step: AgentStep) => void,
  chatContext?: string,
): Promise<MatchResult[]> {
  const skills: string[] = parseJsonField(profileRow?.skills);
  const targetRoles: string[] = parseJsonField(prefRow?.target_roles);
  const targetIndustries: string[] = parseJsonField(prefRow?.target_industries);
  const targetLocations: string[] = parseJsonField(prefRow?.target_locations);
  const excludedRoles: string[] = parseJsonField(prefRow?.excluded_roles);
  const excludedLocations: string[] = parseJsonField(prefRow?.excluded_locations);
  const excludedLine = excludedRoles.length > 0 ? `\n候选人排除的职位类型：${excludedRoles.join("、")}` : "";
  const locationLine = targetLocations.length > 0 ? `\n目标工作地点：${targetLocations.join("、")}（必须优先推荐这些城市的岗位，不要推荐其他城市的岗位）` : "";
  const excludedLocationLine = excludedLocations.length > 0 ? `\n排除的工作地点：${excludedLocations.join("、")}（绝对不要推荐这些城市的岗位）` : "";

  const profileSummary = [
    targetRoles.length > 0 ? `目标职位：${targetRoles.join("、")}` : "",
    targetIndustries.length > 0 ? `目标行业：${targetIndustries.join("、")}` : "",
    targetLocations.length > 0 ? `目标工作地点：${targetLocations.join("、")}` : "",
    skills.length > 0 ? `核心技能：${skills.join("、")}` : "",
    profileRow?.raw_resume_text ? `简历摘要：${profileRow.raw_resume_text.slice(0, 500)}` : "",
  ].filter(Boolean).join("\n");

  const jobSummaries = scored.slice(0, 15).map(s =>
    `[ID:${s.job.id}] ${s.job.title} @ ${s.job.company} | ${s.job.location} | ${s.job.industry} | ${s.job.role_type} | TF-IDF:${s.score.toFixed(3)}`
  ).join("\n");

  const roleLine = targetRoles.length > 0
    ? `\n【最高优先级：目标岗位匹配】候选人明确指定了目标岗位：${targetRoles.join("、")}。岗位标题或角色类型与这些目标岗位明显不符的，严禁推荐！`
    : "";

  const chatContextLine = chatContext
    ? `\n# 🔴 用户最新对话要求（最高优先级 - 绝对否决权）\n用户在当前对话中说：「${chatContext}」\n这是用户的直接要求，必须100%遵守。如果用户指定了岗位类型、城市、排除条件等，必须作为硬性过滤条件。即使某个岗位与简历匹配度很高，只要违反用户的最新要求，就必须排除！\n`
    : "";

  const systemPrompt = `# Role
你是一位顶级的 AI 求职匹配专家。你的任务是根据用户的【简历画像】和【本次对话要求】，在岗位库中为用户进行最精准的匹配。

你可以调用 get_job_detail 工具查看任何岗位的完整详情（职责、要求等），以便做出精确匹配判断。
${chatContextLine}
# 候选人档案
${profileSummary}${excludedLine}${locationLine}${excludedLocationLine}${roleLine}

# 候选岗位（已通过 TF-IDF + 硬性条件筛选，按语义相关度排序）
${jobSummaries}

# 核心纪律 (CRITICAL RULES)
你必须严格遵守以下优先级纪律，任何违反此纪律的匹配都将被视为严重失职：
1. 【最高优先级 - 绝对否决权】：用户在当前最新对话中提出的任何条件（如：指定城市、薪资底线、特定技术栈、拒绝出差、排除特定类型等），均为**硬性过滤条件（Hard Constraints）**。候选人排除的职位类型和排除的工作地点必须严格遵守。
2. 【次级优先级】：在满足【最高优先级】的前提下，再参考用户的【简历画像】进行技能和经验的语义匹配。
3. 如果用户的当前要求与简历内容冲突（例如：简历全是Java，但用户本次明确要求找Python岗位），**必须100%以本次要求为准**，忽略简历中的冲突项。

# 执行步骤 (Execution Workflow)
在每次回复用户前，你必须严格按照以下三步执行：
- Step 1: 提取（Extract）— 明确列出候选人档案中提出的所有硬性要求（目标职位、目标城市、排除项等）。
- Step 2: 过滤（Filter）— 严格剔除所有不符合 Step 1 要求的岗位。即使某个岗位与候选人的技能匹配度高达 99%，只要它违反了任何硬性要求，也必须无情丢弃！
- Step 3: 匹配与解释（Match & Explain）— 在剩余的岗位中选出最合适的，在 reason 字段中向用户解释为什么推荐这些岗位（必须体现你优先满足了TA的硬性要求）。

# 兜底机制 (Fallback Strategy)
如果经过严格过滤后，没有任何岗位满足所有硬性要求，**绝对禁止**为了凑数而推荐不合规的岗位。此时必须在回复中诚实说明"根据您的严格要求，目前库中暂无匹配项"，并简要给出放宽条件的建议。

# 输出格式
最终回复必须是一个纯JSON数组，不要包含任何其他文字。推荐数量由你决定：只推荐真正匹配的岗位，可以是3个、5个、7个，不要凑数。score 必须真实反映匹配程度，不要虚高。

正确示例：
[{"jobId":1,"score":0.85,"reason":"技能匹配"},{"jobId":2,"score":0.7,"reason":"行业匹配"}]`;

  const messages: any[] = [{ role: "system", content: systemPrompt }, { role: "user", content: "请严格按照核心纪律：先提取候选人的硬性要求，再过滤排除，最后匹配。用 get_job_detail 查看你需要的岗位详情，然后给出最终匹配结果。" }];
  const MAX_ROUNDS = 6;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const resp = await openai!.chat.completions.create({
      model: ENV.OPENAI_MATCHING_MODEL,
      messages,
      tools: AGENT_TOOLS,
      tool_choice: "auto",
    });
    const msg = resp.choices[0].message;
    const normalizedMsg = { ...msg, content: msg.content ?? "" };
    messages.push(normalizedMsg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const content = normalizedMsg.content.trim();
      const jsonAttempt = content
        .replace(/<think[\s>][\s\S]*?<\/think>/g, "")
        .replace(/<think[\s>][\s\S]*$/g, "")
        .replace(/^\s*<\/think>\s*/gm, "")
        .replace(/```json/g, "").replace(/```/g, "").trim();
      const jsonMatch = jsonAttempt.match(/\[[\s\S]*\]/);
      if (jsonMatch) break;
      if (content.length > 0) {
        messages.push({ role: "user", content: "请严格按照核心纪律完成匹配，直接输出JSON数组结果，不要包含任何其他文字。如果无匹配项请说明。" });
        continue;
      }
      break;
    }

    const candidateJobIds = new Set(scored.map(s => s.job.id));
    for (const tc of msg.tool_calls) {
      if (tc.function.name === "get_job_detail") {
        let jobId: number | null = null;
        try {
          const parsed = JSON.parse(tc.function.arguments);
          jobId = Number(parsed.job_id);
          if (isNaN(jobId)) jobId = null;
        } catch {}
        if (jobId !== null && candidateJobIds.has(jobId)) {
          const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as any;
          onStep?.({ type: "tool_call", label: "查看岗位详情", detail: job ? `${job.title} @ ${job.company}` : `ID:${jobId}` });
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(job || { error: "未找到该岗位" }) });
          onStep?.({ type: "tool_result", label: "获取岗位信息", detail: job ? `已获取「${job.title}」的要求与职责` : "未找到该岗位" });
        } else {
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: jobId ? "该岗位不在候选列表中" : "无效的岗位ID" }) });
        }
      }
    }
  }

  let finalText = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.content && typeof m.content === "string") { finalText = m.content; break; }
  }
  if (!finalText) throw new Error("Agent returned no text content");

  onStep?.({ type: "scoring", label: "计算匹配度", detail: "AI 综合分析中..." });
  const clean = finalText
    .replace(/<think[\s>][\s\S]*?<\/think>/g, "")
    .replace(/<think[\s>][\s\S]*$/g, "")
    .replace(/^\s*<\/think>\s*/gm, "")
    .replace(/```json/g, "").replace(/```/g, "").trim();
  const jsonMatch = clean.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`Agent output is not valid JSON: ${clean.slice(0, 200)}`);

  const parsed = JSON.parse(jsonMatch[0]) as MatchResult[];
  const candidateJobIds = new Set(scored.map(s => s.job.id));
  const valid = parsed.filter(p =>
    typeof p.jobId === "number" && typeof p.score === "number" && typeof p.reason === "string" && candidateJobIds.has(p.jobId)
  );
  const insert = db.prepare("INSERT OR REPLACE INTO matches (user_id, job_id, match_score, match_reason, status) VALUES (?, ?, ?, ?, 'pending')");
  for (const m of valid) insert.run(userId, m.jobId, m.score, m.reason);
  onStep?.({ type: "done", label: "匹配完成", detail: `找到 ${valid.length} 个推荐岗位` });
  return valid.slice(0, limit);
}

// ═══════════════════════════════════════════════
// Main matching entry point
// ═══════════════════════════════════════════════

export async function runMatching(
  userId: number,
  options?: { limit?: number; force?: boolean; onStep?: (step: AgentStep) => void; chatContext?: string },
): Promise<MatchResult[]> {
  const limit = options?.limit ?? 10;
  const onStep = options?.onStep;
  const profileRow = db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(userId) as any;
  const prefRow = db.prepare("SELECT * FROM preferences WHERE user_id = ?").get(userId) as any;
  if (!profileRow && !prefRow) return [];

  // If cached matches exist and not forced, return them
  if (!options?.force) {
    const existing = db.prepare(
      "SELECT job_id as jobId, match_score as score, match_reason as reason FROM matches WHERE user_id = ? AND status = 'pending' ORDER BY match_score DESC LIMIT ?"
    ).all(userId, limit) as MatchResult[];
    if (existing.length > 0) {
      onStep?.({ type: "done", label: "匹配完成", detail: `已有 ${existing.length} 个推荐岗位` });
      return existing;
    }
  }

  if (options?.force) {
    db.prepare("DELETE FROM matches WHERE user_id = ? AND status = 'pending'").run(userId);
  }

  // ── Hard filters ──
  const targetIndustries = parseJsonField(prefRow?.target_industries);
  const targetLocations = parseJsonField(prefRow?.target_locations);
  const excludedLocations = parseJsonField(prefRow?.excluded_locations);

  let allJobs = (db.prepare("SELECT * FROM jobs WHERE status = 'active'").all() as any[])
    .filter(j => !j.deadline || j.deadline >= new Date().toISOString().split("T")[0]);

  if (targetIndustries.length > 0) {
    allJobs = allJobs.filter(j => targetIndustries.includes(j.industry));
  }
  if (excludedLocations.length > 0) {
    allJobs = allJobs.filter(j => !excludedLocations.some(loc => (j.location || "").includes(loc)));
  }
  if (targetLocations.length > 0) {
    allJobs = allJobs.filter(j => targetLocations.some(loc => (j.location || "").includes(loc)));
  }

  if (allJobs.length === 0) return [];

  onStep?.({ type: "filter", label: "筛选", detail: [
    targetIndustries.length > 0 ? `行业：${targetIndustries.join("、")}` : "",
    targetLocations.length > 0 ? `地点：${targetLocations.join("、")}` : "",
    excludedLocations.length > 0 ? `排除：${excludedLocations.join("、")}` : "",
    `${allJobs.length} 个岗位`,
  ].filter(Boolean).join(" → ") });

  // ── TF-IDF + Cosine Similarity ──
  onStep?.({ type: "scan", label: "TF-IDF 语义匹配", detail: `正在对 ${allJobs.length} 个岗位进行向量化匹配...` });

  const jobVectors = buildJobVectors();
  const userVector = buildUserVector(profileRow, prefRow, jobVectors);

  const excludedRoles = parseJsonField(prefRow?.excluded_roles);

  // Score all jobs
  const scored = allJobs.map(job => {
    const jv = jobVectors.get(job.id);
    let cosineScore = 0;
    let topTerms: string[] = [];

    if (jv && jv.norm > 0 && userVector.norm > 0) {
      cosineScore = cosineSimilarity(userVector, jv);
      topTerms = getTopContributingTerms(userVector, jv, 5);
    }

    // Apply excluded role penalty
    if (excludedRoles.length > 0) {
      const jt = (job.title + " " + (job.role_type || "")).toLowerCase();
      if (excludedRoles.some(ex => jt.includes(ex.toLowerCase()))) {
        cosineScore *= 0.3; // heavy penalty
      }
    }

    const structuralBonus = computeStructuralBonus(profileRow, prefRow, job);
    const finalScore = cosineScore * (1 + Math.max(-0.5, structuralBonus));

    return { job, score: finalScore, structuralBonus, topTerms };
  }).sort((a, b) => b.score - a.score);

  // Top candidates for AI
  const candidates = scored.slice(0, Math.min(15, scored.length));
  onStep?.({ type: "scan", label: "语义匹配完成", detail: `${candidates.length} 个候选岗位进入 AI 分析 (Top score: ${candidates[0]?.score.toFixed(3) || "N/A"})` });

  // ── AI Agent rerank or fallback ──
  if (openai && candidates.length > 0) {
    try {
      return await runAgentMatching(profileRow, prefRow, candidates, limit, userId, onStep, options?.chatContext);
    } catch (agentErr) {
      console.error("[Matching] AI agent failed, using TF-IDF fallback:", agentErr);
      onStep?.({ type: "scan", label: "使用 TF-IDF 结果", detail: "AI 暂不可用，返回语义匹配结果" });
    }
  }

  // Fallback: ensure diversity across target roles
  const targetRoles = parseJsonField(prefRow?.target_roles);
  let fallback: MatchResult[];

  if (targetRoles.length > 1 && candidates.length > 0) {
    // Per-role pools: ensure each target role has at least 1 representative
    const rolePools = new Map<string, typeof candidates>();
    for (const role of targetRoles) {
      rolePools.set(role, candidates.filter(c => {
        const jt = (c.job.title + " " + (c.job.role_type || "")).toLowerCase();
        return jt.includes(role.toLowerCase());
      }));
    }

    const diverse: typeof candidates = [];
    const used = new Set<number>();
    // Round-robin: take 1 from each role pool
    const perRole = Math.max(1, Math.floor(limit / targetRoles.length));
    for (const pool of rolePools.values()) {
      const taken = pool.filter(c => !used.has(c.job.id)).slice(0, perRole);
      for (const c of taken) { used.add(c.job.id); diverse.push(c); }
    }
    // Fill remaining from global top
    for (const c of candidates) {
      if (diverse.length >= limit) break;
      if (!used.has(c.job.id)) { used.add(c.job.id); diverse.push(c); }
    }
    fallback = diverse.slice(0, limit).map(s => ({
      jobId: s.job.id,
      score: Math.round(Math.min(0.99, Math.max(0.1, s.score)) * 100) / 100,
      reason: generateFallbackReason(profileRow, prefRow, s.job, s.topTerms),
    }));
  } else {
    fallback = candidates.slice(0, limit).map(s => ({
      jobId: s.job.id,
      score: Math.round(Math.min(0.99, Math.max(0.1, s.score)) * 100) / 100,
      reason: generateFallbackReason(profileRow, prefRow, s.job, s.topTerms),
    }));
  }

  onStep?.({ type: "done", label: "匹配完成", detail: `找到 ${fallback.length} 个推荐岗位（TF-IDF + 结构加分）` });
  const insert = db.prepare("INSERT OR REPLACE INTO matches (user_id, job_id, match_score, match_reason, status) VALUES (?, ?, ?, ?, 'pending')");
  for (const m of fallback) insert.run(userId, m.jobId, m.score, m.reason);
  return fallback;
}
