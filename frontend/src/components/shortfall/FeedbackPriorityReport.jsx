import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeedbackReport } from "@/hooks/useShortfall";

/**
 * Feedback-derived feature-priority report.
 * Never overstates small samples: shows "insufficient feedback" below minimum.
 */
export function FeedbackPriorityReport() {
  const { data, isPending } = useFeedbackReport();
  if (isPending) return <Skeleton className="h-32 rounded-xl bg-muted" aria-label="Loading feedback report" />;
  const report = data?.report ?? null;
  if (!report) return null;
  if (report.status === "insufficient_feedback") {
    return (
      <Card className="shadow-panel">
        <div className="px-5 py-4">
          <h3 className="font-semibold">What users find most useful</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Insufficient feedback to rank features yet ({report.totalFeedbackResponses} response(s)).
            User interviews pending — no qualitative claims are made yet.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card className="shadow-panel">
      <div className="space-y-2 px-5 py-4">
        <h3 className="font-semibold">What users find most useful</h3>
        <p className="text-sm text-muted-foreground">
          {report.totalFeedbackResponses} feedback response(s) · overall useful rate{" "}
          {Math.round((report.overallUsefulRate ?? 0) * 100)}%
          {report.mostUsefulFeature ? ` · top: ${report.mostUsefulFeature}` : ""}
        </p>
        <ul className="grid gap-1.5 text-sm">
          {Object.entries(report.usefulRateByFeature || {}).map(([f, r]) => (
            <li key={f} className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-1.5">
              <span>{f}</span>
              <span className="font-semibold tabular-nums">{Math.round(r * 100)}% useful</span>
            </li>
          ))}
        </ul>
        {Object.keys(report.languagePreference || {}).length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Language: {Object.entries(report.languagePreference).map(([l, n]) => `${l} (${n})`).join(" · ")}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
