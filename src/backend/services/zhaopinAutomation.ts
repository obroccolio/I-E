import puppeteer from "puppeteer";
import db from "../db/connection.ts";

export type ZhaopinScrapeStep =
  | { type: "navigating"; label: string; detail: string }
  | { type: "scrolling"; label: string; detail: string }
  | { type: "parsing"; label: string; detail: string }
  | { type: "saving"; label: string; detail: string }
  | { type: "done"; label: string; detail: string }
  | { type: "error"; label: string; detail: string }
  | { type: "progress"; label: string; detail: string; current: number; total: number };

const ZHAOPIN_CITY_MAP: Record<string, string> = {
  "全国": "", "北京": "530", "上海": "538", "广州": "763", "深圳": "765",
  "杭州": "653", "成都": "801", "南京": "635", "武汉": "736", "西安": "854",
  "苏州": "639", "天津": "531", "重庆": "551", "厦门": "593", "长沙": "749",
  "合肥": "625", "郑州": "560", "济南": "567", "青岛": "571", "大连": "577",
  "福州": "583", "东莞": "773", "佛山": "771", "珠海": "767",
};

export function getZhaopinCookies(userId: number): string | null {
  const row = db.prepare("SELECT cookies FROM platform_sessions WHERE user_id = ? AND platform = 'zhaopin'").get(userId) as any;
  return row?.cookies ?? null;
}

export function saveZhaopinCookies(userId: number, cookiesJson: string): void {
  db.prepare(`
    INSERT INTO platform_sessions (user_id, platform, cookies, is_valid, updated_at)
    VALUES (?, 'zhaopin', ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, platform) DO UPDATE SET cookies = excluded.cookies, is_valid = 1, updated_at = CURRENT_TIMESTAMP
  `).run(userId, cookiesJson);
}

function normalizeZhaopinCookies(raw: any[]): any[] {
  return raw.map((c: any) => ({
    name: c.name,
    value: c.value,
    domain: c.domain || ".zhaopin.com",
    path: c.path || "/",
    httpOnly: c.httpOnly ?? false,
    secure: c.secure ?? true,
    sameSite: c.sameSite === "unspecified" || !c.sameSite ? "Lax" : c.sameSite,
  }));
}

export async function checkZhaopinCookieValid(userId: number): Promise<boolean> {
  const cookiesJson = getZhaopinCookies(userId);
  if (!cookiesJson) return false;
  let browser: any = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
    await page.setCookie(...normalizeZhaopinCookies(JSON.parse(cookiesJson)));

    // Navigate to homepage (get_jobs-main approach)
    await page.goto("https://www.zhaopin.com", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await new Promise(r => setTimeout(r, 2000));

    const url = page.url();
    const title = await page.title().catch(() => "");
    console.log("[Zhaopin Check] URL:", url, "| Title:", title);

    // ── get_jobs-main style DOM checks ──
    // 1) 已登录：用户头像 .zp-passport__user--head
    const userHead = await page.$(".zp-passport__user--head");
    if (userHead) {
      console.log("[Zhaopin Check] User head found → VALID");
      db.prepare("UPDATE platform_sessions SET is_valid = ? WHERE user_id = ? AND platform = 'zhaopin'").run(1, userId);
      return true;
    }

    // 2) 未登录：登录/注册按钮 a.home-header__c-no-login
    const loginBtn = await page.$("a.home-header__c-no-login");
    if (loginBtn) {
      const text = await page.evaluate((el: any) => el.textContent || "", loginBtn);
      if (text.includes("登录")) {
        console.log("[Zhaopin Check] Login button found:", text.trim(), "→ INVALID");
        db.prepare("UPDATE platform_sessions SET is_valid = ? WHERE user_id = ? AND platform = 'zhaopin'").run(0, userId);
        return false;
      }
    }

    // 3) Fallbacks
    if (url.includes("passport") || url.includes("login")) {
      console.log("[Zhaopin Check] Redirected to login → INVALID");
      db.prepare("UPDATE platform_sessions SET is_valid = ? WHERE user_id = ? AND platform = 'zhaopin'").run(0, userId);
      return false;
    }

    // 4) No login indicators → assume valid
    console.log("[Zhaopin Check] No login indicators → VALID");
    db.prepare("UPDATE platform_sessions SET is_valid = ? WHERE user_id = ? AND platform = 'zhaopin'").run(1, userId);
    return true;
  } catch (e: any) {
    console.error("[Zhaopin Check] Exception:", e.message);
    return false;
  }
  finally { if (browser) await browser.close().catch(() => {}); }
}

