import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Funnel,
  Loader2,
  PiggyBank,
  RefreshCw,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAlerts,
  useDeleteAlert,
  useMarkAlertRead,
  useMarkAllAlertsRead,
  useResolveAlert,
  useRefreshAlerts,
} from "@/hooks/useAlerts";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants (these mirror the backend: models/Alert.js + alertControllers.js)
//   alert = { _id, type, severity, title, message, weekStart, relatedGoal,
//             read, resolved, createdAt }
// ---------------------------------------------------------------------------

const TYPES = {
  low_balance: { label: "Low balance", icon: Wallet },
  high_spending: { label: "High spending", icon: TrendingUp },
  cash_flow: { label: "Cash flow", icon: ArrowLeftRight },
  budget: { label: "Budget", icon: PiggyBank },
  savings_goal: { label: "Savings goal", icon: Target },
  unusual_spending: { label: "Unusual spending", icon: TriangleAlert },
  future_shortfall: { label: "Future shortfall", icon: TrendingDown },
  other: { label: "General", icon: Bell },
};

const SEVERITY = {
  high: { label: "High", tone: "bg-destructive/10 text-destructive" },
  medium: {
    label: "Medium",
    tone: "bg-[#ffd51e]/35 text-[#6b4f00] dark:bg-[#ffd51e]/20 dark:text-[#ffd51e]",
  },
  low: {
    label: "Low",
    tone: "bg-brand-soft text-[#064581] dark:bg-primary/15 dark:text-primary",
  },
};

const TABS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "resolved", label: "Resolved" },
];

const CONTROL =
  "h-11 w-full rounded-xl border border-input bg-card text-[15px] text-foreground outline-none transition-colors hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

const PRIMARY_BTN =
  "rounded-xl bg-[#064581] font-semibold text-white shadow-sm hover:bg-[#0755a4]";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const errorMessage = (error, fallback) =>
  error?.response?.data?.message || fallback;

const typeOf = (alert) => TYPES[alert.type] ?? TYPES.other;
const severityOf = (alert) => SEVERITY[alert.severity] ?? SEVERITY.low;

