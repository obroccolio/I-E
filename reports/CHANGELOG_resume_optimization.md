# Jobro 简历优化功能 — 更新日志

> 版本：v1.3.0
> 日期：2026-05-14
> 范围：简历优化模块从零构建至完整交付

---

## v1.3.0 — 借鉴 resume-optimizer 全面升级

**新增功能**

- **30 秒初判**：优化前 AI 自动生成一句结论——"面试官会继续看吗？最致命的问题是什么？最大亮点是什么？"以深色卡片醒目展示
- **红旗扫描系统**：6 类问题自动检测并分级预警
  - 🔴 纯职责描述（只写"负责了X"没写做出什么）
  - 🟠 玩具项目（外卖/秒杀/博客/学生管理等常见练习项目）
  - 🟠 「精通」无据（多处声明精通但经历条目不足以支撑）
  - 🟠 空洞自评（"热情积极/责任心强"等无区分度表述）
  - 🟡 外包/驻场经历（中软国际/OD 等标签处理）
  - 🟡 短期频繁跳槽（一年内多段经历未解释原因）
- **价值提炼表**：优化前先逐条拆解弱描述——识别交付产物、可感知结果、缺失量化点、推荐改写方向。以可折叠表格展示
- **STAR/CAR/决策-权衡/产物导向**：四种改写公式融入 AI prompt，根据场景自动选用最合适的叙事结构
- **「没有数字」的替代表达**：不编造数据时自动使用范围、频率、变化描述（如"从手工到自动化""从无法追踪到全链路可观测"）
- **占位符规范**：缺失关键信息时标记 `[待补：...]` `[项目描述待补：...]`，不凭空脑补
- **项目上下文检查**：检测每段经历是否有项目背景描述（系统定位 + 服务对象 + 业务问题）
- **一页简历压缩**：独立 API + 前端一键生成。按相关性优先、高密度 bullet、技能只保留筛选价值的原则压缩
- **优化结果新增字段**：`verdict`、`redFlags`、`valueExtractions`、`projectContext`、`onePageVersion`
- **前端新增区块**：30 秒初判卡片、红旗警告面板、价值提炼表（可折叠）、编造警告面板、一页版简历展示区、压缩选项复选框

**后端变更**
- `services/resumeScorer.ts` — 新增 `detectRedFlags()`、`checkProjectContext()`；`ResumeScore` 新增 `redFlags` 字段；导出 `RedFlag` 类型
- `services/resumeOptimizer.ts` — 重写 prompt 体系（融入四种改写公式 + 占位符规范 + 无数字替代表达）；新增 `generateVerdict()`、`extractValue()`、`compressToOnePage()`；`OptimizationResult` 新增 `verdict`、`redFlags`、`valueExtractions`、`projectContext`、`onePageVersion`
- `routes/resumeOptimization.ts` — 新增 `POST /api/resume/compress` 端点；`optimize` 端点支持 `includeOnePage` 参数

**前端变更**
- `screens/ResumeOptimizationScreen.tsx` — 全面重写（≈400 行），新增 30 秒初判卡片、红旗警告面板、价值提炼表格、一页版区域、压缩选项

---

## v1.2.0 — 从「量化」改为「具体化」

**理念变更**：不再要求 AI 用数字量化成果（容易导致编造），改为要求具体描述技术方案、工具使用和问题解决过程。

**新增功能**
- **具体度评分**：替代原「冲击力」维度。评分依据从"数数字出现次数"改为"检测技术细节密度、方案描述、问题解决结构"
- **编造数据检测**：自动扫描优化后新出现的 8 类高风险数据（性能百分比、响应时间优化、业务规模、日均数据等），在前端以黄色警告框标注
- `detectFabricatedNumbers()` 函数，对比原始简历与优化后简历的数字差异

**后端变更**
- `services/resumeScorer.ts` — `scoreImpact()` 重命名为 `scoreSpecificity()`；新增 `countSpecificBullets()`、`detectFabricatedNumbers()`；导出 `FabricationWarning` 类型
- `services/resumeOptimizer.ts` — prompt 从"每条经历必须包含量化成果"改为"描述你具体用了什么技术/工具/方法，解决了什么问题，不要凭空编造数字"；`OptimizationResult` 新增 `fabricationWarnings`

**前端变更**
- `screens/ResumeOptimizationScreen.tsx` — 评分进度条标签从「冲击力」改为「具体度」；新增编造警告黄色面板

---

## v1.1.0 — 前端页面落地

**新增功能**
- 简历优化功能独立页面 `/resume-optimization`
- 双栏布局：左栏输入（简历文本 + 目标 JD）+ 右栏结果展示
- 六维评分可视化：彩色进度条 + 可展开详细诊断
- 优化步骤实时展示（通过的 + 被门控丢弃的）
- 优化前后对比：并排展示原始和优化后简历
- 一键复制优化结果
- 侧边栏新增「简历优化」导航入口（Sparkles 图标）

**前端变更**
- `screens/ResumeOptimizationScreen.tsx` — 新建（≈280 行）
- `lib/api.ts` — 新增 `scoreResume()`、`optimizeResume()`
- `App.tsx` — 新增路由 `/resume-optimization`
- `components/Sidebar.tsx` — 新增导航项

---

## v1.0.0 — 简历评分与优化引擎

**核心架构**

- **六维评分引擎**：结构完整度 (15%)、具体度 (25%)、动词力 (15%)、精炼度 (15%)、结构清晰度 (10%)、关键词匹配 (20%)
- **修改门控机制**：优化后逐维对比，只保留每一项分数都不低于原始版本的修改
- **两轮优化流程**：Round 1 分段优化（经历 → 技能 → 摘要 → 教育）→ Round 2 全文润色

**新增 API**

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/resume/score` | POST | 对简历进行六维评分，不做修改 |
| `/api/resume/optimize` | POST | 评分 + 逐段优化 + 门控 + 返回最优版本 |

**新增文件**

| 文件 | 说明 |
|------|------|
| `src/backend/services/resumeScorer.ts` | 六维评分引擎（≈400 行） |
| `src/backend/services/resumeOptimizer.ts` | 分段优化 + 门控引擎（≈240 行） |
| `src/backend/routes/resumeOptimization.ts` | API 路由 |
| `src/backend/index.ts` | 注册 `/api/resume` 路由 |

---

## 整体架构

```
POST /api/resume/optimize
         │
         ▼
┌─────────────────────────────┐
│  Step 0: 30 秒初判           │  → verdict
│  Step 1: 价值提炼            │  → valueExtractions
│  Step 2: 六维评分            │  → originalScore
│  Step 3-4: 分段优化 + 门控    │  → steps (逐段)
│  Step 5: 全文润色            │  → optimizedText
│  Step 6: 编造检测 + 红旗扫描  │  → fabricationWarnings, redFlags
│  Step 7: 一页压缩（可选）     │  → onePageVersion
└─────────────────────────────┘
```

## 累计新增/修改文件

| 文件 | 变更类型 | 行数 |
|------|---------|------|
| `src/backend/services/resumeScorer.ts` | 新增 | ~500 |
| `src/backend/services/resumeOptimizer.ts` | 新增 | ~310 |
| `src/backend/routes/resumeOptimization.ts` | 新增 | ~60 |
| `src/backend/index.ts` | 修改 | +2 |
| `src/frontend/src/screens/ResumeOptimizationScreen.tsx` | 新增 | ~400 |
| `src/frontend/src/lib/api.ts` | 修改 | +2 |
| `src/frontend/src/App.tsx` | 修改 | +2 |
| `src/frontend/src/components/Sidebar.tsx` | 修改 | +2 |
