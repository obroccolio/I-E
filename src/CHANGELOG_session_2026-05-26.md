# CHANGELOG — 2026-05-23 ~ 2026-05-26

## 一、多平台爬取与去重体系

### 新增文件

| 文件 | 说明 |
|---|---|
| `src/backend/services/liepinAutomation.ts` | 猎聘(Liepin)爬虫 — Puppeteer 实现，Cookie 管理、分页搜索、列表提取、详情采集、标准化入库 |
| `src/backend/services/zhaopinAutomation.ts` | 智联招聘(Zhaopin)爬虫 — 同上架构，适配智联页面 DOM 结构 |
| `src/backend/services/jobDedup.ts` | LLM 跨平台去重服务 — 对同公司多岗位调用 LLM 判断重复分组，写入 `group_id` |

### 修改文件

| 文件 | 改动 |
|---|---|
| `src/backend/db/init.ts` | 新增 `safeAddIndex()` 工具函数；`jobs` 表增加 `UNIQUE INDEX(source, source_url)` 同平台去重约束；新增 `group_id`、`first_seen`、`last_seen`、`seen_count` 列；`platform_sessions` 约束从 `UNIQUE(user_id)` 改为 `UNIQUE(user_id, platform)` 支持多平台；添加 `migratePlatformSessions()` 旧库兼容迁移 |
| `src/backend/services/bossAutomation.ts` | `source` 字段统一为 `'boss'`；新增 `normalizeCookies()` 过滤 EditThisCookie 多余字段、修正 `sameSite`；三处 `setCookie` 调用全部标准化；`checkCookieValid` 改用 `get_jobs-main` 风格的 DOM 元素检测（`li.nav-figure span.label-text`）替代文本匹配 |
| `src/backend/routes/boss.ts` | `GET /api/boss/scrape` 支持 `?platform=boss\|liepin\|zhaopin` 参数分发到对应爬虫；`POST /api/boss/cookies` 和 `GET /api/boss/cookies/status` 支持 `platform` 参数管理多平台 Cookie |
| `src/backend/routes/admin/jobs.ts` | 新增 `POST /api/admin/jobs/dedup` 和 `POST /api/admin/jobs/dedup/:company` 去重触发端点 |
| `src/backend/index.ts` | 无需变更（已有路由自动加载） |

### 前端

| 文件 | 改动 |
|---|---|
| `src/frontend/src/lib/api.ts` | 新增 `savePlatformCookies(platform, cookies)`、`checkPlatformCookies(platform)`、`streamScrape(platform, ...)` 多平台 API |
| `src/frontend/src/screens/SettingsScreen.tsx` | 新增猎聘 Cookie 输入+验证区域；新增智联 Cookie 输入+验证区域；岗位爬取区增加 Boss/猎聘/智联 三选一平台按钮；修复 `Globe` 重复导入编译错误 |

---

## 二、TF-IDF + 余弦相似度匹配引擎

### 重写文件

| 文件 | 说明 |
|---|---|
| `src/backend/services/matchingEngine.ts` | **完全重写** — 用 TF-IDF 向量化 + 余弦相似度替代原有的 token 重叠评分 |

### 新架构

```
用户 Profile + Preferences → buildUserText() → tokenize → TF-IDF 向量
                                                            ↓
所有 Jobs → buildJobText(标题×3加权) → tokenize → TF-IDF 向量 (内存缓存)
                                                            ↓
                                                    余弦相似度 × (1 + 结构加分)
                                                            ↓
                                                    排序 → Top 15 → AI Agent 重排
                                                            ↓
                                                    SSE Streaming → 浏览器
```

### 关键实现

- **TF**: `log(1 + termCount)` 对数归一化
- **IDF**: BM25 平滑 IDF `log((N - df + 0.5) / (df + 0.5))`
- **中文分词**: 汉字 bigram + 英文空格分词
- **向量缓存**: `Map<jobId, TfidfVector>` 内存缓存，version 标记自动失效
- **结构加分**: 乘法增强 `cosine × (1 + structuralBonus)`，角色匹配 +0.5、行业 +0.15、技能 +0.1、地点 +0.05
- **保留**: 硬过滤(行业/地点/排除)、AI Agent 工具调用重排、SSE 流式推送、回退机制

### 验证结果

Python 开发工程师 Profile（技能: Python/Django/Flask/MySQL/Redis/Docker，目标城市: 上海/北京/深圳/杭州）→ 9,575 个岗位中匹配出 5 个推荐：

