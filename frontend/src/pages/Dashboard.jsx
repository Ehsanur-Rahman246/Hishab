import { PiggyBank, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/StatCard";
import { AiInsightsPanel } from "@/components/dashboard/AiInsightsPanel";
import { ShortfallProgressCard } from "@/components/shortfall/ShortfallProgressCard";
import { SpendingTrendCard } from "@/components/dashboard/SpendingTrendCard";
import { CategoryBreakdownCard } from "@/components/dashboard/CategoryBreakdownCard";
import { useDashboardData } from "@/hooks/useDashboard";
import { formatBDTWhole } from "@/lib/format";

function DashboardSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading dashboard">
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-44 rounded-xl bg-muted" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-2xl bg-muted" />
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Skeleton className="h-96 rounded-xl bg-muted" />
        <Skeleton className="h-96 rounded-xl bg-muted" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, error, refetch } = useDashboardData();

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data) {
    const message =
      error?.response?.data?.message || "We could not load your dashboard. Please try again.";
    return (
      <div className="mx-auto max-w-md rounded-xl bg-card p-8 text-center shadow-panel ring-1 ring-foreground/10">
        <h2 className="text-lg">Dashboard unavailable</h2>
        <p className="mt-1 text-sm text-muted-foreground" role="alert">
          {message}
        </p>
        <Button className="mt-4" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const { cards, trend, hasSpending, categories, insights, monthLabel } = data;
  const rate = cards.rate.value;

  return (
    <div className="space-y-8">
      {/* Primary outcome first: shortfall prevention progress. */}
      <ShortfallProgressCard />

      <section aria-label="Key figures" className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Balance"
          icon={Wallet}
          value={formatBDTWhole(cards.balance.value)}
          delta={cards.balance.delta}
          spark={cards.balance.spark}
        />
        <StatCard
          label="Monthly Income"
          icon={TrendingUp}
          value={formatBDTWhole(cards.income.value)}
          delta={cards.income.delta}
          spark={cards.income.spark}
        />
        <StatCard
          label="Monthly Expenses"
          icon={TrendingDown}
          value={formatBDTWhole(cards.spent.value)}
          delta={cards.spent.delta}
          spark={cards.spent.spark}
        />
        <StatCard
          highlight
          label="Savings Rate"
          icon={PiggyBank}
          value={rate === null ? "\u2014" : `${Math.round(rate)}%`}
          delta={cards.rate.delta}
          spark={cards.rate.spark}
        />
      </section>

      <AiInsightsPanel
        insights={insights}
        subtitle={`Generated from your ${monthLabel} transactions`}
      />

      <section aria-label="Spending" className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <SpendingTrendCard trend={trend} hasSpending={hasSpending} />
        <CategoryBreakdownCard
          items={categories.items}
          total={categories.total}
          monthLabel={categories.monthLabel}
        />
      </section>
    </div>
  );
}
