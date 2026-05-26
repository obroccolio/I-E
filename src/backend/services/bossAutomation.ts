import puppeteer from "puppeteer";
import db from "../db/connection.ts";

/** Normalize EditThisCookie export to the fields Puppeteer's setCookie accepts. */
function normalizeCookies(raw: any[]): any[] {
  return raw.map((c: any) => ({
    name: c.name,
    value: c.value,
    domain: c.domain || ".zhipin.com",
    path: c.path || "/",
    httpOnly: c.httpOnly ?? false,
    secure: c.secure ?? true,
    sameSite: c.sameSite === "unspecified" || !c.sameSite ? "Lax" : c.sameSite,
  }));
}

export type GreetStep =
  | { type: "navigating"; label: string; detail: string }
  | { type: "login_check"; label: string; detail: string }
  | { type: "searching"; label: string; detail: string }
  | { type: "opening_chat"; label: string; detail: string }
  | { type: "sending"; label: string; detail: string }
  | { type: "done"; label: string; detail: string }
  | { type: "error"; label: string; detail: string }
  | { type: "captcha"; label: string; detail: string };

export type ScrapeStep =
  | { type: "navigating"; label: string; detail: string }
  | { type: "scrolling"; label: string; detail: string }
  | { type: "parsing"; label: string; detail: string }
  | { type: "saving"; label: string; detail: string }
  | { type: "done"; label: string; detail: string }
  | { type: "error"; label: string; detail: string }
  | { type: "progress"; label: string; detail: string; current: number; total: number };

export interface GreetResult {
  success: boolean;
  message: string;
  steps: GreetStep[];
}

/**
 * Get stored Boss cookies for a user.
 */
export function getCookies(userId: number): string | null {
  const row = db.prepare("SELECT cookies, is_valid FROM platform_sessions WHERE user_id = ? AND platform = 'boss'").get(userId) as any;
  if (!row || !row.cookies) return null;
  return row.is_valid ? row.cookies : null;
}

/**
 * Save Boss cookies for a user.
 */
export function saveCookies(userId: number, cookiesJson: string): void {
  db.prepare(`
    INSERT INTO platform_sessions (user_id, platform, cookies, is_valid, updated_at)
    VALUES (?, 'boss', ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, platform) DO UPDATE SET cookies = excluded.cookies, is_valid = 1, updated_at = CURRENT_TIMESTAMP
  `).run(userId, cookiesJson);
}

/**
 * Get greeting template for a user.
 */
export function getGreetingTemplate(userId: number): string {
  const row = db.prepare("SELECT greeting_template FROM boss_greet_settings WHERE user_id = ?").get(userId) as any;
  return row?.greeting_template ?? "您好，我对{jobName}岗位很感兴趣，希望可以进一步沟通。";
}

/**
 * Save greeting template for a user.
 */
export function saveGreetingTemplate(userId: number, template: string): void {
  db.prepare(`
    INSERT INTO boss_greet_settings (user_id, greeting_template, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET greeting_template = excluded.greeting_template, updated_at = CURRENT_TIMESTAMP
  `).run(userId, template);
}

/**
 * Check if Boss cookies are valid by navigating to boss.com.
 */