function parseSalary(salaryText: string): { min: number; max: number } {
  if (!salaryText) return { min: 0, max: 0 };
  // "15K-25K" or "1.5万-2.5万" or "15k-25k·15薪"
  const kMatch = salaryText.match(/(\d+)\s*[kK]\s*-\s*(\d+)\s*[kK]/);
  if (kMatch) return { min: Number(kMatch[1]) * 1000, max: Number(kMatch[2]) * 1000 };
  const wanMatch = salaryText.match(/([\d.]+)\s*万\s*-\s*([\d.]+)\s*万/);
  if (wanMatch) return { min: Math.round(Number(wanMatch[1]) * 10000 / 12), max: Math.round(Number(wanMatch[2]) * 10000 / 12) };
  const singleK = salaryText.match(/(\d+)\s*[kK]/);
  if (singleK) return { min: Number(singleK[1]) * 1000, max: Number(singleK[1]) * 1000 };
  return { min: 0, max: 0 };
}

function mapRoleType(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("前端")) return "frontend";
  if (t.includes("后端") || t.includes("java") || t.includes("go") || t.includes("python") || t.includes("c++") || t.includes("全栈") || t.includes(".net") || t.includes("php")) return "backend";
  if (t.includes("算法") || t.includes("nlp") || t.includes("视觉") || t.includes("推荐") || t.includes("模型") || t.includes("ai")) return "algorithm";
  if (t.includes("产品")) return "product";
  if (t.includes("数据") || t.includes("dba")) return "data";
  if (t.includes("测试")) return "qa";
  if (t.includes("运维") || t.includes("devops") || t.includes("sre")) return "devops";
  if (t.includes("安全")) return "security";
  if (t.includes("ios") || t.includes("android")) return "mobile";
  if (t.includes("架构")) return "backend";
  if (t.includes("设计")) return "design";
  if (t.includes("运营")) return "operations";
  if (t.includes("市场")) return "marketing";
  if (t.includes("销售")) return "sales";
  if (t.includes("hr") || t.includes("人事") || t.includes("招聘")) return "hr";
  if (t.includes("财务") || t.includes("会计")) return "finance";
  return "other";
}

function mapIndustry(industryText: string): string {
  const ind = (industryText || "").toLowerCase();
  if (ind.includes("金融") || ind.includes("投资") || ind.includes("支付") || ind.includes("银行")) return "fintech";
  if (ind.includes("咨询") || ind.includes("服务")) return "consulting";
  if (ind.includes("医疗") || ind.includes("制药") || ind.includes("健康")) return "healthcare";
  if (ind.includes("银行")) return "banking";
  return "technology";
}

interface ZhaopinJobItem {
  title: string; company: string; location: string;
  salary_min: number; salary_max: number; salaryText: string;
  description: string; requirements: string; tags: string[];
  industry: string; companySize: string; experience: string; degree: string;
  sourceUrl: string;
}

