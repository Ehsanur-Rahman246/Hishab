import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Flag,
  History,
  Info,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Target,
  Trash2,
  Undo2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAddSavings,
  useCreateGoal,
  useDeleteGoal,
  useGoals,
  useGoalTransfers,
  useRunAutomationNow,
  useUpdateGoal,
  useUpdateGoalAutomation,
  useUpdateGoalStatus,
} from "@/hooks/useGoals";
import {
  formatBDT,
  formatBDTWhole,
  formatDate,
  formatDateTime,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWallet } from "@/hooks/useWallet";

// ---------------------------------------------------------------------------
// Constants (these mirror the backend: models/Goal.js + goalControllers.js)
//   goal = { _id, title, description, targetAmount, savedAmount, targetDate,
//            plans[], selectedPlan, status, completedAt, releasedAt,
//            releasedAmount, automation: { enabled, frequency, percentage,
//            priority, paused, lastProcessedCycle, enabledAt } }
//   status: active | paused | completed | cancelled | released
// ---------------------------------------------------------------------------

const TAKA = "\u09F3";
const DAY_MS = 24 * 60 * 60 * 1000;

// "Almost there" kicks in at this share of the target
const ALMOST_THERE = 70;

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

const TABS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "released", label: "Released" },
];

const AUTO_CONSENT =
  "When enabled, Hishab automatically moves the selected percentage of your available Wallet balance into this Goal at the end of each chosen cycle. You can pause or disable it anytime.";

const PRIORITY_HINT =
  "Priority 1 is funded first. Lower-priority goals may be skipped when Wallet funds are insufficient.";

// Fixed auto-save choices (mirror backend ALLOWED_AUTOMATION_PERCENTAGES).
// Users pick one; arbitrary values are never accepted for new/changed
// automations. Legacy goals with other percentages keep working untouched.
const AUTO_PERCENTAGES = [5, 10, 15, 20, 25];
const PERCENTAGE_EXPLAINER =
  "At the end of each selected cycle, Hishab will try to save this percentage of your Wallet balance for this Goal.";
const PERCENTAGE_CHOICES_ERROR = "Choose one of 5%, 10%, 15%, 20%, or 25%.";

const isLegacyPercentage = (v) =>
  v !== null &&
  v !== undefined &&
  v !== "" &&
  !AUTO_PERCENTAGES.includes(Number(v));

function PercentageOptions({ value, onChange, idPrefix, legacy }) {
  return (
    <div className="grid gap-1.5">
      <span id={`${idPrefix}-label`} className="text-sm font-medium">
        Percentage
      </span>
      <div
        className="grid grid-cols-5 gap-2"
        role="radiogroup"
        aria-labelledby={`${idPrefix}-label`}
      >
        {AUTO_PERCENTAGES.map((p) => {
          const selected = Number(value) === p;
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(String(p))}
              className={cn(
                "h-11 rounded-xl border text-[15px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6]",
                selected
                  ? "border-[#064581] bg-brand-soft text-[#064581] dark:border-primary dark:bg-primary/15 dark:text-primary"
                  : "border-input bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {p}%
            </button>
          );
        })}
      </div>
      {legacy != null ? (
        <p className="rounded-lg bg-[#FFD21F]/25 px-3 py-2 text-xs font-medium text-[#6b4f00] dark:text-[#FFD21F]">
          Currently {legacy}% (older setting, still honored). Choose an option
          above to change it.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{PERCENTAGE_EXPLAINER}</p>
    </div>
  );
}

// Same look as the controls on the Transactions page
const CONTROL =
  "h-11 w-full rounded-xl border border-input bg-card px-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

const PRIMARY_BTN =
  "rounded-xl bg-[#064581] font-semibold text-white shadow-sm hover:bg-[#0755a4]";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const errorMessage = (error, fallback) =>
  error?.response?.data?.message || fallback;

// whole taka when possible, paise only when the amount really has them
const money = (n) =>
  Number.isInteger(Number(n)) ? formatBDTWhole(n) : formatBDT(n);

const toInputDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

const tomorrowInput = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toInputDate(d);
};

// "YYYY-MM-DD" -> local noon, so no time zone can shift it to another day.
// The backend only accepts dates in the future, tomorrow noon always is.
const toIsoDate = (inputDate) => {
  const [y, m, d] = inputDate.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
};

const monthYear = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString("en-BD", { month: "short", year: "numeric" });
};

const remainingOf = (goal) =>
  Math.max(0, Number((goal.targetAmount - goal.savedAmount).toFixed(2)));

// Capped at 99 so a nearly-funded goal never reads "100%" before it is done.
const percentOf = (goal) => {
  if (!(goal.targetAmount > 0)) return 0;
  if (goal.savedAmount >= goal.targetAmount) return 100;
  return Math.min(99, Math.round((goal.savedAmount / goal.targetAmount) * 100));
};

const daysLeftOf = (goal) =>
  Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / DAY_MS);

function timeLeftLabel(days) {
  if (days <= 0) return "Past target date";
  if (days === 1) return "1 day left";
  if (days <= 45) return `${days} days left`;
  return `~${Math.round(days / 30.4)} months left`;
}

// Dhaka (UTC+6, no DST) wall-clock helpers for cycle labels.
const dhakaWall = (now = new Date()) =>
  new Date(now.getTime() + 6 * 60 * 60 * 1000);
