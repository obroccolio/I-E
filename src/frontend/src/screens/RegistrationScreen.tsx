import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Mail, Lock } from "lucide-react";
import { OnboardingLayout } from "../components/OnboardingLayout";
import { api } from "../lib/api";

export function RegistrationScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleNext = async () => {
    if (!email || !password) {
      setError(t("auth.missingFields"));
      return;
    }
    try {
      setLoading(true);
      let res;
      try {
        res = await api.login(email, password);
      } catch (loginErr: any) {
        if (loginErr.message?.includes("not_found") || loginErr.message?.includes("User not found")) {
          res = await api.register(email, password);
        } else {
          throw loginErr;
        }
      }
      localStorage.setItem("token", res.token);
      localStorage.setItem("userId", String(res.user.id));
      if (res.user.role) localStorage.setItem("role", res.user.role);
      localStorage.setItem("userName", res.user.email.split("@")[0]);
      if (res.user.role === "admin") {
        navigate("/admin");
      } else {
        navigate(res.user.onboardingComplete ? "/chat" : "/profile-input");
      }
    } catch (e: any) {
      setError(e.message || t("auth.authFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingLayout
      title={t("auth.title")}
      subtitle={t("auth.subtitle")}
      currentStep={1}
      totalSteps={3}
      onNext={handleNext}
      nextLabel={loading ? t("auth.registering") : t("common.nextStep")}
    >
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 mb-2">{t("auth.verifyStatus")}</h2>
        <p className="text-base text-gray-500 mb-8">{t("auth.enterEmail")}</p>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">{t("auth.universityEmail")} <span className="text-red-500 ml-0.5">{t("auth.required")}</span></label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Mail className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="email"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#5c9be6]/20 focus:border-[#5c9be6] transition-all text-base"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">{t("auth.password")} <span className="text-red-500 ml-0.5">{t("auth.required")}</span></label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="password"
              placeholder={t("auth.passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#5c9be6]/20 focus:border-[#5c9be6] transition-all text-base"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
      </div>
    </OnboardingLayout>
  );
}
