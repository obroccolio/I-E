/**
 * Seed 300 realistic job listings into the Jobro database.
 * Run: npx tsx db/seed-jobs.ts
 */
import db from "./connection.ts";

const COMPANIES: Record<string, string[]> = {
  fintech: [
    "蚂蚁集团", "京东科技", "度小满金融", "陆金所", "微众银行",
    "众安保险", "老虎证券", "富途牛牛", "雪球", "同花顺",
    "恒生电子", "长亮科技", "宇信科技", "神州信息", "科蓝软件",
    "汇付天下", "拉卡拉", "收钱吧", "Ping++", "Airwallex",
  ],
  consulting: [
    "麦肯锡", "波士顿咨询", "贝恩", "德勤", "普华永道",
    "安永", "毕马威", "罗兰贝格", "奥纬咨询", "艾意凯",
    "埃森哲", "凯捷", "IBM咨询", "四大会计所-天职", "致同",
    "上海久谦", "睿思咨询", "中智咨询", "华夏基石", "正略钧策",
  ],
  technology: [
    "字节跳动", "腾讯", "阿里巴巴", "百度", "美团",
    "小红书", "哔哩哔哩", "快手", "拼多多", "滴滴",
    "商汤科技", "旷视科技", "云从科技", "依图科技", "地平线",
    "华为", "小米", "OPPO", "vivo", "荣耀",
    "网易", "搜狐", "新浪微博", "知乎", "得物",
    "大疆", "蔚来", "小鹏汽车", "理想汽车", "比亚迪",
    "科大讯飞", "寒武纪", "壁仞科技", "燧原科技", "摩尔线程",
    "米哈游", "莉莉丝", "鹰角网络", "叠纸", "库洛",
    "金山云", "UCloud", "青云QingCloud", "七牛云", "又拍云",
    "唯品会", "SHEIN", "京东", "Shopee", "Lazada",
  ],
  banking: [
    "工商银行", "建设银行", "农业银行", "中国银行", "交通银行",
    "招商银行", "兴业银行", "浦发银行", "中信银行", "光大银行",
    "平安银行", "民生银行", "广发银行", "华夏银行", "北京银行",
    "上海银行", "宁波银行", "南京银行", "江苏银行", "杭州银行",
  ],
  healthcare: [
    "强生", "辉瑞", "罗氏", "诺华", "默沙东",
    "阿斯利康", "赛诺菲", "拜耳", "葛兰素史克", "百时美施贵宝",
    "迈瑞医疗", "联影医疗", "华大基因", "药明康德", "泰格医药",
    "恒瑞医药", "百济神州", "信达生物", "君实生物", "康希诺",
    "微创医疗", "乐普医疗", "鱼跃医疗", "安图生物", "新产业生物",
    "爱尔眼科", "通策医疗", "美年健康", "瑞慈医疗", "平安好医生",
  ],
};

