/**
 * Resume scoring engine.
 *
 * Six dimensions, each 0–100. Rule-based metrics for speed + AI for semantics.
 * Overall score is a weighted sum. Used by resumeOptimizer to gate improvements.
 */

// ── Constants ──

const STRONG_ACTION_VERBS = new Set([
  "主导", "领导", "设计", "开发", "构建", "创建", "实现", "优化",
  "提升", "提高", "降低", "减少", "推动", "驱动", "带领", "管理",
  "协调", "策划", "制定", "分析", "解决", "改进", "改造", "重构",
  "交付", "上线", "发布", "部署", "迁移", "整合", "搭建", "架构",
  "设计开发", "从零搭建", "独立完成", "负责主导",
  "led", "designed", "developed", "built", "created", "implemented",
  "optimized", "improved", "reduced", "drove", "managed", "owned",
  "launched", "delivered", "architected", "spearheaded", "orchestrated",
  "established", "transformed", "automated", "scaled", "engineered",
]);

const WEAK_PHRASES = [
  "负责", "参与", "协助", "了解", "熟悉", "接触", "处理", "跟进",
  "日常", "各种", "其他", "相关", "一些", "若干", "等等",
  "以及", "包括但不限于", "在内的", "等方面",
  "responsible for", "helped with", "assisted in", "participated in",
  "various", "etc", "including but not limited to", "and more",
];

const REQUIRED_SECTIONS = [
  { key: "contact", label: "联系方式", patterns: [/@/, /1[3-9]\d{9}/, /电话|手机|phone|tel/i] },
  { key: "education", label: "教育背景", patterns: [/大学|学院|university|college|bachelor|master|phd|博士|硕士|本科/i] },
  { key: "experience", label: "经历", patterns: [/实习|工作|项目|experience|work|intern|project/i] },
  { key: "skills", label: "技能", patterns: [/技能|skill|熟练|掌握|熟悉/i] },
];

export interface DimensionScore {
  label: string;
  labelZh: string;
  score: number;       // 0–100
  weight: number;      // 0–1
  details: string[];   // What contributed or deducted
}

export interface ResumeScore {
  dimensions: DimensionScore[];
  overall: number;     // 0–100 weighted
  targetMatch?: number; // 0–100, only when target JD provided
  redFlags: RedFlag[];
}

// ── Red Flag Detection ──

const TOY_PROJECTS = [
  "外卖系统", "秒杀系统", "商城系统", "博客系统", "在线教育平台",
  "学生管理系统", "图书管理系统", "宿舍管理系统", "课程设计",
  "个人博客", "仿知乎", "仿微信", "仿淘宝", "仿京东",
  "todo-list", "todo list", "calculator", "weather app",
];

const OUTSOURCING_FLAGS = [
  "中科软", "中软国际", "法本信息", "软通动力", "东软集团",
  "文思海辉", "博彦科技", "柯莱特", "华为 OD", "阿里外包",
  "字节外包", "腾讯外包", "OD ", "外包",
];

const HOLLOW_PHRASES = [
  "热情积极", "责任心强", "吃苦耐劳", "性格开朗", "善于沟通",
  "团队合作精神", "学习能力强", "抗压能力强", "工作认真负责",
  "有上进心", "有团队意识", "良好的职业道德",
];

export interface RedFlag {
  severity: "critical" | "high" | "medium";
  category: string;
  description: string;
  evidence: string;
  suggestion: string;
}

