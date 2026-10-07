import { ArrowRight, Check, Minus } from "lucide-react";

const ROWS = [
  { label: "Historical analytics (transactions, totals, categories)", values: [true, true, true] },
  { label: "4-week cash-flow forecast with confidence", values: [false, false, true] },
  { label: "Contextual shortfall detection", values: [false, false, true] },
  { label: "Bangla / Banglish explanation of your own data", values: [false, false, true] },
  { label: "One prioritized action (not generic tips)", values: [false, false, true] },
  { label: "Safety check before any savings suggestion", values: [false, false, true] },
  { label: "Explicit confirmation before contributions", values: [false, true, true] },
  { label: "Outcome tracking (adherence, shortfall events, goals)", values: [false, false, true] },
];

const COLUMNS = ["Standard dashboard", "Rule-based planner", "Hishab workflow"];

function Cell({ value }) {
  if (value) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
        <Check className="size-4" aria-hidden="true" />
        <span className="sr-only">Yes</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-sm text-[#8aa0b6]">
      <Minus className="size-4" aria-hidden="true" />
      <span className="sr-only">No</span>
    </span>
  );
}

const FLOWS = [
  {
    title: "Standard dashboard",
    steps: ["Past transactions", "user decides alone"],
  },
  {
    title: "Rule-based planner",
    steps: ["Past transactions", "fixed savings percentage"],
  },
  {
    title: "Hishab",
    highlight: true,
    steps: [
      "Past transactions",
      "4-week forecast",
      "Bangla/Banglish explanation",
      "shortfall-safe action",
      "confirmed savings contribution",
      "outcome tracking",
    ],
  },
];

export function WorkflowVisual() {
  return (
    <div className="grid gap-4 md:grid-cols-3" aria-label="Workflow comparison">
      {FLOWS.map((f) => (
        <div
          key={f.title}
          className={`rounded-2xl border p-5 ${
            f.highlight
              ? "border-[#0756A6] bg-[#EAF3FC] shadow-[0_8px_28px_rgba(13,57,117,0.12)]"
              : "border-[#d7e5f5] bg-white"
          }`}
        >
          <p className={`text-sm font-extrabold ${f.highlight ? "text-[#064581]" : "text-[#3d4f63]"}`}>
            {f.title}
          </p>
          <ol className="mt-3 space-y-2">
            {f.steps.map((s, i) => (
              <li key={s} className="flex items-center gap-2 text-sm text-[#17212B]">
                {i > 0 && <ArrowRight className="size-3.5 shrink-0 text-[#0756A6]" aria-hidden="true" />}
                <span className={i > 0 ? "" : "font-medium"}>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

export default function WhyHishab() {
  return (
    <div>
      <WorkflowVisual />
      <div className="mt-8 overflow-x-auto rounded-2xl border border-[#d7e5f5] bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">
            Comparison of a standard dashboard, a rule-based savings planner, and the Hishab combined workflow
          </caption>
          <thead>
            <tr className="border-b border-[#d7e5f5] bg-[#F5F7FA]">
              <th scope="col" className="px-4 py-3 font-semibold text-[#3d4f63]">
                Capability
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className={`px-4 py-3 font-extrabold ${c === "Hishab workflow" ? "text-[#064581]" : "text-[#3d4f63]"}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="border-b border-[#eef3f9] last:border-0">
                <th scope="row" className="px-4 py-3 font-medium text-[#17212B]">
                  {r.label}
                </th>
                {r.values.map((v, i) => (
                  <td key={i} className="px-4 py-3">
                    <Cell value={v} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-[#5b6b7f]">
        Generic product categories only — no commercial product is named or
        measured here. Hishab combines forecast, explanation, one safe action,
        confirmed saving, and outcome tracking in a single loop; real-user
        impact is unproven until the consented pilot completes.
      </p>
    </div>
  );
}
