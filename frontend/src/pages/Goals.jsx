import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Flag,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Target,
  Trash2,
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
  useUpdateGoal,
  useUpdateGoalStatus,
} from "@/hooks/useGoals";
import { formatBDT, formatBDTWhole, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants (these mirror the backend: models/Goal.js + goalControllers.js)
//   goal = { _id, title, description, targetAmount, savedAmount, targetDate,
//            plans[], selectedPlan, status, completedAt }
//   status: active | paused | completed | cancelled
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
];

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
const money = (n) => (Number.isInteger(Number(n)) ? formatBDTWhole(n) : formatBDT(n));

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
  if (goal.status === "completed")
    return { text: "Completed", icon: CheckCircle2, tone: "bg-success/12 text-success" };
  if (goal.status === "paused")
    return { text: "Paused", icon: Pause, tone: "bg-muted text-muted-foreground" };
  if (goal.status === "cancelled")
    return { text: "Cancelled", icon: CircleAlert, tone: "bg-destructive/10 text-destructive" };
  if (daysLeftOf(goal) <= 0)
    return { text: "Overdue", icon: CircleAlert, tone: "bg-destructive/10 text-destructive" };
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
          done ? "bg-success" : muted ? "bg-muted-foreground/40" : "bg-[#064581] dark:bg-primary",
        )}
      />
    </div>
  );
}

