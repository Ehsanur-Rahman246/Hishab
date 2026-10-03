import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleAlert,
  PiggyBank,
  ReceiptText,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/StatCard";
import { useSummaries, useGenerateSummary } from "@/hooks/useSummaries";
import { useTransactions } from "@/hooks/useTransactions";
import { CATEGORIES, monthKey, recentMonths } from "@/lib/dashboard";
import { formatBDT, formatBDTCompact, formatBDTWhole, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Data: Summary (period buckets, Dhaka time) + Transaction (largest expenses)
// ---------------------------------------------------------------------------

const OFFSET = 6 * 3600e3; // backend buckets in Dhaka time (UTC+6)
const DAY = 864e5;
const pad = (n) => String(n).padStart(2, "0");

const PERIODS = {
  monthly: { label: "Monthly", unit: "month", counts: [3, 6, 12] },
  weekly: { label: "Weekly", unit: "week", counts: [4, 8, 12] },
};

const COLORS = ["#064581", "#0755a4", "#ffd21f", "#5b9bd5", "#35b8c8", "#f39b76", "#b9cde3"];
const TIP = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: 13,
};
const AXIS = { fontSize: 12, fill: "var(--muted-foreground)" };

// Weekly buckets start Monday (same rule as summaryControllers.getPeriodDates).
const dayKey = (v) => {
  const d = new Date(new Date(v).getTime() + OFFSET);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

function recentWeeks(count, now = new Date()) {
  const l = new Date(now.getTime() + OFFSET);
  const dow = l.getUTCDay();
  const monday = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(monday - (count - 1 - i) * 7 * DAY);
    const label = start.toLocaleDateString("en-US", { timeZone: "UTC", day: "numeric", month: "short" });
    return {
      key: dayKey(start.getTime() - OFFSET),
      label,
      longLabel: `Week of ${label}`,
      // Wednesday noon (Dhaka), safely inside the week, sent to /generate
      date: new Date(+start + 2 * DAY + 12 * 3600e3 - OFFSET).toISOString(),
    };
  });
}

// "2026-10" or "2026-10-05" -> ISO instant of that Dhaka-midnight
const startOf = (key) => {
  const [y, m, d = 1] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - OFFSET).toISOString();
};

const pct = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