// "just now" / "12 min ago" / "3 h ago" / "Yesterday" / "12 Oct 2026"
function timeAgo(value) {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "\u2014";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(value);
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function IconButton({ label, onClick, disabled, danger, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50",
        danger
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function NotificationRow({ alert, busy, onRead, onResolve, onDelete }) {
  const type = typeOf(alert);
  const severity = severityOf(alert);
  const Icon = alert.resolved ? CircleCheck : type.icon;
  const unread = !alert.read;

  return (
    <li
      className={cn(
        "relative flex gap-3 px-4 py-4 transition-colors hover:bg-muted/40 sm:gap-4 sm:px-5",
        unread && "bg-[#eaf4ff]/70 dark:bg-primary/5",
        alert.resolved && "opacity-75",
      )}
    >
      {unread ? (
        <span
          className="absolute top-10 left-1.5 size-2 -translate-y-1/2 rounded-full bg-[#064581] dark:bg-primary"
          role="img"
          aria-label="Unread"
        />
      ) : null}

      <span
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-xl",
          alert.resolved
            ? "bg-success/12 text-success"
            : "bg-card text-[#064581] ring-1 ring-foreground/10 dark:text-primary",
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p
            className={cn(
              "text-[15px] text-foreground",
              unread ? "font-semibold" : "font-medium",
            )}
          >
            {alert.title}
          </p>
          {!alert.resolved ? (
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                severity.tone,
              )}
            >
              {severity.label}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2.5 py-0.5 text-xs font-semibold text-success">
              <Check className="size-3" aria-hidden="true" /> Resolved
            </span>
          )}
        </div>

        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {alert.message}
        </p>

        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>{type.label}</span>
          <span aria-hidden="true">&middot;</span>
          <time dateTime={alert.createdAt}>{timeAgo(alert.createdAt)}</time>
          {alert.relatedGoal ? (
            <>
              <span aria-hidden="true">&middot;</span>
              <Link
                to="/goals"
                className="font-medium text-[#064581] underline-offset-2 hover:underline dark:text-primary"
              >
                View goals
              </Link>
            </>
          ) : null}
        </p>

        {!alert.resolved ? (
          <button
            type="button"
            onClick={() => onResolve(alert)}
            disabled={busy}
            className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-success underline-offset-2 hover:underline disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <CircleCheck className="size-3.5" aria-hidden="true" />
            )}
            Mark as resolved
          </button>
        ) : null}
      </div>

      <div className="flex shrink-0 items-start gap-0.5">
        {unread ? (
          <IconButton
            label="Mark as read"
            onClick={() => onRead(alert)}
            disabled={busy}
          >
            <Check className="size-4" aria-hidden="true" />
          </IconButton>
        ) : null}
        <IconButton
          label={`Delete ${alert.title}`}
          onClick={() => onDelete(alert)}
          disabled={busy}
          danger
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </IconButton>
      </div>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading notifications" className="divide-y">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-4 px-5 py-4">
          <Skeleton className="size-12 rounded-xl bg-muted" />
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-5 w-56 rounded-md bg-muted" />
            <Skeleton className="h-4 w-full max-w-md rounded-md bg-muted" />
            <Skeleton className="h-3 w-32 rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Message({ icon: Icon, tone, title, children }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className={cn("grid size-14 place-items-center rounded-2xl", tone)}>
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-lg text-foreground">{title}</h3>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const Notifications = () => {
  const { data, isLoading, isFetching, error, refetch } = useAlerts();
  const markRead = useMarkAlertRead();
  const markAll = useMarkAllAlertsRead();
  const resolve = useResolveAlert();
  const remove = useDeleteAlert();
  const sync = useRefreshAlerts();

  const [tab, setTab] = useState("all");
  const [type, setType] = useState("all");

  const alerts = useMemo(() => data?.alerts ?? [], [data]);

  useEffect(() => {
    sync.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(
    () => ({
      all: alerts.length,
      unread: alerts.filter((a) => !a.read).length,
      resolved: alerts.filter((a) => a.resolved).length,
    }),
    [alerts],
  );

  const visible = useMemo(
    () =>
      alerts.filter((a) => {
        if (tab === "unread" && a.read) return false;
        if (tab === "resolved" && !a.resolved) return false;
        if (type !== "all" && a.type !== type) return false;
        return true;
      }),
    [alerts, tab, type],
  );

  // a row is busy while any single-row action for it is in flight
  const busyId = [markRead, resolve, remove].find(
    (m) => m.isPending,
  )?.variables;

  const handleRead = (alert) =>
    markRead.mutate(alert._id, {
      onError: (err) =>
        toast.error(errorMessage(err, "Could not mark it as read.")),
    });

  const handleResolve = (alert) =>
    resolve.mutate(alert._id, {
      onSuccess: () => toast.success("Marked as resolved"),
      onError: (err) =>
        toast.error(errorMessage(err, "Could not resolve the notification.")),
    });

  const handleDelete = (alert) =>
    remove.mutate(alert._id, {
      onSuccess: () => toast.success("Notification deleted"),
      onError: (err) =>
        toast.error(errorMessage(err, "Could not delete the notification.")),
    });

  const handleReadAll = () =>
    markAll.mutate(undefined, {
      onSuccess: () => toast.success("All notifications marked as read"),
      onError: (err) =>
        toast.error(errorMessage(err, "Could not update your notifications.")),
    });

  const filtered = tab !== "all" || type !== "all";

  return (
    <div className="mx-auto w-full max-w-350 space-y-6">
      {/* tabs */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b">
        <div
          role="tablist"
          aria-label="Filter notifications"
          className="flex gap-1"
        >
          {TABS.map((t) => {
            const active = tab === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.value)}
                className={cn(
                  "-mb-px h-11 border-b-2 px-4 text-[15px] transition-colors",
                  active
                    ? "border-[#064581] font-semibold text-[#064581] dark:border-primary dark:text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span className="ml-1.5 text-xs font-medium tabular-nums opacity-70">
                  {counts[t.value]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mb-2 flex w-full flex-wrap items-center gap-3 sm:w-auto">
          {counts.unread > 0 ? (
            <button
              type="button"
              onClick={handleReadAll}
              disabled={markAll.isPending}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[#064581] transition hover:bg-brand-soft disabled:opacity-60 dark:text-primary dark:hover:bg-primary/15"
            >
              {markAll.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCheck className="size-4" aria-hidden="true" />
              )}
              Mark all as read
            </button>
          ) : null}
          <div className="relative w-full flex-1 sm:w-56 sm:flex-none">
            <Funnel
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <select
              aria-label="Filter by type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={cn(
                CONTROL,
                "cursor-pointer appearance-none pr-9 pl-10",
              )}
            >
              <option value="all">All types</option>
              {Object.entries(TYPES).map(([value, t]) => (
                <option key={value} value={value}>
                  {t.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      {/* list */}
      <section
        aria-label="Notifications list"
        className="overflow-hidden rounded-2xl bg-card shadow-panel ring-1 ring-foreground/10"
      >
        {isLoading ? (
          <ListSkeleton />
        ) : error ? (
          <Message
            icon={CircleAlert}
            tone="bg-destructive/10 text-destructive"
            title="Notifications unavailable"
          >
            <p
              role="alert"
              className="mt-1 max-w-sm text-sm text-muted-foreground"
            >
              {errorMessage(
                error,
                "We could not load your notifications. Please try again.",
              )}
            </p>
            <Button
              className={cn("mt-5 h-10 px-5", PRIMARY_BTN)}
              onClick={() => refetch()}
            >
              Try again
            </Button>
          </Message>
        ) : visible.length === 0 ? (
          <Message
            icon={filtered ? BellOff : Bell}
            tone="bg-brand-soft text-[#064581] dark:bg-primary/15 dark:text-primary"
            title={
              filtered ? "No matching notifications" : "No notifications yet"
            }
          >
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {filtered
                ? "Nothing fits these filters right now."
                : "When something needs your attention, like a low balance or unusual spending, it will show up here."}
            </p>
            {filtered ? (
              <Button
                variant="outline"
                className="mt-5 h-10 rounded-xl px-5"
                onClick={() => {
                  setTab("all");
                  setType("all");
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </Message>
        ) : (
          <ul
            aria-busy={isFetching}
            className={cn(
              "divide-y transition-opacity",
              isFetching && "opacity-70",
            )}
          >
            {visible.map((alert) => (
              <NotificationRow
                key={alert._id}
                alert={alert}
                busy={busyId === alert._id}
                onRead={handleRead}
                onResolve={handleResolve}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        )}
      </section>

      {/* footer actions */}
      {!isLoading && !error && alerts.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing {visible.length} of {alerts.length}
          </p>
          <div className="flex gap-3">
            <Button
              onClick={handleReadAll}
              disabled={counts.unread === 0 || markAll.isPending}
              className={cn("h-12 px-6 text-[15px]", PRIMARY_BTN)}
            >
              {markAll.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <CheckCheck aria-hidden="true" />
              )}
              Mark all as read
            </Button>
            <Button
              variant="outline"
              onClick={() => sync.mutate()}
              disabled={isFetching || sync.isPending}
              className="h-12 rounded-xl px-6 text-[15px] font-medium"
            >
              <RefreshCw
                className={cn((isFetching || sync.isPending) && "animate-spin")}
                aria-hidden="true"
              />
              Refresh
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Notifications;
