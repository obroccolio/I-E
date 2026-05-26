import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "../../lib/adminApi";
import { api } from "../../lib/api";
import {
  ChevronLeft, ChevronRight, RefreshCw, Globe, Loader2,
  CheckCircle2, XCircle, Cookie
} from "lucide-react";

export default function AdminSystem() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<any>(null);
  const [config, setConfig] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // ── Scraping & Cookie management ──
  const [scrapePlatform, setScrapePlatform] = useState("boss");
  const [scraping, setScraping] = useState(false);
  const [scrapeSteps, setScrapeSteps] = useState<any[]>([]);
  const [scrapeResult, setScrapeResult] = useState("");
  const [cookieText, setCookieText] = useState("");
  const [cookiePlatform, setCookiePlatform] = useState("boss");
  const [cookieStatus, setCookieStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");

  const cookiePlatformLabel = cookiePlatform === "boss" ? "Boss 直聘" : cookiePlatform === "liepin" ? "猎聘" : "智联招聘";

  const handleCheckCookies = async () => {
    if (!cookieText.trim()) return;
    setCookieStatus("checking");
    try {
      await api.savePlatformCookies(cookiePlatform, cookieText.trim());
      const res = await api.checkPlatformCookies(cookiePlatform);
      setCookieStatus(res.valid ? "valid" : "invalid");
    } catch {
      setCookieStatus("invalid");
    }
  };

  const handleScrape = async () => {
    if (scraping) return;
    setScraping(true);
    setScrapeSteps([]);
    setScrapeResult("");
    try {
      const result = await api.streamScrape(
        scrapePlatform,
        [],
        ["上海", "北京", "深圳", "杭州", "成都"],
        10,
        (step: any) => setScrapeSteps(prev => [...prev, step]),
      );
      setScrapeResult(`共抓取 ${result.total} 条，成功导入 ${result.inserted} 条`);
    } catch (e: any) {
      setScrapeResult(`爬取失败: ${e.message}`);
    }
    setScraping(false);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [h, c, a] = await Promise.all([
        adminApi.health(),
        adminApi.listConfig(),
        adminApi.listAuditLog({ page: logPage }).catch(() => ({ data: [], totalPages: 1 })),
      ]);
      setHealth(h);
      setConfig(c.config || c.data || []);
      setAuditLog(a.data || []);
      setLogTotal(a.totalPages || 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleConfigSave = async (key: string) => {
    await adminApi.updateConfig(key, editValue);
    setEditingKey(null);
    load();
  };

  if (loading) return <div className="p-8 text-gray-400">{t("common.loading")}</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">{t("admin.system.title")}</h1>

      {/* Health */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("admin.system.health")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t("admin.system.db")}</p>
            <p className={`text-lg font-bold ${health?.db === "connected" ? "text-green-600" : "text-red-500"}`}>{health?.db || "-"}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t("admin.system.dbSize")}</p>
            <p className="text-lg font-bold text-gray-900">{health?.dbSize || "-"}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t("admin.system.totalUsers")}</p>
            <p className="text-lg font-bold text-gray-900">{health?.totalUsers ?? "-"}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t("admin.system.totalJobs")}</p>
            <p className="text-lg font-bold text-gray-900">{health?.totalJobs ?? "-"}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t("admin.system.uptime")}</p>
            <p className="text-lg font-bold text-gray-900">{health?.uptime || "-"}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t("admin.system.aiService")}</p>
            <p className={`text-lg font-bold ${health?.aiEnabled ? "text-green-600" : "text-gray-400"}`}>
              {health?.aiEnabled ? t("admin.system.enabled") : t("admin.system.disabled")}
            </p>
          </div>
        </div>
      </section>

      {/* Config */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("admin.system.config")}</h2>
          <button onClick={load} className="p-2 hover:bg-gray-100 rounded-lg"><RefreshCw className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{t("admin.system.configKey")}</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{t("admin.system.configValue")}</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{t("admin.system.configDesc")}</th>
              </tr>
            </thead>
            <tbody>
              {config.length === 0 ? (
                <tr><td colSpan={3} className="text-center py-8 text-gray-400">{t("common.noData")}</td></tr>
              ) : config.map((row: any) => (
                <tr key={row.key} className="border-b border-gray-50">
                  <td className="px-5 py-3 text-sm font-mono text-gray-700">{row.key}</td>
                  <td className="px-5 py-3">
                    {editingKey === row.key ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="py-1.5 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm w-48"
                        />
                        <button onClick={() => handleConfigSave(row.key)} className="px-3 py-1.5 bg-[#113a7a] text-white rounded-lg text-xs">{t("common.save")}</button>
                        <button onClick={() => setEditingKey(null)} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">{t("common.cancel")}</button>
                      </div>
                    ) : (
                      <span
                        className="text-sm text-gray-700 cursor-pointer hover:text-[#5c9be6]"
                        onClick={() => { setEditingKey(row.key); setEditValue(row.value || ""); }}
                      >
                        {row.value || "-"}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500">{row.description || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Multi-Platform Scraping ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">多平台岗位爬取</h2>
        </div>

        {/* Cookie Management */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden mb-6">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                <Cookie className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <div className="font-medium text-gray-900">平台 Cookie 管理（仅用于爬取）</div>
                <div className="text-sm text-gray-500">
                  {cookieStatus === "valid"
                    ? `${cookiePlatformLabel} Cookie 有效`
                    : cookieStatus === "invalid"
                    ? `${cookiePlatformLabel} Cookie 无效，请重新获取`
                    : `配置各平台 Cookie 以启用岗位爬取`}
                </div>
              </div>
              {cookieStatus === "valid" && <CheckCircle2 className="w-5 h-5 text-green-500 ml-auto shrink-0" />}
              {cookieStatus === "invalid" && <XCircle className="w-5 h-5 text-red-400 ml-auto shrink-0" />}
            </div>

            {/* Platform selector for cookie */}
            <div className="flex items-center gap-2 mb-3">
              {(["boss", "liepin", "zhaopin"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => { setCookiePlatform(p); setCookieText(""); setCookieStatus("idle"); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${cookiePlatform === p ? "bg-[#113a7a] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  {p === "boss" ? "Boss 直聘" : p === "liepin" ? "猎聘" : "智联招聘"}
                </button>
              ))}
            </div>

            <textarea
              value={cookieText}
              onChange={(e) => { setCookieText(e.target.value); setCookieStatus("idle"); }}
              placeholder={cookiePlatform === "boss"
                ? `[{"name":"__zp_stoken__","value":"...","domain":".zhipin.com",...}]`
                : cookiePlatform === "liepin"
                ? `[{"name":"lt_auth","value":"...","domain":".liepin.com",...}]`
                : `[{"name":"at","value":"...","domain":".zhaopin.com",...}]`}
              rows={4}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[#5c9be6]/20 focus:border-[#5c9be6]"
            />
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-gray-400">
                登录目标网站后，通过 EditThisCookie 扩展导出 Cookie JSON
              </p>
              <button
                onClick={handleCheckCookies}
                disabled={!cookieText.trim() || cookieStatus === "checking"}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#113a7a] text-white rounded-lg text-xs font-semibold hover:bg-[#0d2b5c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {cookieStatus === "checking" ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> 验证中...</>
                ) : (
                  "验证 Cookie"
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Scraping Control */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Globe className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <div className="font-medium text-gray-900">启动爬取任务</div>
                <div className="text-sm text-gray-500">自动爬取 5 城 × 30+ 关键词的真实岗位并导入数据库</div>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4">
              {(["boss", "liepin", "zhaopin"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setScrapePlatform(p)}
                  disabled={scraping}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${scrapePlatform === p ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"} disabled:opacity-40`}
                >
                  {p === "boss" ? "Boss 直聘" : p === "liepin" ? "猎聘" : "智联招聘"}
                </button>
              ))}
            </div>

            <button
              onClick={handleScrape}
              disabled={scraping}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {scraping ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 爬取中...</>
              ) : (
                <><Globe className="w-4 h-4" /> 开始爬取</>
              )}
            </button>

            {scrapeResult && (
              <p className={`mt-3 text-sm font-medium ${scrapeResult.includes("失败") ? "text-red-500" : "text-emerald-600"}`}>
                {scrapeResult}
              </p>
            )}

            {scrapeSteps.length > 0 && (
              <div className="mt-3 space-y-1.5 max-h-60 overflow-y-auto bg-gray-50 rounded-xl p-4">
                {scrapeSteps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
                    <span className="shrink-0 mt-0.5">
                      {step.type === "done" ? "✅" : step.type === "error" ? "❌" : step.type === "saving" ? "💾" : step.type === "progress" ? `[${step.current}/${step.total}]` : "⏳"}
                    </span>
                    <div>
                      <span className="font-medium">{step.label}</span>
                      <span className="text-gray-400 ml-1">{step.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Audit Log */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("admin.system.auditLog")}</h2>
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{t("common.id")}</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{t("admin.system.admin")}</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{t("admin.system.action")}</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{t("admin.system.targetType")}</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{t("admin.system.targetId")}</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{t("common.time")}</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">{t("admin.system.noLogs")}</td></tr>
              ) : auditLog.map((log: any) => (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3.5 text-sm text-gray-500">{log.id}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{log.admin_email || log.admin_id}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-700">{log.action}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{log.target_type}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{log.target_id}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{log.created_at?.slice(0, 16)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logTotal > 1 && (
          <div className="flex items-center justify-center gap-4 mt-4">
            <button disabled={logPage <= 1} onClick={() => setLogPage(logPage - 1)} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"><ChevronLeft className="w-5 h-5" /></button>
            <span className="text-sm text-gray-600">{t("common.page")} {logPage} {t("common.of")} {logTotal}</span>
            <button disabled={logPage >= logTotal} onClick={() => setLogPage(logPage + 1)} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
          </div>
        )}
      </section>
    </div>
  );
}