const ROLES: Record<string, Array<{ title: string; seniority: string; salaryRange: [number, number] }>> = {
  fintech: [
    { title: "金融产品经理", seniority: "mid", salaryRange: [25000, 45000] },
    { title: "风控算法工程师", seniority: "senior", salaryRange: [40000, 70000] },
    { title: "Java后端开发", seniority: "mid", salaryRange: [20000, 38000] },
    { title: "量化研究员", seniority: "senior", salaryRange: [35000, 65000] },
    { title: "量化交易员", seniority: "mid", salaryRange: [25000, 50000] },
    { title: "数据工程师", seniority: "junior", salaryRange: [12000, 22000] },
    { title: "支付系统架构师", seniority: "senior", salaryRange: [50000, 85000] },
    { title: "合规运营专员", seniority: "junior", salaryRange: [8000, 15000] },
    { title: "区块链开发工程师", seniority: "mid", salaryRange: [22000, 42000] },
    { title: "信贷审核经理", seniority: "mid", salaryRange: [18000, 30000] },
    { title: "金融数据分析师", seniority: "junior", salaryRange: [10000, 20000] },
    { title: "反欺诈分析师", seniority: "mid", salaryRange: [20000, 35000] },
    { title: "数字人民币产品经理", seniority: "mid", salaryRange: [28000, 50000] },
    { title: "供应链金融经理", seniority: "senior", salaryRange: [30000, 55000] },
  ],
  consulting: [
    { title: "战略咨询顾问", seniority: "mid", salaryRange: [25000, 45000] },
    { title: "管理咨询分析师", seniority: "junior", salaryRange: [12000, 22000] },
    { title: "数字化转型顾问", seniority: "senior", salaryRange: [35000, 60000] },
    { title: "市场研究经理", seniority: "mid", salaryRange: [20000, 35000] },
    { title: "组织发展顾问", seniority: "senior", salaryRange: [30000, 55000] },
    { title: "咨询项目经理", seniority: "senior", salaryRange: [40000, 70000] },
    { title: "行业研究员", seniority: "junior", salaryRange: [10000, 18000] },
    { title: "并购咨询顾问", seniority: "mid", salaryRange: [28000, 50000] },
    { title: "ESG咨询顾问", seniority: "mid", salaryRange: [22000, 42000] },
    { title: "财务咨询顾问", seniority: "mid", salaryRange: [20000, 38000] },
    { title: "人力资源咨询顾问", seniority: "junior", salaryRange: [12000, 20000] },
  ],
  technology: [
    { title: "前端开发工程师", seniority: "mid", salaryRange: [18000, 35000] },
    { title: "后端开发工程师", seniority: "mid", salaryRange: [20000, 40000] },
    { title: "算法工程师", seniority: "senior", salaryRange: [40000, 75000] },
    { title: "产品经理", seniority: "mid", salaryRange: [22000, 40000] },
    { title: "UI/UX设计师", seniority: "junior", salaryRange: [10000, 22000] },
    { title: "测试开发工程师", seniority: "mid", salaryRange: [18000, 32000] },
    { title: "DevOps工程师", seniority: "senior", salaryRange: [30000, 55000] },
    { title: "数据分析师", seniority: "junior", salaryRange: [10000, 20000] },
    { title: "技术项目经理", seniority: "senior", salaryRange: [35000, 60000] },
    { title: "Android开发", seniority: "mid", salaryRange: [18000, 35000] },
    { title: "iOS开发", seniority: "mid", salaryRange: [20000, 38000] },
    { title: "安全工程师", seniority: "senior", salaryRange: [30000, 55000] },
    { title: "运维工程师", seniority: "mid", salaryRange: [15000, 28000] },
    { title: "游戏服务器开发", seniority: "mid", salaryRange: [22000, 40000] },
    { title: "NLP算法工程师", seniority: "senior", salaryRange: [45000, 80000] },
    { title: "计算机视觉工程师", seniority: "senior", salaryRange: [40000, 75000] },
    { title: "推荐系统工程师", seniority: "senior", salaryRange: [45000, 80000] },
    { title: "嵌入式开发工程师", seniority: "mid", salaryRange: [18000, 32000] },
    { title: "自动驾驶感知算法", seniority: "senior", salaryRange: [45000, 80000] },
    { title: "SRE工程师", seniority: "senior", salaryRange: [35000, 60000] },
    { title: "Go后端开发", seniority: "mid", salaryRange: [22000, 42000] },
    { title: "游戏策划", seniority: "mid", salaryRange: [18000, 35000] },
    { title: "3D图形开发", seniority: "senior", salaryRange: [35000, 65000] },
    { title: "大模型训练工程师", seniority: "senior", salaryRange: [50000, 90000] },
    { title: "AIGC应用开发", seniority: "mid", salaryRange: [25000, 48000] },
  ],
  banking: [
    { title: "对公客户经理", seniority: "mid", salaryRange: [15000, 28000] },
    { title: "零售客户经理", seniority: "junior", salaryRange: [8000, 16000] },
    { title: "信贷审批官", seniority: "senior", salaryRange: [25000, 45000] },
    { title: "风控经理", seniority: "mid", salaryRange: [20000, 38000] },
    { title: "合规管理岗", seniority: "mid", salaryRange: [18000, 32000] },
    { title: "投资银行分析师", seniority: "junior", salaryRange: [12000, 22000] },
    { title: "资产管理经理", seniority: "senior", salaryRange: [30000, 55000] },
    { title: "资产负债管理", seniority: "mid", salaryRange: [20000, 35000] },
    { title: "运营管理岗", seniority: "junior", salaryRange: [8000, 15000] },
    { title: "金融市场交易员", seniority: "mid", salaryRange: [22000, 45000] },
    { title: "财富管理顾问", seniority: "mid", salaryRange: [18000, 35000] },
    { title: "投行项目经理", seniority: "senior", salaryRange: [35000, 65000] },
  ],
  healthcare: [
    { title: "临床研究经理", seniority: "senior", salaryRange: [25000, 45000] },
    { title: "医药代表", seniority: "junior", salaryRange: [8000, 16000] },
    { title: "生物信息学工程师", seniority: "mid", salaryRange: [18000, 35000] },
    { title: "医疗器械研发", seniority: "senior", salaryRange: [25000, 48000] },
    { title: "药物化学研究员", seniority: "junior", salaryRange: [10000, 20000] },
    { title: "质量管理QA", seniority: "mid", salaryRange: [15000, 28000] },
    { title: "注册事务专员", seniority: "junior", salaryRange: [10000, 18000] },
    { title: "医学联络官", seniority: "senior", salaryRange: [30000, 50000] },
    { title: "IVD研发工程师", seniority: "mid", salaryRange: [18000, 32000] },
    { title: "临床数据分析师", seniority: "mid", salaryRange: [15000, 30000] },
    { title: "药效研究员", seniority: "junior", salaryRange: [10000, 19000] },
    { title: "医学事务经理", seniority: "senior", salaryRange: [28000, 50000] },
  ],
};

