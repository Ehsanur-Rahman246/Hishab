import { useNavigate } from "react-router";
import {
  Bell,
  BellRing,
  CheckCheck,
  Sparkles,
  TrendingDown,
  TriangleAlert,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAlerts,
  useMarkAlertRead,
  useMarkAllAlertsRead,
} from "@/hooks/useAlerts";
import { formatDate, formatDateTime } from "@/lib/format";

const TYPE_LABELS = {
  future_shortfall: "Future shortfall",
  unusual_spending: "Unusual spending",
  low_balance: "Low balance",
  high_spending: "High spending",
  cash_flow: "Cash flow",
  budget: "Budget",
  savings_goal: "Savings goal",
  other: "Notice",
};

const TYPE_ICONS = {
  future_shortfall: TrendingDown,
  unusual_spending: TriangleAlert,
};

const SEVERITY_STYLES = {
  high: {
    bar: "bg-red-500",
    chip: "border-red-200 bg-red-50 text-red-700",
    label: "High priority",
  },
  medium: {
    bar: "bg-[#FFD21F]",
    chip: "border-[#FFD21F] bg-[#FFF8DC] text-[#5c4a00]",
    label: "Medium priority",
  },
  low: {
    bar: "bg-[#0756A6]",
    chip: "border-[#bcd7f3] bg-[#EAF3FC] text-[#064581]",
    label: "Low priority",
  },
};

const typeLabel = (type) => TYPE_LABELS[type] ?? "Notice";
const severityStyle = (severity) => SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.low;

function AlertCard({ alert, onOpen, onMarkRead, marking }) {
  const style = severityStyle(alert.severity);
  const Icon = TYPE_ICONS[alert.type] ?? BellRing;

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border bg-white shadow-[0_8px_28px_rgba(13,57,117,0.07)] transition-transform hover:-translate-y-0.5 ${
        alert.read ? "border-[#d7e5f5]" : "border-[#0756A6]/40"
      }`}
      aria-labelledby={`alert-title-${alert._id}`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-1.5 ${style.bar}`}
        aria-hidden="true"
      />
      <div className="p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${style.chip}`}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {typeLabel(alert.type)}
          </span>
          <span className="text-[11px] font-semibold text-[#5b6b7f]">
            {style.label}
          </span>
          {!alert.read && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0756A6] px-2.5 py-1 text-[11px] font-bold text-white">
              <span
                className="size-1.5 rounded-full bg-white"
                aria-hidden="true"
              />
              Unread
            </span>
          )}
        </div>

        <h2
          id={`alert-title-${alert._id}`}
          className="font-heading mt-2.5 text-base font-bold text-[#17212B]"
        >
          {alert.title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-[#3d4f63]">
          {alert.message}
        </p>

        <p className="mt-2 text-xs text-[#5b6b7f]">
          {alert.weekStart
            ? `Forecast week of ${formatDate(alert.weekStart)} · `
            : null}
          Created {formatDateTime(alert.createdAt)}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => onOpen(alert)}
            className="bg-[#0756A6] font-bold text-white hover:bg-[#064581]"
          >
            <Sparkles aria-hidden="true" />
            View in AI Assistant
          </Button>
          {!alert.read && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onMarkRead(alert._id)}
              disabled={marking}
            >
              Mark as read
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Notifications() {
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useAlerts();
  const markRead = useMarkAlertRead();
  const markAll = useMarkAllAlertsRead();

  const alerts = data?.alerts ?? [];
  const unreadCount = alerts.filter((a) => !a.read).length;

  const handleOpen = (alert) => {
    if (!alert.read) markRead.mutate(alert._id);
    navigate(alert.actionLink || "/ai-assistant");
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <Card className="border-[#d7e5f5]">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#0756A6] text-white"
              aria-hidden="true"
            >
              <Bell className="size-5" />
            </span>
            <div>
              <CardTitle className="text-lg text-[#064581]">
                Notifications
              </CardTitle>
              <CardDescription aria-live="polite">
                {isPending
                  ? "Loading your alerts…"
                  : unreadCount > 0
                    ? `${unreadCount} unread alert${unreadCount === 1 ? "" : "s"}`
                    : "You're all caught up"}
              </CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAll.mutate()}
            disabled={unreadCount === 0 || markAll.isPending}
            className="shrink-0"
          >
            <CheckCheck aria-hidden="true" />
            {markAll.isPending ? "Marking…" : "Mark all as read"}
          </Button>
        </CardHeader>
      </Card>

      {isPending ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading notifications">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="border-[#d7e5f5]">
              <CardContent className="flex flex-col gap-2 py-5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {!isPending && isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load notifications</AlertTitle>
          <AlertDescription className="mt-1 flex flex-col gap-2">
            Please check your connection and try again.
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              className="w-fit"
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {!isPending && !isError && alerts.length === 0 ? (
        <Card className="border-[#d7e5f5]">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span
              className="flex size-14 items-center justify-center rounded-2xl bg-[#EAF3FC] text-[#0756A6]"
              aria-hidden="true"
            >
              <Bell className="size-7" />
            </span>
            <p className="font-heading text-base font-bold text-[#17212B]">
              No notifications yet
            </p>
            <p className="max-w-sm text-sm text-[#3d4f63]">
              When your forecast shows a possible shortfall or the anomaly
              detector spots unusual spending, you&apos;ll see it here. Tap
              Refresh Insights on the AI Assistant page to check.
            </p>
            <Button
              onClick={() => navigate("/ai-assistant")}
              className="bg-[#0756A6] font-bold text-white hover:bg-[#064581]"
            >
              <Sparkles aria-hidden="true" />
              Go to AI Assistant
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!isPending && !isError && alerts.length > 0 ? (
        <div className="flex flex-col gap-3" role="list" aria-label="Notifications">
          {alerts.map((alert) => (
            <div key={alert._id} role="listitem">
              <AlertCard
                alert={alert}
                onOpen={handleOpen}
                onMarkRead={(id) => markRead.mutate(id)}
                marking={markRead.isPending}
              />
            </div>
          ))}
        </div>
      ) : null}

      {markRead.isError || markAll.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Update failed</AlertTitle>
          <AlertDescription>
            Could not update the read state. Please try again.
          </AlertDescription>
        </Alert>
      ) : null}
    </main>
  );
}
