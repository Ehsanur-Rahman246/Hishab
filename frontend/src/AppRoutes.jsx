import { Navigate, Outlet, Route, Routes } from "react-router";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import { useCurrentUser } from "@/hooks/useAuth";

import Landing from "@/pages/Landing";
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

function PublicOnlyRoute() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div
        className="flex min-h-svh items-center justify-center text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        Loading…
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* public-only pages (landing + auth): authenticated users go to the dashboard */}
      <Route element={<PublicOnlyRoute />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      {/* private */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
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

      {/* anything else goes to landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}