export function detectRedFlags(resumeText: string): RedFlag[] {
  const flags: RedFlag[] = [];
  const text = resumeText.toLowerCase();

  // 1. Toy projects
  for (const tp of TOY_PROJECTS) {
    if (text.includes(tp.toLowerCase())) {
      flags.push({
        severity: "high",
        category: "玩具项目",
        description: `检测到常见练习项目「${tp}」——如果没有真实场景、独特技术取舍或量化结果，面试官会降低评价`,
        evidence: tp,
        suggestion: "如果该项目有真实用户或部署环境，请在描述中明确。如果确实是练习项目，建议突出你在其中解决的独特技术难点（如压测、限流、缓存设计），或替换为非公开的课程/实验室项目",
      });
      break; // one toy project flag is enough
    }
  }

  // 2. Outsourcing/OD flags
  for (const os of OUTSOURCING_FLAGS) {
    if (text.includes(os.toLowerCase())) {
      flags.push({
        severity: "medium",
        category: "外包/驻场经历",
        description: `检测到外包或驻场性质的工作经历（${os}）——本身不是问题，但如果只写了职责、没有写项目价值和成长路径，容易被快速跳过`,
        evidence: os,
        suggestion: "重点写你在该岗位上负责的核心项目、交付的产物和产生的业务价值，淡化公司标签。如果从外包走向了甲方或平台团队，这条路径是正向信号，应主动在职业叙事中体现",
      });
      break;
    }
  }

  // 3. Hollow self-evaluations
  const hollowCount = HOLLOW_PHRASES.filter(p => text.includes(p.toLowerCase())).length;
  if (hollowCount >= 3) {
    flags.push({
      severity: "medium",
      category: "空洞自评",
      description: `检测到 ${hollowCount} 个空洞自评词（"热情积极/责任心强/学习能力强"等）——这类表述人人都会写，毫无区分度，浪费宝贵的第一屏空间`,
      evidence: HOLLOW_PHRASES.filter(p => text.includes(p.toLowerCase())).join("、"),
      suggestion: "删除所有空洞自评，把篇幅让给能证明这些品质的具体成果。例如用'主导跨部门项目并在截止日前交付'替代'责任心强'",
    });
  }

  // 4. Too many 「精通」 without evidence
  const jingTongMatches = text.match(/精通/g);
  const hasProjects = /项目经历|项目经验|实习经历|工作经历|工作经验/.test(text);
  const bulletCount = (text.match(/[•·\-*●○◆◇]|\d+[.、．]/g) || []).length;
  if (jingTongMatches && jingTongMatches.length >= 3 && bulletCount < 5) {
    flags.push({
      severity: "high",
      category: "「精通」无据",
      description: `出现了 ${jingTongMatches.length} 次「精通」，但经历描述条目不足——面试官会逐条追问"精通到什么程度"，如果项目中找不到证据就会成为扣分项`,
      evidence: `「精通」出现 ${jingTongMatches.length} 次，bullet points 仅 ${bulletCount} 条`,
      suggestion: '将【精通XX】改为具体描述如【使用XX技术解决了YY问题】，让项目经历来证明技术水平，而非靠技能清单自我声明',
    });
  }

  // 5. Job-hopping patterns (3+ jobs in 3 years)
  const yearMatches = text.match(/(\d{4})[.年/-]\d{1,2}\s*[至~-]\s*(?:至今|(\d{4})[.年/-]\d{1,2})/g);
  if (yearMatches && yearMatches.length >= 3) {
    const shortTenures = yearMatches.filter(m => {
      const years = m.match(/\d{4}/g);
      if (years && years.length >= 2) {
        return Number(years[1]) - Number(years[0]) <= 1;
      }
      return false;
    });
    if (shortTenures.length >= 2) {
      flags.push({
        severity: "medium",
        category: "短期频繁跳槽",
        description: `检测到 ${shortTenures.length} 段不足一年的工作经历——如果不解释原因，面试官可能质疑稳定性`,
        evidence: shortTenures.join(", "),
        suggestion: "在每段短期经历中补充离开原因（如团队解散、业务调整、追求更好方向），并将重点放在该段经历中的实际成果上",
      });
    }
  }

  // 6. Bullet points without any result/structure
  const lines = resumeText.split(/[\n\r]+/).filter(l => l.trim().length > 15);
  const dutyOnlyBullets = lines.filter(l => {
    const t = l.trim();
    return (t.startsWith("负责") || t.startsWith("参与") || t.startsWith("协助")) &&
           !/[，,].*(?:结果|提升|降低|实现|完成|交付|落地|解决|改善)/.test(t);
  });
  if (dutyOnlyBullets.length >= 3 && lines.filter(l => /^[•·\-*]/.test(l.trim())).length >= 3) {
    flags.push({
      severity: "high",
      category: "纯职责描述",
      description: `${dutyOnlyBullets.length} 条经历停留在「负责/参与了什么」，没有说明做成了什么、带来了什么结果`,
      evidence: dutyOnlyBullets.slice(0, 3).join(" | "),
      suggestion: "每条经历至少回答：你交付了什么产物？谁在使用？带来了什么变化？用【动作 + 产物 + 结果】的结构改写",
    });
  }

  return flags;
}

