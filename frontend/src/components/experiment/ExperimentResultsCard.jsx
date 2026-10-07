import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { getSyntheticResults } from "@/api/experimentApi";

// Static fallback mirrors the deterministic backend simulation
// (backend/scripts/run-synthetic-experiment.mjs). Live data is preferred
// when the backend is reachable; both carry the synthetic-only label.
const FALLBACK = {
  dateRange: "2026-01 to 2026-06 (completed months only; July 2026 partial month excluded)",
  arms: {
    control: { sampleCount: 3, avgSavingsAdherenceValue: null, shortfallEventRateValue: 0.5, goalCompletionRateValue: 0.333, completedContributionRate: 0, unsafeSuggestionRate: null },
    rule_based: { sampleCount: 3, avgSavingsAdherenceValue: 0.333, shortfallEventRateValue: 0.5, goalCompletionRateValue: 0.333, completedContributionRate: 0.333, unsafeSuggestionRate: 0.333 },
    hishab_combined: { sampleCount: 3, avgSavingsAdherenceValue: 1, shortfallEventRateValue: 0.5, goalCompletionRateValue: 0.333, completedContributionRate: 0.667, unsafeSuggestionRate: 0 },
  },
  overallStatus: "insufficient_evidence",
};

const fmt = (v) => (v === null || v === undefined ? "n/a (not eligible)" : String(v));

export default function ExperimentResultsCard() {
  const [data, setData] = useState(FALLBACK);

  useEffect(() => {
    let cancelled = false;
    getSyntheticResults()
      .then((r) => {
        if (!cancelled && r?.isSynthetic && r?.arms) setData(r);
      })
      .catch(() => {
        // Offline fallback: static deterministic values stay labelled synthetic.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = [
    { label: "Savings adherence (eligible-only avg)", get: (a) => fmt(a.avgSavingsAdherenceValue) },
    { label: "Shortfall-event rate (observed months)", get: (a) => fmt(a.shortfallEventRateValue) },
    { label: "Goal completion rate", get: (a) => fmt(a.goalCompletionRateValue) },
    { label: "Completed contribution rate", get: (a) => fmt(a.completedContributionRate) },
    { label: "Unsafe suggestion rate", get: (a) => fmt(a.unsafeSuggestionRate) },
  ];

  return (
    <section
      aria-labelledby="synthetic-validation-heading"
      className="rounded-2xl border border-dashed border-[#0756A6] bg-white p-6"
    >
      <p className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF3FC] px-3 py-1.5 text-xs font-bold text-[#064581]">
        <FlaskConical className="size-3.5" aria-hidden="true" />
        Synthetic workflow validation
      </p>
      <h3 id="synthetic-validation-heading" className="font-heading mt-3 text-lg font-extrabold text-[#064581]">
        Experiment results — scripted demo data
      </h3>
      <p className="mt-1 text-sm text-[#3d4f63]">
        9 scripted participants (3 per arm), {data.dateRange}. Validates
        workflow logic only — <strong>not real-user impact</strong>. Status:{" "}
        {data.overallStatus === "insufficient_evidence" ? "insufficient evidence — no winner declared" : data.overallStatus}.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <caption className="sr-only">Synthetic per-arm outcome summary</caption>
          <thead>
            <tr className="border-b border-[#d7e5f5] text-[#5b6b7f]">
              <th scope="col" className="py-2 pr-3 font-semibold">Outcome</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Control</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Rule-based</th>
              <th scope="col" className="py-2 font-semibold">Hishab</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-[#eef3f9] last:border-0">
                <th scope="row" className="py-2 pr-3 font-medium text-[#17212B]">{r.label}</th>
                <td className="py-2 pr-3">{r.get(data.arms.control)}</td>
                <td className="py-2 pr-3">{r.get(data.arms.rule_based)}</td>
                <td className="py-2 font-semibold text-[#064581]">{r.get(data.arms.hishab_combined)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-[#5b6b7f]">
        Synthetic demo only — not real-user impact. Rule-based suggests a
        fixed 10% even when a shortfall is forecast (unsafe rate 0.333);
        Hishab defers instead (unsafe rate 0, 1 correct deferral).
        Shortfall rates are identical by construction in this one-cycle
        script. Real-user proof needs the consented 2–3 month pilot.
      </p>
    </section>
  );
}
