import db from "../db/connection.ts";
import { openai } from "./openaiClient.ts";
import { ENV } from "../config/env.ts";

const DEDUP_PROMPT = `分析以下同一公司的岗位列表，判断哪些是同一个职位在不同平台或不同时间的重复发布。

公司: {company}

岗位列表:
{jobs_json}

判断标准:
1. 职位名称相似（如"高级运营经理"和"运营经理(高级)"可能是同一职位）
2. 职责描述内容高度重叠
3. 薪资范围基本一致
4. 工作地点相同

注意：
- 只合并确实是同一职位的不同发布
- 不同级别的职位应保持独立（如"总监"和"经理"）
- 不同方向的职位应保持独立（如"前端开发"和"后端开发"）

请返回JSON格式:
{
  "groups": [
    {
      "representative_id": "保留的主岗位ID（选择信息最完整的）",
      "duplicate_ids": ["重复岗位ID1", "重复岗位ID2"],
      "reason": "合并理由"
    }
  ],
  "standalone_ids": ["未被合并的独立岗位ID列表"]
}

只返回JSON，不要其他内容。`;

interface DedupGroup {
  representative_id: string;
  duplicate_ids: string[];
  reason: string;
  group_id?: string;
}

interface DedupResult {
  groups: DedupGroup[];
  standalone_ids: string[];
}

function hashGroupId(representativeId: string): string {
  let hash = 0;
  for (let i = 0; i < representativeId.length; i++) {
    const chr = representativeId.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return "grp_" + Math.abs(hash).toString(16).padStart(8, "0");
}

/** Find companies that have multiple jobs without a group_id — candidates for dedup. */
export function findDuplicateCandidates() {
  const rows = db.prepare(`
    SELECT company, COUNT(*) as cnt
    FROM jobs
    WHERE group_id IS NULL AND status = 'active'
    GROUP BY company
    HAVING cnt > 1
    ORDER BY cnt DESC
    LIMIT 50
  `).all() as { company: string; cnt: number }[];
  return rows;
}

/** Run LLM dedup for a single company. Returns the parsed dedup result. */
export async function runLlmDedup(company: string): Promise<DedupResult | null> {
  const jobs = db.prepare(`
    SELECT id, platform, title, company, location, salary_min, salary_max, description, source_url
    FROM jobs
    WHERE company = ? AND group_id IS NULL AND status = 'active'
  `).all(company) as any[];

  if (jobs.length < 2) return null;

  const jobsForPrompt = jobs.map((j) => ({
    id: j.id,
    title: j.title,
    platform: j.platform,
    location: j.location,
    salary: j.salary_min ? `${j.salary_min / 1000}K-${j.salary_max ? j.salary_max / 1000 + "K" : "?"}` : "未知",
    description: (j.description || "").slice(0, 200),
  }));

  if (!openai) {
    console.log("[Dedup] OpenAI not available, skipping LLM dedup for:", company);
    return null;
  }

  const prompt = DEDUP_PROMPT.replace("{company}", company).replace("{jobs_json}", JSON.stringify(jobsForPrompt, null, 2));

  try {
    const resp = await openai.chat.completions.create({
      model: ENV.OPENAI_MATCHING_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
    });

    const text = (resp.choices[0]?.message?.content || "").trim();
    const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Dedup] LLM returned non-JSON:", text.slice(0, 200));
      return null;
    }

    return JSON.parse(jsonMatch[0]) as DedupResult;
  } catch (e: any) {
    console.error("[Dedup] LLM dedup failed for", company, ":", e.message);
    return null;
  }
}

/** Apply a dedup result to the database. */
export function applyDedupResult(company: string, result: DedupResult): number {
  let updated = 0;
  const updateStmt = db.prepare("UPDATE jobs SET group_id = ? WHERE id = ? AND group_id IS NULL");

  const applyAll = db.transaction(() => {
    for (const group of result.groups) {
      const groupId = group.group_id || hashGroupId(group.representative_id);
      const allIds = [group.representative_id, ...group.duplicate_ids];
      for (const id of allIds) {
        const info = updateStmt.run(groupId, id);
        updated += info.changes;
      }
    }
    // Standalone jobs get their own unique group_id
    for (const id of result.standalone_ids) {
      const ownGroup = "grp_" + id.toString().padStart(8, "0");
      const info = updateStmt.run(ownGroup, id);
      updated += info.changes;
    }
  });

  applyAll();
  console.log(`[Dedup] ${company}: ${result.groups.length} groups, ${updated} jobs updated`);
  return updated;
}

/** Run dedup for a specific company (one-shot). */
export async function dedupCompany(company: string): Promise<number> {
  const result = await runLlmDedup(company);
  if (!result) return 0;
  return applyDedupResult(company, result);
}

/** Run dedup for all companies with potential duplicates. */
export async function dedupAll(onProgress?: (msg: string) => void): Promise<{ companies: number; jobsUpdated: number }> {
  const candidates = findDuplicateCandidates();
  let jobsUpdated = 0;

  onProgress?.(`找到 ${candidates.length} 个有重复岗位的公司`);

  for (let i = 0; i < candidates.length; i++) {
    const { company, cnt } = candidates[i];
    onProgress?.(`[${i + 1}/${candidates.length}] 处理 ${company} (${cnt} 个岗位)...`);
    try {
      const updated = await dedupCompany(company);
      jobsUpdated += updated;
    } catch (e: any) {
      onProgress?.(`  ${company} 处理失败: ${e.message}`);
    }
  }

  onProgress?.(`去重完成: ${candidates.length} 家公司, ${jobsUpdated} 个岗位已分组`);
  return { companies: candidates.length, jobsUpdated };
}