// ── Project Context Check ──

export function checkProjectContext(text: string): { hasContext: boolean; projectsWithoutContext: number; suggestion: string } {
  const bullets = text.split(/[\n\r]+/).filter(l => l.trim().length > 1);
  const projectBullets = bullets.filter(l =>
    /^[•·\-*●○◆◇]/.test(l.trim()) ||
    /^\d+[.、．]/.test(l.trim()) ||
    (l.trim().length > 15 && l.trim().length < 300 && !/^[A-Z一-鿿]{2,20}[：:]/.test(l))
  );

  // Check if there's a project description line before bullet groups
  const hasDescriptions = /项目[：:].*系统|平台.*用于|服务.*解决|定位.*面向/.test(text) ||
                          /(?:系统定位|核心用户|业务问题|项目背景)/.test(text);

  let projectsWithoutContext = 0;
  if (projectBullets.length > 3 && !hasDescriptions) {
    projectsWithoutContext = Math.ceil(projectBullets.length / 3);
  }

  return {
    hasContext: hasDescriptions || projectBullets.length <= 3,
    projectsWithoutContext,
    suggestion: projectsWithoutContext > 0
      ? `${projectsWithoutContext} 段经历缺少项目背景描述。建议每段项目经历前加一句说明：系统定位 + 核心用户 + 解决的业务问题`
      : "项目上下文描述良好",
  };
}

// ── Helpers ──

function countBullets(text: string): string[] {
  // Split by Chinese bullet markers, dashes, asterisks, or numbered lists
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
  const bullets = lines.filter(l =>
    /^[•·\-*●○◆◇➤►▸▪▫]/.test(l) ||
    /^\d+[.、．]/.test(l) ||
    /^[（(]\d+[)）]/.test(l) ||
    /^[a-z][.、．]/i.test(l)
  );
  // If no explicit bullets, treat each non-empty line under 300 chars as a bullet
  if (bullets.length < 3) {
    return lines.filter(l => l.length > 10 && l.length < 300);
  }
  return bullets;
}

// ── Specificity detection: reward concrete technical detail, not made-up numbers ──

const TECH_METHODS = [
  // Frameworks & tools
  "Spring", "Spring Boot", "Spring Cloud", "MyBatis", "Hibernate", "JPA",
  "React", "Vue", "Angular", "Next.js", "Nuxt", "Node.js", "Express", "NestJS",
  "Django", "Flask", "FastAPI", "Rails", "Laravel", "Gin",
  "Docker", "Kubernetes", "k8s", "Jenkins", "GitLab CI", "GitHub Actions",
  "MySQL", "PostgreSQL", "MongoDB", "Redis", "Elasticsearch", "Kafka", "RabbitMQ",
  "AWS", "阿里云", "腾讯云", "Nginx", "Tomcat", "Linux",
  "JWT", "OAuth", "RESTful", "GraphQL", "gRPC", "WebSocket",
  "Figma", "Sketch", "Adobe XD", "Axure", "Jira", "Confluence",
  "PyTorch", "TensorFlow", "Scikit-learn", "Pandas", "NumPy",
  "Tableau", "Power BI", "Metabase", "Grafana", "Prometheus",
  // Methodologies
  "A/B测试", "灰度发布", "敏捷开发", "Scrum", "看板", "CI/CD",
  "单元测试", "集成测试", "性能测试", "压力测试", "自动化测试",
  "Code Review", "结对编程", "DDD", "TDD", "微服务", "Serverless",
  // Problem-solving patterns
  "重构", "拆分", "解耦", "抽象", "封装", "并行化", "异步", "缓存",
  "索引优化", "SQL调优", "连接池", "熔断", "降级", "限流",
  "数据清洗", "特征工程", "模型训练", "模型部署", "A/B实验", "效果评估",
];

