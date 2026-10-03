import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import {
  ArrowLeftRight,
  Bell,
  ChartColumn,
  ChartLine,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Target,
  User,
  X,
} from "lucide-react";
import { useCurrentUser, useLogout } from "@/hooks/useAuth";
import { useAlerts } from "@/hooks/useAlerts";
import { cn } from "@/lib/utils";

// Sidebar order and icons follow the design.
const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/analytics", label: "Analytics", icon: ChartColumn },
  { to: "/ai-assistant", label: "AI Assistant", icon: Sparkles },
  { to: "/forecast", label: "Forecast", icon: ChartLine },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/settings", label: "Settings", icon: Settings },
];

const PAGE_TITLES = {
  "/transactions": "Transactions",
  "/analytics": "Analytics",
  "/ai-assistant": "AI Assistant",
  "/forecast": "Forecast",
  "/goals": "Goals",
  "/settings": "Settings",
  "/profile": "Profile",
  "/notifications": "Notifications",
};

const greetingFor = (hour) =>
  hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

const initialsOf = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "U";

function SidebarContent({ onNavigate }) {
  return (
    <div className="flex h-full flex-col bg-[#064581] text-white">
      <div className="px-6 pt-6 pb-8">
        <Link
          to="/dashboard"
          onClick={onNavigate}
          aria-label="Hishab dashboard"
          className="grid size-11 place-items-center rounded-xl bg-[#ffd21f] font-heading text-xl font-extrabold text-[#064581]"
        >
          H
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1.5 px-3">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "relative flex h-12 items-center gap-4 rounded-xl px-4 text-[15px] font-medium transition-colors",
                isActive
                  ? "bg-white font-semibold text-[#064581] before:absolute before:top-1/2 before:-left-3 before:h-8 before:w-1 before:-translate-y-1/2 before:rounded-r before:bg-[#ffd21f]"
                  : "text-white/90 hover:bg-white/10",
              )
            }
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="m-3 rounded-xl bg-white/10 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="size-2 rounded-full bg-[#ffd21f]" aria-hidden="true" />
          Bank-level security
        </p>
        <p className="mt-1 text-sm leading-snug text-white/80">
          Read-only access. Your data is encrypted.
        </p>
      </div>
    </div>
  );
}

function UserMenu({ name, onLogout, loggingOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-3 rounded-full py-1 pr-2 pl-1 hover:bg-muted"
      >
        <span className="grid size-11 place-items-center rounded-full bg-[#064581] text-sm font-bold text-white">
          {initialsOf(name)}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-semibold text-[#064581]">{name}</span>
          <span className="block text-xs text-muted-foreground">Personal plan</span>
        </span>
        <ChevronDown className="hidden size-4 text-muted-foreground sm:block" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-48 rounded-xl bg-popover p-1.5 shadow-panel ring-1 ring-foreground/10"
        >
          <Link role="menuitem" to="/profile" onClick={() => setOpen(false)} className={itemClass}>
            <User className="size-4" aria-hidden="true" /> Profile
          </Link>
          <Link role="menuitem" to="/settings" onClick={() => setOpen(false)} className={itemClass}>
            <Settings className="size-4" aria-hidden="true" /> Settings
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            className={cn(itemClass, "text-destructive")}
          >
            <LogOut className="size-4" aria-hidden="true" /> Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const logout = useLogout();
  const { data: user } = useCurrentUser();
  const { data: alertData } = useAlerts();
  const [drawer, setDrawer] = useState(false);

  const unread = alertData?.alerts?.filter((a) => !a.read).length ?? 0;
  const name = user?.name || "there";
  const firstName = name.split(" ")[0];
  const onDashboard = pathname === "/dashboard";

  // close the mobile drawer with Escape and lock page scroll while it is open
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawer]);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => navigate("/login", { replace: true }),
    });
  };

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex min-h-svh bg-background">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 md:block xl:w-72">
        <SidebarContent />
      </aside>

      {/* mobile drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawer(false)}
          />
          <div className="relative h-full w-72 max-w-[85%]">
            <SidebarContent onNavigate={() => setDrawer(false)} />
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setDrawer(false)}
              className="absolute top-5 right-3 grid size-9 place-items-center rounded-lg text-white hover:bg-white/10"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-[87px] items-center justify-between gap-3 border-b bg-card px-4 sm:px-8 xl:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setDrawer(true)}
              className="grid size-10 shrink-0 place-items-center rounded-lg text-[#064581] hover:bg-muted md:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <div className="min-w-0">
              {onDashboard ? (
                <>
                  <h1 className="truncate text-2xl font-bold text-[#064581]">
                    {greetingFor(new Date().getHours())}, {firstName}
                  </h1>
                  <p className="truncate text-sm text-muted-foreground">{today}</p>
                </>
              ) : (
                <>
                  <h1 className="truncate text-2xl font-bold text-[#064581]">
                    {PAGE_TITLES[pathname] ?? "Hishab"}
                  </h1>
                  <p className="truncate text-sm text-muted-foreground">{today}</p>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              to="/ai-assistant"
              className="hidden items-center gap-2 rounded-full border border-[#ffd21f]/70 bg-[#fff6cc] px-4 py-2 text-sm font-semibold text-[#064581] hover:bg-[#fff0b0] lg:inline-flex"
            >
              <span className="size-2 rounded-full bg-[#0755a4]" aria-hidden="true" />
              AI Insights
            </Link>

            <Link
              to="/notifications"
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
              className="relative grid size-11 place-items-center rounded-xl border bg-card text-[#064581] hover:bg-muted"
            >
              <Bell className="size-5" aria-hidden="true" />
              {unread > 0 ? (
                <span className="absolute top-2 right-2.5 size-2.5 rounded-full bg-[#ffd21f] ring-2 ring-card" aria-hidden="true" />
              ) : null}
            </Link>

            <UserMenu name={name} onLogout={handleLogout} loggingOut={logout.isPending} />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8 xl:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