const LOCATIONS = [
  "北京", "上海", "深圳", "广州", "杭州", "成都", "南京", "武汉",
  "苏州", "西安", "长沙", "天津", "重庆", "宁波", "厦门", "珠海",
  "合肥", "济南", "青岛", "大连", "福州", "东莞", "佛山", "无锡",
];

const JOB_TYPES = ["full-time", "internship", "full-time", "full-time", "full-time", "internship"];
const CURRENCY = "CNY";

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randomDate(): string {
  const now = new Date();
  const future = new Date(now);
  future.setDate(now.getDate() + rand(7, 90));
  return future.toISOString().split("T")[0];
}

const INDUSTRY_ZH: Record<string, string> = {
  fintech: "金融科技",
  consulting: "咨询",
  technology: "科技/互联网",
  banking: "银行",
  healthcare: "医疗健康",
};

function generateDescription(title: string, company: string, industry: string): string {
  const templates = [
    `我们正在寻找一位优秀的${title}加入${company}的${INDUSTRY_ZH[industry]}团队。你将与行业顶尖人才共事，参与核心业务系统的设计与开发，直接推动业务增长。`,
    `${company}正在扩大团队规模，急需${title}加入。在这里，你将接触到最前沿的技术栈，解决真实世界中的复杂问题，并有清晰的职业发展路径。`,
    `${company}诚聘${title}。该岗位将直接向部门负责人汇报，参与重点项目，并有机会在公司快速成长的过程中承担更大的责任。`,
    `加入${company}，成为我们${INDUSTRY_ZH[industry]}业务线的核心成员。我们提供有竞争力的薪酬、弹性工作制和良好的团队氛围。`,
  ];
  return pick(templates);
}

