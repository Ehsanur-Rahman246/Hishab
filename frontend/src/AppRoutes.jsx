import { Navigate, Route, Routes } from "react-router";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";
import Analytics from "@/pages/Analytics";
import AiAssistant from "@/pages/AiAssistant";
import Forecast from "@/pages/Forecast";
import Goals from "@/pages/Goals";
import Settings from "@/pages/Settings";
import Profile from "@/pages/Profile";
import Notifications from "@/pages/Notifications";

export default function AppRoutes() {
  return (
    <Routes>
      {/* public */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* private */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/ai-assistant" element={<AiAssistant />} />
          <Route path="/forecast" element={<Forecast />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/notifications" element={<Notifications />} />
        </Route>
      </Route>

      {/* anything else */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
