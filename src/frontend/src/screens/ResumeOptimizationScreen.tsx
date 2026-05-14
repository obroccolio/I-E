import { useState } from "react";
import { FileSearch, Sparkles, Copy, Check, ChevronDown, ChevronUp, ArrowRight, AlertTriangle, Zap, FileText, Lightbulb } from "lucide-react";
import { api } from "../lib/api";

interface DimensionScore {
  label: string; labelZh: string; score: number; weight: number; details: string[];
}
interface ResumeScore {
  dimensions: DimensionScore[]; overall: number; redFlags: RedFlag[];
}
interface RedFlag {
  severity: "critical" | "high" | "medium"; category: string; description: string; evidence: string; suggestion: string;
}
interface OptimizationStep {
  section: string; before: string; after: string; dimensionChanges: string[]; accepted: boolean;
}
interface FabricationWarning {
  text: string; label: string;
}
interface ValueExtraction {
  originalBullet: string; deliverable: string; result: string; missingQuantification: string; rewriteDirection: string;
}
interface OptimizationResult {
  originalText: string; optimizedText: string; originalScore: ResumeScore; finalScore: ResumeScore;
  steps: OptimizationStep[]; summary: string; fabricationWarnings: FabricationWarning[];
  verdict: string; redFlags: RedFlag[]; valueExtractions: ValueExtraction[];
  projectContext: { hasContext: boolean; projectsWithoutContext: number; suggestion: string };
  onePageVersion: string | null;
}

const SCORE_COLORS: Record<string, string> = {
  completeness: "#5c9be6", specificity: "#f59e0b", verbs: "#8b5cf6",
  conciseness: "#10b981", structure: "#06b6d4", keywords: "#ef4444",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-amber-100 text-amber-800 border-amber-200",
  medium: "bg-blue-100 text-blue-800 border-blue-200",
};

const EXAMPLE_RESUME = `姓名：张三
电话：13800138000 | 邮箱：zhangsan@example.com

求职意向：Java后端开发工程师

教育背景
2020.09 - 2024.06  某985大学  计算机科学与技术  本科
GPA 3.6/4.0，校级优秀学生奖学金

实习经历
2023.06 - 2023.09  某某科技有限公司  后端开发实习生
负责订单模块的日常维护和功能开发
参与了公司内部管理系统的开发项目
处理线上工单和技术支持问题
学习并使用Spring Boot框架进行接口开发
协助团队完成代码review和文档整理

项目经历
学生管理系统：用Java和MySQL开发了一个Web管理系统，实现学生信息录入、课程管理、成绩统计等功能

技能
Java, Python, MySQL, Git, Spring Boot, Redis, Linux`;

const EXAMPLE_JD = `Java后端开发工程师

岗位职责：
1. 负责高并发分布式系统的设计与开发
2. 参与微服务架构的设计与实现
3. 优化系统性能，保障服务稳定性

任职要求：
1. 精通Java语言，熟悉Spring框架
2. 熟悉MySQL、Redis等数据库和中间件
3. 了解分布式系统设计，有微服务开发经验优先
4. 具备良好的系统设计能力和问题解决能力`;

