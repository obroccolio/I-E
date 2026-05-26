import db from "./connection.ts";

const cities = ["北京","深圳","广州","杭州","成都","南京","武汉","苏州","西安","长沙"];
const companies = ["商汤科技","旷视科技","科大讯飞","地平线","云从科技","依图科技","第四范式","寒武纪","壁仞科技","燧原科技"];

const insert = db.prepare(
  `INSERT INTO jobs (source,source_url,title,company,location,description,requirements,responsibilities,salary_min,salary_max,salary_currency,deadline,job_type,industry,role_type,seniority,tags,status)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
);

const now = new Date();
for (let i = 0; i < 10; i++) {
  const dl = new Date(now);
  dl.setDate(now.getDate() + 20 + Math.floor(Math.random() * 40));
  const smin = 30000 + Math.floor(Math.random() * 20000);
  const smax = smin + 15000 + Math.floor(Math.random() * 15000);
  insert.run(
    "seed-algo", `algo://${i}`,
    "算法工程师", companies[i], cities[i],
    `${companies[i]} 正在寻找算法工程师。负责核心AI算法研发，参与模型训练与部署，解决实际业务问题。`,
    `- 硕士及以上学历，计算机/AI相关专业\n- 扎实的机器学习/深度学习基础\n- 熟练PyTorch/TensorFlow\n- 有顶会论文或竞赛经验优先`,
    `- 参与核心算法模块的设计和实现\n- 模型训练、调优和部署落地\n- 跟踪前沿技术，推动算法创新\n- 与工程团队协作完成产品交付`,
    smin, smax, "CNY", dl.toISOString().split("T")[0],
    "full-time", "technology", "algorithm", "mid",
    JSON.stringify(["核心岗位","大牛带队","股票期权","论文发表","GPU算力"]),
    "active",
  );
}

const c = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE role_type = 'algorithm'").get() as any;
console.log(`Added 10 algorithm engineer jobs. Total algorithm jobs: ${c.c}`);
