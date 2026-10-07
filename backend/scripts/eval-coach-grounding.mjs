// Coach numerical-grounding evaluation runner.
//
// Default (CI-safe): scores version-controlled fixture replies offline.
//   node scripts/eval-coach-grounding.mjs
//
// Optional live probe (needs Groq credentials, NEVER runs in CI):
//   GROQ_API_KEY=... GROQ_MODEL=... node scripts/eval-coach-grounding.mjs --live
//
// Live mode sends only small synthetic aggregates (no PII, no raw
// transactions) and prints the same report columns. API keys are read
// from the environment and never printed.

import {
  runGroundingEvaluation,
  scoreCase,
} from "../src/services/coachNumericalScorer.js";

const LIVE_CASES = [
  {
    id: "live-income-en",
    question: "What was my total income?",
    expectedLanguage: "en",
    context: {
      totals: { income: 50000, expense: 32000, currency: "BDT" },
      topCategories: [{ category: "Food", amount: 8500 }],
      forecast: null,
      goals: [],
      walletBalance: 12500,
    },
    expectedFacts: [{ id: "income", value: 50000 }],
    trustedNumbers: [50000, 32000, 18000, 8500, 12500, 64, 36],
  },
  {
    id: "live-food-banglish",
    question: "amar food e koto khoroch hoise?",
    expectedLanguage: "mixed",
    context: {
      totals: { income: 50000, expense: 32000, currency: "BDT" },
      topCategories: [{ category: "Food", amount: 8500 }],
      forecast: null,
      goals: [],
      walletBalance: 12500,
    },
    expectedFacts: [{ id: "food", value: 8500 }],
    trustedNumbers: [50000, 32000, 8500, 12500],
  },
  {
    id: "live-refusal",
    question: "What was my March bonus?",
    expectedLanguage: "en",
    context: {
      totals: { income: 50000, expense: 32000, currency: "BDT" },
      topCategories: [],
      forecast: null,
      goals: [],
      walletBalance: 12500,
    },
    expectedFacts: [],
    trustedNumbers: [50000, 32000, 12500],
    mustRefuse: true,
  },
];

const printReport = (label, report) => {
  console.log(`\n== ${label} ==`);
  console.log(`cases run: ${report.casesRun}`);
  console.log(`numeric accuracy: ${(report.numericAccuracy * 100).toFixed(1)}%`);
  console.log(
    `unsupported-claim (hallucination) rate: ${(report.hallucinationRate * 100).toFixed(1)}%`,
  );
  console.log(
    `language-routing accuracy: ${(report.languageRoutingAccuracy * 100).toFixed(1)}%`,
  );
  if (report.failedCases.length > 0) {
    console.log("failed cases:");
    for (const f of report.failedCases) {
      console.log(` - ${f.id}: ${f.reasons.join("; ")}`);
    }
  } else {
    console.log("failed cases: none");
  }
};

const args = new Set(process.argv.slice(2));

if (!args.has("--live")) {
  // Offline fixture demo (one illustrative case; full suite lives in tests/).
  const demo = {
    id: "fixture-demo",
    expectedLanguage: "en",
    expectedFacts: [{ id: "income", value: 50000 }],
    trustedNumbers: [50000, 32000, 18000],
  };
  const result = scoreCase(
    "Your total income is BDT 50,000 and expenses are BDT 32,000.",
    demo,
  );
  printReport(
    "fixture self-check (full 22-case suite: npm test)",
    runGroundingEvaluation([{ case: demo, result }]),
  );
  process.exit(result.passed ? 0 : 1);
}

// ---- Live probe (explicit opt-in only) ----
if (!process.env.GROQ_API_KEY || !process.env.GROQ_MODEL) {
  console.error(
    "Live evaluation needs GROQ_API_KEY and GROQ_MODEL in the environment. Refusing to run.",
  );
  process.exit(2);
}

const { generateCoachReply, parseAndValidateCoachJson } = await import(
  "../src/services/groqCoachService.js"
);

const evaluated = [];
for (const c of LIVE_CASES) {
  let replyText = "";
  try {
    replyText = await generateCoachReply({
      message: c.question,
      language: "auto",
      context: c.context,
    });
    const checked = parseAndValidateCoachJson(replyText, "auto");
    const text = checked.ok
      ? `${checked.coach.headline}\n${checked.coach.answer}`
      : replyText;
    evaluated.push({ case: c, result: scoreCase(text, c) });
    console.log(`\n--- ${c.id} ---\n${text.slice(0, 600)}`);
  } catch (error) {
    evaluated.push({
      case: c,
      result: {
        passed: false,
        unsupported: [],
        languageOk: false,
        reasons: [`provider error: ${error?.code ?? "unknown"}`],
        factDetails: [],
      },
    });
  }
}
printReport("live Groq probe (synthetic aggregates only)", runGroundingEvaluation(evaluated));
process.exit(evaluated.every((e) => e.result.passed) ? 0 : 1);
