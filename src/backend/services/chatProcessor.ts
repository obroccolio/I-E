/**
 * Extract preference updates from chat messages.
 * Primary: LLM-based extraction. Fallback: keyword heuristics.
 */

import { openai } from "./openaiClient.ts";
import { ENV } from "../config/env.ts";

const LLM_EXTRACT_PROMPT = `从用户的对话消息中提取求职偏好变动，返回JSON。

用户消息: {message}

已有偏好:
- 目标岗位: {target_roles}
- 目标行业: {target_industries}
- 目标城市: {target_locations}
- 排除岗位: {excluded_roles}
- 排除城市: {excluded_locations}

规则:
- 如果用户表达了新的目标岗位（如"帮我找全栈""看看前端开发""检索一下数据分析师"），填到 target_roles_add（新增）和 target_roles_replace（替换）。注意区分：说"也帮我找X"是新增，"我不做嵌入了改做全栈"是替换
- 如果用户表达了目标城市变动，填到 target_locations_add / target_locations_replace
- 如果用户表达了排除条件（"不看销售""不要996""排除北京"），填到 excluded_roles_add / excluded_locations_add
- 如果你不确定用户的意图，宁可留空也不要瞎填
- 返回纯JSON，不要markdown：

{
  "target_roles_add": [],
  "target_roles_replace": null,
  "target_locations_add": [],
  "target_locations_replace": null,
  "target_industries_add": [],
  "excluded_roles_add": [],
  "excluded_locations_add": [],
  "salary_min": null,
  "salary_max": null,
  "notes": "一句话总结用户意图，如果没有变化填'无变化'"
}`;

export interface PreferenceDeltas {
  target_roles_add?: string[];
  target_roles_replace?: string[] | null;
  target_locations_add?: string[];
  target_locations_replace?: string[] | null;
  target_industries_add?: string[];
  excluded_roles_add?: string[];
  excluded_locations_add?: string[];
  salary_min?: number | null;
  salary_max?: number | null;
  notes?: string;
}

export async function extractPreferenceUpdatesLLM(
  message: string,
  existingPrefs: Record<string, any>,
): Promise<PreferenceDeltas | null> {
  if (!openai) return null;

  const prompt = LLM_EXTRACT_PROMPT
    .replace("{message}", message)
    .replace("{target_roles}", String(existingPrefs?.target_roles || "无"))
    .replace("{target_industries}", String(existingPrefs?.target_industries || "无"))
    .replace("{target_locations}", String(existingPrefs?.target_locations || "无"))
    .replace("{excluded_roles}", String(existingPrefs?.excluded_roles || "无"))
    .replace("{excluded_locations}", String(existingPrefs?.excluded_locations || "无"));

  try {
    const resp = await openai.chat.completions.create({
      model: ENV.OPENAI_MATCHING_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
    });

    const text = (resp.choices[0]?.message?.content || "").trim();
    const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const result = JSON.parse(jsonMatch[0]) as PreferenceDeltas;
    if (result.notes === "无变化" && !result.target_roles_add?.length && !result.target_roles_replace) return null;
    return result;
  } catch (e: any) {
    console.error("[LLM Extract] Failed:", e.message);
    return null;
  }
}

/** Apply LLM-extracted deltas to produce the final updates Record. */
export function applyDeltas(
  deltas: PreferenceDeltas,
  existingPrefs: Record<string, any> | null,
): Record<string, any> {
  const updates: Record<string, any> = {};

  // Helper to parse existing JSON array fields
  const parse = (v: any): string[] => {
    if (!v) return [];
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  };

  // target_roles
  if (deltas.target_roles_replace !== undefined && deltas.target_roles_replace !== null) {
    updates.target_roles = deltas.target_roles_replace;
  } else if (deltas.target_roles_add?.length) {
    const current = parse(existingPrefs?.target_roles);
    updates.target_roles = [...new Set([...current, ...deltas.target_roles_add])];
  }

  // target_locations
  if (deltas.target_locations_replace !== undefined && deltas.target_locations_replace !== null) {
    updates.target_locations = deltas.target_locations_replace;
  } else if (deltas.target_locations_add?.length) {
    const current = parse(existingPrefs?.target_locations);
    updates.target_locations = [...new Set([...current, ...deltas.target_locations_add])];
  }

  // target_industries
  if (deltas.target_industries_add?.length) {
    const current = parse(existingPrefs?.target_industries);
    updates.target_industries = [...new Set([...current, ...deltas.target_industries_add])];
  }

  // excluded_roles
  if (deltas.excluded_roles_add?.length) {
    const current = parse(existingPrefs?.excluded_roles);
    updates.excluded_roles = [...new Set([...current, ...deltas.excluded_roles_add])];
  }

  // excluded_locations
  if (deltas.excluded_locations_add?.length) {
    const current = parse(existingPrefs?.excluded_locations);
    updates.excluded_locations = [...new Set([...current, ...deltas.excluded_locations_add])];
  }

  // salary
  if (deltas.salary_min != null) updates.salary_min = deltas.salary_min;
  if (deltas.salary_max != null) updates.salary_max = deltas.salary_max;

  return updates;
}

