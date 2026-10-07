import { useEffect, useState } from "react";
import { ShieldCheck, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useShortfallPlan, useShortfallEvent, useShortfallFeedback } from "@/hooks/useShortfall";
import { cn } from "@/lib/utils";

const LANGS = [
  { id: "auto", label: "Auto" },
  { id: "bn", label: "বাংলা" },
  { id: "en", label: "English" },
];

const HELPFUL_OPTIONS = [
  { id: "forecast", label: "Forecast" },
  { id: "expense_explanation", label: "Expense explanation" },
  { id: "language_wording", label: "Bangla/Banglish wording" },
  { id: "suggested_action", label: "Suggested action" },
  { id: "none", label: "None" },
];

/**
 * Shortfall Prevention Plan — the ONE core intervention.
 * Order: risk → verified driver → ONE concrete action → useful/not/completed.
 * Cautious "Review your spending manually" when low-confidence/insufficient.
 * Advisory only: never moves money (stated in UI + enforced server-side).
 */
export function ShortfallPlanCard({ defaultLanguage = "auto" }) {
  const [language, setLanguage] = useState(defaultLanguage);
  const planQuery = useShortfallPlan(language);
  const eventMut = useShortfallEvent();
  const feedbackMut = useShortfallFeedback();

  const [phase, setPhase] = useState("plan"); // plan | feedback | done
  const [helpful, setHelpful] = useState("");
  const [freeText, setFreeText] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState(null); // accepted | dismissed | completed | voted
  const [error, setError] = useState(null);

  const plan = planQuery.data?.plan ?? null;
  const risk = planQuery.data?.risk ?? plan?.risk ?? "low";

  // Log "plan shown" once per plan load (privacy-safe count only).
  useEffect(() => {
    if (plan?.shown && planQuery.data?.success) {
      eventMut.mutate(
        { kind: "plan_shown", language, actionRecommended: plan?.action?.title ?? null },
        { onError: () => {} },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planQuery.data?.plan?.headline, language]);

  const act = async (kind) => {
    setError(null);
    try {
      await eventMut.mutateAsync({
        kind,
        language,
        actionRecommended: plan?.action?.title ?? null,
      });
      if (kind === "plan_accepted") setStatus("accepted");
      if (kind === "plan_dismissed") setStatus("dismissed");
      if (kind === "action_completed") setPhase("done");
      if (kind === "plan_accepted" || kind === "action_completed") setPhase("feedback");
    } catch (e) {
      setError(e?.response?.data?.message || "Could not save. Please try again.");
    }
  };

  const submitFeedback = async (useful) => {
    setError(null);
    if (!consent) {
      setError("Please tick the consent box before sending feedback (required).");
      return;
    }
    try {
      await feedbackMut.mutateAsync({
        consent: true,
        useful,
        featureHelpful: helpful || "none",
        language,
        feedbackText: freeText || null,
      });
      setStatus(useful ? "useful" : "not_useful");
      setPhase("done");
    } catch (e) {
      setError(e?.response?.data?.message || "Could not save feedback. Please try again.");
    }
  };

  if (planQuery.isPending) return <Skeleton className="h-64 rounded-xl bg-muted" aria-label="Loading prevention plan" />;
  if (planQuery.isError || !plan) {
    return (
      <Card className="shadow-panel">
        <div className="px-5 py-4 text-sm text-muted-foreground">
          Could not load your prevention plan.{" "}
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => planQuery.refetch()}>
            Try again
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="shadow-panel ring-2 ring-accent" aria-label="Shortfall prevention plan">
      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent-foreground">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Shortfall Prevention Plan · {risk} risk
          </p>
          <div role="group" aria-label="Plan language" className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-semibold">
            {LANGS.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={language === l.id}
                onClick={() => setLanguage(l.id)}
                className={cn(
                  "rounded-md px-3 py-1.5",
                  language === l.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-heading text-xl font-extrabold">{plan.headline}</h3>
          <p className="mt-1 text-[15px] leading-relaxed">{plan.explanation}</p>
          {plan.driver ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Top driver from your own transactions: {plan.driver.category}
              {plan.driver.totalBDT ? ` (${plan.driver.totalBDT} BDT in past shortfall months)` : ""}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl bg-secondary/70 p-4 ring-1 ring-primary/10">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Your one next step</p>
          <p className="mt-1 font-semibold">{plan.action?.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{plan.action?.detail}</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Advice only — this plan never moves money. Savings transfers stay separately confirmed by you.
          </p>
        </div>

        {phase === "plan" ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => act("plan_accepted")} disabled={eventMut.isPending} className="rounded-xl">
              Accept plan
            </Button>
            <Button variant="outline" onClick={() => act("plan_dismissed")} disabled={eventMut.isPending} className="rounded-xl">
              Dismiss
            </Button>
            <Button variant="secondary" onClick={() => act("action_completed")} disabled={eventMut.isPending} className="rounded-xl">
              Mark completed
            </Button>
          </div>
        ) : null}

        {phase === "feedback" ? (
          <div className="space-y-3 rounded-xl border p-4">
            <p className="font-semibold">Was this useful?</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => submitFeedback(true)} disabled={feedbackMut.isPending} className="rounded-xl">
                Useful
              </Button>
              <Button variant="outline" onClick={() => submitFeedback(false)} disabled={feedbackMut.isPending} className="rounded-xl">
                Not useful
              </Button>
              <Button variant="ghost" onClick={() => setPhase("done")} className="rounded-xl">
                Skip
              </Button>
            </div>
            <div>
              <p className="text-sm font-medium">Which part helped most?</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {HELPFUL_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={helpful === o.id}
                    onClick={() => setHelpful(o.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-semibold",
                      helpful === o.id ? "border-primary bg-secondary text-primary" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Optional: tell us in your own words (Bangla/English/Banglish all fine)"
              aria-label="Optional feedback"
              className="w-full rounded-xl border bg-card p-2.5 text-sm outline-none focus:border-primary"
            />
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
              <span>
                I agree my anonymised feedback (useful/not-useful + chosen option) may be used for product research.
                No raw transactions are shared. Required before sending.
              </span>
            </label>
          </div>
        ) : null}

        {phase === "done" ? (
          <p className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success" role="status">
            Thanks — your response was recorded. Future completed months will show whether shortfalls become rarer
            (observational tracking, not proof of cause).
          </p>
        ) : null}

        {status === "dismissed" ? (
          <p className="text-xs text-muted-foreground" role="status">Plan dismissed. You can accept it later — no money moved.</p>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive" role="alert">{error}</p>
        ) : null}
      </div>
    </Card>
  );
}
