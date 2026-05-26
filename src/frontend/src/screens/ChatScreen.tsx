import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { Send, Phone, MessageSquare, Briefcase, Menu, MapPin, CheckCircle2, Edit3, X, Clock, Loader2, Zap } from "lucide-react";
import { Sidebar } from "../components/Sidebar";
import { Logo } from "../components/Logo";
import { api } from "../lib/api";

const STEP_ICONS: Record<string, string> = {
  filter: "\u{1F50D}",
  scan: "\u{1F4CB}",
  tool_call: "\u{1F441}",
  tool_result: "\u{1F4C4}",
  scoring: "⚖️",
  done: "✅",
};

type ProfileData = {
  name?: string;
  education?: Array<{ school?: string; degree?: string; field?: string }>;
  experience?: Array<{ title?: string; company?: string; start?: string; end?: string }>;
  skills?: string[];
};

type JobData = {
  id: string;
  match_id: number;
  title: string;
  company: string;
  location: string;
  matchReason: string;
  time?: string;
  matchPercentage?: string;
  requirements?: string[];
  responsibilities?: string[];
  salary?: string;
  deadline?: string;
  applyMethod?: string;
};

type AgentStepItem = {
  type: string;
  label: string;
  detail: string;
};

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
  isInitial?: boolean;
  isJobMatch?: boolean;
  isProfileSummary?: boolean;
  isAgentProcess?: boolean;
  agentSteps?: AgentStepItem[];
  jobsData?: JobData[];
};

