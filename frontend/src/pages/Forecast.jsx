import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  PiggyBank,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EvaluationSection } from "@/components/ai/EvaluationSection";
import { useForecasts } from "@/hooks/useForecasts";
import { useGoals } from "@/hooks/useGoals";
import { toApiError, useGenerateInsights } from "@/hooks/useAiInsights";
import { cn } from "@/lib/utils";
import { formatBDT, formatBDTCompact, formatBDTWhole } from "@/lib/format";

// ---------------------------------------------------------------------------
// Data shaping. Source of truth is the ForecastSnapshot model:
//   { modelUsed, horizonWeeks, generatedAt,
//     weeks: [{ weekStart, predictedInflow, predictedOutflow, predictedBalance,
//               shortfallRisk, actualInflow, actualOutflow }] }
// ---------------------------------------------------------------------------

const RISKS = ["low", "medium", "high"];
const safeRisk = (r) => (RISKS.includes(r) ? r : "low");
const RISK_RANK = { low: 0, medium: 1, high: 2 };
const RISK_LABEL = { low: "Low", medium: "Medium", high: "High" };
const RISK_BG = { low: "bg-success", medium: "bg-warning", high: "bg-destructive" };
const RISK_TEXT = { low: "text-success", medium: "text-warning", high: "text-destructive" };

const MODEL_LABELS = {
  linear_regression: "Linear regression",
  historical_average_fallback: "Historical average",
};
const modelLabel = (m) =>
  MODEL_LABELS[m] ?? String(m ?? "Forecast model").replace(/_/g, " ");

const shortDate = (d) => {
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? "\u2014"
    : date.toLocaleDateString("en-BD", { day: "numeric", month: "short" });
};

function toRows(weeks) {
  return [...(weeks ?? [])]
    .sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart))
    .map((w) => {
      const income = Number(w.predictedInflow) || 0;
      const expense = Number(w.predictedOutflow) || 0;
      return {
        key: String(w.weekStart),
        label: shortDate(w.weekStart),
        income,
        expense,
        net: income - expense,
        balance: Number.isFinite(Number(w.predictedBalance)) ? Number(w.predictedBalance) : null,
        risk: safeRisk(w.shortfallRisk),
        band: [Math.min(income, expense), Math.max(income, expense)],
        actualExpense: w.actualOutflow ?? null,
      };
    });
}

const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
const worstRisk = (rows) =>
  rows.reduce((w, r) => (RISK_RANK[r.risk] > RISK_RANK[w] ? r.risk : w), "low");

function updatedLabel(iso, now) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "saved";
  const days = Math.floor((now - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function buildInsight(rows, expenseTotal) {
  const peak = rows.reduce((p, r) => (r.expense > p.expense ? r : p), rows[0]);
  const high = rows.filter((r) => r.risk === "high");
  const medium = rows.filter((r) => r.risk === "medium");
  let risk = "No shortfall weeks are expected.";
  if (high.length) {
    risk = `${high.length === 1 ? "1 week looks" : `${high.length} weeks look`} tight (${high
      .map((r) => r.label)
      .join(", ")}): expenses may exceed income.`;
  } else if (medium.length) {
    risk = `Keep an eye on ${medium.map((r) => r.label).join(", ")}, where spending runs close to income.`;
  }
  return (
    <>
      Based on your transaction history, expected spending over the next {rows.length} weeks is{" "}
      <strong>{formatBDTWhole(expenseTotal)}</strong>, peaking in the week of {peak.label} at{" "}
      {formatBDTWhole(peak.expense)}. {risk}
    </>
  );
}

// Compare the forecast surplus with the user's active goal (Goal model).
function goalPace(goal, avgNet) {
  const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);
  const plan = (goal.plans ?? []).find((p) => String(p._id) === String(goal.selectedPlan));
  if (remaining === 0) return "Goal reached. Nice work.";
  if (plan?.weeklyAmount > 0) {
    return avgNet >= plan.weeklyAmount
      ? `Forecast surplus of ${formatBDTWhole(avgNet)}/week covers your ${formatBDTWhole(plan.weeklyAmount)}/week plan.`
      : `Forecast surplus of ${formatBDTWhole(Math.max(avgNet, 0))}/week is below your ${formatBDTWhole(plan.weeklyAmount)}/week plan.`;
  }
  if (avgNet > 0) {
    return `At ${formatBDTWhole(avgNet)}/week, about ${Math.ceil(remaining / avgNet)} weeks to save the remaining ${formatBDTWhole(remaining)}.`;
  }
  return "No weekly surplus is forecast, so this goal would not move on forecast alone.";
}

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

function StatTile({ label, value, sub, icon: Icon, highlight = false, negative = false, chip }) {
  return (
    <Card
      className={cn(
        "relative gap-2 shadow-panel [--card-spacing:--spacing(5)]",
        highlight && "ring-2 ring-accent",
      )}
    >
      <div className="flex items-center justify-between px-(--card-spacing)">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          className={cn(
            "grid size-8 place-items-center rounded-lg",
            highlight ? "bg-accent text-accent-foreground" : "bg-secondary text-primary",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <div className="px-(--card-spacing)">
        <span
          className={cn(
            "font-heading text-3xl font-extrabold tabular-nums tracking-tight",
            negative && "text-destructive",
            highlight &&
              !negative &&
              "bg-[linear-gradient(transparent_64%,var(--accent)_64%)] px-0.5",
          )}
        >
          {value}
        </span>
      </div>
      <div className="flex items-center gap-2 px-(--card-spacing) text-xs text-muted-foreground">
        {chip}
        <span>{sub}</span>
      </div>
    </Card>
  );
}

function DeltaChip({ value }) {
  if (value === null || !Number.isFinite(value)) return null;
  const flat = Math.round(value) === 0;
  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold tabular-nums",
        flat && "bg-muted text-muted-foreground",
        !flat && up && "bg-success/10 text-success",
        !flat && !up && "bg-destructive/10 text-destructive",
      )}
    >
      {flat ? null : <Icon className="size-3.5" aria-hidden="true" />}
      {flat ? "0" : formatBDTWhole(Math.abs(value))}
    </span>
  );
}

