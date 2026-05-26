import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { BadgeCheck, MapPin, Clock, X, CheckCircle2, Send, Loader2 } from "lucide-react";
import { Sidebar } from "../components/Sidebar";
import { api } from "../lib/api";

type JobData = {
  id: number;
  match_id: number | null;
  title: string;
  company: string;
  location: string;
  appliedDate?: string;
  time?: string;
  matchReason?: string;
  matchScore?: string;
  status?: string;
  verified?: boolean;
  logo: string;
  requirements?: string[];
  responsibilities?: string[];
  salary?: string;
  deadline?: string;
  applyMethod?: string;
};

function mapMatchRow(r: any): JobData {
  return {
    id: r.job_id ?? r.id,
    match_id: r.match_id ?? r.id ?? null,
    title: r.title,
    company: r.company,
    location: r.location ?? "",
    appliedDate: r.created_at ? new Date(r.created_at).toLocaleDateString() : undefined,
    matchReason: r.match_reason ?? "",
    matchScore: typeof r.match_score === "number" ? `${Math.round(r.match_score * 100)}% Match` : undefined,
    status: r.status ?? "pending",
    verified: true,
    logo: `https://picsum.photos/seed/${(r.company ?? "").replace(/\s+/g, "").toLowerCase()}/100/100`,
    requirements: r.requirements ? String(r.requirements).split("\n").filter(Boolean) : [],
    responsibilities: r.responsibilities ? String(r.responsibilities).split("\n").filter(Boolean) : [],
    salary: r.salary_min
      ? `$${r.salary_min.toLocaleString()}${r.salary_max ? ` - $${r.salary_max.toLocaleString()}` : ""} / month`
      : undefined,
    deadline: r.deadline ?? "",
    applyMethod: r.source_url ?? "",
  };
}

