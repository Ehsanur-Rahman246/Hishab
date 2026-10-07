import { ShieldCheck, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useShortfallOutcome } from "@/hooks/useShortfall";
import { formatBDTWhole } from "@/lib/format";
import { cn } from "@/lib/utils";

const RISK_TEXT = { low: "text-success", medium: "text-warning", high: "text-destructive" };
const RISK_LABEL = { low: "Low", medium: "Medium", high: "High" };

/**
 * "Your shortfall prevention progress" — primary-outcome card.
 * Shows: historical baseline shortfall rate, current forecasted risk,
 * one prioritized next step, action/feedback status, confidence +
 * insufficient-history states. Plain language, no ML jargon.
 */
export function ShortfallProgressCard({ compact = false }) {
  const { data, isPending, isError, refetch } = useShortfallOutcome();

  if (isPending) return <Skeleton className="h-44 rounded-xl bg-muted" aria-label="Loading shortfall progress" />;
  if (isError || !data?.success) {
    return (
      <Card className="shadow-panel">
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-sm text-muted-foreground">Shortfall progress unavailable right now.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
        </div>
      </Card>
    );
  }

  const b = data.baseline;
  const c = data.currentPeriod;
  const iv = data.intervention;
  const insufficient = data.outcomeStatus === "insufficient_history";
  const pct = Math.round((b.shortfallRate || 0) * 100);

  return (
    <Card className="shadow-panel ring-2 ring-primary/20" aria-label="Your shortfall prevention progress">
      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-extrabold">Your shortfall prevention progress</h2>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
            Completed months where recorded expenses exceed recorded income
          </span>
        </div>

        {insufficient ? (
          <div className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p>
              Not enough history yet — found {b.observedMonths} completed month(s), need {b.dataQuality?.minRequiredMonths ?? 3}.
              The current partial month never counts. Add more months of transactions to unlock your baseline.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted/60 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Past shortfall rate</p>
              <p className="font-heading text-2xl font-extrabold tabular-nums">
                {pct}% <span className="text-sm font-medium text-muted-foreground">({b.shortfallMonths}/{b.observedMonths} months)</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Avg gap {formatBDTWhole(b.averageDeficitBDT)} in shortfall months
              </p>
            </div>
            <div className="rounded-xl bg-muted/60 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Next 4 weeks risk</p>
              <p className={cn("font-heading text-2xl font-extrabold", RISK_TEXT[c.forecastedShortfallRisk] ?? "")}>
                {RISK_LABEL[c.forecastedShortfallRisk] ?? c.forecastedShortfallRisk}
              </p>
              <p className="text-xs text-muted-foreground">
                Projected gap {formatBDTWhole(c.projectedDeficitBDT)} · confidence {c.confidence}
              </p>
            </div>
            <div className="rounded-xl bg-muted/60 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Your plan</p>
              <p className="text-sm font-semibold">
                {iv.actionCompleted ? "Action completed — nice work" : iv.planAccepted ? "Plan accepted — mark it done when finished" : iv.planShown ? "Plan shown — accept or dismiss it" : "See your one-step plan below"}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.outcomeStatus === "tracking" ? "Tracking future completed months" : data.outcomeStatus === "baseline_only" ? "Baseline only — accept a plan to start tracking" : "Waiting for enough history"}
              </p>
            </div>
          </div>
        )}

        {!compact && b.topContributingCategories?.length > 0 && !insufficient ? (
          <p className="text-xs text-muted-foreground">
            Top driver{b.topContributingCategories.length > 1 ? "s" : ""} in shortfall months:{" "}
            {b.topContributingCategories.map((t) => `${t.category} (${formatBDTWhole(t.totalBDT)})`).join(" · ")}
          </p>
        ) : null}

        {data.prePost ? (
          <p className="text-xs text-muted-foreground">
            Before plan: {Math.round(data.prePost.pre.shortfallRate * 100)}% over {data.prePost.pre.observedMonths} month(s) ·
            After plan: {Math.round(data.prePost.post.shortfallRate * 100)}% over {data.prePost.post.observedMonths} month(s).
            Observational only — not proof the plan caused the change.
          </p>
        ) : null}

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Flow: Forecast → risk detected → explanation → one action → your feedback → observed future outcome.
        </p>
      </div>
    </Card>
  );
}
