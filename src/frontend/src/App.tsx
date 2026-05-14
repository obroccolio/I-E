/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RegistrationScreen } from "./screens/RegistrationScreen";
import { ProfileInputScreen } from "./screens/ProfileInputScreen";
import { PreferencesScreen } from "./screens/PreferencesScreen";
import { ChatScreen } from "./screens/ChatScreen";
import { ProfileConfirmationScreen } from "./screens/ProfileConfirmationScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import ResumeOptimizationScreen from "./screens/ResumeOptimizationScreen";
import { SidebarProvider } from "./contexts/SidebarContext";
import AdminLayout from "./screens/admin/AdminLayout";
import AdminDashboard from "./screens/admin/AdminDashboard";
import AdminUsers from "./screens/admin/AdminUsers";
import AdminJobs from "./screens/admin/AdminJobs";
import AdminMatches from "./screens/admin/AdminMatches";
import AdminConversations from "./screens/admin/AdminConversations";
import AdminSystem from "./screens/admin/AdminSystem";

export default function App() {
  return (
    <SidebarProvider>
      <BrowserRouter>
        <Routes>
          {/* Admin routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="jobs" element={<AdminJobs />} />
            <Route path="matches" element={<AdminMatches />} />
            <Route path="conversations" element={<AdminConversations />} />
            <Route path="system" element={<AdminSystem />} />
          </Route>

          {/* User routes */}
          <Route element={<Layout />}>
            <Route path="/" element={<RegistrationScreen />} />
            <Route path="/profile-input" element={<ProfileInputScreen />} />
            <Route path="/preferences" element={<PreferencesScreen />} />
            <Route path="/chat" element={<ChatScreen />} />
            <Route path="/profile-confirmation" element={<ProfileConfirmationScreen />} />
            <Route path="/dashboard" element={<DashboardScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/resume-optimization" element={<ResumeOptimizationScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SidebarProvider>
  );
}
