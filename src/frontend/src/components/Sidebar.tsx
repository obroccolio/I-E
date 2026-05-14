import { Briefcase, User, MessageSquare, PanelLeftClose, PanelLeft, Shield, Sparkles } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSidebar } from "../contexts/SidebarContext";
import { Logo } from "./Logo";

export function Sidebar() {
  const location = useLocation();
  const { isSidebarOpen, toggleSidebar } = useSidebar();
  const { t } = useTranslation();
  const role = localStorage.getItem("role");

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* Floating toggle button when sidebar is closed */}
      {!isSidebarOpen && (
        <button
          onClick={toggleSidebar}
          className="fixed top-5 left-5 z-50 p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 text-gray-600 transition-colors hidden md:block"
          aria-label="Open Sidebar"
        >
          <PanelLeft className="w-5 h-5" />
        </button>
      )}

      <aside 
        className={`bg-gray-50 border-gray-200 hidden md:flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
          isSidebarOpen ? "w-72 border-r" : "w-0 border-r-0"
        }`}
      >
        <div className="w-72 flex flex-col h-full">
          <div className="p-4 flex items-center justify-between">
            <Link to="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity pl-2">
              <Logo className="w-8 h-8" />
              <span className="text-xl font-bold tracking-tight text-gray-900">Jobro</span>
            </Link>
            <button
              onClick={toggleSidebar}
              className="p-2 bg-transparent rounded-lg hover:bg-gray-200 text-gray-600 transition-colors"
              aria-label="Close Sidebar"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
          </div>
          
          <nav className="flex-1 px-4 py-2 space-y-1 mt-2">
            <Link
              to="/chat"
              className={`flex items-center gap-3 w-full p-3 rounded-xl transition-colors text-sm font-medium ${
                isActive('/chat') ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              {t("nav.chat")}
            </Link>
            <Link
              to="/dashboard"
              className={`flex items-center gap-3 w-full p-3 rounded-xl transition-colors text-sm font-medium ${
                isActive('/dashboard') ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              {t("nav.applied")}
            </Link>
            <Link
              to="/profile-confirmation"
              className={`flex items-center gap-3 w-full p-3 rounded-xl transition-colors text-sm font-medium ${
                isActive('/profile-confirmation') ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <User className="w-4 h-4" />
              {t("nav.profile")}
            </Link>
            <Link
              to="/resume-optimization"
              className={`flex items-center gap-3 w-full p-3 rounded-xl transition-colors text-sm font-medium ${
                isActive('/resume-optimization') ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              简历优化
            </Link>
            {role === "admin" && (
              <Link
                to="/admin"
                className={`flex items-center gap-3 w-full p-3 rounded-xl transition-colors text-sm font-medium ${
                  location.pathname.startsWith('/admin') ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Shield className="w-4 h-4" />
                {t("nav.admin")}
              </Link>
            )}
          </nav>

          <div className="p-4 border-t border-gray-200 mt-auto">
            <Link
              to="/settings"
              className={`flex items-center gap-3 w-full p-3 rounded-xl transition-colors text-sm font-medium ${
                isActive('/settings') ? 'bg-gray-200 text-gray-900' : 'text-gray-900 hover:bg-gray-200'
              }`}
            >
              <div className="w-8 h-8 bg-[#5c9be6]/20 rounded-full flex items-center justify-center text-[#113a7a] font-bold shrink-0">
                {(localStorage.getItem("userName") || "U")[0].toUpperCase()}
              </div>
              <div className="flex flex-col items-start truncate">
                <span className="truncate w-full text-left">{localStorage.getItem("userName") || "User"}</span>
                <span className="text-xs text-gray-500 font-normal">{t("nav.settings")}</span>
              </div>
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