| Score | 岗位 | 公司 | 城市 |
|---|---|---|---|
| 0.92 | python开发工程师 | 手心游戏 | 深圳 |
| 0.88 | python开发工程师 | 嘉为科技 | 北京 |
| 0.88 | Python | 华为 | 杭州 |
| 0.85 | python开发工程师 | 千仞科技 | 杭州 |
| 0.85 | python | 某大型互联网公司 | 上海 |

---

## 三、AI Prompt 增强

### 修改文件

| 文件 | 改动 |
|---|---|
| `src/backend/services/matchingEngine.ts` | 嵌入完整匹配纪律 prompt：Role → 三级核心纪律（当前要求优先/简历参考/冲突以当前为准）→ Extract-Filter-Match 三步执行 → 兜底机制。`runAgentMatching` 的 system prompt 完全重写 |
| `src/backend/routes/chat.ts` | 聊天助手 prompt 同步嵌入核心纪律，保持与匹配引擎行为一致 |

---

## 四、LLM + 正则双轨偏好提取 & 聊天上下文注入（方案 A+B）

### 问题

用户聊天中说"帮我也检索一下适合我的全栈工程师岗位"时，原有正则无法从中提取"全栈工程师"，匹配结果仍然全是原有偏好（嵌入式开发工程师）。

### 修改文件

| 文件 | 改动 |
|---|---|
| `src/backend/services/chatProcessor.ts` | **A 方案** — 新增 `extractPreferenceUpdatesLLM()`：将用户消息 + 现有偏好发给 LLM，返回结构化增量（区分"新增"vs"替换"）；新增 `applyDeltas()` 合并增量。保留原正则函数作为 fallback。同时重写正则模式：3 个僵硬正则 → 5 组灵活模式，覆盖 10 种常见口语 |
| `src/backend/routes/chat.ts` | 优先走 LLM 提取，失败降级到正则；响应中增加 `userMessage` 和 `prefUpdates` 字段供前端回传 |
| `src/backend/services/matchingEngine.ts` | **B 方案** — `runMatching` 新增 `chatContext` 参数；`runAgentMatching` 接受 `chatContext` 并注入 system prompt 顶部：「🔴 用户最新对话要求（最高优先级）」；多目标岗位时 fallback 增加多样性保证（每个目标角色至少 1 个代表） |
| `src/backend/routes/matching.ts` | SSE 端点解析 `chatContext` query param 并传给 `runMatching` |
| `src/frontend/src/lib/api.ts` | `streamMatching` 新增 `chatContext` 参数 |
| `src/frontend/src/screens/ChatScreen.tsx` | 调用匹配时传入用户原始消息作为 `chatContext` |

### 链路

```
用户输入 → LLM 提取偏好 → 写入 DB → 返回 reply
          ↘
            用户原文 → streamMatching(chatContext=原文)
              → runAgentMatching 的 system prompt 顶部:
                "🔴 用户最新对话要求（最高优先级 - 绝对否决权）
                 用户在当前对话中说：「帮我也检索一下适合我的全栈工程师岗位」"
              → AI 强制遵守
```

---

## 五、用户端 / 管理员端设置分离

### 修改文件

| 文件 | 改动 |
|---|---|
| `src/frontend/src/screens/SettingsScreen.tsx` | 移除猎聘 Cookie 区、智联 Cookie 区、多平台岗位爬取整区。用户端只保留 Boss Cookie（用于打招呼）+ 招呼语模板。移除未使用的 `Loader2`、`Zap` 导入和相关 state/handler |
| `src/frontend/src/screens/admin/AdminSystem.tsx` | 新增爬取管理区：三平台 Cookie 管理 tab（标注"仅用于爬取"）、多平台爬取启动 + SSE 实时进度流 |

---

## 六、修复的 Bug

1. `SettingsScreen.tsx` 第21行 `Globe` 重复导入导致编译失败
2. `platform_sessions` 表 `UNIQUE(user_id)` 限制每个用户只能存一个平台 Cookie → 改为 `UNIQUE(user_id, platform)`
3. `saveCookies` 的 `ON CONFLICT(user_id)` 与新约束不匹配 → 改为 `ON CONFLICT(user_id, platform)`
4. EditThisCookie 导出的 `sameSite: "unspecified"` 和 `storeId`/`id`/`hostOnly` 等多余字段导致 Puppeteer `setCookie` 报 `Protocol error (Network.deleteCookies)` → 新增 `normalizeCookies()` 统一处理
5. Cookie 验证用文本匹配不可靠 → 改为 `get_jobs-main` 风格的 DOM 元素检测
6. `adminUserService.deleteUser()` 漏删 `platform_sessions` 和 `boss_greet_settings`，导致配置过平台 Cookie 的用户（如李墨轩）因 FOREIGN KEY 约束无法删除 → 在 transaction 开头补充两张表的清理
