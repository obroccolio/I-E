import db from "./connection.ts";

const COMPANIES = [
  "字节跳动", "腾讯", "阿里巴巴", "美团", "小红书", "哔哩哔哩", "拼多多", "得物", "米哈游", "莉莉丝",
  "鹰角网络", "叠纸", "SHEIN", "蔚来", "华为", "商汤科技", "科大讯飞", "UCloud", "七牛云",
  "依图科技", "壁仞科技", "燧原科技", "达观数据", "明略科技", "深兰科技", "云从科技", "竹间智能", "芯驰科技", "地平线",
  "喜马拉雅", "饿了么", "携程", "阅文集团", "微盟", "小鹅通", "乐言科技", "特赞", "观远数据", "黑湖科技",
  "众安科技", "虎扑", "蜻蜓FM", "趣头条", "返利网", "洋码头", "爱回收", "樊登读书", "一条", "酷狗音乐",
];

const ROLES = [
  "前端开发工程师", "后端开发工程师", "算法工程师", "数据工程师", "Java开发工程师",
  "Go后端开发", "Python开发工程师", "全栈工程师", "DevOps工程师", "测试开发工程师",
  "产品经理", "数据分析师", "iOS开发工程师", "Android开发工程师", "安全工程师",
  "NLP算法工程师", "推荐系统工程师", "大模型应用开发", "AIGC工程师", "云原生开发工程师",
  "技术项目经理", "架构师", "SRE工程师", "大数据开发工程师", "AI产品经理",
  "嵌入式开发工程师", "游戏服务器开发", "图形学工程师", "系统运维工程师", "DBA",
];

const LOCATION = "上海";
const insert = db.prepare(
  `INSERT INTO jobs (source, source_url, title, company, location, description, requirements, responsibilities, salary_min, salary_max, salary_currency, deadline, job_type, industry, role_type, seniority, tags, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
);

const now = new Date();
let count = 0;

const insertAll = db.transaction(() => {
  for (const company of COMPANIES) {
    for (const title of ROLES) {
      if (Math.random() > 0.42) continue; // ~42% of combos
      const salaryMin = 18000 + Math.floor(Math.random() * 17000);
      const salaryMax = salaryMin + 8000 + Math.floor(Math.random() * 25000);
      const deadline = new Date(now);
      deadline.setDate(now.getDate() + 14 + Math.floor(Math.random() * 60));

      const tagPool = ["五险一金","年终奖","股票期权","带薪年假","补充医疗","餐补","免费健身房","下午茶","大牛带队","技术驱动","扁平管理","弹性工作","租房补贴","免费三餐","Mac办公"];
      const picked = tagPool.sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 4));

      const t = title.toLowerCase();
      let roleType = "other";
      if (t.includes("前端")) roleType = "frontend";
      else if (t.includes("后端") || t.includes("java") || t.includes("go") || t.includes("python") || t.includes("全栈")) roleType = "backend";
      else if (t.includes("算法") || t.includes("nlp") || t.includes("推荐") || t.includes("大模型") || t.includes("aigc") || t.includes("图形")) roleType = "algorithm";
      else if (t.includes("产品")) roleType = "product";
      else if (t.includes("数据") || t.includes("dba")) roleType = "data";
      else if (t.includes("测试")) roleType = "qa";
      else if (t.includes("运维") || t.includes("devops") || t.includes("sre")) roleType = "devops";
      else if (t.includes("安全")) roleType = "security";
      else if (t.includes("架构")) roleType = "backend";
      else if (t.includes("ios") || t.includes("android")) roleType = "mobile";
      else if (t.includes("云")) roleType = "devops";
      else if (t.includes("嵌入式")) roleType = "embedded";
      else if (t.includes("游戏")) roleType = "backend";

      insert.run(
        "seed-shanghai", null,
        title, company, LOCATION,
        `${company}正在寻找${title}加入上海团队。你将与行业顶尖人才共事，参与核心业务系统的设计与开发，在充满活力的上海办公室享受一流的工作环境。`,
        `- 本科及以上学历，计算机相关专业优先\n- 2-5年相关工作经验\n- 扎实的计算机基础\n- 良好的团队协作和沟通能力\n- 对技术有热情`,
        `- 参与核心系统的设计和开发\n- 负责功能模块的编码实现和测试\n- 进行代码评审和技术文档编写\n- 持续优化系统性能和稳定性`,
        salaryMin, salaryMax, "CNY", deadline.toISOString().split("T")[0],
        "full-time", "technology", roleType, "mid",
        JSON.stringify(picked),
      );
      count++;
    }
  }
});

insertAll();
console.log(`Added ${count} Shanghai mid-level tech jobs`);

const shTotal = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE location = '上海'").get() as any;
const shTech = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE location = '上海' AND industry = 'technology'").get() as any;
const shMid = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE location = '上海' AND seniority = 'mid'").get() as any;
const total = db.prepare("SELECT COUNT(*) as c FROM jobs").get() as any;

console.log(`\nDatabase summary:`);
console.log(`  Total jobs: ${total.c}`);
console.log(`  Shanghai jobs: ${shTotal.c}`);
console.log(`  Shanghai tech jobs: ${shTech.c}`);
console.log(`  Shanghai mid-level jobs: ${shMid.c}`);

// Sample
const samples = db.prepare("SELECT title, company, location, salary_min, salary_max, seniority, industry FROM jobs WHERE location = '上海' LIMIT 8").all() as any[];
console.log("\nSample Shanghai jobs:");
for (const s of samples) {
  console.log(`  ${s.title} @ ${s.company} ${s.salary_min}-${s.salary_max} CNY [${s.seniority}]`);
}