function generateRequirements(title: string): string {
  const reqs = [
    `- 本科及以上学历，计算机或相关专业优先\n- ${rand(1, 5)}年以上相关工作经验\n- 熟练掌握相关工具和技术栈\n- 良好的沟通能力和团队协作精神\n- 有较强的学习能力和自我驱动力`,
    `- 硕士学历优先\n- ${rand(1, 3)}年以上${title}相关经验\n- 有带领团队或项目的经验\n- 数据驱动，具备分析思维\n- 能在快节奏环境中高效工作`,
    `- 本科及以上学历\n- 应届生或${rand(1, 2)}年以内工作经验\n- 对${INDUSTRY_ZH[pick(Object.keys(INDUSTRY_ZH))]}行业有热情\n- 扎实的专业基础\n- 积极主动，善于解决问题`,
  ];
  return pick(reqs);
}

function generateResponsibilities(title: string, industry: string): string {
  const respMap: Record<string, string[]> = {
    fintech: [
      `- 负责金融产品需求分析和方案设计\n- 参与核心交易系统的开发和优化\n- 与风控、合规团队协作确保系统安全\n- 跟踪行业动态，持续改进产品体验`,
    ],
    consulting: [
      `- 为客户提供战略咨询服务\n- 进行市场调研和数据分析\n- 撰写咨询报告和方案建议\n- 参与客户会议和项目交付`,
    ],
    technology: [
      `- 参与核心系统的架构设计和开发\n- 负责功能模块的编码实现和测试\n- 进行代码评审和技术文档编写\n- 持续优化系统性能和稳定性`,
    ],
    banking: [
      `- 负责业务条线的日常管理和推进\n- 维护客户关系并拓展业务渠道\n- 进行风险管理和合规审查\n- 完成各项业绩指标`,
    ],
    healthcare: [
      `- 参与药品/医疗器械的研发项目\n- 进行临床数据分析和报告撰写\n- 与医院和研究机构沟通协作\n- 跟踪行业法规变化，确保合规`,
    ],
  };
  return pick(respMap[industry] || respMap.technology);
}

interface Job {
  source: string;
  source_url: string;
  title: string;
  company: string;
  location: string;
  description: string;
  requirements: string;
  responsibilities: string;
  salary_min: number;
  salary_max: number;
  salary_currency: string;
  deadline: string;
  job_type: string;
  industry: string;
  role_type: string;
  seniority: string;
  tags: string[];
}

