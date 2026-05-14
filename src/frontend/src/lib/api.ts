const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001/api";

async function req(method: string, path: string, body?: any, extra?: RequestInit) {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = localStorage.getItem("token");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    ...extra,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: () => req("GET", "/health"),
  register: (email: string, password: string) => req("POST", "/auth/register", { email, password }),
  login: (email: string, password: string) => req("POST", "/auth/login", { email, password }),
  deleteAccount: () => req("DELETE", "/auth/account"),
  getProfile: () => req("GET", "/profiles/me"),
  updateProfile: (body: any) => req("PUT", "/profiles/me", body),
  uploadResume: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const token = localStorage.getItem("token");
    return fetch(`${API_BASE}/profiles/resume-upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    });
  },
  getPreferences: () => req("GET", "/preferences"),
  savePreferences: (body: any) => req("POST", "/preferences", body),
  getJobs: (limit?: number, offset?: number) => req("GET", `/jobs?limit=${limit ?? 50}&offset=${offset ?? 0}`),
  bulkImportJobs: (jobs: any[]) => req("POST", "/jobs/bulk", { jobs }),
  getRecommendations: (limit?: number) => req("GET", `/matching/recommendations?limit=${limit ?? 10}`),
  runMatching: (limit?: number) => req("POST", "/matching/run", { limit }),
  streamMatching: (limit: number, onStep: (step: any) => void): Promise<any[]> => {
    const token = localStorage.getItem("token");
    return new Promise((resolve, reject) => {
      fetch(`${API_BASE}/matching/stream?limit=${limit}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(res => {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const results: any[] = [];
        (function read() {
          reader.read().then(({ done, value }) => {
            if (done) { resolve(results); return; }
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop()!;
            for (const part of parts) {
              const raw = part.replace(/^data: /, "");
              if (!raw) continue;
              try {
                const parsed = JSON.parse(raw);
                if (parsed.type === "result") { results.push(...(parsed.recommendations || [])); }
                else { onStep(parsed); }
              } catch {}
            }
            read();
          }).catch(reject);
        })();
      }).catch(reject);
    });
  },
  sendFeedback: (match_id: number, type: string, comment?: string) => req("POST", "/feedback", { match_id, type, comment }),
  chat: (message: string) => req("POST", "/chat", { message }),
  getChatHistory: () => req("GET", "/chat"),
  getMyMatches: (status?: string) => req("GET", `/matches/me${status ? `?status=${status}` : ""}`),
  updateMatchStatus: (match_id: number, status: string) => req("PATCH", `/matches/${match_id}`, { status }),
  trackEvent: (event_type: string, user_id?: number, payload?: any) => req("POST", "/events", { event_type, user_id, payload }),
  scoreResume: (resumeText: string, targetJD?: string) => req("POST", "/resume/score", { resumeText, targetJD }),
  optimizeResume: (resumeText: string, targetJD?: string) =>
    req("POST", "/resume/optimize", { resumeText, targetJD }),
};
