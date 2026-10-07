import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const fmt = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString("en-BD") : "—");

function MetricTable({ evaluation }) {
  const lr = evaluation.linearRegression;
  const ha = evaluation.historicalAverageBaseline;
  if (!lr || !ha) return null;
  const rows = [
    ["Income", lr.income, ha.income],
    ["Expense", lr.expense, ha.expense],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Series</th>
            <th className="py-1 pr-2 text-right font-medium">Trend MAE</th>
            <th className="py-1 pr-2 text-right font-medium">Average MAE</th>
            <th className="py-1 pr-2 text-right font-medium">Trend RMSE</th>
            <th className="py-1 text-right font-medium">Average RMSE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, a, b]) => (
            <tr key={label} className="border-t">
              <td className="py-1 pr-2 font-medium">{label}</td>
              <td className="py-1 pr-2 text-right">{fmt(a.mae)}</td>
              <td className="py-1 pr-2 text-right">{fmt(b.mae)}</td>
              <td className="py-1 pr-2 text-right">{fmt(a.rmse)}</td>
              <td className="py-1 text-right">{fmt(b.rmse)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-muted-foreground">
        Symmetric error (sMAPE): income {fmt(lr.income.smape)}% vs {fmt(ha.income.smape)}%;
        expense {fmt(lr.expense.smape)}% vs {fmt(ha.expense.smape)}%. Lower is closer.
      </p>
    </div>
  );
}

export function EvaluationSection({ evaluation, patternSignals, confidence, segment, humanReview }) {
  if (!evaluation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evaluation &amp; reliability</CardTitle>
          <CardDescription>
            No reliability check is stored with this forecast yet. Generate a fresh
            forecast to run the latest model-vs-average test.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const eligible = evaluation.eligible === true;
  const winner = evaluation.winner;
  const salary = patternSignals?.salaryPatternDetected === true;
  const festApplied = patternSignals?.festivalAdjustmentApplied === true;
  const confLevel = confidence?.level;
  const confReasons = Array.isArray(confidence?.reasons) ? confidence.reasons : [];
  const fallback = confidence?.fallback === true;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Evaluation &amp; reliability</CardTitle>
        <CardDescription>
          {eligible
            ? `Checked on your last ${evaluation.finalHoldoutWeeks} weeks: trained only on earlier weeks, tested on ${evaluation.testStart} to ${evaluation.testEnd}.`
            : "Not enough history yet for a fair test — showing why, not guessing."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {!eligible ? (
          <p className="text-muted-foreground">
            {evaluation.reason ??
              "This forecast needs at least 8 weeks of history (4 to learn from, 4 to test against)."}
          </p>
        ) : (
          <>
            <MetricTable evaluation={evaluation} />
            <p>
              {winner === "linear_regression" ? (
                <>
                  <strong>Trend model was closer</strong> on the test weeks — the
                  forecast above uses the trend line.
                </>
              ) : (
                <>
                  <strong>Simple average was as close or closer</strong> on the test
                  weeks — ties go to the simpler model. Treat the forecast as a rough
                  estimate.
                </>
              )}
            </p>
          </>
        )}

        <ul className="flex flex-col gap-1 text-muted-foreground">
          <li>
            {salary
              ? `Payday pattern: around day ${patternSignals.estimatedPaydayDayOfMonth} of the month (${patternSignals.salaryEvidenceCount} matching salary receipts).`
              : "Payday pattern: none clear yet — needs 3+ similar salary receipts across 2+ months."}
          </li>
          <li>
            {festApplied
              ? `Festival uplift applied from your own past festival weeks (${patternSignals.festivalEvidenceWeeks} weeks of evidence).`
              : `Festival uplift: off. ${patternSignals?.festivalReason ?? "Not enough prior festival history for this account."}`}
          </li>
          {confLevel ? (
            <li>
              Confidence: <strong className="text-foreground">{confLevel}</strong>
              {fallback ? " — historical-average fallback shown, treat as a rough estimate." : ""}
              {confReasons.length ? ` (${confReasons[0]})` : ""}
            </li>
          ) : null}
          {segment?.history_length ? (
            <li>
              Your usage pattern: {segment.history_length}, {segment.income_regularity} income,{" "}
              {segment.spending_pattern} spending, {segment.transaction_density} activity.
              Segment checks measure consistency across usage patterns, not people.
            </li>
          ) : null}
          {humanReview?.action ? (
            <li>
              {humanReview.label ?? "Review manually"}
              {confidence?.fallbackReason ? ` — ${confidence.fallbackReason}` : ""}
              {humanReview.note ? ` ${humanReview.note}` : ""}
            </li>
          ) : null}
        </ul>

        <details className="rounded-lg bg-muted/60 px-3 py-2">
          <summary className="cursor-pointer font-medium">How this was checked</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
            <li>Weeks are never shuffled: the model learns only from weeks strictly before the test weeks.</li>
            <li>Expanding time window — the latest 4 weeks are the untouched final test; earlier cutoffs are validation only.</li>
            <li>Same test weeks for both models: trend line vs plain historical average.</li>
            <li>MAE = average miss in BDT; RMSE punishes big misses; sMAPE is a zero-safe symmetric percentage (0/0 weeks count as perfect).</li>
            <li>Salary and festival signals come only from your own history (Asia/Dhaka dates); adjustments need repeated evidence or stay off.</li>
            <li>Unusual spending weighs your category norm, merchant familiarity and recent pace — not amount alone.</li>
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}