const dhakaMonthlyKey = (now = new Date()) => {
  const w = dhakaWall(now);
  return `${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, "0")}`;
};
const dhakaWeeklyKey = (now = new Date()) => {
  const w = dhakaWall(now);
  const d = new Date(
    Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const isoYear = d.getUTCFullYear();
  const week = Math.ceil(
    ((d - new Date(Date.UTC(isoYear, 0, 1))) / 86400000 + 1) / 7,
  );
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
};

const autoOf = (goal) => goal.automation || { enabled: false };

function nextCycleText(goal) {
  const a = autoOf(goal);
  if (goal.status === "released") return "Released — no further transfers";
  if (!a.enabled) return "Automation off";
  if (a.paused || goal.status !== "active") return "Automation paused";
  const key = a.frequency === "weekly" ? dhakaWeeklyKey() : dhakaMonthlyKey();
  return a.frequency === "weekly"
    ? `Weekly · current cycle ${key}`
    : `Monthly · current cycle ${key}`;
}

// The page only ever shows data the backend really has; a plan's estimate is
// used when one is selected, otherwise the goal's own target date.
function estimateOf(goal) {
  const plan = goal.plans?.find((p) => p._id === goal.selectedPlan);
  return plan
    ? { label: "Est.", date: plan.projectedCompletionDate }
    : { label: "Target", date: goal.targetDate };
}

// Small badge in the card's top-right corner.
function badgeOf(goal, pct) {
  if (goal.status === "released")
<<<<<<< HEAD
    return {
      text: "Released",
      icon: Undo2,
      tone: "bg-[#eaf3fc] text-[#064581] dark:bg-primary/15 dark:text-primary",
    };
=======
    return { text: "Completed & released", icon: Undo2, tone: "bg-[#eaf3fc] text-[#064581] dark:bg-primary/15 dark:text-primary" };
>>>>>>> 381a66cc80bf0087bf6d4272e724beeb27eeed7d
  if (goal.status === "completed")
    return {
      text: "Completed",
      icon: CheckCircle2,
      tone: "bg-success/12 text-success",
    };
  if (goal.status === "paused")
    return {
      text: "Paused",
      icon: Pause,
      tone: "bg-muted text-muted-foreground",
    };
  if (goal.status === "cancelled")
    return {
      text: "Cancelled",
      icon: CircleAlert,
      tone: "bg-destructive/10 text-destructive",
    };
  if (daysLeftOf(goal) <= 0)
    return {
      text: "Overdue",
      icon: CircleAlert,
      tone: "bg-destructive/10 text-destructive",
    };
  if (pct >= ALMOST_THERE)
    return {
      text: "Almost there",
      icon: Flag,
      tone: "bg-[#ffd51e]/35 text-[#6b4f00] dark:bg-[#ffd51e]/20 dark:text-[#ffd51e]",
    };
  return null;
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function ProgressBar({ pct, done, muted, label }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-3 w-full overflow-hidden rounded-full bg-[#eaf1fa] dark:bg-muted"
    >
      <div
        style={{ "--pct": `${pct}%` }}
        className={cn(
          "h-full w-(--pct) rounded-full transition-[width] duration-700 ease-out starting:w-0 motion-reduce:transition-none",
          done
            ? "bg-success"
            : muted
              ? "bg-muted-foreground/40"
              : "bg-[#064581] dark:bg-primary",
        )}
      />
    </div>
  );
}

function AutomationLine({ goal }) {
  const a = autoOf(goal);
  if (goal.status === "released") {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Undo2 className="size-3.5" aria-hidden="true" />
<<<<<<< HEAD
        Released
        {goal.releasedAmount != null
          ? ` · ${money(goal.releasedAmount)} returned`
          : ""}
=======
        Completed &amp; released{goal.releasedAmount != null ? ` · ${money(goal.releasedAmount)} returned` : ""}
>>>>>>> 381a66cc80bf0087bf6d4272e724beeb27eeed7d
        {goal.releasedAt ? ` · ${formatDate(goal.releasedAt)}` : ""}
      </p>
    );
  }
  if (!a.enabled) return null;
  const paused = a.paused || goal.status !== "active";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
          paused
            ? "bg-muted text-muted-foreground"
            : "bg-[#eaf3fc] text-[#064581] dark:bg-primary/15 dark:text-primary",
        )}
      >
        <Zap className="size-3" aria-hidden="true" />
        {paused ? "Auto-save paused" : "Auto-save on"}
      </span>
      <span className="text-muted-foreground tabular-nums">
        {a.frequency === "weekly" ? "Weekly" : "Monthly"} · {a.percentage}% ·
        Priority {a.priority}
      </span>
      <span className="text-muted-foreground">{nextCycleText(goal)}</span>
    </div>
  );
}