export async function scrapeZhaopinJobs(
  userId: number,
  keywords: string[],
  cities: string[],
  maxPerKeyword: number,
  onStep: (step: ZhaopinScrapeStep) => void,
): Promise<{ total: number; inserted: number }> {
  const cookiesJson = getZhaopinCookies(userId);
  if (!cookiesJson) {
    onStep({ type: "error", label: "未配置Cookie", detail: "请先在设置粘贴智联招聘Cookie" });
    return { total: 0, inserted: 0 };
  }

  let browser: any = null;
  let totalSaved = 0;
  const allJobs: ZhaopinJobItem[] = [];
  const seenUrls = new Set<string>();

  try {
    onStep({ type: "navigating", label: "启动浏览器", detail: "正在启动Chrome..." });
    browser = await puppeteer.launch({
      headless: true,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled", "--window-size=1280,800"],
    });

    const effectiveCities = cities.length > 0 ? cities : ["上海", "北京", "深圳", "杭州", "成都"];
    const effectiveKeywords = keywords.length > 0 ? keywords : ["前端开发", "后端开发", "Java开发", "算法工程师", "产品经理"];

    for (const city of effectiveCities) {
      const cityCode = ZHAOPIN_CITY_MAP[city] || "";
      if (!cityCode) { onStep({ type: "progress", label: city, detail: "不支持的城市，跳过", current: 0, total: 0 }); continue; }

      for (const keyword of effectiveKeywords) {
        const page = await browser.newPage();
        try {
          await page.setCookie(...normalizeZhaopinCookies(JSON.parse(cookiesJson)));

          const before = allJobs.length;
          onStep({ type: "scrolling", label: `${city} - ${keyword}`, detail: "正在加载岗位列表..." });

          const maxPages = Math.ceil(maxPerKeyword / 15);
          for (let p = 1; p <= maxPages; p++) {
            const url = `https://sou.zhaopin.com/?jl=${cityCode}&kw=${encodeURIComponent(keyword)}&p=${p}`;
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
            await new Promise(r => setTimeout(r, 3000 + Math.random() * 1000));

            // Wait for job cards
            let cards: any[] = [];
            const selectors = [".joblist-box__item", ".positionlist .positionItem", "[class*='joblist'] [class*='item']"];
            for (const sel of selectors) {
              try { await page.waitForSelector(sel, { timeout: 6000 }); } catch { continue; }
              cards = await page.$$(sel);
              if (cards.length > 0) break;
            }
            if (cards.length === 0) break;

            for (const card of cards) {
              try {
                // Title
                let title = "";
                const titleEl = await card.$("a.jobinfo__name, [class*='jobname'] span, [class*='job-name'], a[href*='/job/']");
                if (titleEl) title = (await titleEl.evaluate((el: any) => el.textContent || "")).trim();

                // Company
                let company = "";
                const companyEl = await card.$("a.companyinfo__name, [class*='compname'] span, [class*='company-name']");
                if (companyEl) company = (await companyEl.evaluate((el: any) => el.textContent || "")).trim();

                // Salary
                let salaryText = "";
                const salaryEl = await card.$(".jobinfo__salary, [class*='salary'], p[class*='salary']");
                if (salaryEl) salaryText = (await salaryEl.evaluate((el: any) => el.textContent || "")).trim();

                // Location
                let location = "";
                const locEl = await card.$(".jobinfo__other-info, [class*='location'], [class*='city'], [class*='jobdesc'] li");
                if (locEl) {
                  location = (await locEl.evaluate((el: any) => el.textContent || "")).trim();
                  if (location && location.includes("·")) location = location.split("·")[0].trim();
                }

                // URL
                const linkEl = await card.$("a[href*='/job/'], a.jobinfo__name");
                let rawUrl = "";
                if (linkEl) rawUrl = await linkEl.evaluate((el: any) => el.getAttribute("href") || "");
                if (rawUrl && rawUrl.startsWith("//")) rawUrl = "https:" + rawUrl;
                if (rawUrl && !rawUrl.startsWith("http")) rawUrl = "https://www.zhaopin.com" + rawUrl;
                const sourceUrl = rawUrl.split("?")[0];

                if (!title || !company || !sourceUrl) continue;
                if (seenUrls.has(sourceUrl)) continue;
                seenUrls.add(sourceUrl);

                const salary = parseSalary(salaryText);

                allJobs.push({
                  title, company, location: location || city,
                  salary_min: salary.min, salary_max: salary.max, salaryText,
                  description: "", requirements: "", tags: [],
                  industry: "", companySize: "", experience: "", degree: "",
                  sourceUrl,
                });
              } catch { continue; }
            }

            // Check if next page
            const nextBtn = await page.$(".soupager__btn:not(.soupager__btn--disable)");
            if (!nextBtn) break;
            await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
          }

          const newCount = allJobs.length - before;
          onStep({ type: "parsing", label: `${city} - ${keyword} 完成`, detail: `新增 ${newCount} 条（累计 ${allJobs.length} 条）` });
        } finally {
          await page.close().catch(() => {});
        }
      }
    }

    // ── 保存到数据库 ──
    onStep({ type: "saving", label: "保存岗位数据", detail: `共 ${allJobs.length} 条待入库` });
    const insert = db.prepare(`
      INSERT OR IGNORE INTO jobs (source, source_url, title, company, location, description, requirements, responsibilities, salary_min, salary_max, salary_currency, deadline, job_type, industry, role_type, seniority, tags, status)
      VALUES ('zhaopin', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CNY', ?, 'full-time', ?, ?, 'mid', ?, 'active')
    `);

    const insertAll = db.transaction((items: ZhaopinJobItem[]) => {
      for (const item of items) {
        if (!item.title || !item.company) continue;
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 30 + Math.floor(Math.random() * 30));
        const roleType = mapRoleType(item.title);
        const industry = mapIndustry(item.industry);
        const allTags = [...item.tags];
        if (item.experience) allTags.push(item.experience);
        if (item.degree) allTags.push(item.degree);

        insert.run(
          item.sourceUrl, item.title, item.company, item.location,
          item.description, item.description,
          item.salary_min, item.salary_max,
          deadline.toISOString().split("T")[0],
          industry, roleType, JSON.stringify(allTags),
        );
        totalSaved++;
      }
    });

    insertAll(allJobs);
    onStep({ type: "done", label: "爬取完成", detail: `成功导入 ${totalSaved} 条岗位（${allJobs.length} 条采集，${allJobs.length - totalSaved} 条重复跳过）` });
    return { total: allJobs.length, inserted: totalSaved };
  } catch (e: any) {
    onStep({ type: "error", label: "爬取异常", detail: e.message || "未知错误" });
    return { total: allJobs.length, inserted: totalSaved };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