function buildAnalytics(periods, summaries, keyOf) {
  const byKey = new Map(summaries.map((s) => [keyOf(s.startDate), s]));
  const series = periods.map((p) => {
    const s = byKey.get(p.key);
    const income = s?.income || 0;
    const totalExpense = s?.totalExpense || 0;
    const moved = s?.expenses?.savings || 0; // moved aside, not spent
    const spent = Math.max(0, totalExpense - moved);
    const saved = income - spent;
    return {
      ...p,
      active: income > 0 || totalExpense > 0,
      income, spent, moved, saved,
      rate: income > 0 ? (saved / income) * 100 : null,
      expenses: s?.expenses ?? {},
    };
  });

  const cur = series[series.length - 1];
  const prev = series[series.length - 2];
  const sum = (k) => series.reduce((t, s) => t + s[k], 0);
  const income = sum("income");
  const spent = sum("spent");
  const saved = income - spent;
  const rate = income > 0 ? (saved / income) * 100 : null;

  const first = Math.max(0, series.findIndex((s) => s.active));
  const spark = (fn) => {
    const v = series.slice(first).map(fn);
    return v.length >= 2 ? v : null;
  };

  const rows = CATEGORIES.map((c) => ({
    name: c.label,
    value: series.reduce((t, s) => t + (s.expenses[c.key] || 0), 0),
    cur: cur.expenses[c.key] || 0,
    prev: prev?.expenses?.[c.key] || 0,
  }));
  const ranked = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const rest = ranked.slice(6).reduce((t, r) => t + r.value, 0);
  const categories = ranked.slice(0, 6);
  if (rest > 0) categories.push({ name: "Others", value: rest });

  const active = series.filter((s) => s.active);
  const best = [...active].sort((a, b) => b.saved - a.saved)[0];
  const peak = [...active].sort((a, b) => b.spent - a.spent)[0];
  const moves = rows
    .map((r) => ({ ...r, diff: r.cur - r.prev }))
    .filter((r) => r.diff !== 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 5);

  return {
    series, cur, prev, income, spent, saved, rate, categories, best, peak, moves,
    moved: sum("moved"),
    hasData: active.length > 0,
    hasPrev: Boolean(prev?.active),
    cards: {
      income: { delta: { value: pct(cur.income, prev?.income), unit: "%", goodWhen: "up" }, spark: spark((s) => s.income) },
      spent: { delta: { value: pct(cur.spent, prev?.spent), unit: "%", goodWhen: "down" }, spark: spark((s) => s.spent) },
      saved: { delta: { value: pct(cur.saved, prev?.saved), unit: "%", goodWhen: "up" }, spark: spark((s) => s.saved) },
      rate: {
        delta: {
          value: cur.rate !== null && prev?.rate != null ? cur.rate - prev.rate : null,
          unit: " pts",
          goodWhen: "up",
        },
        spark: spark((s) => s.rate ?? 0),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

function Segmented({ label, value, onChange, options }) {
  return (
    <div role="group" aria-label={label} className="inline-grid grid-flow-col gap-1 rounded-xl bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-10 rounded-lg px-4 text-sm font-semibold transition",
            value === o.value
              ? "bg-card text-[#064581] shadow-sm dark:text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Panel({ title, subtitle, aside, children }) {
  return (
    <Card className="shadow-panel [--card-spacing:--spacing(5)]">
      <div className="flex items-start justify-between gap-3 px-(--card-spacing)">
        <div>
          <h2 className="text-lg">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {aside}
      </div>
      <div className="px-(--card-spacing)">{children}</div>
    </Card>
  );
}

const Muted = ({ children }) => (
  <p className="grid min-h-40 place-items-center rounded-xl bg-muted/60 px-4 text-center text-sm text-muted-foreground">
    {children}
  </p>
);

function AnalyticsSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading analytics">
      <Skeleton className="h-40 rounded-2xl bg-muted" />
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-44 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Skeleton className="h-96 rounded-xl bg-muted" />
        <Skeleton className="h-96 rounded-xl bg-muted" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Analytics() {
  const [period, setPeriod] = useState("monthly");
  const [counts, setCounts] = useState({ monthly: 6, weekly: 8 });
  const [nonce, setNonce] = useState(0);
  const [synced, setSynced] = useState(null);
  const started = useRef(null);

  const cfg = PERIODS[period];
  const count = counts[period];
  const keyOf = period === "monthly" ? monthKey : dayKey;
  const periods = useMemo(() => (period === "monthly" ? recentMonths(count) : recentWeeks(count)), [period, count]);

  // GET /api/summaries?period=  (Summary model)
  const { data, isLoading, isSuccess, error, refetch } = useSummaries(period);
  // POST /api/summaries/generate  (upserts from Transaction model)
  const { mutateAsync: build } = useGenerateSummary();
  const summaries = useMemo(() => data?.summaries ?? [], [data]);

  // Summaries only exist after /generate is called: build missing periods and
  // always refresh the latest two so new transactions show up. The backend
  // upserts, so repeating this is safe.
  const token = `${period}:${count}:${nonce}`;
  useEffect(() => {
    if (!isSuccess || started.current === token) return;
    started.current = token;
    const have = new Set(summaries.map((s) => keyOf(s.startDate)));
    const todo = periods.filter((p, i) => !have.has(p.key) || i >= periods.length - 2);
    Promise.allSettled(todo.map((p) => build({ period, date: p.date }))).then(() => setSynced(token));
  }, [isSuccess, token, summaries, periods, keyOf, period, build]);
  const syncing = isSuccess && synced !== token;

  const a = useMemo(() => buildAnalytics(periods, summaries, keyOf), [periods, summaries, keyOf]);

  // GET /api/transactions (Transaction model) -> largest expenses in range
  const txs = useTransactions({ type: "expense", from: startOf(periods[0].key), limit: 200 });
  const top = useMemo(
    () =>
      (txs.data?.transactions ?? [])
        .filter((t) => t.category !== "Savings")
        .sort((x, y) => y.amount - x.amount)
        .slice(0, 5),
    [txs.data],
  );

  const rangeText = `${count} ${cfg.unit}s`;
  const refresh = () => {
    setNonce((n) => n + 1);
    refetch();
  };

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="font-heading text-3xl font-extrabold text-[#064581] sm:text-4xl dark:text-primary">
          Analytics
        </h2>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Where your money comes from and where it goes.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Period"
          value={period}
          onChange={setPeriod}
          options={Object.entries(PERIODS).map(([value, p]) => ({ value, label: p.label }))}
        />
        <Segmented
          label="Range"
          value={count}
          onChange={(n) => setCounts((c) => ({ ...c, [period]: n }))}
          options={cfg.counts.map((n) => ({ value: n, label: `${n}${period === "monthly" ? "M" : "W"}` }))}
        />
        <Button
          variant="outline"
          size="icon"
          className="size-12 rounded-xl"
          aria-label="Refresh analytics"
          onClick={refresh}
          disabled={syncing}
        >
          <RefreshCw className={cn(syncing && "animate-spin")} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );

  let body;
  if (isLoading || (syncing && summaries.length === 0)) {
    body = <AnalyticsSkeleton />;
  } else if (error) {
    body = (
      <div className="mx-auto max-w-md rounded-2xl bg-card p-8 text-center shadow-panel ring-1 ring-foreground/10">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <CircleAlert className="size-6" aria-hidden="true" />
        </span>
        <h3 className="mt-4 text-lg">Analytics unavailable</h3>
        <p role="alert" className="mt-1 text-sm text-muted-foreground">
          {error?.response?.data?.message || "We could not load your analytics. Please try again."}
        </p>
        <Button className="mt-5 h-10 rounded-xl px-5" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  } else if (!a.hasData) {
    body = (
      <div className="flex flex-col items-center rounded-2xl bg-card px-6 py-16 text-center shadow-panel ring-1 ring-foreground/10">
        <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
          <ReceiptText className="size-6" aria-hidden="true" />
        </span>
        <h3 className="mt-4 text-lg">Nothing to analyse yet</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          No income or expenses in the last {rangeText}. Add a transaction and your analytics will appear here.
        </p>
        <Link
          to="/transactions"
          className="mt-5 inline-flex h-10 items-center rounded-xl bg-[#064581] px-5 text-sm font-semibold text-white hover:bg-[#0755a4]"
        >
          Add transaction
        </Link>
      </div>
    );
  } else {
    const kept = a.rate !== null && a.saved >= 0;
    const topCat = a.categories.find((c) => c.name !== "Others") ?? a.categories[0];
    const facts = [
      { icon: PiggyBank, label: "Best saving " + cfg.unit, value: a.best?.longLabel, sub: a.best && formatBDTWhole(a.best.saved) },
      { icon: TrendingUp, label: "Highest spending", value: a.peak?.longLabel, sub: a.peak && formatBDTWhole(a.peak.spent) },
      {
        icon: Wallet,
        label: "Top category",
        value: topCat?.name ?? "\u2014",
        sub: topCat && a.spent > 0 ? `${Math.round((topCat.value / a.spent) * 100)}% of spending` : null,
      },
    ];
    const unitName = `last ${cfg.unit}`;

    body = (
      <>
        <section
          aria-label="Summary"
          className="relative overflow-hidden rounded-2xl bg-[#064581] p-6 text-white shadow-panel sm:p-8"
        >
          <span className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/5" aria-hidden="true" />
          <span className="pointer-events-none absolute -right-4 -bottom-20 size-44 rounded-full border-[18px] border-accent/25" aria-hidden="true" />
          <div className="relative grid gap-6 lg:grid-cols-[1.2fr_2fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-accent">
                <Sparkles className="size-3.5" aria-hidden="true" /> Last {rangeText}
              </span>
              <p className="mt-3 font-heading text-2xl leading-snug font-extrabold sm:text-[1.7rem]">
                {kept
                  ? `You kept ${Math.round(a.rate)}% of your income.`
                  : `You spent ${formatBDTWhole(Math.abs(a.saved))} more than you earned.`}
              </p>
              <p className="mt-1 text-sm text-white/70">
                {formatBDTWhole(a.income)} in, {formatBDTWhole(a.spent)} out
                {a.moved > 0 ? `, ${formatBDTWhole(a.moved)} moved to savings` : ""}.
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, a.rate ?? 0))}%` }} />
              </div>
            </div>
            <ul className="grid gap-3 sm:grid-cols-3">
              {facts.map(({ icon: Icon, label, value, sub }) => (
                <li key={label} className="rounded-xl bg-white/10 p-4 ring-1 ring-white/10">
                  <Icon className="size-[18px] text-accent" aria-hidden="true" />
                  <p className="mt-3 text-xs text-white/70">{label}</p>
                  <p className="mt-0.5 truncate font-semibold">{value}</p>
                  <p className="text-sm text-white/70 tabular-nums">{sub}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-label="Key figures" className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Income" icon={TrendingUp} value={formatBDTWhole(a.income)} {...a.cards.income} />
          <StatCard label="Total Spending" icon={TrendingDown} value={formatBDTWhole(a.spent)} {...a.cards.spent} />
          <StatCard label="Net Savings" icon={Wallet} value={formatBDTWhole(a.saved)} {...a.cards.saved} />
          <StatCard
            highlight
            label="Savings Rate"
            icon={PiggyBank}
            value={a.rate === null ? "\u2014" : `${Math.round(a.rate)}%`}
            {...a.cards.rate}
          />
        </section>

        <section aria-label="Cash flow and categories" className="grid gap-6 xl:grid-cols-[3fr_2fr]">
          <Panel
            title="Income vs spending"
            subtitle={`Each ${cfg.unit} over the last ${rangeText}`}
            aside={
              <ul className="flex shrink-0 flex-wrap justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {[["Income", "var(--primary)"], ["Spending", "var(--chart-2)"], ["Net saved", "var(--success)"]].map(([n, c]) => (
                  <li key={n} className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ background: c }} aria-hidden="true" />
                    {n}
                  </li>
                ))}
              </ul>
            }
          >
            <div
              className="h-72 w-full"
              role="img"
              aria-label={`Income, spending and net savings per ${cfg.unit}: ${a.series
                .map((s) => `${s.label} ${formatBDT(s.income)} in, ${formatBDT(s.spent)} out`)
                .join("; ")}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={a.series.map((s) => ({
                    label: s.label,
                    Income: s.income,
                    Spending: s.spent,
                    "Net saved": s.active ? s.saved : null,
                  }))}
                  margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
                  barGap={4}
                >
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS} />
                  <YAxis width={56} axisLine={false} tickLine={false} tickFormatter={formatBDTCompact} tick={AXIS} />
                  <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} formatter={(v, n) => [formatBDT(v), n]} contentStyle={TIP} />
                  <Bar dataKey="Income" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  <Bar dataKey="Spending" fill="var(--chart-2)" radius={[6, 6, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  <Bar dataKey="Net saved" fill="var(--success)" radius={[6, 6, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Spending by category" subtitle={`Last ${rangeText}, ${formatBDTWhole(a.spent)} total`}>
            {a.categories.length === 0 ? (
              <Muted>No spending recorded in this range.</Muted>
            ) : (
              <div className="space-y-5">
                <div
                  className="relative mx-auto size-44"
                  role="img"
                  aria-label={`Spending by category: ${a.categories.map((c) => `${c.name} ${formatBDT(c.value)}`).join(", ")}`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={a.categories}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="68%"
                        outerRadius="100%"
                        paddingAngle={2}
                        startAngle={90}
                        endAngle={-270}
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {a.categories.map((c, i) => (
                          <Cell key={c.name} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, n) => [formatBDT(v), n]} contentStyle={TIP} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="font-heading text-lg font-extrabold tabular-nums">{formatBDTWhole(a.spent)}</p>
                      <p className="text-xs text-muted-foreground">spent</p>
                    </div>
                  </div>
                </div>
                <ul className="space-y-3">
                  {a.categories.map((c, i) => {
                    const share = a.spent > 0 ? (c.value / a.spent) * 100 : 0;
                    return (
                      <li key={c.name} className="text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2.5">
                            <span className="size-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} aria-hidden="true" />
                            {c.name}
                          </span>
                          <span className="tabular-nums">
                            <span className="font-semibold">{formatBDTWhole(c.value)}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{Math.round(share)}%</span>
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <div className="h-full rounded-full" style={{ width: `${share}%`, background: COLORS[i % COLORS.length] }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Panel>
        </section>

        <section aria-label="Movers and largest expenses" className="grid gap-6 xl:grid-cols-2">
          <Panel
            title="Biggest changes"
            subtitle={a.hasPrev ? `${a.cur.label} compared with ${a.prev.label}` : `Needs an earlier ${cfg.unit} to compare`}
          >
            {!a.hasPrev || a.moves.length === 0 ? (
              <Muted>No category changes to show for the {unitName} yet.</Muted>
            ) : (
              <ul className="divide-y">
                {a.moves.map((m) => {
                  const up = m.diff > 0;
                  const Icon = up ? ArrowUpRight : ArrowDownRight;
                  const change = m.prev > 0 ? `${Math.abs(Math.round((m.diff / m.prev) * 100))}%` : "new";
                  return (
                    <li key={m.name} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold">{m.name}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatBDTWhole(m.prev)} to {formatBDTWhole(m.cur)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-xs font-semibold tabular-nums",
                          up ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success",
                        )}
                      >
                        <Icon className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">{up ? "Up" : "Down"}</span>
                        {formatBDTWhole(Math.abs(m.diff))} &middot; {change}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title="Largest expenses"
            subtitle={`Top spending in the last ${rangeText}`}
            aside={
              <Link to="/transactions" className="shrink-0 text-sm font-semibold text-primary hover:underline">
                All transactions
              </Link>
            }
          >
            {txs.isLoading ? (
              <Skeleton className="h-40 rounded-xl bg-muted" />
            ) : txs.error ? (
              <Muted>Could not load transactions.</Muted>
            ) : top.length === 0 ? (
              <Muted>No expenses in this range.</Muted>
            ) : (
              <>
                <ul className="divide-y">
                  {top.map((t, i) => (
                    <li key={t._id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-sm font-bold text-primary tabular-nums">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">{t.description || t.subcategory || t.category}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.category} &middot; {formatDate(t.date)}
                        </p>
                      </div>
                      <p className="shrink-0 text-[15px] font-semibold tabular-nums">
                        {"\u2212"}
                        {formatBDT(t.amount)}
                      </p>
                    </li>
                  ))}
                </ul>
                {txs.data?.pagination?.total > 200 ? (
                  <p className="mt-3 text-xs text-muted-foreground">Based on your 200 most recent expenses in this range.</p>
                ) : null}
              </>
            )}
          </Panel>
        </section>
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-8">
      {header}
      {body}
    </div>
  );
}