export default function ResumeOptimizationScreen() {
  const [resumeText, setResumeText] = useState("");
  const [targetJD, setTargetJD] = useState("");
  const [loading, setLoading] = useState<"score" | "optimize" | "compress" | null>(null);
  const [score, setScore] = useState<ResumeScore | null>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [expandedDim, setExpandedDim] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [showValueExtraction, setShowValueExtraction] = useState(false);
  const [compressEnabled, setCompressEnabled] = useState(true);

  const handleScore = async () => {
    if (!resumeText.trim()) return;
    setLoading("score"); setResult(null);
    try {
      const s = await api.scoreResume(resumeText.trim(), targetJD.trim() || undefined);
      setScore(s);
    } catch (e: any) { console.error(e); }
    finally { setLoading(null); }
  };

  const handleOptimize = async () => {
    if (!resumeText.trim()) return;
    setLoading("optimize");
    try {
      const r = await fetch(`${import.meta.env.VITE_API_BASE || "http://localhost:3001/api"}/resume/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ resumeText: resumeText.trim(), targetJD: targetJD.trim() || undefined, includeOnePage: compressEnabled }),
      }).then(res => res.json());
      setResult(r);
      setScore(r.finalScore);
    } catch (e: any) { console.error(e); }
    finally { setLoading(null); }
  };

  const handleCompress = async () => {
    if (!result?.optimizedText) return;
    setLoading("compress");
    try {
      const r = await fetch(`${import.meta.env.VITE_API_BASE || "http://localhost:3001/api"}/resume/compress`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ resumeText: result.optimizedText, targetJD: targetJD.trim() || undefined }),
      }).then(res => res.json());
      setResult(prev => prev ? { ...prev, onePageVersion: r.onePageVersion } : prev);
    } catch (e: any) { console.error(e); }
    finally { setLoading(null); }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const loadExample = () => { setResumeText(EXAMPLE_RESUME); setTargetJD(EXAMPLE_JD); setShowExample(false); };
  const barWidth = (s: number) => `${Math.max(2, s)}%`;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI 简历优化</h1>
            <p className="text-sm text-gray-500 mt-1">30 秒初判 · 红旗扫描 · 六维评分 · 价值提炼 · STAR 改写 · 一页压缩</p>
          </div>
          <button onClick={() => setShowExample(!showExample)} className="text-sm text-[#5c9be6] hover:text-[#113a7a] font-medium">
            {showExample ? "收起示例" : "填入示例"}
          </button>
        </div>
        {showExample && (
          <div className="mb-6 p-4 bg-[#5c9be6]/5 border border-[#5c9be6]/20 rounded-xl text-sm text-gray-600">
            点击下方按钮将填入一份示例简历和目标 JD。
            <button onClick={loadExample} className="ml-3 text-[#5c9be6] font-semibold hover:underline">立即填入</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Left: Input ── */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">简历文本</label>
              <textarea value={resumeText} onChange={(e) => { setResumeText(e.target.value); setScore(null); setResult(null); }}
                placeholder="将你的简历全文粘贴到这里..." rows={18}
                className="w-full p-4 bg-white border border-gray-200 rounded-2xl text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[#5c9be6]/20 focus:border-[#5c9be6]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                目标岗位描述 <span className="text-gray-400 font-normal">（可选）</span>
              </label>
              <textarea value={targetJD} onChange={(e) => { setTargetJD(e.target.value); setScore(null); setResult(null); }}
                placeholder="粘贴你想投递的岗位 JD..." rows={5}
                className="w-full p-4 bg-white border border-gray-200 rounded-2xl text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[#5c9be6]/20 focus:border-[#5c9be6]" />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={handleScore} disabled={!resumeText.trim() || loading !== null}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <FileSearch className="w-4 h-4" />{loading === "score" ? "分析中..." : "分析评分"}
              </button>
              <button onClick={handleOptimize} disabled={!resumeText.trim() || loading !== null}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#113a7a] text-white rounded-xl text-sm font-semibold hover:bg-[#0d2b5c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <Sparkles className="w-4 h-4" />{loading === "optimize" ? "优化中..." : "AI 一键优化"}
              </button>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={compressEnabled} onChange={(e) => setCompressEnabled(e.target.checked)} className="rounded" />
                同时生成一页版
              </label>
            </div>
          </div>

          {/* ── Right: Results ── */}
          <div className="space-y-4">
            {!score && !loading && (
              <div className="flex flex-col items-center justify-center h-64 bg-white border border-gray-200 rounded-2xl text-gray-400 text-sm">
                <FileSearch className="w-10 h-10 mb-3 opacity-30" />点击「分析评分」查看简历诊断结果
              </div>
            )}
            {loading && (
              <div className="flex flex-col items-center justify-center h-64 bg-white border border-gray-200 rounded-2xl">
                <div className="w-8 h-8 border-2 border-[#5c9be6] border-t-transparent rounded-full animate-spin mb-3" />
                <span className="text-sm text-gray-500">{loading === "score" ? "正在分析简历..." : loading === "compress" ? "正在压缩..." : "AI 正在逐段优化..."}</span>
              </div>
            )}

            {result && (
              <>
                {/* 30-second verdict */}
                {result.verdict && (
                  <div className="bg-gray-900 text-white rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-4 h-4 text-[#f59e0b]" />
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">30 秒初判</span>
                    </div>
                    <p className="text-sm leading-relaxed">{result.verdict}</p>
                  </div>
                )}

                {/* Red flags — shown even for score-only */}
                {result.redFlags.length > 0 && (
                  <div className="bg-white border border-red-100 rounded-2xl p-5">
                    <h2 className="text-sm font-semibold text-red-800 flex items-center gap-1.5 mb-3">
                      <AlertTriangle className="w-4 h-4" /> 红旗警告（{result.redFlags.length}）
                    </h2>
                    <div className="space-y-3">
                      {result.redFlags.map((rf, i) => (
                        <div key={i} className={`p-3 rounded-xl border text-xs ${SEVERITY_STYLES[rf.severity] || SEVERITY_STYLES.medium}`}>
                          <div className="font-semibold mb-1">{rf.category}：{rf.description}</div>
                          <div className="opacity-80">证据：{rf.evidence}</div>
                          <div className="mt-1.5 font-medium">建议：{rf.suggestion}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {score && (
              <>
                {/* Score breakdown */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-900">六维评分</h2>
                    <span className="text-3xl font-bold text-[#113a7a]">{score.overall}</span>
                  </div>
                  <div className="space-y-3">
                    {score.dimensions.map((dim) => (
                      <div key={dim.label}>
                        <div className="flex items-center justify-between mb-1">
                          <button onClick={() => setExpandedDim(expandedDim === dim.label ? null : dim.label)}
                            className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900">
                            {expandedDim === dim.label ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {dim.labelZh} <span className="text-gray-400">({Math.round(dim.weight * 100)}%)</span>
                          </button>
                          <span className="text-xs font-semibold text-gray-700">{dim.score}</span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: barWidth(dim.score), backgroundColor: SCORE_COLORS[dim.label] || "#6b7280" }} />
                        </div>
                        {expandedDim === dim.label && (
                          <div className="mt-1.5 p-2.5 bg-gray-50 rounded-lg text-xs text-gray-600 space-y-0.5">
                            {dim.details.map((d, i) => (
                              <div key={i} className={d.startsWith("✗") || d.startsWith("建议") ? "text-amber-600" : d.startsWith("✓") ? "text-green-600" : ""}>{d}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {result && (
                    <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-100">
                      <div className="text-xs text-gray-500"><span className="font-bold text-gray-700">{result.originalScore.overall}</span> → <span className="font-bold text-green-600">{result.finalScore.overall}</span></div>
                      {result.projectContext && !result.projectContext.hasContext && (
                        <div className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{result.projectContext.suggestion}</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Optimization steps */}
                {result && result.steps.filter(s => s.accepted).length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-5">
                    <h2 className="text-sm font-semibold text-gray-900 mb-3">优化步骤</h2>
                    <div className="space-y-2">
                      {result.steps.filter(s => s.accepted).map((step, i) => (
                        <div key={i} className="flex items-start gap-2 p-2.5 bg-green-50 border border-green-100 rounded-xl text-xs text-green-800">
                          <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <div>
                            <div className="font-medium">{step.section}</div>
                            {step.dimensionChanges.slice(0, 3).map((c, j) => <div key={j} className="text-green-700 mt-0.5">{c}</div>)}
                          </div>
                        </div>
                      ))}
                    </div>
                    {result.steps.filter(s => !s.accepted).length > 0 && (
                      <div className="mt-2 text-xs text-gray-400">
                        {result.steps.filter(s => !s.accepted).map(s => s.section).join("、")} 未通过门控，已丢弃
                      </div>
                    )}
                  </div>
                )}

                {/* Value extraction table (collapsible) */}
                {result && result.valueExtractions.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-5">
                    <button onClick={() => setShowValueExtraction(!showValueExtraction)}
                      className="flex items-center justify-between w-full text-sm font-semibold text-gray-900">
                      <span className="flex items-center gap-1.5"><Lightbulb className="w-4 h-4 text-[#f59e0b]" />价值提炼（{result.valueExtractions.length} 条）</span>
                      {showValueExtraction ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {showValueExtraction && (
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 text-gray-500">
                              <th className="text-left py-2 pr-3 font-medium">原描述</th>
                              <th className="text-left py-2 pr-3 font-medium">可识别产物</th>
                              <th className="text-left py-2 pr-3 font-medium">可识别结果</th>
                              <th className="text-left py-2 font-medium">改写方向</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.valueExtractions.slice(0, 8).map((ve, i) => (
                              <tr key={i} className="border-b border-gray-50">
                                <td className="py-2 pr-3 text-gray-600 max-w-40 truncate">{ve.originalBullet}</td>
                                <td className="py-2 pr-3 text-gray-800">{ve.deliverable}</td>
                                <td className="py-2 pr-3 text-gray-800">{ve.result}</td>
                                <td className="py-2 text-[#5c9be6] font-medium">{ve.rewriteDirection}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Fabrication warnings */}
                {result && result.fabricationWarnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                    <h2 className="text-sm font-semibold text-amber-800 flex items-center gap-1.5 mb-3">
                      <AlertTriangle className="w-4 h-4" /> 请人工核实以下数据
                    </h2>
                    <div className="space-y-1.5">
                      {result.fabricationWarnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded font-medium shrink-0">{w.label}</span>
                          <span className="text-amber-700 font-mono">{w.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Optimized text */}
                {result && (
                  <div className="bg-white border border-green-200 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-semibold text-green-800 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" /> 优化结果
                      </h2>
                      <button onClick={() => handleCopy(result.optimizedText)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors">
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? "已复制" : "复制"}
                      </button>
                    </div>
                    <p className="text-sm text-green-700 mb-3">{result.summary}</p>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="p-3 bg-gray-50 rounded-xl">
                        <div className="text-xs font-semibold text-gray-400 uppercase mb-1">优化前</div>
                        <div className="text-xs font-bold text-gray-600">{result.originalScore.overall} 分</div>
                      </div>
                      <div className="p-3 bg-green-50 rounded-xl">
                        <div className="text-xs font-semibold text-green-500 uppercase mb-1">优化后 <ArrowRight className="w-3 h-3 inline" /></div>
                        <div className="text-xs font-bold text-green-700">{result.finalScore.overall} 分</div>
                      </div>
                    </div>
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 font-sans bg-gray-50 rounded-xl p-4 max-h-96 overflow-y-auto">{result.optimizedText}</pre>
                  </div>
                )}
              </>
            )}

            {/* One-page version */}
            {result?.onePageVersion && (
              <div className="bg-white border border-blue-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
                    <FileText className="w-4 h-4" /> 一页版简历
                  </h2>
                  <button onClick={() => handleCopy(result.onePageVersion!)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors">
                    <Copy className="w-3.5 h-3.5" />复制
                  </button>
                </div>
                <p className="text-xs text-blue-600 mb-3">已删除低价值内容，保留最能支撑目标岗位的高密度 bullet</p>
                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 font-sans bg-gray-50 rounded-xl p-4 max-h-96 overflow-y-auto">{result.onePageVersion}</pre>
              </div>
            )}
          </div>
        </div>

        {/* Bottom: Before/After comparison */}
        {result && (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">原始简历</h3>
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 font-sans max-h-80 overflow-y-auto">{result.originalText}</pre>
            </div>
            <div className="bg-white border border-green-200 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-green-600 uppercase tracking-wider mb-3">优化后简历</h3>
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 font-sans max-h-80 overflow-y-auto">{result.optimizedText}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
