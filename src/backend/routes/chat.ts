import { Router } from "express";
import db from "../db/connection.ts";
import { openai } from "../services/openaiClient.ts";
import { ENV } from "../config/env.ts";
import { AppError } from "../utils/AppError.ts";
import { extractPreferenceUpdates, extractPreferenceUpdatesLLM, applyDeltas } from "../services/chatProcessor.ts";

const router = Router();

const ARRAY_PREF_FIELDS = ["target_roles", "excluded_roles", "target_industries", "target_locations", "excluded_locations"];

function parseArrayField(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [String(value)];
  } catch {
    return value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  }
}

function mergePreferences(userId: number, updates: Record<string, any>) {
  const existing = db.prepare("SELECT * FROM preferences WHERE user_id = ?").get(userId) as any;

  for (const field of ARRAY_PREF_FIELDS) {
    if (!updates[field]) continue;
    // For target_locations, REPLACE (not merge) — user says "切换到深圳" means they want ONLY 深圳
    if (field === "target_locations") {
      updates[field] = JSON.stringify(updates[field]);
      continue;
    }
    const current = parseArrayField(existing?.[field]);
    const merged = [...new Set([...current, ...updates[field]])];
    updates[field] = JSON.stringify(merged);
  }

  if (existing) {
    const setClauses: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && value !== null) {
        setClauses.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (setClauses.length > 0) {
      setClauses.push("updated_at = CURRENT_TIMESTAMP");
      db.prepare(`UPDATE preferences SET ${setClauses.join(", ")} WHERE user_id = ?`).run(...values, userId);
    }
  } else {
    db.prepare(`
      INSERT INTO preferences (user_id, target_roles, target_industries, target_locations,
        excluded_roles, salary_min, salary_max, company_size, other_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      updates.target_roles ?? null,
      updates.target_industries ?? null,
      updates.target_locations ?? null,
      updates.excluded_roles ?? null,
      updates.salary_min ?? null,
      updates.salary_max ?? null,
      null, null
    );
  }
}

function shouldRecommendJobs(message: string): boolean {
  const text = message.toLowerCase();
  const patterns = [
    "推荐", "工作", "岗位", "职位", "有什么", "适合我",
    "recommend", "jobs", "find me", "suggest", "match",
    "看看", "有没有", "帮我找", "找工作", "求职"
  ];
  return patterns.some(p => text.includes(p));
}

function queryJobsFromMatches(userId: number, matches: { jobId: number }[]): any[] {
  const jobIds = matches.map(m => m.jobId);
  const placeholders = jobIds.map(() => "?").join(",");
  return db.prepare(
    `SELECT m.id as match_id, m.match_score, m.match_reason,
       j.id as job_id, j.title, j.company, j.location,
       j.requirements, j.responsibilities, j.salary_min, j.salary_max,
       j.deadline, j.source_url
     FROM matches m JOIN jobs j ON m.job_id = j.id
     WHERE m.user_id = ? AND j.id IN (${placeholders})
     ORDER BY m.match_score DESC`
  ).all(userId, ...jobIds) as any[];
}

router.get("/", (req, res, next) => {
  try {
    const userId = (req as any).user.id;
    const rows = db.prepare(
      `SELECT role, content, created_at FROM conversations
       WHERE user_id = ? ORDER BY created_at ASC`
    ).all(userId);

    // Also return current pending matches so frontend can render job cards
    const pendingMatches = db.prepare(
      `SELECT m.id as match_id, m.match_score, m.match_reason,
         j.id as job_id, j.title, j.company, j.location,
         j.requirements, j.responsibilities, j.salary_min, j.salary_max,
         j.deadline, j.source_url
       FROM matches m JOIN jobs j ON m.job_id = j.id
       WHERE m.user_id = ? AND m.status = 'pending'
       ORDER BY m.match_score DESC LIMIT 5`
    ).all(userId) as any[];

    res.json({ messages: rows, pendingMatches });
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const userId = (req as any).user.id;
    const { message } = req.body;
    if (!message) {
      throw new AppError("chat.missing_message", 400);
    }

    const history = db.prepare(
      `SELECT role, content FROM (
        SELECT role, content, created_at FROM conversations
        WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
      ) ORDER BY created_at ASC`
    ).all(userId) as any[];

    const context = history
      .filter(h => !h.content.startsWith("[AI") && !h.content.startsWith("[AI temporarily"))
      .map(h => ({ role: h.role, content: h.content }));

    // Detect intent: LLM first, regex fallback
    const existingPrefs = db.prepare("SELECT * FROM preferences WHERE user_id = ?").get(userId) as any;
    const llmDeltas = await extractPreferenceUpdatesLLM(message, existingPrefs || {});
    let prefUpdates: Record<string, any> | undefined;

    if (llmDeltas) {
      prefUpdates = applyDeltas(llmDeltas, existingPrefs || null);
      console.log("[Chat] LLM extracted prefs:", JSON.stringify(prefUpdates));
    } else {
      // Fallback to regex
      prefUpdates = extractPreferenceUpdates(message);
      if (prefUpdates) console.log("[Chat] Regex extracted prefs:", JSON.stringify(prefUpdates));
    }

    // Save preference updates
    if (prefUpdates && Object.keys(prefUpdates).length > 0) {
      try { mergePreferences(userId, prefUpdates); } catch (e) { console.error("[Chat] Pref merge:", e); }
    }

    // Load existing matches for LLM context — just read DB, don't trigger matching
    let recommendations: any[] | undefined;
    try {
      const existingMatches = db.prepare(
        `SELECT m.id as match_id, m.match_score, m.match_reason, j.id as job_id, j.title, j.company, j.location
         FROM matches m JOIN jobs j ON m.job_id = j.id
         WHERE m.user_id = ? AND m.status = 'pending'
         ORDER BY m.match_score DESC LIMIT 10`
      ).all(userId) as any[];
      if (existingMatches.length > 0) recommendations = existingMatches;
    } catch (e) { console.error("[Chat] Match lookup error:", e); }

    // Build system prompt — inject real job data, rejected jobs, and matching discipline
    let systemPrompt = `# Role
你是一位顶级的 AI 求职匹配专家（Jobro），帮助用户通过自然对话优化求职偏好并匹配岗位。

# 核心纪律
1. 【最高优先级 - 绝对否决权】：用户在当前对话中提出的任何硬性条件（城市、薪资、技术栈、排除类型等），必须严格遵守。候选人明确排除的职位/地点绝对不要推荐。
2. 【次级优先级】：在满足硬性条件后，再根据用户简历画像进行技能和经验的语义匹配。
3. 用户当前要求与简历冲突时，**100% 以本次要求为准**。

# 对话规则
- Your reply must ONLY describe the jobs listed below. Do NOT mention or describe any job that is not in the list.
- Never claim you are offline or unavailable — you are currently active and ready to help.
- 用户将在下方看到岗位卡片，你只需要简要解释为什么这些岗位匹配TA的偏好。
- 如果当前没有匹配项，坦诚告知并建议放宽条件，**绝对禁止**为了凑数推荐不合规岗位。`;

    // Add rejected jobs context so AI knows user's dislikes
    const rejectedJobs = db.prepare(
      `SELECT j.title, j.company FROM matches m JOIN jobs j ON m.job_id = j.id
       WHERE m.user_id = ? AND m.status = 'rejected' ORDER BY m.created_at DESC LIMIT 10`
    ).all(userId) as any[];
    if (rejectedJobs.length > 0) {
      const rejectedList = rejectedJobs.map((j: any) => `${j.title} @ ${j.company}`).join(", ");
      systemPrompt += `\n\n用户已标记不感兴趣的职位：${rejectedList}。请记住这些偏好，不要再推荐类似的职位。`;
    }

    if (recommendations && recommendations.length > 0) {
      const jobList = recommendations.map((j: any, i: number) =>
        `${i + 1}. [ID:${j.job_id}] ${j.title} @ ${j.company} (${j.location}) - 匹配度${Math.round((j.match_score ?? 0.5) * 100)}%`
      ).join("\n");
      systemPrompt += `\n\n以下是从系统工作库中为该用户匹配的真实职位（仅限这些）：\n${jobList}\n请仅基于上面列表中的职位回复。绝对不要编造或提及不在列表中的职位。用户在下方会看到对应的推荐卡片，你只需简要概括即可。`;
    } else if (prefUpdates) {
      // User updated preferences but no matches yet — tell AI to acknowledge without listing fake jobs
      systemPrompt += `\n\n用户刚更新了偏好，系统正在为其匹配新岗位。请确认偏好已更新，告诉用户稍后即可看到匹配结果。不要编造任何职位。`;
    }

    let reply = "";
    if (openai) {
      try {
        const messages = [
          { role: "system" as const, content: systemPrompt },
          ...context.map(c => ({ role: c.role as "user" | "assistant", content: c.content })),
          { role: "user" as const, content: message },
        ];
        const response = await openai.chat.completions.create({
          model: ENV.OPENAI_MATCHING_MODEL,
          messages,
        });
        const raw = response.choices[0]?.message?.content || "";
        reply = raw
          .replace(/<think>[\s\S]*?<\/think>/g, "")
          .replace(/<think>[\s\S]*$/g, "")
          .replace(/^\s*<\/think>\s*/gm, "")
          .trim();
        if (!reply) {
          if (recommendations && recommendations.length > 0) {
            reply = `根据您的偏好，我为您筛选了 ${recommendations.length} 个匹配岗位，请查看下方推荐卡片。`;
          } else {
            reply = "好的，已记录您的偏好。您还可以告诉我更多求职需求，我会为您精准匹配。";
          }
        }
      } catch (aiErr: any) {
        console.error("[Chat] AI error:", aiErr.message || aiErr);
        reply = `[AI temporarily unavailable] ${aiErr.message || "Please try again later."}`;
      }
    } else {
      reply = "[AI is offline] Understood. I'll note your preference when AI is back.";
    }

    const insert = db.prepare("INSERT INTO conversations (user_id, role, content) VALUES (?, ?, ?)");
    insert.run(userId, "user", message);
    insert.run(userId, "assistant", reply);

    res.json({
      reply,
      user_id: userId,
      recommendations: undefined,
      // Pass user's message and extracted prefs back so frontend can feed them to matching
      userMessage: message,
      prefUpdates: prefUpdates || null,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
