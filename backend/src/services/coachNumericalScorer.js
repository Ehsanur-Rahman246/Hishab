// Numerical-grounding scorer for the bilingual AI coach.
//
// Purpose: JSON validity is NOT proof of correctness. This module checks
// whether monetary / percentage figures in a coach reply actually match the
// trusted financial context (aggregates only — never raw transactions).
//
// - Normalizes Bengali digits (০-৯) to ASCII before extraction.
// - Extracts monetary / percentage / amount-like numbers from reply text.
// - Matches each expected fact within an explicit rounding tolerance.
// - Flags unsupported financial claims (possible hallucinations).
// - Detects reply language (bn / en / mixed) for routing accuracy.
//
// Deterministic and offline: CI tests score version-controlled fixture
// replies. Live Groq evaluation is optional, env-gated, and never required.

const BENGALI_DIGIT_MAP = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};

const BANGLA_RANGE = /[\u0980-\u09FF]/;
const LATIN_RANGE = /[A-Za-z]/;

// Words/symbols that mark a number as a money claim.
const MONEY_MARKERS = ["bdt", "taka", "takas", "টাকা", "৳", "tk"];

// Words/symbols that mark a number as a percentage claim.
const PERCENT_MARKERS = ["%", "percent", "শতাংশ", "পার্সেন্ট"];

export const DEFAULT_ABS_TOLERANCE = 1.0; // BDT 1 (covers rounding to whole taka)
export const DEFAULT_REL_TOLERANCE = 0.005; // 0.5% (covers decimal/rounding edges)

export const normalizeDigits = (text) =>
  String(text ?? "").replace(/[০-৯]/g, (d) => BENGALI_DIGIT_MAP[d]);

// Strip thousand separators so "1,250" and "1250" compare equal. Decimal
// points are preserved.
const canonicalNumber = (raw) => Number(String(raw).replace(/,/g, ""));

// Latin-script Bangla (Banglish) words. Mirrors the coach controller's
// no-data fallback routing: an "auto" Banglish question gets a mixed reply,
// so pure-script detection alone would mislabel Banglish as English.
const BANGLISH_HINT =
  /\b(amar|amader|tomar|apnar|apni|tumi|ki|kivabe|keno|koto|kototuku|jomano|joma|kharcha|khoroch|maas|mash|mashe|mase|soptaho|dine|protidin|bazaar|bhat|bari|basa|beshi|sobcheye|hoise|eita|ei|kothay)\b/i;

export const detectReplyLanguage = (text) => {
  const t = String(text ?? "");
  const hasBangla = BANGLA_RANGE.test(t);
  const hasLatin = LATIN_RANGE.test(t);
  if (hasBangla && hasLatin) return "mixed";
  if (hasBangla) return "bn";
  if (BANGLISH_HINT.test(t)) return "mixed";
  return "en";
};

const surrounding = (lower, index, length, window = 10) =>
  lower.slice(Math.max(0, index - window), index + length + window);

// Extract candidate financial numbers from free text.
// A number counts as a financial claim when it carries a money/percent
// marker nearby, OR it is amount-like (value >= 100 or has decimals).
// Small bare integers (counts, list positions, years are handled by the
// caller via trustedNumbers) are ignored to avoid false positives on
// phrases like "3 actions" or "step 1".
export const extractFinancialNumbers = (text) => {
  const normalized = normalizeDigits(String(text ?? ""));
  const lower = normalized.toLowerCase();
  const out = [];
  const re = /-?\d[\d,]*(\.\d+)?/g;
  let m;
  while ((m = re.exec(normalized)) !== null) {
    const raw = m[0];
    const value = canonicalNumber(raw);
    if (!Number.isFinite(value)) continue;
    const ctx = surrounding(lower, m.index, raw.length).toLowerCase();
    const isMoney =
      MONEY_MARKERS.some((k) => ctx.includes(k.toLowerCase())) ||
      /৳/.test(surrounding(normalized, m.index, raw.length));
    const isPercent = PERCENT_MARKERS.some((k) =>
      ctx.includes(k.toLowerCase()),
    );
    const hasDecimals = raw.includes(".");
    const amountLike = Math.abs(value) >= 100 || hasDecimals;
    if (isMoney || isPercent || amountLike) {
      out.push({ raw, value, isMoney, isPercent });
    }
  }
  return out;
};

export const withinTolerance = (
  found,
  expected,
  absTol = DEFAULT_ABS_TOLERANCE,
  relTol = DEFAULT_REL_TOLERANCE,
) =>
  Math.abs(found - expected) <=
  Math.max(absTol, relTol * Math.abs(expected));

// Common derived figures a truthful reply may state without them appearing
// literally in the context (e.g. "you spent 64%" from income 50000 and
// expense 32000, or "4000 remaining" from goal 10000/6000). These are
// computable from supplied aggregates, so they count as derivable.
export const deriveContextNumbers = (context) => {
  const out = [];
  try {
    const income = Number(context?.totals?.income);
    const expense = Number(context?.totals?.expense);
    if (Number.isFinite(income) && income > 0 && Number.isFinite(expense)) {
      out.push(income - expense, (expense / income) * 100, ((income - expense) / income) * 100);
    }
    for (const g of context?.goals ?? []) {
      const target = Number(g?.targetAmount);
      const saved = Number(g?.savedAmount);
      if (Number.isFinite(target) && Number.isFinite(saved)) {
        out.push(target - saved);
        if (target > 0) out.push((saved / target) * 100);
      }
    }
    for (const c of context?.topCategories ?? []) {
      const amt = Number(c?.amount);
      if (Number.isFinite(amt) && Number.isFinite(expense) && expense > 0) {
        out.push((amt / expense) * 100);
      }
    }
  } catch {
    // Derivation is best-effort; raw numbers below still apply.
  }
  return out.filter((n) => Number.isFinite(n));
};