function generateJobs(): Job[] {
  const jobs: Job[] = [];
  const usedKeys = new Set<string>();

  for (let i = 0; i < 400; i++) {
    const industry = pick(["fintech", "technology", "consulting", "banking", "healthcare"] as const);
    const roleTemplate = pick(ROLES[industry]);
    const company = pick(COMPANIES[industry]);
    const location = pick(LOCATIONS);
    const title = roleTemplate.title;
    const jobType = pick(JOB_TYPES);
    const [min, max] = roleTemplate.salaryRange;

    // Vary the salary a bit
    const salaryVariance = 0.15;
    const salaryMin = Math.round(min * (1 + (Math.random() - 0.5) * salaryVariance * 2) / 1000) * 1000;
    const salaryMax = Math.round(max * (1 + (Math.random() - 0.5) * salaryVariance * 2) / 1000) * 1000;

    // Prevent duplicate company+title combos
    const key = `${company}:${title}`;
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);

    const tags = [
      ...(jobType === "internship" ? ["实习", "校招"] : []),
      ...(roleTemplate.seniority === "junior" ? ["应届生可投"] : []),
      ...(roleTemplate.seniority === "senior" ? ["核心岗位"] : []),
      ...pickN(["弹性工作", "五险一金", "年终奖", "股票期权", "带薪年假", "补充医疗", "餐补", "交通补贴", "免费健身房", "团建旅游", "下午茶", "远程办公", "大牛带队", "扁平管理", "技术驱动"], rand(2, 5)),
    ];

    // Generate role_type from title
    let roleType = "other";
    const t = title.toLowerCase();
    if (t.includes("前端") || t.includes("frontend")) roleType = "frontend";
    else if (t.includes("后端") || t.includes("java") || t.includes("go") || t.includes("python")) roleType = "backend";
    else if (t.includes("算法") || t.includes("机器学习") || t.includes("nlp") || t.includes("视觉") || t.includes("模型")) roleType = "algorithm";
    else if (t.includes("产品") || t.includes("product")) roleType = "product";
    else if (t.includes("设计") || t.includes("ui") || t.includes("ux")) roleType = "design";
    else if (t.includes("测试") || t.includes("qa")) roleType = "qa";
    else if (t.includes("运维") || t.includes("devops") || t.includes("sre")) roleType = "devops";
    else if (t.includes("数据") || t.includes("data")) roleType = "data";
    else if (t.includes("客户") || t.includes("销售") || t.includes("代表")) roleType = "sales";
    else if (t.includes("经理") || t.includes("管理")) roleType = "management";
    else if (t.includes("咨询") || t.includes("顾问")) roleType = "consulting";
    else if (t.includes("研发") || t.includes("开发")) roleType = "backend";

    const job: Job = {
      source: "seed",
      source_url: null as any,
      title,
      company,
      location,
      description: generateDescription(title, company, industry),
      requirements: generateRequirements(title),
      responsibilities: generateResponsibilities(title, industry),
      salary_min: salaryMin,
      salary_max: salaryMax,
      salary_currency: CURRENCY,
      deadline: randomDate(),
      job_type: jobType,
      industry,
      role_type: roleType,
      seniority: roleTemplate.seniority,
      tags,
    };

    jobs.push(job);
  }

  return jobs;
}

// ── Main ──
console.log("[SeedJobs] Generating 300 job listings...");
const jobs = generateJobs();
console.log(`[SeedJobs] Generated ${jobs.length} jobs`);

const insert = db.prepare(`
  INSERT INTO jobs (source, source_url, title, company, location, description, requirements, responsibilities, salary_min, salary_max, salary_currency, deadline, job_type, industry, role_type, seniority, tags, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
`);

const insertAll = db.transaction((items: Job[]) => {
  for (const j of items) {
    insert.run(
      j.source,
      j.source_url,
      j.title,
      j.company,
      j.location,
      j.description,
      j.requirements,
      j.responsibilities,
      j.salary_min,
      j.salary_max,
      j.salary_currency,
      j.deadline,
      j.job_type,
      j.industry,
      j.role_type,
      j.seniority,
      JSON.stringify(j.tags),
    );
  }
});

// Clear existing seed jobs first
db.prepare("DELETE FROM jobs WHERE source = 'seed'").run();
console.log("[SeedJobs] Cleared existing seed jobs");

insertAll(jobs);
console.log(`[SeedJobs] Inserted ${jobs.length} jobs`);

// Print summary
const count = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status = 'active'").get() as any;
const byIndustry = db.prepare("SELECT industry, COUNT(*) as c FROM jobs GROUP BY industry ORDER BY c DESC").all() as any[];
const byLocation = db.prepare("SELECT location, COUNT(*) as c FROM jobs GROUP BY location ORDER BY c DESC LIMIT 10").all() as any[];

console.log(`\nTotal active jobs: ${count.c}`);
console.log("\nBy industry:");
for (const r of byIndustry) console.log(`  ${r.industry}: ${r.c}`);
console.log("\nTop 10 locations:");
for (const r of byLocation) console.log(`  ${r.location}: ${r.c}`);

// Verify data
const samples = db.prepare("SELECT title, company, location, salary_min, salary_max, industry FROM jobs LIMIT 10").all() as any[];
console.log("\nSample jobs:");
for (const s of samples) console.log(`  ${s.title} @ ${s.company} (${s.location}) ${s.salary_min}-${s.salary_max} CNY [${s.industry}]`);

console.log("\n[Done] Job database is ready!");
