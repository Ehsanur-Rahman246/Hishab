import { Link, NavLink, Outlet, useNavigate } from "react-router";
import {
  LayoutDashboard,
  ArrowLeftRight,
  ChartPie,
  Bot,
  TrendingUp,
  Target,
  Bell,
  User,
  Settings,
  LogOut,
  Wallet,
} from "lucide-react";
import { useLogout } from "@/hooks/useAuth";
import { useAlerts } from "@/hooks/useAlerts";

const mainNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/analytics", label: "Analytics", icon: ChartPie },
  { to: "/ai-assistant", label: "AI Assistant", icon: Bot },
  { to: "/forecast", label: "Forecast", icon: TrendingUp },
  { to: "/goals", label: "Goals", icon: Target },
];

const secondaryNav = [
  { to: "/notifications", label: "Notifications", icon: Bell, badge: true },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/settings", label: "Settings", icon: Settings },
];

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

export default function AppLayout() {
  const navigate = useNavigate();
  const logout = useLogout();
  const { data } = useAlerts();

  const unread = data?.alerts?.filter((a) => !a.read).length ?? 0;

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => navigate("/login", { replace: true }),
    });
  };

  const renderLink = ({ to, label, icon: Icon, badge }) => (
    <NavLink key={to} to={to} end={to === "/dashboard"} className={linkClass}>
      <Icon className="size-4" />
      <span className="flex-1">{label}</span>
      {badge && unread > 0 && (
        <span className="rounded-full bg-destructive px-1.5 text-xs text-white">
          {unread}
        </span>
      )}
    </NavLink>
  );

  return (
    <div className="flex min-h-svh">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-card p-4 md:flex">
        <Link
          to="/dashboard"
          className="mb-6 flex items-center gap-2 px-3"
          aria-label="Hishab dashboard"
        >
          <span
            className="flex size-8 items-center justify-center rounded-lg bg-[#0756A6] text-white"
            aria-hidden="true"
          >
            <Wallet className="size-4" />
          </span>
          <span className="font-heading text-lg font-extrabold tracking-tight">
            Hishab<span className="text-[#0756A6]">.</span>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          {mainNav.map(renderLink)}
        </nav>

        <nav className="flex flex-col gap-1 border-t pt-4">
          {secondaryNav.map(renderLink)}
          <button
            onClick={handleLogout}
            disabled={logout.isPending}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            Logout
          </button>
        </nav>
      </aside>

      {/* page content */}
      <main className="flex-1 p-4 pb-20 md:p-6 md:pb-6">
        <Outlet />
      </main>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t bg-card py-2 md:hidden" aria-label="Primary mobile">
        {[...mainNav.slice(0, 4), secondaryNav[0]].map(
          ({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/dashboard"}
              aria-label={
                to === "/notifications" && unread > 0
                  ? `${label}, ${unread} unread`
                  : label
              }
              className={({ isActive }) =>
                `relative p-2 ${isActive ? "text-primary" : "text-muted-foreground"}`
              }
            >
              <Icon className="size-5" />
              {to === "/notifications" && unread > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-bold text-white"
                  aria-hidden="true"
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </NavLink>
          ),
        )}
      </nav>
    </div>
  );
}