// Collect every finite number inside a trusted context object (recursively)
// so runtime validation can verify "derivable from supplied context".
export const collectTrustedNumbers = (context) => {
  const out = [];
  const walk = (node) => {
    if (typeof node === "number" && Number.isFinite(node)) {
      out.push(node);
      return;
    }
    if (typeof node === "string") {
      for (const n of extractFinancialNumbers(node)) out.push(n.value);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      Object.values(node).forEach(walk);
    }
  };
  walk(context);
  return [...out, ...deriveContextNumbers(context)];
};

// Check that every expected fact appears in the reply within tolerance.
export const scoreExpectedFacts = (
  replyText,
  expectedFacts = [],
  options = {},
) => {
  const { absTol = DEFAULT_ABS_TOLERANCE, relTol = DEFAULT_REL_TOLERANCE } =
    options;
  const found = extractFinancialNumbers(replyText).map((n) => n.value);
  const details = expectedFacts.map((fact) => {
    const matched = found.some((v) => withinTolerance(v, fact.value, absTol, relTol));
    return { id: fact.id, expected: fact.value, matched };
  });
  return details;
};

// Numbers in the reply that match NO trusted number within tolerance.
export const findUnsupportedFinancialClaims = (
  replyText,
  trustedNumbers = [],
  options = {},
) => {
  const { absTol = DEFAULT_ABS_TOLERANCE, relTol = DEFAULT_REL_TOLERANCE } =
    options;
  return extractFinancialNumbers(replyText).filter(
    (n) => !trustedNumbers.some((t) => withinTolerance(n.value, t, absTol, relTol)),
  );
};

export const CAUTIOUS_NUMBERS_NOTE =
  " Note: some figures above could not be verified against your saved data — treat amounts cautiously.";

// Score one evaluation case against its fixture reply.
// Case: { id, expectedLanguage, expectedFacts: [{id, value}], trustedNumbers,
//   mustRefuse (bool), customTol?: {absTol, relTol} }
export const scoreCase = (replyText, testCase) => {
  const options =
    testCase.customTol ?? {
      absTol: DEFAULT_ABS_TOLERANCE,
      relTol: DEFAULT_REL_TOLERANCE,
    };
  const factDetails = scoreExpectedFacts(
    replyText,
    testCase.expectedFacts ?? [],
    options,
  );
  const factsOk =
    factDetails.length === 0 ? true : factDetails.every((d) => d.matched);
  const unsupported = findUnsupportedFinancialClaims(
    replyText,
    testCase.trustedNumbers ?? [],
    options,
  );
  const noHallucination =
    (testCase.expectedFacts ?? []).length > 0
      ? unsupported.length === 0
      : unsupported.length === 0;
  // Refusal cases pass only when the reply states it cannot answer AND
  // makes no financial claims at all.
  const refusalOk = testCase.mustRefuse
    ? unsupported.length === 0 &&
      /cannot|don't have|do not have|নেই|পারছি না|obosshoi|janina|জানি না|not (in|available)|missing/i.test(
        String(replyText),
      )
    : true;
  const languageOk = testCase.expectedLanguage
    ? detectReplyLanguage(replyText) === testCase.expectedLanguage
    : true;
  const passed = factsOk && noHallucination && refusalOk && languageOk;
  const reasons = [];
  for (const d of factDetails.filter((d) => !d.matched)) {
    reasons.push(`expected ${d.expected} not found (fact ${d.id})`);
  }
  if (unsupported.length > 0) {
    reasons.push(
      `unsupported claim(s): ${unsupported.map((u) => u.raw).join(", ")}`,
    );
  }
  if (testCase.mustRefuse && !refusalOk) {
    reasons.push("expected a refusal with no invented amounts");
  }
  if (testCase.expectedLanguage && !languageOk) {
    reasons.push(
      `language ${detectReplyLanguage(replyText)} != expected ${testCase.expectedLanguage}`,
    );
  }
  return { passed, factDetails, unsupported, languageOk, reasons };
};

// Aggregate a list of { case, replyText } evaluations into a report.
export const runGroundingEvaluation = (evaluated) => {
  const total = evaluated.length;
  const passed = evaluated.filter((e) => e.result.passed).length;
  const hallucinated = evaluated.filter(
    (e) => e.result.unsupported.length > 0,
  ).length;
  const langOk = evaluated.filter((e) => e.result.languageOk).length;
  return {
    casesRun: total,
    numericAccuracy: total ? passed / total : 0,
    hallucinationRate: total ? hallucinated / total : 0,
    languageRoutingAccuracy: total ? langOk / total : 0,
    failedCases: evaluated
      .filter((e) => !e.result.passed)
      .map((e) => ({ id: e.case.id, reasons: e.result.reasons })),
  };
};