// ═══════════════════════════════════════════════
// Regex-based extraction (fallback)
// ═══════════════════════════════════════════════
export function extractPreferenceUpdates(message: string): Record<string, any> | undefined {
  const text = message.toLowerCase();
  const updates: Record<string, any> = {};

  const KNOWN_CITIES = ["北京", "上海", "深圳", "广州", "杭州", "成都", "南京", "武汉", "苏州", "天津", "重庆", "西安", "长沙", "郑州", "青岛", "大连", "宁波", "厦门", "珠海", "合肥", "济南", "福州", "昆明", "贵阳", "海口", "三亚", "东莞", "佛山", "无锡", "常州", "哈尔滨", "沈阳", "长春"];

  // Excluded roles: "不看销售" / "对运营不感兴趣" / "exclude marketing"
  if (text.includes("不看") || text.includes("不感兴趣") || text.includes("exclude")) {
    const match = text.match(/(?:不看|不感兴趣|exclude)\s*(.+)/);
    if (match) {
      updates.excluded_roles = match[1].split(/[,，、]/).map(s => s.trim()).filter(Boolean);
    }
  }

  // Excluded locations: "不想在深圳" / "不要北京的" / "排除上海" / "不想去杭州"
  const negativeLocationPatterns = [
    /不想[在去]?\s*([一-鿿]{2,4})/,
    /不要\s*([一-鿿]{2,4})\s*(?:的|工作|岗位|职位)?/,
    /(?:排除|避开|去掉)\s*([一-鿿]{2,4})/,
    /不想去\s*([一-鿿]{2,4})/,
  ];
  const excludedLocations: string[] = [];
  for (const pat of negativeLocationPatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      const city = match[1].replace(/的|工作|岗位|职位|就业|发展$/g, "").trim();
      if (city.length >= 2 && KNOWN_CITIES.includes(city)) excludedLocations.push(city);
    }
  }
  if (excludedLocations.length > 0) {
    updates.excluded_locations = excludedLocations;
  }

  // ── Target role extraction (rewritten for natural Chinese patterns) ──

  // Common role suffix keywords for anchor-based extraction
  const ROLE_SUFFIX = "(?:工程师|开发工程师|开发|设计师|分析师|经理|专员|架构师|科学家|顾问|运营|编辑|策划|助理|代表|销售|客服|主管|总监|实习生|培训生|管培生)";
  const ROLE_SUFFIX_LOOSE = "(?:岗位|职位|工作|方向|领域|机会)";

  const extractedRoles: string[] = [];

  // Pattern group 1: Explicit search commands with flexible filler
  // "帮我检索一下适合我的全栈工程师岗位" → "全栈工程师"
  // "帮我找找前端开发的职位" → "前端开发"
  // "搜索数据分析师" → "数据分析师"
  const searchVerb = "(?:检索一下|搜索一下|帮我检索一下|帮我搜索一下|帮我找一下|帮我看看|帮我找|帮我检索|帮我搜索|检索|搜索|找一下|找|推荐一下|推荐)";
  const filler = "(?:一下)?(?:适合我的|适合我|有没有|有什么|一些|一些关于|关于|的|一些?适合我的)?";
  const roleCapture = `([一-鿿a-zA-Z+]{2,20}${ROLE_SUFFIX})`;
  const roleCaptureLoose = `([一-鿿a-zA-Z+]{2,15})${ROLE_SUFFIX_LOOSE}`;

  const searchPatterns = [
    new RegExp(searchVerb + filler + roleCapture),
    new RegExp(searchVerb + filler + roleCaptureLoose),
    // "来看一下全栈工程师" / "看看全栈"
    /(?:看看|看一下|看下|瞧瞧)\s*([一-鿿a-zA-Z+]{2,20}(?:工程师|开发|设计师|分析师|经理|专员|架构师|科学家|顾问))/,
    // "有没有全栈工程师" / "有全栈开发的岗位吗"
    /(?:有没有|有什么|有)\s*([一-鿿a-zA-Z+]{2,20}(?:工程师|开发|设计师|分析师|经理|专员|架构师|科学家|顾问))/,
  ];

  for (const pat of searchPatterns) {
    const match = text.match(pat);
    if (match) {
      let role = match[1].replace(/岗位|职位|工作$/g, "").trim();
      // Clean up filler/verb leftovers from loose patterns
      role = role.replace(/^(?:找|找一下|找找|检索|搜索|推荐|看看|几个|一些|一下|适合我|适合我的|有没有|有什么|关于)的?/i, "").trim();
      if (role.length >= 2) {
        extractedRoles.push(role);
        break;
      }
    }
  }

  // Pattern group 2: "想看前端" / "想做全栈" / "想转全栈" / "prefer backend"
  if (extractedRoles.length === 0 && /(?:想看|想做|想转|想找|想投|想面|prefer|关注)/i.test(text)) {
    const match = text.match(/(?:想看|想做|想转|想找|想投|想面|prefer|关注)\s*(.+)/i);
    if (match) {
      const roles = match[1].split(/[,，、和及与或]/).map(s => s.replace(/岗位|职位|工作|方向$/g, "").trim()).filter(Boolean);
      extractedRoles.push(...roles);
    }
  }

  // Pattern group 2.5: "X之外也看看Y" / "除了X也搜索Y"
  if (extractedRoles.length === 0) {
    const asidePat = /(?:之外|以外|除了[^,，。.!！?？]{0,10})(?:也|还|再)?\s*(?:看看|看下|检索|搜索|找|找找)\s*(.+)/;
    const m = text.match(asidePat);
    if (m) {
      const rest = m[1].replace(/岗位|职位|工作$/g, "").trim();
      if (rest.length >= 2 && rest.length < 30) {
        extractedRoles.push(rest);
      }
    }
  }

  // Pattern group 3: Standalone role mentions without explicit search verbs
  // "全栈工程师的岗位也帮我看看" / "嵌入式之外也看看全栈" / "顺便也看下前端开发"
  if (extractedRoles.length === 0) {
    // Look for known role patterns anywhere in the text
    const looseRolePat = new RegExp(`([一-鿿a-zA-Z+]{2,20}${ROLE_SUFFIX})`, "g");
    let m;
    const found: string[] = [];
    while ((m = looseRolePat.exec(text)) !== null) {
      const r = m[1].replace(/岗位|职位|工作$/g, "").trim();
      if (r.length >= 3 && !found.includes(r)) found.push(r);
    }
    // Only use if we found at least one and the message has intent signals
    if (found.length > 0 && /(?:也|还|另外|顺便|同时|除了|之外|以外|再看|也看|也想|还要|以及|和|帮我)/.test(text)) {
      extractedRoles.push(...found);
    }
  }

  // Pattern group 4: "换个方向" / "试试全栈"
  if (extractedRoles.length === 0) {
    const tryPat = /(?:试试|尝试|换个|换到|转向|转做|改做)\s*([一-鿿a-zA-Z+]{2,20}(?:工程师|开发|设计师|分析师|经理|专员|架构师|科学家|顾问|方向)?)/;
    const m = text.match(tryPat);
    if (m) {
      let role = m[1].replace(/方向$/g, "").trim();
      if (role.length >= 2) extractedRoles.push(role);
    }
  }

  if (extractedRoles.length > 0) {
    updates.target_roles = extractedRoles;
  }

  // Target industries: "想进金融行业" / "想进入互联网行业" / "industry finance"
  if (text.includes("行业") || text.includes("industry")) {
    const match = text.match(/(?:想进|想进入|industry)\s*([\w一-鿿]+)/);
    if (match) {
      const cleaned = match[1].replace(/行业$/, "").trim();
      if (cleaned) {
        updates.target_industries = [cleaned];
      }
    }
  }

  // Target locations — expanded to match many Chinese location patterns
  const COASTAL_CITIES = ["上海", "深圳", "广州", "杭州", "宁波", "厦门", "青岛", "大连", "天津", "珠海", "苏州", "南京"];
  const locationPatterns = [
    // "想去上海" / "prefer Shanghai"
    { regex: /(?:想去|prefer)\s*([一-鿿]{2,4}|[a-z]+)/i, group: 1, strip: /工作|就业|发展$/ },
    // "想要沿海城市(的工作)"
    { regex: /沿海城市/, group: -1, strip: null, cities: COASTAL_CITIES },
    // "在/去/到 上海/北京 工作"
    { regex: /[在去到]\s*([一-鿿]{2,4})\s*工作/, group: 1, strip: null },
    // "上海的工作" / "北京的工作"
    { regex: /([一-鿿]{2,4})的?(?:工作|岗位|职位)/, group: 1, strip: null },
    // "工作地点在上海" / "地点北京"
    { regex: /(?:工作)?地点[在是]?\s*([一-鿿]{2,4})/, group: 1, strip: null },
    // "切换到深圳" / "换成杭州"
    { regex: /(?:切换到?|换成?)\s*([一-鿿]{2,4})/, group: 1, strip: null },
  ];

  for (const pat of locationPatterns) {
    if (pat.cities) {
      const match = text.match(pat.regex);
      if (match) {
        updates.target_locations = pat.cities;
        break;
      }
    } else {
      const match = text.match(pat.regex);
      if (match && match[pat.group]) {
        let city = match[pat.group].trim();
        if (pat.strip) city = city.replace(pat.strip, "").trim();
        // Validate against known cities to avoid false positives like "那就没有"
        if (city.length >= 2 && KNOWN_CITIES.includes(city)) {
          updates.target_locations = [city];
          break;
        }
      }
    }
  }

  // Salary: "薪资8000-15000" / "salary 8000 to 15000"
  if (text.includes("薪资") || text.includes("salary") || text.includes("工资")) {
    const nums = text.match(/\d{1,6}/g)
      ?.map(Number)
      .filter(n => n > 1000 && n < 1000000) ?? [];
    if (nums.length >= 2) {
      updates.salary_min = Math.min(...nums);
      updates.salary_max = Math.max(...nums);
    }
  }

  return Object.keys(updates).length > 0 ? updates : undefined;
}
