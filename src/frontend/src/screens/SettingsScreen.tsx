import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { api } from "../lib/api";
import {
  LogOut,
  Trash2,
  FileText,
  Shield,
  Bell,
  Globe,
  HelpCircle,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
  MessageSquareText,
  Cookie,
} from "lucide-react";
import { Sidebar } from "../components/Sidebar";

export function SettingsScreen() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [bossCookies, setBossCookies] = useState("");
  const [bossGreeting, setBossGreeting] = useState("您好，我对{jobName}岗位很感兴趣，希望可以进一步沟通。");
  const [cookieStatus, setCookieStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [savingBoss, setSavingBoss] = useState(false);
  const [bossSaved, setBossSaved] = useState(false);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/");
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm(t("settings.deleteConfirm"))) return;
    try {
      await api.deleteAccount();
      localStorage.clear();
      navigate("/");
    } catch (e: any) {
      alert(e.message || "Failed to delete account");
    }
  };

  const handleCheckCookies = async () => {
    if (!bossCookies.trim()) return;
    setCookieStatus("checking");
    try {
      await api.saveBossCookies(bossCookies.trim());
      const res = await api.checkBossCookies();
      setCookieStatus(res.valid ? "valid" : "invalid");
    } catch {
      setCookieStatus("invalid");
    }
  };

  const handleSaveBossSettings = async () => {
    setSavingBoss(true);
    try {
      await api.saveBossSettings(bossGreeting);
      setBossSaved(true);
      setTimeout(() => setBossSaved(false), 2000);
    } catch {}
    finally { setSavingBoss(false); }
  };

  return (
    <div className="h-screen bg-white flex overflow-hidden">
      <Sidebar />
      <div className="flex-1 overflow-y-auto p-8 md:p-12">
        <div className="max-w-3xl mx-auto">
          <div className="mb-10">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">{t("settings.title")}</h1>
            <p className="text-gray-500 text-base">{t("settings.subtitle")}</p>
          </div>

          <div className="space-y-10">
            {/* Preferences Section */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">{t("settings.preferences")}</h2>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">

                {/* Notifications */}
                <div className="p-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600">
                      <Bell className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{t("settings.emailNotifications")}</div>
                      <div className="text-sm text-gray-500">{t("settings.emailNotificationsDesc")}</div>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={emailNotifications}
                      onChange={() => setEmailNotifications(!emailNotifications)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#113a7a]"></div>
                  </label>
                </div>

                <div className="p-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600">
                      <Bell className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{t("settings.pushNotifications")}</div>
                      <div className="text-sm text-gray-500">{t("settings.pushNotificationsDesc")}</div>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={pushNotifications}
                      onChange={() => setPushNotifications(!pushNotifications)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#113a7a]"></div>
                  </label>
                </div>

                {/* Language */}
                <div className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{t("settings.language")}</div>
                      <div className="text-sm text-gray-500">{t("settings.languageDesc")}</div>
                    </div>
                  </div>
                  <select
                    value={i18n.language.startsWith("zh") ? i18n.language : "en"}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-[#5c9be6] focus:border-[#5c9be6] block p-2.5 outline-none"
                  >
                    <option value="en">{t("settings.langEn")}</option>
                    <option value="zh-CN">{t("settings.langZhCN")}</option>
                    <option value="zh-HK">{t("settings.langZhHK")}</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Boss 直聘配置 Section */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Boss 直聘 · 一键打招呼</h2>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">

                {/* Cookie 管理 */}
                <div className="p-5 border-b border-gray-100">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                      <Cookie className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">Boss 直聘 Cookie</div>
                      <div className="text-sm text-gray-500">
                        {cookieStatus === "valid"
                          ? "Cookie 有效，可以正常使用打招呼功能"
                          : cookieStatus === "invalid"
                          ? "Cookie 无效，请重新获取"
                          : "粘贴 Boss 直聘的 Cookie 以启用自动打招呼"}
                      </div>
                    </div>
                    {cookieStatus === "valid" && <CheckCircle2 className="w-5 h-5 text-green-500 ml-auto shrink-0" />}
                    {cookieStatus === "invalid" && <XCircle className="w-5 h-5 text-red-400 ml-auto shrink-0" />}
                  </div>
                  <textarea
                    value={bossCookies}
                    onChange={(e) => { setBossCookies(e.target.value); setCookieStatus("idle"); }}
                    placeholder={`[{"name":"__zp_stoken__","value":"...","domain":".zhipin.com",...}]`}
                    rows={4}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[#5c9be6]/20 focus:border-[#5c9be6]"
                  />
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs text-gray-400">
                      在浏览器登录 boss.zhipin.com 后，从 DevTools → Application → Cookies 导出
                    </p>
                    <button
                      onClick={handleCheckCookies}
                      disabled={!bossCookies.trim() || cookieStatus === "checking"}
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

                {/* 招呼语模板 */}
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      <MessageSquareText className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">招呼语模板</div>
                      <div className="text-sm text-gray-500">点击「一键打招呼」时将自动发送此消息</div>
                    </div>
                  </div>
                  <textarea
                    value={bossGreeting}
                    onChange={(e) => setBossGreeting(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#5c9be6]/20 focus:border-[#5c9be6]"
                  />
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-md">{'{jobName}'} 职位名称</span>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-md">{'{company}'} 公司名</span>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-md">{'{salary}'} 薪资</span>
                    </div>
                    <button
                      onClick={handleSaveBossSettings}
                      disabled={savingBoss}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#113a7a] text-white rounded-lg text-xs font-semibold hover:bg-[#0d2b5c] disabled:opacity-40 transition-colors"
                    >
                      {bossSaved ? <><CheckCircle2 className="w-3.5 h-3.5" /> 已保存</> : savingBoss ? "保存中..." : "保存模板"}
                    </button>
                  </div>
                </div>

              </div>
            </section>

            {/* Support & Legal Section */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">{t("settings.supportLegal")}</h2>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <button className="w-full p-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600">
                      <HelpCircle className="w-5 h-5" />
                    </div>
                    <div className="font-medium text-gray-900">{t("settings.helpSupport")}</div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>
                <button className="w-full p-4 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="font-medium text-gray-900">{t("settings.termsOfService")}</div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>
                <button className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div className="font-medium text-gray-900">{t("settings.privacyPolicy")}</div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </section>

            {/* Account Actions Section */}
            <section>
              <h2 className="text-sm font-semibold text-red-600 uppercase tracking-wider mb-4">{t("settings.accountActions")}</h2>
              <div className="bg-white border border-red-100 rounded-2xl overflow-hidden shadow-sm">
                <button
                  onClick={handleLogout}
                  className="w-full p-4 border-b border-red-50 flex items-center gap-3 hover:bg-red-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <div className="font-medium text-red-600">{t("settings.logout")}</div>
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="w-full p-4 flex items-center gap-3 hover:bg-red-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-medium text-red-600">{t("settings.deleteAccount")}</div>
                  </div>
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