export function ChatScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasAddedSummary = useRef(false);

  const [greetingMatchId, setGreetingMatchId] = useState<number | null>(null);
  const [greetSteps, setGreetSteps] = useState<{ type: string; label: string; detail: string }[]>([]);
  const [greetDone, setGreetDone] = useState(false);

  const mapRecsToJobData = (recs: any[]): JobData[] => recs.map((r: any) => ({
    id: String(r.job_id ?? r.id),
    match_id: r.match_id,
    title: r.title,
    company: r.company,
    location: r.location || "",
    time: "Suggested",
    matchPercentage: `${Math.round((r.match_score ?? 0.7) * 100)}% Match`,
    matchReason: r.match_reason || "",
    requirements: r.requirements ? String(r.requirements).split("\n").filter(Boolean) : [],
    responsibilities: r.responsibilities ? String(r.responsibilities).split("\n").filter(Boolean) : [],
    salary: r.salary_min
      ? `$${r.salary_min.toLocaleString()}${r.salary_max ? ` - $${r.salary_max.toLocaleString()}` : ""} / month`
      : undefined,
    deadline: r.deadline || "",
    applyMethod: r.source_url || "",
  }));

  useEffect(() => {
    api.getProfile().then((data: any) => {
      if (data.profile) setProfile(data.profile);
    }).catch(() => {});
  }, []);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: t("chat.greeting"),
      isJobMatch: false,
    },
  ]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    api.getChatHistory().then((data: any) => {
      const history = data.messages || [];
      const pending = data.pendingMatches || [];

      if (history.length > 0) {
        const restored: Message[] = [
          { id: "0", role: "assistant", content: t("chat.greeting"), isJobMatch: false },
          ...history.map((m: any, i: number) => ({
            id: `hist-${i}`,
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ];

        if (pending.length > 0) {
          restored.push({
            id: "hist-jobs",
            role: "assistant",
            content: "",
            isJobMatch: true,
            jobsData: mapRecsToJobData(pending),
          });
        }

        setMessages(restored);
      } else if (pending.length > 0) {
        // New user with pre-generated matches from preferences screen
        setMessages([
          { id: "0", role: "assistant", content: t("chat.greeting"), isJobMatch: false },
          { id: "auto-recs", role: "assistant", content: "", isJobMatch: true, jobsData: mapRecsToJobData(pending) },
        ]);
      } else {
        // No matches yet — use SSE streaming for real-time Agent steps
        const agentMsgId = "auto-agent";
        setMessages([
          { id: "0", role: "assistant", content: t("chat.greeting"), isJobMatch: false },
          { id: agentMsgId, role: "assistant", content: "", isAgentProcess: true, agentSteps: [] },
        ]);
        api.streamMatching(10, (step) => {
          setMessages(prev => prev.map(m =>
            m.id === agentMsgId
              ? { ...m, agentSteps: [...(m.agentSteps || []), step] }
              : m
          ));
        }).then((recs) => {
          if (recs.length > 0) {
            setMessages(prev => [
              ...prev.filter(m => m.id !== agentMsgId),
              { id: "auto-recs", role: "assistant", content: "", isJobMatch: true, jobsData: mapRecsToJobData(recs) },
            ]);
          } else {
            setMessages(prev => prev.filter(m => m.id !== agentMsgId));
          }
        }).catch(() => {
          // Fallback to non-streaming
          api.getRecommendations(5).then((recData: any) => {
            const recs = recData.recommendations || [];
            if (recs.length > 0) {
              setMessages(prev => [
                ...prev.filter(m => m.id !== agentMsgId),
                { id: "auto-recs", role: "assistant", content: "", isJobMatch: true, jobsData: mapRecsToJobData(recs) },
              ]);
            } else {
              setMessages(prev => prev.filter(m => m.id !== agentMsgId));
            }
          }).catch(() => {});
        });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get("onboarding") === "complete" && !hasAddedSummary.current) {
      hasAddedSummary.current = true;
      navigate(location.pathname, { replace: true });

      setTimeout(() => {
        setMessages((prev) => {
          if (prev.some((m) => m.isProfileSummary)) return prev;
          return [
            ...prev,
            {
              id: Date.now().toString(),
              role: "assistant",
              content: t("chat.profileSummaryIntro"),
              isProfileSummary: true,
            },
          ];
        });
      }, 500);
    }
  }, [location, navigate]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const token = localStorage.getItem("token");
    if (!token) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "assistant", content: t("chat.notLoggedIn") },
      ]);
      return;
    }

    const userText = inputText;
    const newUserMsg: Message = { id: Date.now().toString(), role: "user", content: userText };
    setMessages((prev) => [...prev, newUserMsg]);
    setInputText("");
    setIsLoading(true);

    // Detect if user is asking about jobs or updating location/prefs — show Agent steps if so
    const jobKeywords = ["推荐", "工作", "岗位", "职位", "有什么", "适合我", "recommend", "jobs", "find me", "suggest", "match", "看看", "有没有", "帮我找", "找工作", "求职", "切换", "换成", "沿海", "上海", "北京", "深圳", "广州", "杭州", "成都", "南京", "武汉", "苏州"];
    const wantsJobs = jobKeywords.some(kw => userText.toLowerCase().includes(kw));

    let agentMsgId: string | undefined;
    if (wantsJobs) {
      agentMsgId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        { id: agentMsgId!, role: "assistant", content: "", isAgentProcess: true, agentSteps: [] },
      ]);
    }

    try {
      if (wantsJobs) {
        // Step 1: Send chat first to extract + save preference updates
        // Chat won't return recommendations — those come from SSE stream
        let firstReply = "";
        try {
          const chatData = await api.chat(userText);
          firstReply = chatData.reply || "";
        } catch { /* non-critical */ }

        // Step 2: SSE streaming matching with Agent steps
        // Pass user's message as chatContext so AI can honor current-turn requirements
        const recs = await api.streamMatching(10, (step) => {
          setMessages(prev => prev.map(m =>
            m.id === agentMsgId
              ? { ...m, agentSteps: [...(m.agentSteps || []), step] }
              : m
          ));
        }, userText);

        // Step 3: Remove agent process card, render final reply + cards
        if (agentMsgId) {
          setMessages(prev => prev.filter(m => m.id !== agentMsgId));
        }

        let reply = "";
        if (recs.length > 0) {
          reply = `根据您的偏好，我为您筛选了 ${recs.length} 个匹配岗位，请查看下方推荐卡片。`;
        } else {
          reply = firstReply || "暂未找到符合条件的岗位，您可以尝试调整偏好。";
        }

        const newMessages: Message[] = [];
        newMessages.push({ id: (Date.now() + 2).toString(), role: "assistant", content: reply });
        if (recs.length > 0) {
          newMessages.push({
            id: (Date.now() + 3).toString(),
            role: "assistant",
            content: "",
            isJobMatch: true,
            jobsData: mapRecsToJobData(recs),
          });
        }
        setMessages(prev => [...prev, ...newMessages]);
      } else {
        // Normal chat without matching
        const data = await api.chat(userText);
        const newMessages: Message[] = [
          { id: Date.now().toString(), role: "assistant", content: data.reply || t("chat.processing") },
        ];
        if (data.recommendations && data.recommendations.length > 0) {
          newMessages.push({
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: "",
            isJobMatch: true,
            jobsData: mapRecsToJobData(data.recommendations),
          });
        }
        setMessages(prev => [...prev, ...newMessages]);
      }
    } catch (error) {
      console.error(error);
      if (agentMsgId) {
        setMessages(prev => prev.filter(m => m.id !== agentMsgId));
      }
      setMessages(prev => [
        ...prev,
        { id: Date.now().toString(), role: "assistant", content: t("chat.errorGeneric") },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmProfile = async () => {
    const newUserMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: t("chat.profileConfirmed"),
    };
    setMessages((prev) => [...prev, newUserMsg]);

    const agentMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: agentMsgId, role: "assistant", content: "", isAgentProcess: true, agentSteps: [] },
    ]);

    try {
      const recs = await api.streamMatching(5, (step) => {
        setMessages(prev => prev.map(m =>
          m.id === agentMsgId
            ? { ...m, agentSteps: [...(m.agentSteps || []), step] }
            : m
        ));
      });
      if (recs.length === 0) {
        setMessages((prev) => [
          ...prev.filter(m => m.id !== agentMsgId),
          { id: (Date.now() + 2).toString(), role: "assistant", content: t("dashboard.noSuggestions") },
        ]);
        return;
      }
      setMessages((prev) => [
        ...prev.filter(m => m.id !== agentMsgId),
        {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: t("chat.profileSaved"),
          isJobMatch: true,
          jobsData: mapRecsToJobData(recs),
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev.filter(m => m.id !== agentMsgId),
        { id: (Date.now() + 2).toString(), role: "assistant", content: t("chat.errorGeneric") },
      ]);
    }
  };

  const handlePassJob = async (matchId: number) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "user",
        content: t("chat.notInterested"),
      },
    ]);

    try {
      await api.updateMatchStatus(matchId, "rejected");
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: t("chat.notInterestedReply"),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: t("chat.errorGeneric"),
        },
      ]);
    }
  };

  const handleApplyJob = async (matchId: number) => {
    try {
      await api.updateMatchStatus(matchId, "accepted");
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: t("chat.applySuccess"),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: t("chat.errorGeneric"),
        },
      ]);
    }
  };

  const handleGreet = async (jobId: number, matchId: number, jobTitle: string, company: string) => {
    if (greetingMatchId) return;
    setGreetingMatchId(matchId);
    setGreetSteps([]);
    setGreetDone(false);

    try {
      await api.streamBossGreet(jobId, (step) => {
        setGreetSteps(prev => [...prev, step]);
      });
      setGreetDone(true);
    } catch (err: any) {
      setGreetSteps(prev => [...prev, { type: "error", label: "打招呼失败", detail: err.message || "未知错误" }]);
      setGreetDone(true);
    }

    try { await api.updateMatchStatus(matchId, "accepted"); } catch {}

    setTimeout(() => {
      setGreetingMatchId(null);
      setGreetSteps([]);
      setGreetDone(false);
    }, 2500);
  };

  return (
    <div className="flex h-screen bg-white text-gray-900 font-sans overflow-hidden">
      {!selectedJob && <Sidebar />}

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-full relative">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-gray-200 bg-white shrink-0">
          <button className="p-2 -ml-2 text-gray-600">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-semibold">Jobro</span>
          <div className="w-8 h-8" /> {/* Spacer */}
        </header>

        {/* Greet Progress Overlay */}
        {greetingMatchId && (
          <div className="absolute inset-0 z-30 bg-white/60 backdrop-blur-sm flex items-start justify-center pt-32">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white border border-gray-200 rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4"
            >
              <div className="flex items-center gap-2 mb-4">
                {greetDone ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <div className="w-5 h-5 border-2 border-[#5c9be6] border-t-transparent rounded-full animate-spin" />
                )}
                <h3 className="font-semibold text-gray-900">Boss 直聘 · 一键打招呼</h3>
              </div>
              <div className="space-y-3">
                {greetSteps.map((step, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-2.5"
                  >
                    {step.type === "done" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    ) : step.type === "messaging" ? (
                      <Send className="w-4 h-4 text-[#5c9be6] mt-0.5 shrink-0" />
                    ) : (
                      <div className="w-2 h-2 bg-[#5c9be6] rounded-full mt-1.5 shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{step.label}</p>
                      <p className="text-xs text-gray-500">{step.detail}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
              {greetDone && (
                <button
                  onClick={() => { setGreetingMatchId(null); setGreetSteps([]); setGreetDone(false); }}
                  className="mt-4 w-full py-2 bg-green-50 text-green-700 rounded-lg text-sm font-semibold hover:bg-green-100 transition-colors"
                >
                  完成
                </button>
              )}
            </motion.div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-4xl mx-auto space-y-8">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1">
                    <Logo className="w-8 h-8" />
                  </div>
                )}

                <div className={`flex flex-col gap-2 w-full ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={`px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed ${
                      msg.role === "user"
                        ? "bg-gray-100 text-gray-900 max-w-[80%]"
                        : msg.isJobMatch
                        ? "bg-transparent px-0 py-0 w-full"
                        : msg.isAgentProcess
                        ? "bg-transparent px-0 py-0"
                        : "text-gray-900 whitespace-pre-wrap max-w-[80%]"
                    }`}
                  >
                    {msg.isAgentProcess ? (
                      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2.5 w-full max-w-md">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-2 h-2 bg-[#5c9be6] rounded-full animate-pulse" />
                          <p className="text-sm font-semibold text-[#113a7a]">{t("chat.agentMatching")}</p>
                        </div>
                        {msg.agentSteps?.map((step, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3 }}
                            className="flex items-start gap-2.5"
                          >
                            <span className="shrink-0 text-sm mt-0.5">{STEP_ICONS[step.type] || "•"}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900">{step.label}</p>
                              <p className="text-xs text-gray-500 truncate">{step.detail}</p>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : msg.isJobMatch && msg.jobsData ? (
                      <div>
                        <p className="text-[15px] text-gray-900 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    ) : msg.isProfileSummary ? (
                      <div>
                        <p className="text-[15px] text-gray-900 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>

                  {/* Profile Summary Card */}
                  {msg.isProfileSummary && (
                    <div className="mt-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm w-full max-w-2xl">
                      <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
                        <div className="w-16 h-16 bg-[#5c9be6]/20 rounded-full flex items-center justify-center text-[#113a7a] text-2xl font-bold">
                          {(profile?.name || "U")[0].toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 text-xl">{profile?.name || t("chat.newUser")}</h4>
                          <p className="text-gray-500 text-base">{t("chat.targetIndustries")}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t("chat.keyStrengths")}</p>
                          <div className="flex flex-wrap gap-2">
                            {(profile?.skills || []).slice(0, 4).map((skill, i) => (
                              <span key={i} className={`px-2.5 py-1 rounded-md text-xs font-semibold ${i % 2 === 0 ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>{skill}</span>
                            ))}
                            {(!profile?.skills || profile.skills.length === 0) && (
                              <span className="text-sm text-gray-400">{t("chat.noData")}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {profile?.experience && profile.experience.length > 0 && (
                        <div className="mb-6">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t("chat.workExperience")}</p>
                          <div className="space-y-4">
                            {profile.experience.map((exp, i) => (
                              <div key={i} className="relative pl-4 border-l-2 border-gray-200">
                                <div className={`absolute w-2.5 h-2.5 rounded-full -left-[6px] top-1.5 ring-4 ring-white ${i === 0 ? "bg-[#5c9be6]" : "bg-gray-300"}`}></div>
                                <h5 className="text-sm font-bold text-gray-900">{exp.title}</h5>
                                <p className="text-[#5c9be6] font-medium text-xs mb-1">{exp.company}</p>
                                <p className="text-xs text-gray-500">{exp.start}{exp.end ? ` - ${exp.end}` : ""}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {profile?.education && profile.education.length > 0 && (
                        <div className="mb-6">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t("chat.education")}</p>
                          {profile.education.map((edu, i) => (
                            <div key={i} className="relative pl-4 border-l-2 border-gray-200">
                              <div className="absolute w-2.5 h-2.5 bg-[#5c9be6] rounded-full -left-[6px] top-1.5 ring-4 ring-white"></div>
                              <h5 className="text-sm font-bold text-gray-900">{edu.school}</h5>
                              <p className="text-[#5c9be6] font-medium text-xs mb-1">{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={handleConfirmProfile}
                          className="flex-1 bg-[#113a7a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-[#0d2b5c] transition-colors flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                          {t("chat.looksGood")}
                        </button>
                        <button
                          onClick={() => navigate("/profile-confirmation")}
                          className="px-6 py-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors text-sm font-semibold flex items-center gap-2"
                        >
                          <Edit3 className="w-5 h-5" />
                          {t("common.edit")}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Job Match Card */}
                  {msg.isJobMatch && msg.jobsData && (
                    <div className="mt-4 w-full max-w-4xl">
                      <div className="flex overflow-x-auto pb-4 gap-4 snap-x hide-scrollbar">
                        {msg.jobsData.map((job) => (
                          <div
                            key={job.id}
                            onClick={() => setSelectedJob(job)}
                            className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm min-w-[300px] max-w-[320px] shrink-0 snap-start flex flex-col cursor-pointer hover:border-[#5c9be6]/50 transition-colors"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-bold text-gray-900 text-lg leading-tight line-clamp-2">{job.title}</h4>
                              {job.matchPercentage && (
                                <span className="bg-[#5c9be6]/20 text-[#113a7a] text-xs font-bold px-2 py-1 rounded-full shrink-0 ml-2">
                                  {t("chat.highMatch")}
                                </span>
                              )}
                            </div>
                            <p className="text-gray-600 font-medium text-sm mb-1">{job.company}</p>
                            <p className="text-gray-400 text-xs mb-4">{job.location} &middot; {job.time}</p>

                            <p className="text-sm text-gray-700 leading-relaxed line-clamp-3 mb-4 flex-1">{job.matchReason}</p>

                            <div className="flex gap-2 mt-auto">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePassJob(job.match_id);
                                }}
                                className="flex-1 bg-white border border-gray-200 text-gray-700 text-xs font-semibold py-2 rounded-full hover:bg-gray-50 transition-colors"
                              >
                                {t("chat.notInterested")}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGreet(job.id, job.match_id, job.title, job.company);
                                }}
                                disabled={greetingMatchId === job.match_id}
                                className="flex-1 bg-[#113a7a] text-white text-xs font-semibold py-2 rounded-full hover:bg-[#0d2b5c] disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                              >
                                {greetingMatchId === job.match_id ? (
                                  <><Loader2 className="w-3 h-3 animate-spin" /> 打招呼中</>
                                ) : (
                                  <><Zap className="w-3 h-3" /> 一键打招呼</>
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-4 justify-start"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1">
                  <Logo className="w-8 h-8" />
                </div>
                <div className="px-5 py-3.5 rounded-2xl bg-gray-50 text-gray-500 text-[15px] flex items-center gap-1">
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4, delay: 0 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4, delay: 0.2 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4, delay: 0.4 }} className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                </div>
              </motion.div>
            )}
            <div className="h-40" /> {/* Spacer to clear the absolute input area */}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent pt-10 pb-6 px-4 md:px-8">
          <div className="max-w-4xl mx-auto relative">
            <div className="relative flex items-end gap-2 bg-gray-100 rounded-3xl p-2 border border-gray-200 focus-within:border-gray-300 focus-within:bg-white transition-colors shadow-sm">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={t("chat.placeholder")}
                className="w-full max-h-48 min-h-[44px] bg-transparent border-none focus:ring-0 resize-none py-3 pl-4 pr-12 text-[15px] leading-relaxed"
                rows={1}
              />
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isLoading}
                className="absolute right-3 bottom-3 w-8 h-8 bg-black text-white rounded-full flex items-center justify-center disabled:opacity-30 disabled:bg-gray-400 transition-all"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </div>
            <div className="text-center mt-3">
              <p className="text-xs text-gray-400">{t("chat.disclaimer")}</p>
            </div>
          </div>
        </div>
      </main>

      {/* Job Detail Pane */}
      {selectedJob && (
        <aside className="w-full md:w-96 bg-white border-l border-gray-200 flex flex-col h-full shrink-0 overflow-y-auto shadow-xl z-20 absolute md:relative right-0">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
            <h2 className="text-xl font-bold">{t("chat.jobDetails")}</h2>
            <button onClick={() => setSelectedJob(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{selectedJob.title}</h1>
              <p className="text-lg text-[#5c9be6] font-medium">{selectedJob.company}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500 mt-3">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" /> {selectedJob.location}
                </span>
                {selectedJob.time && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" /> {t("common.time")}: {selectedJob.time}
                  </span>
                )}
                {selectedJob.deadline && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" /> {t("jobs.deadline")}: {selectedJob.deadline}
                  </span>
                )}
              </div>
            </div>

            {selectedJob.salary && (
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t("chat.salary")}</p>
                <p className="font-semibold text-gray-900">{selectedJob.salary}</p>
              </div>
            )}

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">{t("chat.personalizedRationale")}</h3>
              <div className="bg-[#5c9be6]/5 p-4 rounded-xl border border-[#5c9be6]/20">
                <p className="text-sm text-[#113a7a] leading-relaxed">{selectedJob.matchReason}</p>
              </div>
            </div>

            {selectedJob.responsibilities && (
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{t("chat.responsibilities")}</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                  {selectedJob.responsibilities.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedJob.requirements && (
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{t("chat.requirements")}</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                  {selectedJob.requirements.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedJob.applyMethod && (
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{t("chat.howToApply")}</h3>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  {selectedJob.applyMethod.includes("@") ? (
                    <p className="text-sm text-gray-700">
                      {t("chat.emailResumeTo")}{" "}
                      <a href={`mailto:${selectedJob.applyMethod}`} className="text-[#5c9be6] hover:underline font-medium">
                        {selectedJob.applyMethod}
                      </a>
                    </p>
                  ) : (
                    <p className="text-sm text-gray-700">
                      {t("chat.applyViaWebsite")}{" "}
                      <a href={selectedJob.applyMethod} target="_blank" rel="noopener noreferrer" className="text-[#5c9be6] hover:underline font-medium">
                        {selectedJob.applyMethod}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="pt-4 flex gap-3">
              <button
                onClick={() => {
                  handlePassJob(selectedJob.match_id);
                  setSelectedJob(null);
                }}
                className="flex-1 bg-white border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors"
              >
                {t("chat.notInterested")}
              </button>
              <button
                onClick={() => {
                  handleGreet(selectedJob.match_id, selectedJob.title, selectedJob.company);
                  setSelectedJob(null);
                }}
                disabled={greetingMatchId === selectedJob.match_id}
                className="flex-1 bg-[#113a7a] text-white font-semibold py-3 rounded-xl hover:bg-[#0d2b5c] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Zap className="w-4 h-4" /> 一键打招呼
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