const PROBLEM_SOLVE_PATTERNS = [
  /通过.*(?:解决|实现|完成|达成|提升|降低|减少|缩短)/,
  /(?:采用|使用|基于).*(?:方案|架构|策略|框架|技术|模型)/,
  /(?:设计|搭建|构建|建立).*(?:系统|平台|模块|流程|管线|引擎)/,
  /(?:负责|主导|参与).*(?:设计|开发|实现|建设|迁移|改造|优化)/,
  /used\s+\w+.*(?:to|for)\s+\w+/i,
  /(?:built|created|designed|developed|implemented)\s+\w+\s+(?:using|with|based\s+on)/i,
];

function countSpecificBullets(bullets: string[]): number {
  return bullets.filter(b => {
    // Has a concrete technical term
    const hasTech = TECH_METHODS.some(t =>
      b.toLowerCase().includes(t.toLowerCase())
    );
    // Has problem-solution structure
    const hasStructure = PROBLEM_SOLVE_PATTERNS.some(p => p.test(b));
    // Has genuine numeric data (dates, durations, team sizes — not fabricated KPIs)
    const hasGenuineNumber = /\d{4}[.年/-]\d{1,2}/.test(b) || // dates
      /\d+\s*(?:人|人的团队|人团队)/.test(b) ||               // team sizes (real, easily verified)
      /GPA\s*\d/.test(b) ||                                    // GPA
      /\d+\s*(?:门|个|届)/.test(b);                            // counts (classes, projects, cohorts)

    return hasTech || hasStructure || hasGenuineNumber;
  }).length;
}

// ── Fabrication detection: scan for numbers that may have been made up ──

const FABRICATION_PATTERNS = [
  // Performance metrics (high risk of fabrication)
  { pattern: /(?:提升|提高|增长|增加|上升)\s*\d+[%％]/g, label: "性能提升百分比" },
  { pattern: /(?:降低|减少|下降|缩短)\s*\d+[%％]/g, label: "性能下降百分比" },
  { pattern: /(?:从|由)\s*\d+\s*(?:ms|秒|分钟|小时|天).*(?:到|至|降[至到]|缩短[至到])\s*\d+/g, label: "响应时间优化" },
  { pattern: /\d+\s*(?:万|亿|k|K)\s*(?:用户|订单|请求|访问|PV|UV)/g, label: "业务规模数据" },
  { pattern: /\d+[%％]\s*(?:的|转化|点击|留存|复购|命中)/g, label: "业务指标数据" },
  { pattern: /(?:日均|月均|年均|每日|每月|每年)\s*\d+/g, label: "日均/月均数据" },
  { pattern: /\d+\s*(?:行|次|笔|条|个|家|篇)\s*(?:代码|订单|记录|请求|客户|文章|用户)/g, label: "数量数据" },
  { pattern: /(?:减少|降低|节省|节约)\s*\d+/g, label: "节省/降低数据" },
];

export interface FabricationWarning {
  text: string;
  label: string;
}

export function detectFabricatedNumbers(before: string, after: string): FabricationWarning[] {
  const warnings: FabricationWarning[] = [];

  for (const { pattern, label } of FABRICATION_PATTERNS) {
    const beforeMatches = new Set((before.match(pattern) || []).map(m => m.trim()));
    const afterMatches = (after.match(pattern) || []).map(m => m.trim());

    for (const m of afterMatches) {
      if (!beforeMatches.has(m)) {
        warnings.push({ text: m, label });
      }
    }
  }

  return warnings;
}

function countActionVerbBullets(bullets: string[]): number {
  return bullets.filter(b => {
    const firstWord = b.trim().split(/[\s,，、]/)[0];
    return STRONG_ACTION_VERBS.has(firstWord);
  }).length;
}

function countWeakPhrases(text: string): number {
  let count = 0;
  for (const phrase of WEAK_PHRASES) {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = text.match(regex);
    if (matches) count += matches.length;
  }
  return count;
}