export async function checkCookieValid(userId: number): Promise<boolean> {
  const cookiesJson = getCookies(userId);
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

    // Inject cookies before any navigation
    await page.setCookie(...normalizeCookies(JSON.parse(cookiesJson)));

    // Navigate to homepage (get_jobs-main approach)
    await page.goto("https://www.zhipin.com", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await new Promise(r => setTimeout(r, 2000));

    const url = page.url();
    const title = await page.title().catch(() => "");
    console.log("[Boss Check] URL:", url, "| Title:", title);

    // ── get_jobs-main style DOM-based check ──
    // 1) Check for user label (logged in indicator)
    const userLabel = await page.$("li.nav-figure span.label-text");
    if (userLabel) {
      const box = await userLabel.boundingBox().catch(() => null);
      if (box) {
        console.log("[Boss Check] User label visible → VALID");
        db.prepare("UPDATE platform_sessions SET is_valid = ? WHERE user_id = ? AND platform = 'boss'").run(1, userId);
        return true;
      }
    }

    // 2) Check for login/register button → NOT logged in
    const loginBtn = await page.$("li.nav-sign a, .btns, a[href*='login']");
    if (loginBtn) {
      const text = await page.evaluate((el: any) => el.textContent || "", loginBtn);
      if (text.includes("登录")) {
        console.log("[Boss Check] Login button found:", text.trim(), "→ INVALID");
        db.prepare("UPDATE platform_sessions SET is_valid = ? WHERE user_id = ? AND platform = 'boss'").run(0, userId);
        return false;
      }
    }

    // 3) Fallbacks from title / URL
    if (title.includes("登录") || url.includes("login") || url.includes("passport")) {
      console.log("[Boss Check] Login page detected → INVALID");
      db.prepare("UPDATE platform_sessions SET is_valid = ? WHERE user_id = ? AND platform = 'boss'").run(0, userId);
      return false;
    }

    if (title.includes("403") || title.includes("Forbidden")) {
      console.log("[Boss Check] 403/Forbidden → INVALID");
      db.prepare("UPDATE platform_sessions SET is_valid = ? WHERE user_id = ? AND platform = 'boss'").run(0, userId);
      return false;
    }

    // 4) No login indicators → assume valid
    console.log("[Boss Check] No login indicators → VALID");
    db.prepare("UPDATE platform_sessions SET is_valid = ? WHERE user_id = ? AND platform = 'boss'").run(1, userId);
    return true;
  } catch (e: any) {
    console.error("[Boss Check] Exception:", e.message);
    return false;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Fill greeting template with job info.
 */
function fillTemplate(template: string, job: { title: string; company: string; salary?: string }): string {
  return template
    .replace(/\{jobName\}/g, job.title)
    .replace(/\{company\}/g, job.company)
    .replace(/\{salary\}/g, job.salary || "面议");
}

/**
 * Main greeting flow.
 */
export async function greetJob(
  userId: number,
  jobId: number,
  onStep: (step: GreetStep) => void,
): Promise<GreetResult> {
  const steps: GreetStep[] = [];

  // Load job info
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as any;
  if (!job) {
    onStep({ type: "error", label: "岗位不存在", detail: `job_id=${jobId} 在数据库中未找到` });
    return { success: false, message: "岗位不存在", steps };
  }

  // Load cookies
  const cookiesJson = getCookies(userId);
  if (!cookiesJson) {
    onStep({ type: "error", label: "未配置Cookie", detail: "请先在设置页面粘贴Boss直聘的Cookie" });
    return { success: false, message: "未配置Boss直聘Cookie", steps };
  }

  // Load greeting template
  const template = getGreetingTemplate(userId);
  const greetingText = fillTemplate(template, {
    title: job.title,
    company: job.company,
    salary: job.salary_min ? `${job.salary_min / 1000}k-${job.salary_max ? job.salary_max / 1000 + "k" : "?"}` : undefined,
  });

  let browser: any = null;
  let page: any = null;

  try {
    // ── Step 1: Launch browser ──
    onStep({ type: "navigating", label: "启动浏览器", detail: "正在启动Chrome..." });
    browser = await puppeteer.launch({
      headless: true,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1280,800",
      ],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // ── Step 2: Inject cookies and check login ──
    onStep({ type: "login_check", label: "验证登录状态", detail: "注入Cookie并检查..." });
    await page.setCookie(...normalizeCookies(JSON.parse(cookiesJson)));

    await page.goto("https://www.zhipin.com/web/chat/index", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    await new Promise(r => setTimeout(r, 2000));

    // Check login by looking for login button
    const loginBtn = await page.$("a[href*='login'], .login-btn, .btn-login");
    if (loginBtn) {
      onStep({ type: "error", label: "Cookie已过期", detail: "请在设置页面更新Boss直聘的Cookie" });
      db.prepare("UPDATE platform_sessions SET is_valid = 0 WHERE user_id = ? AND platform = 'boss'").run(userId);
      return { success: false, message: "Cookie已过期，请重新登录Boss直聘并更新Cookie", steps };
    }

    // ── Step 3: Search for the job ──
    onStep({ type: "searching", label: "搜索目标岗位", detail: `${job.title} @ ${job.company}` });
    const searchQuery = encodeURIComponent(`${job.company} ${job.title}`);
    await page.goto(`https://www.zhipin.com/web/geek/job?query=${searchQuery}&city=100010000`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await new Promise(r => setTimeout(r, 2000));

    // Wait for job list to appear
    try {
      await page.waitForSelector(".job-list-box, .search-job-result, .job-card-wrap", { timeout: 8000 });
    } catch {
      onStep({ type: "error", label: "未找到岗位", detail: "Boss直聘搜索未返回结果" });
      return { success: false, message: "在Boss直聘上未搜索到对应岗位", steps };
    }

    // ── Step 4: Find and click the matching job card ──
    onStep({ type: "opening_chat", label: "打开沟通窗口", detail: "正在查找匹配的岗位卡片..." });

    // Try multiple selector strategies
    let clicked = false;
    const clickStrategies = [
      // Strategy 1: find card by job title text
      async () => {
        const cards = await page.$$(".job-card-wrap, .job-card, .search-job-result li, .job-list-box li");
        for (const card of cards) {
          const text = await page.evaluate((el: any) => el.textContent || "", card);
          if (text.includes(job.company) || text.includes(job.title.split("工程师")[0] || job.title)) {
            // Find the chat button inside this card
            const chatBtn = await card.$(".btn-startchat, .op-btn-chat, .btn-chat, a[href*='chat']");
            if (chatBtn) {
              await chatBtn.click();
              clicked = true;
              return true;
            }
            // Or just click the card itself
            await card.click();
            clicked = true;
            return true;
          }
        }
        return false;
      },
      // Strategy 2: click first "立即沟通" button
      async () => {
        const btn = await page.$(".btn-startchat, .op-btn-chat, a.start-chat-btn, .btn-chat");
        if (btn) {
          await btn.click();
          clicked = true;
          return true;
        }
        return false;
      },
    ];

    for (const strategy of clickStrategies) {
      if (await strategy()) break;
    }

    if (!clicked) {
      onStep({ type: "error", label: "无法打开沟通", detail: "未找到'立即沟通'按钮" });
      return { success: false, message: "未找到沟通入口，可能岗位已下线", steps };
    }

    // Wait for chat popup to appear
    await new Promise(r => setTimeout(r, 2000));

    // ── Step 5: Send greeting message ──
    onStep({ type: "sending", label: "发送招呼语", detail: greetingText.slice(0, 30) + "..." });

    // Find chat input and send button
    const inputSelectors = [
      "div.chat-input[contenteditable='true']",
      "div#chat-input",
      "textarea.input-area",
      "div[contenteditable='true']",
      ".input-area textarea",
    ];

    let inputEl = null;
    for (const sel of inputSelectors) {
      inputEl = await page.$(sel);
      if (inputEl) break;
    }

    if (inputEl) {
      // Type greeting text
      await inputEl.click();
      await new Promise(r => setTimeout(r, 300));
      await inputEl.type(greetingText, { delay: 50 });
      await new Promise(r => setTimeout(r, 500));

      // Find send button
      const sendBtn = await page.$(
        "div.send-message, button.btn-send, .send-btn, button.send, span.send-message",
      );
      if (sendBtn) {
        await sendBtn.click();
        await new Promise(r => setTimeout(r, 1000));
      } else {
        // Try pressing Enter
        await page.keyboard.press("Enter");
        await new Promise(r => setTimeout(r, 1000));
      }

      onStep({ type: "done", label: "打招呼完成", detail: `已向「${job.company}」的HR发送招呼：${greetingText.slice(0, 20)}...` });

      // Update match status
      db.prepare("UPDATE matches SET status = 'accepted' WHERE user_id = ? AND job_id = ? AND status = 'pending'").run(userId, jobId);

      return { success: true, message: "打招呼成功", steps };
    }

    // Check for captcha
    const url = page.url();
    if (url.includes("verify") || url.includes("captcha")) {
      onStep({ type: "captcha", label: "需要验证", detail: "Boss直聘要求滑块验证，请手动在浏览器中完成" });
      return { success: false, message: "需要手动完成滑块验证", steps };
    }

    onStep({ type: "error", label: "发送失败", detail: "未找到聊天输入框" });
    return { success: false, message: "未找到聊天输入框，Boss直聘页面可能已更新", steps };
  } catch (e: any) {
    onStep({ type: "error", label: "执行异常", detail: e.message || "未知错误" });
    return { success: false, message: e.message || "自动化执行失败", steps };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

// ══════════════════════════════════════════════
// Boss 直聘岗位爬取
// ══════════════════════════════════════════════

const BOSS_CITY_MAP: Record<string, string> = {
  "北京": "101010100", "上海": "101020100", "深圳": "101280600", "广州": "101280100",
  "杭州": "101210100", "成都": "101270100", "南京": "101190100", "武汉": "101200100",
  "苏州": "101190400", "西安": "101110100", "长沙": "101250100", "天津": "101030100",
  "重庆": "101040100", "宁波": "101210400", "厦门": "101230200", "珠海": "101280700",
  "合肥": "101220100", "济南": "101120100", "青岛": "101120200", "大连": "101070200",
  "福州": "101230100", "东莞": "101281600", "佛山": "101280800", "无锡": "101190200",
};

const KEYWORD_LIST = [
  "前端开发", "后端开发", "Java开发", "Go开发", "Python开发", "算法工程师",
  "产品经理", "数据分析", "测试开发", "DevOps", "Android开发", "iOS开发",
  "安全工程师", "运维工程师", "架构师", "大数据开发", "AI工程师", "全栈工程师",
  "嵌入式开发", "C++开发", ".NET开发", "PHP开发", "DBA", "SRE工程师",
  "NLP工程师", "计算机视觉", "推荐系统", "大模型", "云计算", "区块链",
  "软件测试", "技术经理", "项目经理", "交互设计", "视觉设计",
  "运营", "市场", "销售", "HR", "财务",
];

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

interface BossJobDetail {
  title: string;
  company: string;
  location: string;
  salary_min: number;
  salary_max: number;
  job_type: string;
  description: string;
  requirements: string;
  tags: string[];
}

function parseBossSalary(salaryText: string): { min: number; max: number } {
  if (!salaryText) return { min: 0, max: 0 };
  // Format: "15K-25K" or "15k-25k·16薪" or "面议"
  const match = salaryText.match(/(\d+)\s*[kK]\s*-\s*(\d+)\s*[kK]/);
  if (match) return { min: Number(match[1]) * 1000, max: Number(match[2]) * 1000 };
  const single = salaryText.match(/(\d+)\s*[kK]/);
  if (single) return { min: Number(single[1]) * 1000, max: Number(single[1]) * 1000 };
  return { min: 0, max: 0 };
}

/**
 * 爬取 Boss 直聘岗位数据并导入数据库。
 * 参考 get_jobs 项目的 Boss.java 实现。
 */
export async function scrapeBossJobs(
  userId: number,
  keywords: string[],
  cities: string[],
  maxPerKeyword: number,
  onStep: (step: ScrapeStep) => void,
): Promise<{ total: number; inserted: number }> {
  const cookiesJson = getCookies(userId);
  if (!cookiesJson) {
    onStep({ type: "error", label: "未配置Cookie", detail: "请先在设置粘贴Boss直聘Cookie" });
    return { total: 0, inserted: 0 };
  }

  let browser: any = null;
  let page: any = null;
  let totalSaved = 0;
  let totalFetched = 0;

  try {
    onStep({ type: "navigating", label: "启动浏览器", detail: "正在启动Chrome..." });
    browser = await puppeteer.launch({
      headless: true,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled", "--window-size=1280,800"],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Inject cookies
    await page.setCookie(...normalizeCookies(JSON.parse(cookiesJson)));

    const effectiveCities = cities.length > 0 ? cities : ["上海", "北京", "深圳", "杭州", "成都"];
    const effectiveKeywords = keywords.length > 0 ? keywords : ["前端开发", "后端开发", "Java开发", "算法工程师", "产品经理"];

    const allJobs: Array<{
      title: string; company: string; location: string; salary_min: number; salary_max: number;
      description: string; experience: string; degree: string; tags: string[];
      industry: string; companyScale: string; financingStage: string;
      encryptId: string; sourceUrl: string;
    }> = [];

    // 监听岗位详情 API 响应（get_jobs 方式：page.onResponse 全局监听）
    page.on("response", async (resp: any) => {
      try {
        const url = resp.url();
        if (!url || !url.includes("/wapi/zpgeek/job/detail.json")) return;
        if (resp.request().method() !== "GET") return;

        const body = await resp.text();
        if (!body || body.length < 50) return;

        const root = JSON.parse(body);
        const zpData = root?.zpData;
        if (!zpData) return;

        const jobInfo = zpData.jobInfo;
        const brand = zpData.brandComInfo;
        const bossInfo = zpData.bossInfo;
        if (!jobInfo) return;

        const salaryText = jobInfo.salaryDesc || "";
        const salary = parseBossSalary(salaryText);

        const jobTags: string[] = [];
        if (jobInfo.jobLabels) {
          for (const label of jobInfo.jobLabels) {
            if (typeof label === "string") jobTags.push(label);
            else if (label.name) jobTags.push(label.name);
          }
        }

        allJobs.push({
          title: jobInfo.jobName || "",
          company: brand?.brandName || brand?.companyName || "",
          location: jobInfo.locationName || jobInfo.cityName || "",
          salary_min: salary.min,
          salary_max: salary.max,
          description: jobInfo.postDescription || jobInfo.jobDescription || "",
          experience: jobInfo.experienceName || "",
          degree: jobInfo.degreeName || "",
          tags: jobTags,
          industry: brand?.industryName || "",
          companyScale: brand?.scaleName || "",
          financingStage: brand?.stageName || "",
          encryptId: jobInfo.encryptId || "",
          sourceUrl: jobInfo.encryptId
            ? `https://www.zhipin.com/job_detail/${jobInfo.encryptId}.html`
            : "",
        });
      } catch {}
    });

    // ── 主循环：城市 × 关键词 ──
    for (const city of effectiveCities) {
      const cityCode = BOSS_CITY_MAP[city] || "101020100";

      for (const keyword of effectiveKeywords) {
        const beforeCount = allJobs.length;
        if (allJobs.length - totalFetched >= maxPerKeyword * 2) {
          // 已经抓够了，跳过
          onStep({ type: "progress", label: `${city} - ${keyword}`, detail: "已达标，跳过", current: allJobs.length, total: allJobs.length });
          continue;
        }

        onStep({ type: "scrolling", label: `${city} - ${keyword}`, detail: "正在加载岗位列表..." });

        const query = encodeURIComponent(keyword);
        await page.goto(
          `https://www.zhipin.com/web/geek/job?query=${query}&city=${cityCode}`,
          { waitUntil: "domcontentloaded", timeout: 15000 },
        );

        // 等待列表容器出现（get_jobs 方式）
        try {
          await page.waitForSelector("ul.rec-job-list", { timeout: 10000 });
        } catch {
          onStep({ type: "error", label: `${city} - ${keyword}`, detail: "列表加载超时" });
          continue;
        }
        await new Promise(r => setTimeout(r, 1000));

        // ── 滚动到底加载全部岗位（get_jobs 方式）──
        let lastCount = -1;
        let stableCount = 0;
        for (let i = 0; i < 200; i++) {
          // 检查 footer 是否可见
          const footer = await page.$("div#footer, #footer");
          if (footer) {
            const visible = await footer.isVisible().catch(() => false);
            if (visible) break;
          }

          // 按视口 1.5 倍渐进滚动
          await page.evaluate(() => {
            window.scrollBy(0, Math.floor(window.innerHeight * 1.5));
          });
          await new Promise(r => setTimeout(r, 300));

          // 检测卡片数量是否稳定
          const cards = await page.$$("ul.rec-job-list li.job-card-box");
          const currentCount = cards.length;
          if (currentCount === lastCount) {
            stableCount++;
          } else {
            stableCount = 0;
          }
          lastCount = currentCount;

          if (stableCount >= 3) {
            // 连续稳定 3 次 → 强制触底
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(r => setTimeout(r, 500));
          }
        }

        const cards = await page.$$("ul.rec-job-list li.job-card-box");
        onStep({ type: "progress", label: `${city} - ${keyword}`, detail: `加载 ${cards.length} 个岗位`, current: 0, total: cards.length });

        // ── 逐个点击卡片触发详情 API（get_jobs 方式）──
        await page.evaluate(() => window.scrollTo(0, 0));
        await new Promise(r => setTimeout(r, 500));

        const clickCount = Math.min(cards.length, maxPerKeyword);
        for (let i = 0; i < clickCount; i++) {
          try {
            // 重新获取卡片避免 stale element
            const freshCards = await page.$$("ul.rec-job-list li.job-card-box");
            if (i >= freshCards.length) break;

            // 第一个卡片需特殊处理：先点第二个再点第一个
            if (i === 0 && freshCards.length > 1) {
              await freshCards[1].click();
              await new Promise(r => setTimeout(r, 800));
              await freshCards[0].click();
            } else {
              await freshCards[i].click();
            }
            await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
          } catch { continue; }

          if (i % 10 === 0 && i > 0) {
            onStep({ type: "progress", label: `${city} - ${keyword}`, detail: `已扫描 ${i}/${clickCount}，抓到 ${allJobs.length} 条`, current: i, total: clickCount });
          }
        }

        const newCount = allJobs.length - beforeCount;
        onStep({ type: "parsing", label: `${city} - ${keyword} 完成`, detail: `新增 ${newCount} 条岗位（累计 ${allJobs.length} 条）` });
        totalFetched = allJobs.length;
      }
    }

    // ── 保存到数据库 ──
    onStep({ type: "saving", label: "保存岗位数据", detail: `共 ${allJobs.length} 条待入库` });

    const insert = db.prepare(`
      INSERT OR IGNORE INTO jobs (source, source_url, title, company, location, description, requirements, responsibilities, salary_min, salary_max, salary_currency, deadline, job_type, industry, role_type, seniority, tags, status)
      VALUES ('boss', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CNY', ?, 'full-time', ?, ?, 'mid', ?, 'active')
    `);

    const insertAll = db.transaction((items: typeof allJobs) => {
      for (const item of items) {
        if (!item.title || !item.company) continue;
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 30 + Math.floor(Math.random() * 30));
        const roleType = mapRoleType(item.title);
        // 行业映射
        let industry = "technology";
        const ind = (item.industry || "").toLowerCase();
        if (ind.includes("金融") || ind.includes("投资") || ind.includes("支付")) industry = "fintech";
        else if (ind.includes("咨询") || ind.includes("服务")) industry = "consulting";
        else if (ind.includes("银行")) industry = "banking";
        else if (ind.includes("医疗") || ind.includes("制药") || ind.includes("健康")) industry = "healthcare";

        const allTags = [...item.tags];
        if (item.experience) allTags.push(item.experience);
        if (item.degree) allTags.push(item.degree);
        if (item.companyScale) allTags.push(item.companyScale);

        insert.run(
          item.sourceUrl,
          item.title, item.company, item.location,
          item.description,
          item.description, // requirements = description since API doesn't separate them
          item.salary_min, item.salary_max,
          deadline.toISOString().split("T")[0],
          industry,
          roleType,
          JSON.stringify(allTags),
        );
        totalSaved++;
      }
    });

    insertAll(allJobs);

    onStep({ type: "done", label: "爬取完成", detail: `成功导入 ${totalSaved} 条岗位` });
    return { total: allJobs.length, inserted: totalSaved };
  } catch (e: any) {
    onStep({ type: "error", label: "爬取异常", detail: e.message || "未知错误" });
    return { total: totalFetched, inserted: totalSaved };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}