function GoalCard({ goal, busy, onAdd, onEdit, onDelete, onStatus }) {
  const pct = percentOf(goal);
  const badge = badgeOf(goal, pct);
  const est = estimateOf(goal);
  const completed = goal.status === "completed";
  const paused = goal.status === "paused";
  const cancelled = goal.status === "cancelled";
  const inactive = paused || cancelled;
  const remaining = remainingOf(goal);
  const StatusIcon = completed ? CheckCircle2 : Target;

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
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onEdit(goal)}>
                <Pencil aria-hidden="true" /> Edit goal
              </DropdownMenuItem>
              {goal.status === "active" ? (
                <DropdownMenuItem onClick={() => onStatus(goal, "paused")}>
                  <Pause aria-hidden="true" /> Pause goal
                </DropdownMenuItem>
              ) : null}
              {paused || cancelled ? (
                <DropdownMenuItem onClick={() => onStatus(goal, "active")}>
                  <Play aria-hidden="true" /> {paused ? "Resume goal" : "Reactivate goal"}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(goal)}>
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
        <span className="font-heading text-3xl font-extrabold text-[#064581] dark:text-primary">
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
          <span className="font-semibold text-foreground tabular-nums">{pct}%</span>
          <span
            className="flex items-center gap-1.5 text-muted-foreground"
            title={formatDate(est.date)}
          >
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {est.label} {monthYear(est.date)}
          </span>
        </div>
        <p className="mt-1.5 min-h-5 text-xs text-muted-foreground">
          {completed
            ? goal.completedAt
              ? `Reached on ${formatDate(goal.completedAt)}`
              : "Fully funded"
            : cancelled
              ? "This goal was cancelled"
              : `${money(remaining)} to go \u00B7 ${paused ? "paused" : timeLeftLabel(daysLeftOf(goal))}`}
        </p>
      </div>

      <div className="mt-5">
        {completed ? (
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

// ---------------------------------------------------------------------------
// Create / edit goal dialog
// The form is its own component so it starts fresh every time the dialog opens.
// ---------------------------------------------------------------------------

function GoalForm({ goal, onDone }) {
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const editing = Boolean(goal);
  const pending = create.isPending || update.isPending;

  const initialDate = goal ? toInputDate(new Date(goal.targetDate)) : "";
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [amount, setAmount] = useState(goal ? String(goal.targetAmount) : "");
  const [date, setDate] = useState(initialDate);
  const [error, setError] = useState("");

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
    setError("");

    const body = {
      title: title.trim(),
      description: description.trim(),
      targetAmount: value,
    };
    if (!editing || date !== initialDate) body.targetDate = toIsoDate(date);

    const options = {
      onSuccess: () => {
        toast.success(editing ? "Goal updated" : "Goal created");
        onDone();
      },
      onError: (err) =>
        setError(errorMessage(err, "Could not save the goal. Please try again.")),
    };

    if (editing) update.mutate({ id: goal._id, ...body }, options);
    else create.mutate(body, options);
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
          Note <span className="font-normal text-muted-foreground">(optional)</span>
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

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
        <Button type="submit" className={cn("h-10 px-5", PRIMARY_BTN)} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {editing ? "Save changes" : "Create goal"}
        </Button>
      </DialogFooter>
    </form>
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

  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0;
  const afterPct = valid
    ? Math.min(100, Math.round(((goal.savedAmount + value) / goal.targetAmount) * 100))
    : null;

  const chips = QUICK_AMOUNTS.filter((q) => q < remaining);

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return setError("Enter an amount greater than 0.");
    if (value > remaining)
      return setError(`You only need ${money(remaining)} more to reach this goal.`);
    setError("");

    add.mutate(
      { id: goal._id, amount: value },
      {
        onSuccess: (res) => {
          if (res?.goal?.status === "completed")
            toast.success(`You reached "${goal.title}"!`);
          else toast.success(`${money(value)} added to ${goal.title}`);
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
          {goal.title} &middot; {money(goal.savedAmount)} of {money(goal.targetAmount)} saved
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

      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
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
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
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
        <Button type="submit" className={cn("h-10 px-5", PRIMARY_BTN)} disabled={add.isPending}>
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
  const remove = useDeleteGoal();

  const [tab, setTab] = useState("all");
  const [formGoal, setFormGoal] = useState(null); // goal being edited
  const [formOpen, setFormOpen] = useState(false);
  const [addGoal, setAddGoal] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const goals = useMemo(() => data?.goals ?? [], [data]);

  const counts = useMemo(() => {
    const c = { all: goals.length, active: 0, paused: 0, completed: 0 };
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
            status === "paused" ? "Goal paused" : `${goal.title} is active again`,
          ),
        onError: (err) =>
          toast.error(errorMessage(err, "Could not update the goal.")),
      },
    );
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    remove.mutate(toDelete._id, {
      onSuccess: () => {
        toast.success("Goal deleted");
        setToDelete(null);
      },
      onError: (err) => toast.error(errorMessage(err, "Could not delete the goal.")),
    });
  };

  const busyId =
    statusMutation.isPending ? statusMutation.variables?.id : null;

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
        </div>
        <Button
          variant="outline"
          onClick={openCreate}
          className="h-12 rounded-xl border-[#064581] bg-card px-5 text-[15px] font-semibold text-[#064581] hover:bg-brand-soft dark:border-primary dark:text-primary dark:hover:bg-primary/15"
        >
          <Plus aria-hidden="true" /> New goal
        </Button>
      </div>

      {goals.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Filter goals"
            className="inline-flex gap-1 rounded-xl bg-muted p-1"
          >
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  "h-9 rounded-lg px-3.5 text-sm font-semibold transition",
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
              <span className="font-semibold text-foreground">{money(totals.saved)}</span>{" "}
              saved of {money(totals.target)} across {totals.count} active{" "}
              {totals.count === 1 ? "goal" : "goals"}
            </p>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <GoalsSkeleton />
      ) : error ? (
        <Panel icon={CircleAlert} tone="bg-destructive/10 text-destructive" title="Goals unavailable">
          <p role="alert" className="mt-1 max-w-sm text-sm text-muted-foreground">
            {errorMessage(error, "We could not load your goals. Please try again.")}
          </p>
          <Button className={cn("mt-5 h-10 px-5", PRIMARY_BTN)} onClick={() => refetch()}>
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
            Name something you're saving for, set an amount and a date, and watch it grow with every deposit.
          </p>
          <Button className={cn("mt-5 h-10 px-5", PRIMARY_BTN)} onClick={openCreate}>
            <Plus aria-hidden="true" /> Create your first goal
          </Button>
        </Panel>
      ) : visible.length === 0 ? (
        <Panel
          icon={Target}
          tone="bg-brand-soft text-brand dark:bg-primary/15 dark:text-primary"
          title={`No ${tab} goals`}
        >
          <Button variant="outline" className="mt-5 h-10 rounded-xl px-5" onClick={() => setTab("all")}>
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
              onAdd={setAddGoal}
              onEdit={openEdit}
              onDelete={setToDelete}
              onStatus={changeStatus}
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
        <DialogContent className="sm:max-w-md">
          <GoalForm goal={formGoal} onDone={() => setFormOpen(false)} />
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
                ? `"${toDelete.title}" and its ${money(toDelete.savedAmount)} of progress will be removed. Your wallet and transactions are not changed.`
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