function extractKeywords(text: string): Set<string> {
  const words = new Set<string>();
  // Technical terms
  const techTerms = text.match(/\b[A-Z][a-zA-Z+#.]{2,}\b/g) || [];
  techTerms.forEach(t => words.add(t.toLowerCase()));
  // Chinese compound terms (2-4 chars)
  const cnTerms = text.match(/[一-鿿]{2,4}/g) || [];
  cnTerms.forEach(t => words.add(t));
  return words;
}

// ── Scoring Functions ──

function scoreCompleteness(text: string): DimensionScore {
  const details: string[] = [];
  let score = 0;

  for (const section of REQUIRED_SECTIONS) {
    const found = section.patterns.some(p => p.test(text));
    if (found) {
      score += 25;
      details.push(`✓ 包含${section.label}`);
    } else {
      details.push(`✗ 缺少${section.label}`);
    }
  }

  return { label: "completeness", labelZh: "结构完整度", score, weight: 0.15, details };
}

function scoreSpecificity(bullets: string[]): DimensionScore {
  if (bullets.length === 0) return { label: "specificity", labelZh: "具体度", score: 0, weight: 0.25, details: ["无经历描述"] };

  const specific = countSpecificBullets(bullets);
  const total = bullets.length;
  const ratio = Math.min(1, specific / Math.max(total, 1));
  // Scale: even 50% specific = 80 points (reward partial specificity)
  const score = Math.min(100, Math.round(ratio * 160));

  const details = [
    `${total} 条经历描述，${specific} 条包含具体技术/方案/工具细节`,
  ];

  if (ratio < 0.4) {
    details.push(`建议：将"负责/参与了XX"改为"使用YY技术实现了ZZ功能"，让经历描述更具体可验证`);
  } else if (ratio < 0.7) {
    details.push("过半经历已有具体细节，可继续优化其余条目");
  } else {
    details.push("经历描述具体度良好，技术方案和工具细节丰富");
  }

  return { label: "specificity", labelZh: "具体度", score, weight: 0.25, details };
}

function scoreActionVerbs(bullets: string[]): DimensionScore {
  if (bullets.length === 0) return { label: "verbs", labelZh: "动词力", score: 0, weight: 0.15, details: ["无经历描述"] };

  const strong = countActionVerbBullets(bullets);
  const weak = bullets.filter(b => {
    const first = b.trim().split(/[\s,，、]/)[0];
    return first === "负责" || first === "参与" || first === "协助";
  }).length;

  const score = Math.round((strong / Math.max(bullets.length, 1)) * 100);

  const details = [
    `${strong} 条用强动词开头（设计/主导/优化等）`,
    weak > 0 ? `${weak} 条用弱动词（负责/参与/协助），建议替换` : "没有弱动词，很好",
  ];

  return { label: "verbs", labelZh: "动词力", score, weight: 0.15, details };
}

function scoreConciseness(text: string): DimensionScore {
  const weakCount = countWeakPhrases(text);
  const len = text.length;
  const details: string[] = [];

  let score = 100;

  // Too short
  if (len < 200) {
    score -= 30;
    details.push("简历过短（<200字），内容可能不够充实");
  }
  // Too long
  if (len > 2000) {
    score -= Math.min(20, Math.floor((len - 2000) / 100));
    details.push("简历偏长，建议精简到一页以内");
  }
  // Vague phrases
  if (weakCount > 5) {
    score -= Math.min(40, (weakCount - 5) * 2);
    details.push(`检测到 ${weakCount} 处空泛表述（"负责/各种/等等"），建议具体化`);
  } else {
    details.push("空泛表述控制在 5 处以内，良好");
  }

  if (len >= 400 && len <= 1000) {
    details.push("字数适中，一页最佳");
  }

  return { label: "conciseness", labelZh: "精炼度", score: Math.max(0, score), weight: 0.15, details };
}

function scoreStructure(text: string, bullets: string[]): DimensionScore {
  let score = 0;
  const details: string[] = [];

  // Uses bullet points
  if (bullets.length >= 3) { score += 30; details.push("✓ 使用条目式描述"); }
  else { details.push("✗ 建议将经历改为 bullet points 逐条列出"); }

  // Has section headers (capitalized or Chinese bracket format)
  const headers = text.match(/^[A-Z][A-Z\s&/]+$/gm) || text.match(/【.+】/g) || text.match(/[A-Z][a-z]+ [A-Z][a-z]+/g) || [];
  if (headers.length >= 2) { score += 30; details.push("✓ 有清晰的分段标题"); }
  else { details.push("✗ 建议添加分段标题（教育背景/工作经历/项目经验/技能）"); }

  // Consistent date format
  const dateCount = (text.match(/\d{4}[.年/-]\d{1,2}/g) || []).length;
  if (dateCount >= 1) { score += 20; details.push("✓ 时间格式规范"); }
  else { details.push("✗ 建议补充时间信息（如 2023.09-2024.06）"); }

  // No overly long paragraphs
  const longGraphs = text.split(/\n{2,}/).filter(g => g.length > 500).length;
  if (longGraphs === 0) { score += 20; details.push("✓ 段落长度适中"); }
  else { details.push("✗ 有大段文字，建议拆分或改用 bullet points"); }

  return { label: "structure", labelZh: "结构清晰度", score, weight: 0.10, details };
}

async function scoreKeywordMatch(resumeText: string, targetJD?: string): Promise<DimensionScore> {
  if (!targetJD) {
    return { label: "keywords", labelZh: "关键词匹配", score: 50, weight: 0.20, details: ["未提供目标岗位描述，无法计算精确匹配度"] };
  }

  const resumeKeywords = extractKeywords(resumeText);
  const jdKeywords = extractKeywords(targetJD);

  if (jdKeywords.size === 0) {
    return { label: "keywords", labelZh: "关键词匹配", score: 50, weight: 0.20, details: ["未能从岗位描述中提取关键词"] };
  }

  let matched = 0;
  const matchedList: string[] = [];
  const missedList: string[] = [];

  for (const kw of jdKeywords) {
    if (resumeKeywords.has(kw)) { matched++; matchedList.push(kw); }
    else if (missedList.length < 10) { missedList.push(kw); }
  }

  const ratio = matched / jdKeywords.size;
  // Scale: 50% coverage = 80 points (perfect coverage is rare), 0% = 0
  const score = Math.round(Math.min(100, ratio * 160));

  return {
    label: "keywords",
    labelZh: "关键词匹配",
    score,
    weight: 0.20,
    details: [
      `JD 关键词 ${jdKeywords.size} 个，简历匹配 ${matched} 个（${Math.round(ratio * 100)}%）`,
      matchedList.length > 0 ? `已匹配：${matchedList.slice(0, 8).join("、")}` : "",
      missedList.length > 0 ? `建议补充：${missedList.slice(0, 8).join("、")}` : "",
    ].filter(Boolean),
  };
}

// ── Main Scoring API ──

export async function scoreResume(resumeText: string, targetJD?: string): Promise<ResumeScore> {
  const bullets = countBullets(resumeText);

  const dimensions: DimensionScore[] = [
    scoreCompleteness(resumeText),
    scoreSpecificity(bullets),
    scoreActionVerbs(bullets),
    scoreConciseness(resumeText),
    scoreStructure(resumeText, bullets),
    await scoreKeywordMatch(resumeText, targetJD),
  ];

  const overall = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) * 100
  ) / 100;

  const redFlags = detectRedFlags(resumeText);

  return { dimensions, overall, redFlags };
}

// ── Utility: compare two scores ──

export function scoreImproved(before: ResumeScore, after: ResumeScore): { improved: boolean; changes: string[] } {
  const changes: string[] = [];

  for (let i = 0; i < before.dimensions.length; i++) {
    const b = before.dimensions[i];
    const a = after.dimensions[i];
    const delta = a.score - b.score;
    if (delta > 2) {
      changes.push(`↑ ${a.labelZh}：${b.score} → ${a.score} (+${delta})`);
    } else if (delta < -2) {
      changes.push(`↓ ${a.labelZh}：${b.score} → ${a.score} (${delta})`);
    }
  }

  const improved = after.overall > before.overall;
  if (improved) {
    changes.unshift(`总分：${before.overall} → ${after.overall} (+${Math.round((after.overall - before.overall) * 100) / 100})`);
  }

  return { improved, changes };
}