export function DashboardScreen() {
  const [activeTab, setActiveTab] = useState<"applied" | "suggested" | "rejected">("suggested");
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null);
  const [suggestedJobs, setSuggestedJobs] = useState<JobData[]>([]);
  const [appliedJobs, setAppliedJobs] = useState<JobData[]>([]);
  const [rejectedJobs, setRejectedJobs] = useState<JobData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [greetingJobId, setGreetingJobId] = useState<number | null>(null);
  const [greetSteps, setGreetSteps] = useState<{ type: string; label: string; detail: string }[]>([]);
  const [greetDone, setGreetDone] = useState(false);
  const { t } = useTranslation();

  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const p1 = api.getRecommendations(10)
      .then((data) => {
        const recs = data.recommendations || [];
        if (recs.length > 0) {
          setSuggestedJobs(recs.map(mapMatchRow));
        } else {
          return api.getMyMatches("pending").then((d: any) => {
            setSuggestedJobs((d.matches || []).map(mapMatchRow));
          }).catch(() => setSuggestedJobs([]));
        }
      })
      .catch((e) => setError(e.message));
    const p2 = api.getMyMatches("accepted")
      .then((data: any) => {
        setAppliedJobs((data.matches || []).map(mapMatchRow));
      })
      .catch(() => setAppliedJobs([]));
    const p3 = api.getMyMatches("rejected")
      .then((data: any) => {
        setRejectedJobs((data.matches || []).map(mapMatchRow));
      })
      .catch(() => setRejectedJobs([]));
    Promise.all([p1, p2, p3]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleReject = async (job: JobData) => {
    if (!job.match_id) return;
    try {
      await api.updateMatchStatus(job.match_id, "rejected");
      setSuggestedJobs((prev) => prev.filter((j) => j.id !== job.id));
      setRejectedJobs((prev) => [mapMatchRow({ ...job, status: "rejected" }), ...prev]);
      if (selectedJob?.id === job.id) setSelectedJob(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAccept = async (job: JobData) => {
    if (!job.match_id) return;
    try {
      await api.updateMatchStatus(job.match_id, "accepted");
      setSuggestedJobs((prev) => prev.filter((j) => j.id !== job.id));
      setAppliedJobs((prev) => [mapMatchRow({ ...job, status: "accepted" }), ...prev]);
      if (selectedJob?.id === job.id) setSelectedJob(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleWithdraw = async (job: JobData) => {
    if (!job.match_id) return;
    try {
      await api.updateMatchStatus(job.match_id, "pending");
      setAppliedJobs((prev) => prev.filter((j) => j.id !== job.id));
      setSuggestedJobs((prev) => [mapMatchRow({ ...job, status: "pending" }), ...prev]);
      if (selectedJob?.id === job.id) setSelectedJob(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRemoveRejected = async (job: JobData) => {
    if (!job.match_id) return;
    try {
      await api.updateMatchStatus(job.match_id, "pending");
      setRejectedJobs((prev) => prev.filter((j) => j.id !== job.id));
      setSuggestedJobs((prev) => [mapMatchRow({ ...job, status: "pending" }), ...prev]);
      if (selectedJob?.id === job.id) setSelectedJob(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGreet = async (job: JobData) => {
    if (!job.match_id || greetingJobId) return;
    setGreetingJobId(job.id);
    setGreetSteps([]);
    setGreetDone(false);

    try {
      await api.streamBossGreet(job.id, (step) => {
        setGreetSteps(prev => [...prev, step]);
      });
      setGreetDone(true);
    } catch (err: any) {
      setGreetSteps(prev => [...prev, { type: "error", label: "打招呼失败", detail: err.message || "未知错误" }]);
      setGreetDone(true);
    }

    try {
      await api.updateMatchStatus(job.match_id, "accepted");
      setSuggestedJobs(prev => prev.filter(j => j.id !== job.id));
      setAppliedJobs(prev => [mapMatchRow({ ...job, status: "accepted" }), ...prev]);
    } catch {}

    setTimeout(() => {
      setGreetingJobId(null);
      setGreetSteps([]);
      setGreetDone(false);
    }, 2500);
  };

  return (
    <div className="h-screen bg-white flex overflow-hidden">
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 md:p-12 relative">
          {/* Greet Progress Overlay */}
          {greetingJobId && (
            <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-sm flex items-start justify-center pt-32">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white border border-gray-200 rounded-2xl shadow-xl p-6 w-full max-w-sm"
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
                    onClick={() => { setGreetingJobId(null); setGreetSteps([]); setGreetDone(false); }}
                    className="mt-4 w-full py-2 bg-green-50 text-green-700 rounded-lg text-sm font-semibold hover:bg-green-100 transition-colors"
                  >
                    完成
                  </button>
                )}
              </motion.div>
            </div>
          )}

          <div className="max-w-4xl mx-auto">
            {/* Tabs */}
            <div className="flex items-center gap-6 border-b border-gray-200 mb-6">
              <button
                onClick={() => setActiveTab("applied")}
                className={`pb-4 text-lg font-medium transition-colors relative ${
                  activeTab === "applied" ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t("dashboard.appliedJobs")}
                {activeTab === "applied" && (
                  <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("suggested")}
                className={`pb-4 text-lg font-medium transition-colors relative ${
                  activeTab === "suggested" ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t("dashboard.suggestedByAI")}
                {activeTab === "suggested" && (
                  <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("rejected")}
                className={`pb-4 text-lg font-medium transition-colors relative ${
                  activeTab === "rejected" ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t("dashboard.rejectedJobs")}
                {activeTab === "rejected" && (
                  <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900" />
                )}
              </button>
            </div>

            {loading && <p className="text-gray-500">{t("dashboard.loading")}</p>}
            {error && <p className="text-red-500">{error}</p>}

            <div className="bg-white">
              {activeTab === "applied" && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {appliedJobs.length === 0 ? (
                    <p className="text-gray-500">{t("dashboard.noApplied")}</p>
                  ) : (
                    appliedJobs.map((job, index) => (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => setSelectedJob(job)}
                        className={`flex py-6 border-b border-gray-200 last:border-0 cursor-pointer transition-colors hover:bg-gray-50 -mx-4 px-4 rounded-xl ${
                          selectedJob?.id === job.id ? "bg-gray-50" : ""
                        }`}
                      >
                        <div className="w-16 h-16 mr-5 shrink-0">
                          <img
                            src={job.logo}
                            alt={job.company}
                            className="w-full h-full object-cover rounded-sm"
                            referrerPolicy="no-referrer"
                          />
                        </div>

                        <div className="flex-1">
                          <h3 className="text-[19px] font-bold text-gray-900 flex items-center gap-1.5 leading-tight">
                            {job.title}
                            {job.verified && <BadgeCheck className="w-5 h-5 text-[#5c9be6]" />}
                          </h3>
                          <p className="text-[17px] text-gray-900 mt-1">{job.company}</p>
                          <p className="text-[15px] text-gray-500 mt-0.5">{job.location}</p>
                          <p className="text-[14px] text-gray-500 mt-1.5">{job.appliedDate}</p>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "suggested" && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {suggestedJobs.length === 0 && !loading ? (
                    <p className="text-gray-500">{t("dashboard.noSuggestions")}</p>
                  ) : (
                    suggestedJobs.map((job, index) => (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => setSelectedJob(job)}
                        className={`flex py-6 border-b border-gray-200 last:border-0 cursor-pointer transition-colors hover:bg-gray-50 -mx-4 px-4 rounded-xl ${
                          selectedJob?.id === job.id ? "bg-gray-50" : ""
                        }`}
                      >
                        <div className="w-16 h-16 mr-5 shrink-0">
                          <img
                            src={job.logo}
                            alt={job.company}
                            className="w-full h-full object-cover rounded-sm"
                            referrerPolicy="no-referrer"
                          />
                        </div>

                        <div className="flex-1">
                          <h3 className="text-[19px] font-bold text-gray-900 flex items-center gap-1.5 leading-tight">
                            {job.title}
                          </h3>
                          <p className="text-[17px] text-gray-900 mt-1">{job.company}</p>
                          <p className="text-[15px] text-gray-500 mt-0.5">{job.location}</p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-[14px] text-gray-500">{t("dashboard.suggestedToday")}</span>
                            {job.matchScore && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#5c9be6]/10 text-[#113a7a]">
                                {job.matchScore}
                              </span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleGreet(job); }}
                              disabled={greetingJobId === job.id}
                              className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-[#113a7a] text-white rounded-full text-xs font-semibold hover:bg-[#0d2b5c] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {greetingJobId === job.id ? (
                                <><Loader2 className="w-3 h-3 animate-spin" /> 打招呼中</>
                              ) : (
                                <><Send className="w-3 h-3" /> 一键打招呼</>
                              )}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "rejected" && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {rejectedJobs.length === 0 ? (
                    <p className="text-gray-500">{t("dashboard.noRejected")}</p>
                  ) : (
                    rejectedJobs.map((job, index) => (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => setSelectedJob(job)}
                        className={`flex py-6 border-b border-gray-200 last:border-0 cursor-pointer transition-colors hover:bg-gray-50 -mx-4 px-4 rounded-xl ${
                          selectedJob?.id === job.id ? "bg-gray-50" : ""
                        }`}
                      >
                        <div className="w-16 h-16 mr-5 shrink-0">
                          <img
                            src={job.logo}
                            alt={job.company}
                            className="w-full h-full object-cover rounded-sm opacity-60"
                            referrerPolicy="no-referrer"
                          />
                        </div>

                        <div className="flex-1">
                          <h3 className="text-[19px] font-bold text-gray-900 flex items-center gap-1.5 leading-tight">
                            {job.title}
                          </h3>
                          <p className="text-[17px] text-gray-900 mt-1">{job.company}</p>
                          <p className="text-[15px] text-gray-500 mt-0.5">{job.location}</p>
                          <p className="text-[14px] text-red-400 mt-1.5">{t("dashboard.markedNotInterested")}</p>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Job Detail Pane */}
      {selectedJob && (
        <aside className="w-full md:w-96 bg-white border-l border-gray-200 flex flex-col h-full shrink-0 overflow-y-auto shadow-xl z-20 absolute md:relative right-0">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
            <h2 className="text-xl font-bold">{t("dashboard.jobDetails")}</h2>
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
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t("dashboard.salary")}</p>
                <p className="font-semibold text-gray-900">{selectedJob.salary}</p>
              </div>
            )}

            {selectedJob.matchReason && (
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{t("dashboard.personalizedRationale")}</h3>
                <div className="bg-[#5c9be6]/5 p-4 rounded-xl border border-[#5c9be6]/20">
                  <p className="text-sm text-[#113a7a] leading-relaxed">{selectedJob.matchReason}</p>
                </div>
              </div>
            )}

            {selectedJob.responsibilities && (
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{t("dashboard.responsibilities")}</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                  {selectedJob.responsibilities.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedJob.requirements && (
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{t("dashboard.requirements")}</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                  {selectedJob.requirements.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedJob.applyMethod && (
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{t("dashboard.howToApply")}</h3>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  {selectedJob.applyMethod.includes("@") ? (
                    <p className="text-sm text-gray-700">
                      {t("dashboard.emailResumeTo")}{" "}
                      <a href={`mailto:${selectedJob.applyMethod}`} className="text-[#5c9be6] hover:underline font-medium">
                        {selectedJob.applyMethod}
                      </a>
                    </p>
                  ) : (
                    <p className="text-sm text-gray-700">
                      {t("dashboard.applyViaWebsite")}{" "}
                      <a href={selectedJob.applyMethod} target="_blank" rel="noopener noreferrer" className="text-[#5c9be6] hover:underline font-medium">
                        {selectedJob.applyMethod}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeTab === "suggested" ? (
              <div className="pt-4 flex gap-3">
                <button
                  onClick={() => handleReject(selectedJob)}
                  className="flex-1 bg-white border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  {t("dashboard.notInterested")}
                </button>
                <button
                  onClick={() => handleAccept(selectedJob)}
                  className="flex-1 bg-[#113a7a] text-white font-semibold py-3 rounded-xl hover:bg-[#0d2b5c] transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  {t("common.applyNow")}
                </button>
              </div>
            ) : activeTab === "rejected" ? (
              <div className="pt-4 flex gap-3">
                <button
                  onClick={() => handleRemoveRejected(selectedJob)}
                  className="flex-1 bg-[#113a7a] text-white font-semibold py-3 rounded-xl hover:bg-[#0d2b5c] transition-colors"
                >
                  {t("dashboard.restore")}
                </button>
              </div>
            ) : (
              <div className="pt-4 flex gap-3">
                <button
                  onClick={() => handleWithdraw(selectedJob)}
                  className="flex-1 bg-white border border-gray-200 text-red-600 font-semibold py-3 rounded-xl hover:bg-red-50 transition-colors"
                >
                  {t("dashboard.withdraw")}
                </button>
                {selectedJob.applyMethod && (
                  <a
                    href={selectedJob.applyMethod.includes("@") ? `mailto:${selectedJob.applyMethod}` : selectedJob.applyMethod}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-[#113a7a] text-white font-semibold py-3 rounded-xl hover:bg-[#0d2b5c] transition-colors text-center"
                  >
                    {t("common.applyNow")}
                  </a>
                )}
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