function GoalCard({
  goal,
  busy,
  autoBusy,
  onAdd,
  onEdit,
  onDelete,
  onStatus,
  onAutomation,
  onPauseAutomation,
  onResumeAutomation,
  onHistory,
  onRunNow,
  runPending,
}) {
  const pct = percentOf(goal);
  const badge = badgeOf(goal, pct);
  const est = estimateOf(goal);
  const completed = goal.status === "completed";
  const released = goal.status === "released";
  const paused = goal.status === "paused";
  const cancelled = goal.status === "cancelled";
  const inactive = paused || cancelled || released;
  const terminal = completed || cancelled || released;
  const remaining = remainingOf(goal);
  const StatusIcon = completed ? CheckCircle2 : released ? Undo2 : Target;
  const a = autoOf(goal);
  const autoPaused = a.enabled && (a.paused || goal.status !== "active");

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-2xl bg-card p-5 shadow-panel ring-1 ring-foreground/10 transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] sm:p-6",
        inactive && "opacity-85",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-xl",
            completed
              ? "bg-success/12 text-success"
              : "bg-brand-soft text-brand dark:bg-primary/15 dark:text-primary",
          )}
        >
          <StatusIcon className="size-5" aria-hidden="true" />
        </span>

        <div className="flex items-center gap-1.5">
          {badge ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                badge.tone,
              )}
            >
              <badge.icon className="size-3" aria-hidden="true" />
              {badge.text}
            </span>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Options for ${goal.title}`}
              disabled={busy}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50 data-popup-open:bg-muted"
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {!terminal ? (
                <DropdownMenuItem onClick={() => onEdit(goal)}>
                  <Pencil aria-hidden="true" /> Edit goal
                </DropdownMenuItem>
              ) : null}
              {goal.status === "active" && !released ? (
                <DropdownMenuItem onClick={() => onStatus(goal, "paused")}>
                  <Pause aria-hidden="true" /> Pause goal
                </DropdownMenuItem>
              ) : null}
              {paused || cancelled ? (
                <DropdownMenuItem onClick={() => onStatus(goal, "active")}>
                  <Play aria-hidden="true" />{" "}
                  {paused ? "Resume goal" : "Reactivate goal"}
                </DropdownMenuItem>
              ) : null}
              {!terminal ? (
                <DropdownMenuItem onClick={() => onAutomation(goal)}>
                  <Zap aria-hidden="true" />
                  {a.enabled ? "Edit auto-save" : "Set up auto-save"}
                </DropdownMenuItem>
              ) : null}
              {a.enabled && !autoPaused && !terminal ? (
                <DropdownMenuItem onClick={() => onPauseAutomation(goal)}>
                  <Pause aria-hidden="true" /> Pause auto-save
                </DropdownMenuItem>
              ) : null}
              {a.enabled && autoPaused && goal.status === "active" ? (
                <DropdownMenuItem onClick={() => onResumeAutomation(goal)}>
                  <Play aria-hidden="true" /> Resume auto-save
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => onHistory(goal)}>
                <History aria-hidden="true" /> Transfer history
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(goal)}
              >
                <Trash2 aria-hidden="true" /> Delete goal
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <h3 className="mt-4 truncate font-heading text-xl font-bold text-[#064581] dark:text-primary">
        {goal.title}
      </h3>
      <p className="mt-0.5 min-h-5 truncate text-sm text-muted-foreground">
        {goal.description || "\u00A0"}
      </p>

      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 tabular-nums">
        <span
          data-testid="goal-saved"
          className="font-heading text-3xl font-extrabold text-[#064581] dark:text-primary"
        >
          {money(goal.savedAmount)}
        </span>
        <span className="text-[15px] text-muted-foreground">
          / {money(goal.targetAmount)}
        </span>
      </p>

      <div className="mt-4">
        <ProgressBar
          pct={pct}
          done={completed}
          muted={inactive}
          label={`${goal.title} progress`}
        />
        <div className="mt-2.5 flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-foreground tabular-nums">
            {pct}%
          </span>
          <span
            className="flex items-center gap-1.5 text-muted-foreground"
            title={formatDate(est.date)}
          >
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {est.label} {monthYear(est.date)}
          </span>
        </div>
        <p className="mt-1.5 min-h-5 text-xs text-muted-foreground">
          {released
            ? goal.releasedAt
              ? `Completed & released on ${formatDate(goal.releasedAt)}${goal.releasedAmount != null ? ` · ${money(goal.releasedAmount)} returned to wallet` : ""}`
              : "Funds returned to wallet"
            : completed
              ? goal.completedAt
                ? `Reached on ${formatDate(goal.completedAt)}`
                : "Fully funded"
              : cancelled
                ? "This goal was cancelled"
                : `${money(remaining)} to go \u00B7 ${paused ? "paused" : timeLeftLabel(daysLeftOf(goal))}`}
        </p>
        <AutomationLine goal={goal} />
      </div>

      <div className="mt-5 grid gap-2">
        {released ? (
          <Button
            disabled
            className="h-12 w-full rounded-xl text-[15px] font-semibold"
            variant="outline"
          >
            <Undo2 aria-hidden="true" /> Funds returned to wallet
          </Button>
        ) : completed ? (
          <Button
            disabled
            className="h-12 w-full rounded-xl text-[15px] font-semibold"
            variant="outline"
          >
            <CheckCircle2 aria-hidden="true" /> Goal reached
          </Button>
        ) : inactive ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onStatus(goal, "active")}
            className="h-12 w-full rounded-xl text-[15px] font-semibold"
          >
            {busy ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Play aria-hidden="true" />
            )}
            {paused ? "Resume to add money" : "Reactivate goal"}
          </Button>
        ) : (
          <Button
            onClick={() => onAdd(goal)}
            disabled={busy}
            className={cn("h-12 w-full text-[15px]", PRIMARY_BTN)}
          >
            <Plus aria-hidden="true" /> Add money
          </Button>
        )}

        {!terminal ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              disabled={autoBusy}
              onClick={() =>
                autoPaused ? onResumeAutomation(goal) : onPauseAutomation(goal)
              }
              className="h-10 rounded-xl text-sm font-semibold"
              title={
                a.enabled
                  ? autoPaused
                    ? "Resume automatic saving"
                    : "Pause automatic saving"
                  : "Set up automatic saving"
              }
            >
              {autoBusy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : autoPaused ? (
                <Play aria-hidden="true" />
              ) : (
                <Pause aria-hidden="true" />
              )}
              {a.enabled
                ? autoPaused
                  ? "Resume auto"
                  : "Pause auto"
                : "Auto-save"}
            </Button>
            <Button
              variant="outline"
              onClick={() => onHistory(goal)}
              className="h-10 rounded-xl text-sm font-semibold"
            >
              <History aria-hidden="true" /> History
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            onClick={() => onHistory(goal)}
            className="h-10 w-full rounded-xl text-sm font-semibold"
          >
            <History aria-hidden="true" /> Transfer history
          </Button>
        )}

        {goal.status === "active" ? (
          <Button
            variant="ghost"
            disabled={runPending}
            onClick={() => onRunNow(goal)}
            className="h-10 w-full rounded-xl text-sm font-semibold text-muted-foreground"
            title="Demo only: process the currently-due cycle now"
          >
            {runPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
            Run now (demo)
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function GoalsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading goals"
      className="grid gap-6 md:grid-cols-2 xl:grid-cols-3"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl bg-card p-6 shadow-panel ring-1 ring-foreground/10"
        >
          <Skeleton className="size-12 rounded-xl bg-muted" />
          <Skeleton className="mt-5 h-6 w-40 rounded-md bg-muted" />
          <Skeleton className="mt-4 h-9 w-48 rounded-md bg-muted" />
          <Skeleton className="mt-5 h-3 w-full rounded-full bg-muted" />
          <Skeleton className="mt-3 h-4 w-full rounded-md bg-muted" />
          <Skeleton className="mt-6 h-12 w-full rounded-xl bg-muted" />
        </div>
      ))}
    </div>
  );
}

function Panel({ icon: Icon, tone, title, children }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-card px-6 py-16 text-center shadow-panel ring-1 ring-foreground/10">
      <span className={cn("grid size-14 place-items-center rounded-2xl", tone)}>
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-lg text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger,
  pending,
  onCancel,
  onConfirm,
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel?.();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            className="h-10 rounded-xl px-4"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant={danger ? "destructive" : "default"}
            className={cn("h-10 rounded-xl px-4", !danger && PRIMARY_BTN)}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Create / edit goal dialog (includes automation setup)
// ---------------------------------------------------------------------------

function GoalForm({ goal, goals, onDone }) {
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const autoSave = useUpdateGoalAutomation();
  const editing = Boolean(goal);
  const pending = create.isPending || update.isPending || autoSave.isPending;

  const initialDate = goal ? toInputDate(new Date(goal.targetDate)) : "";
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [amount, setAmount] = useState(goal ? String(goal.targetAmount) : "");
  const [date, setDate] = useState(initialDate);
  const [autoEnabled, setAutoEnabled] = useState(
    Boolean(goal?.automation?.enabled),
  );
  const [frequency, setFrequency] = useState(
    goal?.automation?.frequency ?? "monthly",
  );
  const [percentage, setPercentage] = useState(
    goal?.automation?.percentage != null
      ? String(goal.automation.percentage)
      : "10",
  );
  const [priority, setPriority] = useState(
    goal?.automation?.priority != null ? String(goal.automation.priority) : "",
  );
  const [error, setError] = useState("");

  const legacyPercentage =
    editing && isLegacyPercentage(goal?.automation?.percentage)
      ? goal.automation.percentage
      : null;

  const duplicatePriority =
    autoEnabled && priority !== ""
      ? (goals || []).some(
          (g) =>
            (!goal || g._id !== goal._id) &&
            g.automation?.enabled &&
            String(g.automation?.priority) === String(Number(priority)),
        )
      : false;

  const submit = (e) => {
    e.preventDefault();
    const value = Number(amount);

    if (!title.trim()) return setError("Give your goal a name.");
    if (!Number.isFinite(value) || value <= 0)
      return setError("Enter a target amount greater than 0.");
    if (editing && value < goal.savedAmount)
      return setError(
        `The target can't be lower than the ${money(goal.savedAmount)} you've already saved.`,
      );
    if (!date) return setError("Pick a target date.");
    // an overdue goal can keep its old date, any new date must be in the future
    if (date !== initialDate && date < tomorrowInput())
      return setError("The target date must be in the future.");

    let automation;
    if (autoEnabled) {
      if (frequency !== "weekly" && frequency !== "monthly")
        return setError("Choose Weekly or Monthly for auto-save.");
      // Unchanged legacy percentages pass through untouched (never sent);
      // every new or changed value must be one of the five options.
      const pctUnchanged =
        editing && percentage === String(goal?.automation?.percentage ?? "");
      if (!pctUnchanged && !AUTO_PERCENTAGES.includes(Number(percentage)))
        return setError(PERCENTAGE_CHOICES_ERROR);
      const pri = Number(priority);
      if (!Number.isInteger(pri) || pri < 1)
        return setError(
          "Priority must be a positive whole number (1 is highest).",
        );
      automation = {
        enabled: true,
        frequency,
        percentage: Number(percentage),
        priority: pri,
      };
    }
    setError("");

    const body = {
      title: title.trim(),
      description: description.trim(),
      targetAmount: value,
    };
    if (!editing || date !== initialDate) body.targetDate = toIsoDate(date);

    // Basic fields always go to PATCH /:id (it rejects automation payloads).
    // Automation changes go to PATCH /:id/automation, which accepts partial
    // updates — unchanged legacy percentages are simply not sent, so old
    // records are never rewritten or corrupted.
    const stored = goal?.automation || {};
    let autoBody = null;
    if (editing && automation) {
      autoBody = {};
      if (autoEnabled !== Boolean(stored.enabled)) autoBody.enabled = true;
      if (frequency !== stored.frequency) autoBody.frequency = frequency;
      if (percentage !== String(stored.percentage ?? ""))
        autoBody.percentage = Number(percentage);
      if (priority !== String(stored.priority ?? ""))
        autoBody.priority = Number(priority);
      // Freshly enabling: send complete details (all validated above).
      if (autoBody.enabled === true) {
        autoBody.frequency = frequency;
        autoBody.percentage = Number(percentage);
        autoBody.priority = Number(priority);
      }
      if (Object.keys(autoBody).length === 0) autoBody = null;
    }
    if (editing && stored.enabled && !autoEnabled) {
      autoBody = { enabled: false };
    }

    const saveError = (err) =>
      setError(errorMessage(err, "Could not save the goal. Please try again."));

    const finishAutomation = () => {
      if (!autoBody) {
        toast.success("Goal updated");
        onDone();
        return;
      }
      autoSave.mutate(
        { id: goal._id, ...autoBody },
        {
          onSuccess: () => {
            toast.success("Goal updated");
            onDone();
          },
          onError: saveError,
        },
      );
    };

    const options = {
      onSuccess: () => {
        if (editing) finishAutomation();
        else {
          toast.success("Goal created");
          onDone();
        }
      },
      onError: saveError,
    };

    if (editing) update.mutate({ id: goal._id, ...body }, options);
    else
      create.mutate(
        { ...body, ...(automation ? { automation } : {}) },
        options,
      );
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="font-heading text-lg text-[#064581] dark:text-primary">
          {editing ? "Edit goal" : "New goal"}
        </DialogTitle>
        <DialogDescription>
          {editing
            ? "Change what you're saving for, how much, or by when."
            : "Pick something to save for, then add money whenever you can."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="goal-title">Goal name</Label>
        <input
          id="goal-title"
          type="text"
          maxLength={100}
          placeholder="e.g. Emergency fund"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={CONTROL}
          autoFocus
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="goal-amount">Target amount</Label>
          <div className="relative">
            <span
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[15px] font-semibold text-muted-foreground"
              aria-hidden="true"
            >
              {TAKA}
            </span>
            <input
              id="goal-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={cn(CONTROL, "pl-9")}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="goal-date">Target date</Label>
          <input
            id="goal-date"
            type="date"
            min={tomorrowInput()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={CONTROL}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="goal-description">
          Note{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <input
          id="goal-description"
          type="text"
          maxLength={500}
          placeholder="Why does this goal matter?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={CONTROL}
        />
      </div>

      <div className="rounded-2xl border border-input p-4">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={autoEnabled}
            onChange={(e) => setAutoEnabled(e.target.checked)}
            className="mt-1 size-4 accent-[#0756A6]"
          />
          <span className="text-sm">
            <span className="font-semibold text-foreground">
              Enable automatic saving
            </span>
            <span className="block text-xs text-muted-foreground">
              {AUTO_CONSENT}
            </span>
          </span>
        </label>

        {autoEnabled ? (
          <div className="mt-3 grid gap-3">
            <div
              className="grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label="Frequency"
            >
              {[
                { value: "weekly", label: "Weekly" },
                { value: "monthly", label: "Monthly" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={frequency === opt.value}
                  onClick={() => setFrequency(opt.value)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                    frequency === opt.value
                      ? "border-primary bg-brand-soft dark:bg-primary/15"
                      : "border-input bg-card hover:border-primary/40",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <PercentageOptions
              value={percentage}
              onChange={setPercentage}
              idPrefix="goal-pct"
              legacy={legacyPercentage}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="goal-priority">Priority</Label>
              <input
                id="goal-priority"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                placeholder="1 = highest"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={CONTROL}
              />
            </div>
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {PRIORITY_HINT}
            </p>
            {duplicatePriority ? (
              <p
                role="alert"
                className="rounded-lg bg-[#FFD21F]/25 px-3 py-2 text-xs font-medium text-[#6b4f00] dark:text-[#FFD21F]"
              >
                Another automated goal already uses priority {Number(priority)}.
                Duplicates are allowed, but the oldest goal is funded first on
                ties.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-xl px-4"
          onClick={onDone}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className={cn("h-10 px-5", PRIMARY_BTN)}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : null}
          {editing ? "Save changes" : "Create goal"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Edit automation dialog (priority / frequency / percentage / enable-disable)
// ---------------------------------------------------------------------------

function AutomationForm({ goal, goals, onDone }) {
  const save = useUpdateGoalAutomation();
  const a = autoOf(goal);
  const [enabled, setEnabled] = useState(Boolean(a.enabled));
  const [frequency, setFrequency] = useState(a.frequency ?? "monthly");
  const [percentage, setPercentage] = useState(
    a.percentage != null ? String(a.percentage) : "10",
  );
  const [priority, setPriority] = useState(
    a.priority != null ? String(a.priority) : "",
  );
  const [error, setError] = useState("");

  const legacyPercentage = isLegacyPercentage(a.percentage)
    ? a.percentage
    : null;

  const duplicatePriority =
    enabled && priority !== ""
      ? (goals || []).some(
          (g) =>
            g._id !== goal._id &&
            g.automation?.enabled &&
            String(g.automation?.priority) === String(Number(priority)),
        )
      : false;

  const submit = (e) => {
    e.preventDefault();
    if (goal.status !== "active" && enabled) {
      return setError("Only active goals can enable automation.");
    }
    const body = { enabled };
    if (enabled) {
      if (frequency !== "weekly" && frequency !== "monthly")
        return setError("Choose Weekly or Monthly.");
      // Preserve an unchanged legacy percentage (never resend it); every
      // new or changed value must be one of the five fixed options.
      if (percentage !== String(a.percentage ?? "")) {
        if (!AUTO_PERCENTAGES.includes(Number(percentage)))
          return setError(PERCENTAGE_CHOICES_ERROR);
        body.percentage = Number(percentage);
      } else if (a.percentage == null) {
        if (!AUTO_PERCENTAGES.includes(Number(percentage)))
          return setError(PERCENTAGE_CHOICES_ERROR);
        body.percentage = Number(percentage);
      }
      const pri = Number(priority);
      if (!Number.isInteger(pri) || pri < 1)
        return setError(
          "Priority must be a positive whole number (1 is highest).",
        );
      body.frequency = frequency;
      body.priority = pri;
    }
    setError("");
    save.mutate(
      { id: goal._id, ...body },
      {
        onSuccess: () => {
          toast.success(enabled ? "Auto-save enabled" : "Auto-save disabled");
          onDone();
        },
        onError: (err) =>
          setError(errorMessage(err, "Could not update automation.")),
      },
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="font-heading text-lg text-[#064581] dark:text-primary">
          Automatic saving
        </DialogTitle>
        <DialogDescription>
          {goal.title} · {AUTO_CONSENT}
        </DialogDescription>
      </DialogHeader>

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-1 size-4 accent-[#0756A6]"
        />
        <span className="text-sm font-semibold text-foreground">
          Enable automatic saving
        </span>
      </label>

      {enabled ? (
        <div className="grid gap-3">
          <div
            className="grid grid-cols-2 gap-2"
            role="radiogroup"
            aria-label="Frequency"
          >
            {[
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={frequency === opt.value}
                onClick={() => setFrequency(opt.value)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                  frequency === opt.value
                    ? "border-primary bg-brand-soft dark:bg-primary/15"
                    : "border-input bg-card hover:border-primary/40",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <PercentageOptions
            value={percentage}
            onChange={setPercentage}
            idPrefix="auto-pct"
            legacy={legacyPercentage}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="auto-priority">Priority</Label>
            <input
              id="auto-priority"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={CONTROL}
            />
          </div>
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {PRIORITY_HINT}
          </p>
          {duplicatePriority ? (
            <p
              role="alert"
              className="rounded-lg bg-[#FFD21F]/25 px-3 py-2 text-xs font-medium text-[#6b4f00] dark:text-[#FFD21F]"
            >
              Another automated goal already uses priority {Number(priority)}.
              Oldest first on ties.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-xl px-4"
          onClick={onDone}
          disabled={save.isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className={cn("h-10 px-5", PRIMARY_BTN)}
          disabled={save.isPending}
        >
          {save.isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : null}
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Transfer history dialog (immutable audit ledger)
// ---------------------------------------------------------------------------

function TransferHistoryDialog({ goal, onClose }) {
  const { data, isLoading, error } = useGoalTransfers(goal?._id);
  const transfers = data?.transfers ?? [];
  return (
    <Dialog
      open={Boolean(goal)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg text-[#064581] dark:text-primary">
            Transfer history
          </DialogTitle>
          <DialogDescription>
            {goal
              ? `${goal.title} · every automatic move is recorded here and never deleted.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div
            className="space-y-2"
            role="status"
            aria-label="Loading transfers"
          >
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl bg-muted" />
            ))}
          </div>
        ) : error ? (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage(error, "Could not load transfer history.")}
          </p>
        ) : transfers.length === 0 ? (
          <p className="rounded-xl bg-muted px-3 py-4 text-center text-sm text-muted-foreground">
            No automatic transfers yet for this goal.
          </p>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {transfers.map((t) => (
              <li
                key={t._id}
                className="rounded-xl border border-input px-3 py-2.5 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">
                    {t.type === "goal_release"
                      ? "Released to wallet"
                      : t.type === "goal_cancelled_refund"
                        ? "Cancelled — refunded to wallet"
                        : t.type === "manual_contribution"
                          ? "Manual contribution"
                          : "Auto contribution"}
                  </span>
                  <span className="font-bold text-[#064581] tabular-nums dark:text-primary">
                    {money(t.amount)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  Cycle {t.cycleKey} · {formatDateTime(t.createdAt)} · Wallet{" "}
                  {money(t.walletBalanceBefore)} → {money(t.walletBalanceAfter)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            className="h-10 rounded-xl px-4"
            onClick={onClose}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Add money dialog
// ---------------------------------------------------------------------------

function AddMoneyForm({ goal, onDone }) {
  const add = useAddSavings();
  const remaining = remainingOf(goal);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // One UUID per dialog attempt: double-clicks and network retries resend
  // the same key, so the backend returns the original transfer instead of
  // deducting the wallet twice.
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0;
  const afterPct = valid
    ? Math.min(
        100,
        Math.round(((goal.savedAmount + value) / goal.targetAmount) * 100),
      )
    : null;

  const chips = QUICK_AMOUNTS.filter((q) => q < remaining);

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return setError("Enter an amount greater than 0.");
    if (value > remaining)
      return setError(
        `You only need ${money(remaining)} more to reach this goal.`,
      );
    setError("");

    add.mutate(
      { id: goal._id, amount: value, idempotencyKey },
      {
        onSuccess: (res) => {
          // A retried request returns the original transfer with
          // duplicate: true — an expected outcome, not an error.
          if (res?.duplicate) {
            const msg = `Already recorded: ${money(res?.transfer?.amount ?? value)} is in ${goal.title}. No money was moved again.`;
            setNotice(msg);
            toast.info(msg);
            return;
          }
<<<<<<< HEAD
          if (res?.goal?.status === "released") {
            toast.success(
              `${goal.title} completed. ${money(res.goal.releasedAmount)} returned to your wallet.`,
            );
          } else if (res?.goal?.status === "completed") {
            toast.success(`You reached "${goal.title}"!`);
          } else {
            toast.success(`${money(value)} added to ${goal.title}`);
          }
=======
          // Early completion: the same transaction already returned the full
          // saved amount to the wallet — say so explicitly.
          if (res?.released) {
            const amt = Number(res.releasedAmount || 0).toLocaleString("en-BD");
            toast.success(`Goal completed early — BDT ${amt} has been returned to your wallet.`);
          } else if (res?.goal?.status === "completed")
            toast.success(`You reached "${goal.title}"! ${money(value)} moved to the goal.`);
          else toast.success(`${money(value)} added to ${goal.title}`);
>>>>>>> 381a66cc80bf0087bf6d4272e724beeb27eeed7d
          onDone();
        },
        onError: (err) =>
          setError(errorMessage(err, "Could not add money. Please try again.")),
      },
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="font-heading text-lg text-[#064581] dark:text-primary">
          Add money
        </DialogTitle>
        <DialogDescription>
          {goal.title} &middot; {money(goal.savedAmount)} of{" "}
          {money(goal.targetAmount)} saved
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="savings-amount">Amount</Label>
        <div className="relative">
          <span
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[15px] font-semibold text-muted-foreground"
            aria-hidden="true"
          >
            {TAKA}
          </span>
          <input
            id="savings-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={cn(CONTROL, "pl-9")}
            autoFocus
          />
        </div>
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Quick amounts"
      >
        {chips.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setAmount(String(q))}
            className={cn(
              "h-9 rounded-full border px-3.5 text-sm font-medium transition",
              value === q
                ? "border-[#064581] bg-brand-soft text-[#064581] dark:border-primary dark:bg-primary/15 dark:text-primary"
                : "border-input text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            +{formatBDTWhole(q)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAmount(String(remaining))}
          className={cn(
            "h-9 rounded-full border px-3.5 text-sm font-medium transition",
            value === remaining
              ? "border-[#064581] bg-brand-soft text-[#064581] dark:border-primary dark:bg-primary/15 dark:text-primary"
              : "border-input text-muted-foreground hover:border-primary/40 hover:text-foreground",
          )}
        >
          Fill remaining ({money(remaining)})
        </button>
      </div>

      <p className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
        {afterPct === null
          ? `${money(remaining)} left to reach your goal.`
          : value > remaining
            ? `That's more than the ${money(remaining)} still needed.`
            : afterPct >= 100
              ? "This completes your goal."
              : `You'll be at ${afterPct}% with ${money(remaining - value)} left.`}
      </p>

      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-lg bg-[#eaf3fc] px-3 py-2 text-sm text-[#064581] dark:bg-primary/15 dark:text-primary"
        >
          {notice}
        </p>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-xl px-4"
          onClick={onDone}
          disabled={add.isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className={cn("h-10 px-5", PRIMARY_BTN)}
          disabled={add.isPending}
        >
          {add.isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          Add money
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const Goals = () => {
  const { data, isLoading, isFetching, error, refetch } = useGoals();
  const statusMutation = useUpdateGoalStatus();
  const autoMutation = useUpdateGoalAutomation();
  const runNow = useRunAutomationNow();
  const remove = useDeleteGoal();
  const walletQuery = useWallet();
  const walletBalance = walletQuery.data?.wallet?.balance;

  const [tab, setTab] = useState("all");
  const [formGoal, setFormGoal] = useState(null); // goal being edited
  const [formOpen, setFormOpen] = useState(false);
  const [autoGoal, setAutoGoal] = useState(null); // goal whose automation is edited
  const [addGoal, setAddGoal] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [historyGoal, setHistoryGoal] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind, goal }

  const goals = useMemo(() => data?.goals ?? [], [data]);

  const counts = useMemo(() => {
    const c = {
      all: goals.length,
      active: 0,
      paused: 0,
      completed: 0,
      released: 0,
    };
    for (const g of goals) if (g.status in c) c[g.status] += 1;
    return c;
  }, [goals]);

  const totals = useMemo(() => {
    const live = goals.filter((g) => g.status === "active");
    return {
      count: live.length,
      saved: live.reduce((s, g) => s + g.savedAmount, 0),
      target: live.reduce((s, g) => s + g.targetAmount, 0),
    };
  }, [goals]);

  const visible = tab === "all" ? goals : goals.filter((g) => g.status === tab);

  const openCreate = () => {
    setFormGoal(null);
    setFormOpen(true);
  };
  const openEdit = (goal) => {
    setFormGoal(goal);
    setFormOpen(true);
  };

  const changeStatus = (goal, status) => {
    statusMutation.mutate(
      { id: goal._id, status },
      {
        onSuccess: () =>
          toast.success(
            status === "paused"
              ? "Goal paused"
              : `${goal.title} is active again`,
          ),
        onError: (err) =>
          toast.error(errorMessage(err, "Could not update the goal.")),
      },
    );
  };

  const runNowForUser = () => {
    runNow.mutate(undefined, {
      onSuccess: (res) => {
        const c = res?.summary?.contributions ?? [];
        const r = res?.summary?.releases ?? [];
        const funded = c.filter((x) => x.status === "contributed");
        const released = r.filter((x) => x.status === "released");
        const fundedTotal = funded.reduce(
          (s, x) => s + (Number(x.amount) || 0),
          0,
        );
        const releasedTotal = released.reduce(
          (s, x) => s + (Number(x.amount) || 0),
          0,
        );
        const parts = [];
        parts.push(
          funded.length > 0
            ? `${funded.length} contribution${funded.length === 1 ? "" : "s"} (${money(fundedTotal)})`
            : "no new contributions",
        );
        parts.push(
          released.length > 0
            ? `${released.length} release${released.length === 1 ? "" : "s"} (${money(releasedTotal)})`
            : "no releases",
        );
        toast.success(`Cycle processed: ${parts.join(", ")}.`);
      },
      onError: (err) =>
        toast.error(errorMessage(err, "Could not run the cycle.")),
    });
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    const idempotencyKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    remove.mutate(
      { id: toDelete._id, idempotencyKey },
      {
        onSuccess: (res) => {
          const refunded = Number(res?.refundedAmount) || 0;
          if (res?.duplicate) {
            toast.info(
              refunded > 0
                ? `Already deleted: ${money(refunded)} was already returned to your wallet.`
                : "Already deleted.",
            );
          } else if (refunded > 0) {
            toast.success(
              `Goal deleted. ${money(refunded)} returned to your wallet.`,
            );
          } else {
            toast.success("Goal deleted");
          }
          setToDelete(null);
        },
        onError: (err) =>
          toast.error(errorMessage(err, "Could not delete the goal.")),
      },
    );
  };

  const confirmAutomation = () => {
    if (!confirm) return;
    const { kind, goal } = confirm;
    const body =
      kind === "pause-auto"
        ? { paused: true }
        : kind === "resume-auto"
          ? { paused: false }
          : kind === "disable-auto"
            ? { enabled: false }
            : null;
    if (!body) return;
    autoMutation.mutate(
      { id: goal._id, ...body },
      {
        onSuccess: () => {
          toast.success(
            kind === "pause-auto"
              ? "Auto-save paused"
              : kind === "resume-auto"
                ? "Auto-save resumed"
                : "Auto-save disabled",
          );
          setConfirm(null);
        },
        onError: (err) =>
          toast.error(errorMessage(err, "Could not update automation.")),
      },
    );
  };

  const busyId = statusMutation.isPending ? statusMutation.variables?.id : null;
  const autoBusyId = autoMutation.isPending ? autoMutation.variables?.id : null;

  const confirmText = (kind, goal) => {
    if (kind === "pause-auto")
      return {
        title: "Pause automatic saving?",
        description: `"${goal?.title}" will stop receiving automatic transfers until you resume it. Money already saved stays in the goal.`,
        confirmLabel: "Pause auto-save",
      };
    if (kind === "resume-auto")
      return {
        title: "Resume automatic saving?",
        description: `"${goal?.title}" will receive automatic transfers again from the next due cycle.`,
        confirmLabel: "Resume auto-save",
      };
    if (kind === "disable-auto")
      return {
        title: "Disable automatic saving?",
        description: `"${goal?.title}" will stop receiving automatic transfers. Money already saved stays in the goal.`,
        confirmLabel: "Disable auto-save",
      };
    return { title: "", description: "", confirmLabel: "Confirm" };
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-3xl font-extrabold text-[#064581] sm:text-4xl dark:text-primary">
            Goals
          </h2>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            Small, steady deposits add up.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Wallet:{" "}
            <span
              data-testid="wallet-balance"
              className="font-semibold tabular-nums text-foreground"
            >
              {walletBalance === undefined
                ? "\u2014"
                : formatBDTWhole(walletBalance)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={runNowForUser}
            disabled={runNow.isPending}
            className="h-12 rounded-xl px-5 text-[15px] font-semibold"
            title="Demo only: process releases + the currently-due cycle for your account"
          >
            {runNow.isPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
            Run now (demo)
          </Button>
          <Button
            variant="outline"
            onClick={openCreate}
            className="h-12 rounded-xl border-[#064581] bg-card px-5 text-[15px] font-semibold text-[#064581] hover:bg-brand-soft dark:border-primary dark:text-primary dark:hover:bg-primary/15"
          >
            <Plus aria-hidden="true" /> New goal
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-[#0756A6]/20 bg-[#EAF3FC] px-4 py-3 text-sm leading-relaxed text-[#064581] dark:bg-primary/10 dark:text-primary">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          {PRIORITY_HINT} Weekly cycles run every Sunday, monthly cycles on the
          1st — or press “Run now (demo)” to process the currently-due cycle
          immediately.
        </p>
      </div>

      {goals.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Filter goals"
            className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1"
          >
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  "h-9 rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap transition",
                  tab === t.value
                    ? "bg-card text-[#064581] shadow-sm dark:text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span className="ml-1.5 text-xs font-medium tabular-nums opacity-70">
                  {counts[t.value]}
                </span>
              </button>
            ))}
          </div>

          {totals.count > 0 ? (
            <p className="text-sm text-muted-foreground tabular-nums">
              <span className="font-semibold text-foreground">
                {money(totals.saved)}
              </span>{" "}
              saved of {money(totals.target)} across {totals.count} active{" "}
              {totals.count === 1 ? "goal" : "goals"}
            </p>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <GoalsSkeleton />
      ) : error ? (
        <Panel
          icon={CircleAlert}
          tone="bg-destructive/10 text-destructive"
          title="Goals unavailable"
        >
          <p
            role="alert"
            className="mt-1 max-w-sm text-sm text-muted-foreground"
          >
            {errorMessage(
              error,
              "We could not load your goals. Please try again.",
            )}
          </p>
          <Button
            className={cn("mt-5 h-10 px-5", PRIMARY_BTN)}
            onClick={() => refetch()}
          >
            Try again
          </Button>
        </Panel>
      ) : goals.length === 0 ? (
        <Panel
          icon={Target}
          tone="bg-brand-soft text-brand dark:bg-primary/15 dark:text-primary"
          title="No goals yet"
        >
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Name something you're saving for, set an amount and a date, and
            watch it grow with every deposit.
          </p>
          <Button
            className={cn("mt-5 h-10 px-5", PRIMARY_BTN)}
            onClick={openCreate}
          >
            <Plus aria-hidden="true" /> Create your first goal
          </Button>
        </Panel>
      ) : visible.length === 0 ? (
        <Panel
          icon={Target}
          tone="bg-brand-soft text-brand dark:bg-primary/15 dark:text-primary"
          title={`No ${tab} goals`}
        >
          <Button
            variant="outline"
            className="mt-5 h-10 rounded-xl px-5"
            onClick={() => setTab("all")}
          >
            Show all goals
          </Button>
        </Panel>
      ) : (
        <div
          aria-busy={isFetching}
          className={cn(
            "grid gap-6 transition-opacity md:grid-cols-2 xl:grid-cols-3",
            isFetching && !isLoading && "opacity-90",
          )}
        >
          {visible.map((goal) => (
            <GoalCard
              key={goal._id}
              goal={goal}
              busy={busyId === goal._id}
              autoBusy={autoBusyId === goal._id}
              onAdd={setAddGoal}
              onEdit={openEdit}
              onDelete={setToDelete}
              onStatus={changeStatus}
              onAutomation={setAutoGoal}
              onPauseAutomation={(g) =>
                setConfirm({ kind: "pause-auto", goal: g })
              }
              onResumeAutomation={(g) =>
                setConfirm({ kind: "resume-auto", goal: g })
              }
              onHistory={setHistoryGoal}
              onRunNow={runNowForUser}
              runPending={runNow.isPending}
            />
          ))}
        </div>
      )}

      {/* create / edit */}
      <Dialog
        open={formOpen}
        onOpenChange={(next) => {
          if (!next) setFormOpen(false);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <GoalForm
            goal={formGoal}
            goals={goals}
            onDone={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* automation edit */}
      <Dialog
        open={Boolean(autoGoal)}
        onOpenChange={(next) => {
          if (!next && !autoMutation.isPending) setAutoGoal(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {autoGoal ? (
            <AutomationForm
              goal={goals.find((g) => g._id === autoGoal._id) ?? autoGoal}
              goals={goals}
              onDone={() => setAutoGoal(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* add money */}
      <Dialog
        open={Boolean(addGoal)}
        onOpenChange={(next) => {
          if (!next) setAddGoal(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {addGoal ? (
            <AddMoneyForm
              // re-read the latest saved amount after a refetch
              goal={goals.find((g) => g._id === addGoal._id) ?? addGoal}
              onDone={() => setAddGoal(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* transfer history */}
      {historyGoal ? (
        <TransferHistoryDialog
          goal={historyGoal}
          onClose={() => setHistoryGoal(null)}
        />
      ) : null}

      {/* pause / resume / disable automation */}
      {confirm ? (
        <ConfirmDialog
          open={Boolean(confirm)}
          title={confirmText(confirm.kind, confirm.goal).title}
          description={confirmText(confirm.kind, confirm.goal).description}
          confirmLabel={confirmText(confirm.kind, confirm.goal).confirmLabel}
          pending={autoMutation.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={confirmAutomation}
        />
      ) : null}

      {/* delete */}
      <Dialog
        open={Boolean(toDelete)}
        onOpenChange={(next) => {
          if (!next && !remove.isPending) setToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this goal?</DialogTitle>
            <DialogDescription>
              {toDelete
                ? Number(toDelete.savedAmount) > 0
                  ? `"${toDelete.title}" will be permanently deleted and ${money(toDelete.savedAmount)} will be returned to your wallet as a Savings income transaction.`
                  : `"${toDelete.title}" will be permanently deleted. No money will be returned (nothing saved yet).`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-10 rounded-xl px-4"
              onClick={() => setToDelete(null)}
              disabled={remove.isPending}
            >
              Keep it
            </Button>
            <Button
              variant="destructive"
              className="h-10 rounded-xl px-4"
              onClick={confirmDelete}
              disabled={remove.isPending}
            >
              {remove.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Goals;