function ChartTooltip({ active, payload }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const lines = [
    ["Income", row.income, "var(--chart-1)"],
    ["Expense", row.expense, "var(--chart-4)"],
    ["Net", row.net, null],
    ...(row.balance === null ? [] : [["Balance", row.balance, null]]),
  ];
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-panel">
      <p className="mb-1 font-semibold">Week of {row.label}</p>
      {lines.map(([name, v, color]) => (
        <p key={name} className="flex items-center justify-between gap-4 tabular-nums">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {color ? (
              <span className="size-2 rounded-full" style={{ background: color }} />
            ) : null}
            {name}
          </span>
          <span className={cn("font-medium", v < 0 && "text-destructive")}>{formatBDT(v)}</span>
        </p>
      ))}
    </div>
  );
}

const AXIS_TICK = { fontSize: 12, fill: "var(--muted-foreground)" };

function TrendCard({ rows, insight }) {
  const [view, setView] = useState("cashflow");
  const hasActuals = rows.some((r) => r.actualExpense !== null);
  const minBalance = Math.min(...rows.map((r) => r.balance ?? 0));

  return (
    <Card className="shadow-panel [--card-spacing:--spacing(5)]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-(--card-spacing)">
        <div>
          <h2 className="text-lg">Cash flow projection</h2>
          <p className="text-sm italic text-muted-foreground">
            {view === "cashflow"
              ? "Shaded band shows the weekly gap between income and spending"
              : "Predicted wallet balance at the end of each week"}
          </p>
        </div>
        <div
          role="group"
          aria-label="Chart view"
          className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-semibold"
        >
          {[
            ["cashflow", "Cash flow"],
            ["balance", "Balance"],
          ].map(([id, text]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={cn(
                "rounded-md px-3 py-1.5 transition-colors",
                view === id
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <div className="px-(--card-spacing)">
        <div
          className="h-60 w-full"
          role="img"
          aria-label={`Weekly forecast: ${rows
            .map((r) => `${r.label} income ${formatBDT(r.income)}, expense ${formatBDT(r.expense)}`)
            .join("; ")}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="fcBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="fcBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS_TICK} />
              <YAxis
                width={56}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatBDTCompact}
                tick={AXIS_TICK}
                domain={
                  view === "cashflow"
                    ? [0, (max) => Math.ceil(max * 1.1)]
                    : ["auto", "auto"]
                }
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border)" }} />

              {view === "cashflow" ? (
                <>
                  <Area
                    dataKey="band"
                    type="monotone"
                    stroke="none"
                    fill="url(#fcBand)"
                    activeDot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="income"
                    name="Income"
                    type="monotone"
                    stroke="var(--chart-1)"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--card)", strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    dataKey="expense"
                    name="Expense"
                    type="monotone"
                    stroke="var(--chart-4)"
                    strokeWidth={2.5}
                    strokeDasharray="6 5"
                    dot={{ r: 4, fill: "var(--chart-2)", stroke: "var(--card)", strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                  {hasActuals ? (
                    <Line
                      dataKey="actualExpense"
                      name="Actual expense"
                      stroke="none"
                      dot={{ r: 3.5, fill: "var(--foreground)" }}
                      activeDot={false}
                      isAnimationActive={false}
                    />
                  ) : null}
                </>
              ) : (
                <>
                  {minBalance < 0 ? (
                    <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="4 4" />
                  ) : null}
                  <Area
                    dataKey="balance"
                    name="Balance"
                    type="monotone"
                    stroke="var(--chart-1)"
                    strokeWidth={2.5}
                    fill="url(#fcBalance)"
                    dot={{ r: 4, fill: "var(--chart-2)", stroke: "var(--card)", strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weekly strip: net + risk per week, replaces a separate table/risk chart. */}
      <div
        className="grid gap-2 px-(--card-spacing)"
        style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}
      >
        {rows.map((r) => (
          <div key={r.key} data-testid="forecast-week" className="min-w-0 rounded-lg bg-muted/60 px-2.5 py-2">
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-xs text-muted-foreground">{r.label}</span>
              <span
                className={cn("size-2 shrink-0 rounded-full", RISK_BG[r.risk])}
                title={`${RISK_LABEL[r.risk]} risk`}
              />
              <span className="sr-only">{RISK_LABEL[r.risk]} risk</span>
            </div>
            <p
              className={cn(
                "truncate text-sm font-semibold tabular-nums",
                r.net < 0 && "text-destructive",
              )}
            >
              {r.net > 0 ? "+" : ""}
              {formatBDTWhole(r.net)}
            </p>
          </div>
        ))}
      </div>

      <div className="px-(--card-spacing)">
        <div className="flex items-start gap-3 rounded-xl bg-secondary px-4 py-3 text-sm leading-relaxed">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p>{insight}</p>
        </div>
      </div>
    </Card>
  );
}

function OutlookCard({ rows, snapshot }) {
  const overall = worstRisk(rows);
  const fallback = snapshot.modelUsed === "historical_average_fallback";
  return (
    <Card className="shadow-panel [--card-spacing:--spacing(5)]">
      <div className="flex items-center justify-between px-(--card-spacing)">
        <h2 className="text-lg">Risk outlook</h2>
        {fallback ? (
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
            {modelLabel(snapshot.modelUsed)}
          </span>
        ) : null}
      </div>
      <div className="px-(--card-spacing)">
        <p className={cn("font-heading text-3xl font-extrabold", RISK_TEXT[overall])}>
          {RISK_LABEL[overall]}
        </p>
        <div
          className="mt-3 flex gap-1.5"
          role="img"
          aria-label={`Weekly risk: ${rows.map((r) => `${r.label} ${r.risk}`).join(", ")}`}
        >
          {rows.map((r) => (
            <span
              key={r.key}
              title={`${r.label}: ${RISK_LABEL[r.risk]} risk`}
              className={cn("h-2 flex-1 rounded-full", RISK_BG[r.risk])}
            />
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {fallback
            ? "Not enough history for a trend yet, so this is a historical average. Add more transactions to sharpen it."
            : `Trend fitted to your weekly income and spending, projected ${snapshot.horizonWeeks} weeks ahead.`}
        </p>
      </div>
    </Card>
  );
}

function GoalCard({ goalsQuery, avgNet }) {
  const goals = (goalsQuery.data?.goals ?? [])
    .filter((g) => g.status === "active" && g.targetAmount > 0)
    .sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));
  const goal = goals[0];
  const pct = goal
    ? Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100))
    : 0;

  return (
    <Card className="shadow-panel [--card-spacing:--spacing(5)]">
      <div className="flex items-center justify-between px-(--card-spacing)">
        <h2 className="text-lg">Savings goal</h2>
        {goal ? (
          <span className="max-w-[55%] truncate text-xs text-muted-foreground">
            {goal.title}
            {goals.length > 1 ? ` +${goals.length - 1}` : ""}
          </span>
        ) : null}
      </div>
      {goalsQuery.isPending ? (
        <div className="px-(--card-spacing)">
          <Skeleton className="h-24 rounded-xl bg-muted" />
        </div>
      ) : goal ? (
        <div className="flex items-center gap-4 px-(--card-spacing)">
          <div className="relative size-24 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                data={[{ v: pct }]}
                innerRadius="74%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} angleAxisId={0} />
                <RadialBar
                  dataKey="v"
                  angleAxisId={0}
                  cornerRadius={10}
                  fill="var(--primary)"
                  background={{ fill: "var(--muted)" }}
                  isAnimationActive={false}
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <span className="absolute inset-0 grid place-items-center font-heading text-lg font-extrabold tabular-nums">
              {pct}%
            </span>
          </div>
          <div className="min-w-0 text-sm text-muted-foreground">
            <p className="mb-1 font-medium text-foreground tabular-nums">
              {formatBDTWhole(goal.savedAmount)} of {formatBDTWhole(goal.targetAmount)}
            </p>
            {goalPace(goal, avgNet)}
          </div>
        </div>
      ) : (
        <div className="px-(--card-spacing) text-sm text-muted-foreground">
          {goalsQuery.isError ? "Could not load your goals." : "No active goal yet."}{" "}
          <Link to="/goals" className="font-semibold text-primary hover:underline">
            Set a goal
          </Link>
        </div>
      )}
    </Card>
  );
}

function ForecastSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading forecast">
      <Skeleton className="h-14 w-72 rounded-xl bg-muted" />
      <div className="grid gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Skeleton className="h-120 rounded-xl bg-muted" />
        <Skeleton className="h-120 rounded-xl bg-muted" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Forecast() {
  const queryClient = useQueryClient();
  const forecasts = useForecasts(); // GET /api/forecasts, newest first
  const goalsQuery = useGoals();
  const generate = useGenerateInsights(); // POST /api/ai/analyze -> saves a new ForecastSnapshot
  const [now] = useState(() => Date.now());

  const list = forecasts.data?.forecasts;
  const snapshot = list?.[0] ?? null;
  const previous = list?.[1] ?? null;

  const view = useMemo(() => {
    if (!snapshot) return null;
    const rows = toRows(snapshot.weeks);
    if (!rows.length) return null;
    const income = sum(rows, "income");
    const expense = sum(rows, "expense");
    const prevRows = previous ? toRows(previous.weeks) : [];
    const prevNet = prevRows.length ? sum(prevRows, "income") - sum(prevRows, "expense") : null;
    return {
      rows,
      income,
      expense,
      net: income - expense,
      delta: prevNet === null ? null : income - expense - prevNet,
      avgNet: (income - expense) / rows.length,
      insight: buildInsight(rows, expense),
    };
  }, [snapshot, previous]);

  const refresh = () =>
    generate.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["forecasts"] }),
    });
  const generateError = generate.error
    ? toApiError(generate.error, "Could not generate a forecast.")
    : null;

  if (forecasts.isPending) return <ForecastSkeleton />;

  if (forecasts.isError) {
    const err = toApiError(forecasts.error, "We could not load your forecast. Please try again.");
    return (
      <div className="mx-auto max-w-md rounded-xl bg-card p-8 text-center shadow-panel ring-1 ring-foreground/10">
        <h2 className="text-lg">Forecast unavailable</h2>
        <p className="mt-1 text-sm text-muted-foreground" role="alert">
          {err.message}
        </p>
        <Button className="mt-4" onClick={() => forecasts.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const n = view?.rows.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">Forecast</h1>
          <p className="text-muted-foreground">
            {view ? `What your patterns suggest for the next ${n} weeks.` : "Your spending forecast will appear here."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {snapshot ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent-foreground">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Updated {updatedLabel(snapshot.generatedAt, now)}
            </span>
          ) : null}
          <Button
            onClick={refresh}
            disabled={generate.isPending}
            className="h-9 min-w-40 rounded-xl bg-[#064581] px-4 text-white transition-colors hover:bg-[#0755a4]"
          >
            <RefreshCw className={generate.isPending ? "animate-spin" : ""} aria-hidden="true" />
            {generate.isPending ? "Refreshing\u2026" : view ? "Refresh forecast" : "Generate forecast"}
          </Button>
        </div>
      </div>

      {generateError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not generate a forecast</AlertTitle>
          <AlertDescription>
            {generateError.status === 400
              ? "Add at least one transaction before generating a forecast."
              : generateError.message}
          </AlertDescription>
        </Alert>
      ) : null}

      {!view ? (
        <Card className="shadow-panel">
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <Sparkles className="size-6 text-primary" aria-hidden="true" />
            <p className="font-medium">No forecast yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Generate your first forecast. It reads your transactions and projects income, spending
              and risk for the coming weeks.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <section aria-label="Forecast totals" className="grid gap-6 md:grid-cols-3">
            <StatTile
              label="Predicted expenses"
              icon={TrendingDown}
              value={formatBDTWhole(view.expense)}
              sub={`Next ${n} weeks`}
            />
            <StatTile
              label="Predicted income"
              icon={TrendingUp}
              value={formatBDTWhole(view.income)}
              sub={`About ${formatBDTWhole(view.income / n)} per week`}
            />
            <StatTile
              highlight
              label="Expected savings"
              icon={PiggyBank}
              value={formatBDTWhole(view.net)}
              negative={view.net < 0}
              chip={<DeltaChip value={view.delta} />}
              sub={view.delta === null ? "Income minus expenses" : "vs previous forecast"}
            />
          </section>

          <div className="grid items-start gap-6 xl:grid-cols-[1fr_340px]">
            <TrendCard rows={view.rows} insight={view.insight} />
            <div className="space-y-6">
              <OutlookCard rows={view.rows} snapshot={snapshot} />
              <GoalCard goalsQuery={goalsQuery} avgNet={view.avgNet} />
            </div>
          </div>

          <EvaluationSection
            evaluation={snapshot.evaluation ?? null}
            patternSignals={snapshot.patternSignals ?? null}
          />
        </>
      )}
    </div>
  );
}