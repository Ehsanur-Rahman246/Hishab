/**
 * Shortfall baseline + prevention-plan service.
 *
 * PRIMARY OUTCOME (single source of truth, keep visible + consistent
 * across code, UI, reports, seed data, README):
 *   "Reduce the rate of user-months with a cash-flow shortfall."
 *
 * Operational definition:
 * - Historical cash-flow shortfall month = a COMPLETED calendar month
 *   where total recorded expenses exceed total recorded income.
 * - Call this "cash-flow shortfall", NOT "negative wallet balance",
 *   unless a verified month-start wallet balance and full wallet ledger
 *   make actual balance reconstruction possible (not implemented — so we
 *   never claim wallet-balance reconstruction).
 * - A forecasted shortfall = projected four-week expenses exceed projected
 *   four-week income, OR the existing cumulative predicted balance becomes
 *   negative when a reliable current wallet balance is available.
 *
 * Boundaries:
 * - Only COMPLETED historical months count toward the baseline. The
 *   current partial month is NEVER a completed outcome.
 * - Observed baseline / forecasted risk / post-intervention outcome are
 *   explicitly distinguished and never conflated.
 * - Never claim Hishab reduced shortfalls merely because a forecast was
 *   generated or advice was shown. Impact requires completed post months.
 * - No AI recommendation can move money. Plan actions are advisory text
 *   only; any savings transfer stays separately confirmed + user-initiated.
 * - Demo/synthetic metrics must be labelled synthetic. Real-user metrics
 *   stay empty/pending until consented study data exists.
 */

// Visible definition string reused by API, UI, reports, README.
export const SHORTFALL_DEFINITION =
  "Completed months where recorded expenses exceed recorded income.";

export const SHORTFALL_DEFINITION_LONG =
  "Historical cash-flow shortfall month = a completed calendar month where " +
  "total recorded expenses exceed total recorded income. " +
  "Call this 'cash-flow shortfall', not 'negative wallet balance', unless a " +
  "verified month-start wallet balance and full wallet ledger make actual " +
  "balance reconstruction possible. " +
  "A forecasted shortfall = projected four-week expenses exceed projected " +
  "four-week income, or the existing cumulative predicted balance becomes " +
  "negative when a reliable current wallet balance is available.";

export const MIN_OBSERVED_MONTHS = 3;
export const MIN_POST_MONTHS_FOR_COMPARISON = 1;
export const MIN_MONTHS_PER_ARM_FOR_AGGREGATE = 2;
export const MIN_USERS_FOR_AGGREGATE = 10;
export const MIN_FEEDBACK_FOR_REPORT = 5;

export const VALID_PLAN_LANGUAGES = ["bn", "en", "mixed", "auto"];
export const VALID_RISKS = ["low", "medium", "high"];
export const VALID_EVENT_KINDS = [
  "plan_shown",
  "plan_accepted",
  "plan_dismissed",
  "action_completed",
  "feedback_useful",
  "feedback_not_useful",
];
export const VALID_HELPFUL_FEATURES = [
  "forecast",
  "expense_explanation",
  "language_wording",
  "suggested_action",
  "none",
];

export function monthKeyUTC(date) {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function startOfCurrentMonthUTC(now = new Date()) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function mondayStartKeyUTC(date) {
  const d = new Date(date);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day),
  );
  return monday.toISOString().slice(0, 10);
}

/**
 * Compute the transaction-derived shortfall baseline.
 * @param {Array} transactions plain objects {type, category, amount, date}
 * @param {Date} now reference time (current partial month excluded)
 */
export function computeShortfallBaseline(transactions = [], now = new Date()) {
  const cutoff = startOfCurrentMonthUTC(now);
  const completed = (transactions || []).filter((t) => {
    const d = new Date(t?.date);
    return !Number.isNaN(d.getTime()) && d < cutoff;
  });

  const byMonth = new Map();
  for (const t of completed) {
    const key = monthKeyUTC(t.date);
    if (!byMonth.has(key)) byMonth.set(key, { income: 0, expense: 0, count: 0 });
    const row = byMonth.get(key);
    const amt = Number(t?.amount) || 0;
    if (t?.type === "income") row.income += amt;
    else if (t?.type === "expense") row.expense += amt;
    row.count += 1;
  }

  const months = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, v]) => ({
      month,
      income: Math.round(v.income * 100) / 100,
      expense: Math.round(v.expense * 100) / 100,
      net: Math.round((v.income - v.expense) * 100) / 100,
      shortfall: v.expense > v.income,
    }));

  const observedMonths = months.length;
  const shortfallMonths = months.filter((m) => m.shortfall).length;
  const shortfallRate = observedMonths > 0 ? shortfallMonths / observedMonths : 0;
  const deficits = months.filter((m) => m.shortfall).map((m) => m.expense - m.income);
  const averageDeficitBDT =
    deficits.length > 0
      ? Math.round((deficits.reduce((s, x) => s + x, 0) / deficits.length) * 100) / 100
      : 0;

  // Top categories contributing to shortfall months (expense only).
  const shortfallKeys = new Set(months.filter((m) => m.shortfall).map((m) => m.month));
  const byCat = new Map();
  let shortfallExpenseTotal = 0;
  for (const t of completed) {
    if (t?.type !== "expense") continue;
    if (!shortfallKeys.has(monthKeyUTC(t.date))) continue;
    const cat = String(t?.category || "Other");
    const amt = Number(t?.amount) || 0;
    byCat.set(cat, (byCat.get(cat) || 0) + amt);
    shortfallExpenseTotal += amt;
  }
  const topContributingCategories = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, totalBDT]) => ({
      category,
      totalBDT: Math.round(totalBDT * 100) / 100,
      share: shortfallExpenseTotal > 0 ? Math.round((totalBDT / shortfallExpenseTotal) * 1000) / 1000 : 0,
    }));

  // Weekly negative-net stats over completed history.
  const byWeek = new Map();
  for (const t of completed) {
    const key = mondayStartKeyUTC(t.date);
    if (!byWeek.has(key)) byWeek.set(key, { income: 0, expense: 0 });
    const row = byWeek.get(key);
    const amt = Number(t?.amount) || 0;
    if (t?.type === "income") row.income += amt;
    else if (t?.type === "expense") row.expense += amt;
  }
  const weeks = [...byWeek.values()];
  const weeksObserved = weeks.length;
  const weeksNegative = weeks.filter((w) => w.expense > w.income).length;
  const weeksNegativePct = weeksObserved > 0 ? weeksNegative / weeksObserved : 0;

  const sufficient = observedMonths >= MIN_OBSERVED_MONTHS;
  return {
    observedMonths,
    shortfallMonths,
    shortfallRate: Math.round(shortfallRate * 1000) / 1000,
    averageDeficitBDT,
    topContributingCategories,
    weeksObserved,
    weeksNegative,
    weeksNegativePct: Math.round(weeksNegativePct * 1000) / 1000,
    months,
    dataQuality: sufficient
      ? { status: "sufficient", minRequiredMonths: MIN_OBSERVED_MONTHS }
      : {
          status: "insufficient_history",
          minRequiredMonths: MIN_OBSERVED_MONTHS,
          reason: `Need at least ${MIN_OBSERVED_MONTHS} completed months; found ${observedMonths}. Current partial month is excluded.`,
        },
  };
}

/**
 * Derive forecasted shortfall risk from 4-week forecast weeks.
 * Forecasted shortfall = projected 4-week expenses exceed projected 4-week
 * income, OR cumulative predicted balance becomes negative when a reliable
 * current wallet balance is available.
 */
export function deriveForecastRisk(weeks = [], { walletBalance = null } = {}) {
  const rows = Array.isArray(weeks) ? weeks : [];
  const income = rows.reduce((s, w) => s + (Number(w?.predictedInflow ?? w?.predictedIncome) || 0), 0);
  const expense = rows.reduce((s, w) => s + (Number(w?.predictedOutflow ?? w?.predictedExpense) || 0), 0);
  const projectedDeficitBDT = Math.max(0, Math.round((expense - income) * 100) / 100);
  const hasReliableBalance = Number.isFinite(Number(walletBalance));
  const balances = rows.map((w) => w?.predictedBalance ?? w?.balance ?? null);
  const anyNegativeBalance = hasReliableBalance
    ? balances.some((b) => Number.isFinite(Number(b)) && Number(b) < 0)
    : false;
  const expensesExceedIncome = expense > income;
  const weeklyRisks = rows.map((w) => String(w?.shortfallRisk ?? w?.risk ?? "low"));
  const anyHigh = weeklyRisks.includes("high") || anyNegativeBalance || expensesExceedIncome;
  const anyMedium = weeklyRisks.includes("medium");

  // Confidence heuristic (observable evidence only): more weeks + larger
  // history is not known here, so confidence reflects forecast internal
  // agreement. Callers override with history-based confidence when available.
  let confidence = "low";
  if (rows.length >= 4 && (anyHigh || expensesExceedIncome)) confidence = "medium";
  if (rows.length >= 4 && anyNegativeBalance) confidence = "medium";
  if (rows.length === 0) confidence = "low";

  let forecastedShortfallRisk = "low";
  if (anyHigh) forecastedShortfallRisk = "high";
  else if (anyMedium) forecastedShortfallRisk = "medium";

  return {
    forecastedShortfallRisk,
    projectedIncomeBDT: Math.round(income * 100) / 100,
    projectedExpenseBDT: Math.round(expense * 100) / 100,
    projectedDeficitBDT,
    anyNegativePredictedBalance: anyNegativeBalance,
    hasReliableBalance,
    confidence,
  };
}

/**
 * Build the single prioritized Shortfall Prevention Plan.
 * At most ONE concrete action. Low-confidence / insufficient data yields a
 * cautious "Review your spending manually" state instead of a strong push.
 * Never moves money — advisory text only.
 */
export function buildPreventionPlan({
  baseline,
  forecastRisk,
  unusualExpenses = [],
  language = "auto",
  topDriver = null,
} = {}) {
  const lang = VALID_PLAN_LANGUAGES.includes(language) ? language : "auto";
  const resolved = lang === "auto" ? "mixed" : lang;
  const insufficient = !baseline || baseline.observedMonths < MIN_OBSERVED_MONTHS;
  const lowConfidence = !forecastRisk || forecastRisk.confidence === "low" || forecastRisk.forecastedShortfallRisk === "low";

  const driver =
    topDriver ||
    (baseline?.topContributingCategories?.[0]
      ? {
          category: baseline.topContributingCategories[0].category,
          totalBDT: baseline.topContributingCategories[0].totalBDT,
        }
      : null);
  const unusual = Array.isArray(unusualExpenses) ? unusualExpenses[0] : null;

  const TEXT = {
    cautious: {
      bn: "আপনার তথ্য এখনো কম, তাই এখনই জোরালো পরামর্শ দিচ্ছি না। Review your spending manually — গত মাসের খরচগুলো একবার দেখে নিন।",
      en: "There is not enough history for a confident plan yet. Review your spending manually — look through last month's expenses once.",
      mixed:
        "Apnar history ekhono kom, tai ekhon strong suggestion dicchi na. Review your spending manually — goto masher khoroch gulo ekbar dekhe nin.",
    },
  };

  if (insufficient || lowConfidence) {
    return {
      shown: true,
      cautious: true,
      risk: forecastRisk?.forecastedShortfallRisk ?? "low",
      headline:
        resolved === "bn"
          ? "এখনই বড় সিদ্ধান্ত নেবেন না"
          : resolved === "en"
            ? "Hold off on big moves for now"
            : "Ekhon boro decision niben na",
      explanation: TEXT.cautious[resolved],
      driver: driver || null,
      action: {
        title:
          resolved === "bn"
            ? "নিজে খরচগুলো দেখুন"
            : resolved === "en"
              ? "Review your spending manually"
              : "Nije khoroch gulo dekhun",
        detail: TEXT.cautious[resolved],
        movesMoney: false,
      },
      language: resolved,
      moneyMoved: false,
    };
  }

  // Normal path: one verified driver + one concrete action.
  const deficit = forecastRisk?.projectedDeficitBDT || baseline?.averageDeficitBDT || 0;
  const cat = driver?.category || "Food";
  const templates = {
    bn: {
      headline: "আসছে মাসে ঘাটতির ঝুঁকি আছে",
      explanation: `আপনার তথ্য বলছে ${cat} খাতে খরচ বেশি হওয়ায় ঘাটতি হতে পারে (আনুমানিক ৳${Math.round(deficit)})।`,
      actionTitle: `${cat} খরচ এই সপ্তাহে ১০% কমান`,
      actionDetail: `পরের বাজার/অর্ডারের সময় ${cat} খাতে একটু কম খরচ করুন। এটি শুধু পরামর্শ — কোনো টাকা সরানো হবে না।`,
    },
    en: {
      headline: "Shortfall risk ahead",
      explanation: `Your own transactions show ${cat} spending is the top driver of past shortfalls (around ৳${Math.round(deficit)} gap).`,
      actionTitle: `Cut ${cat} spending by 10% this week`,
      actionDetail: `Spend a little less on your next ${cat} purchase. This is advice only — no money will be moved.`,
    },
    mixed: {
      headline: "Samne shortfall risk ache",
      explanation: `Apnar nijer transaction bolche ${cat} khoroch shortfall-er main driver (around ৳${Math.round(deficit)} gap).`,
      actionTitle: `Ei week-e ${cat} khoroch 10% koman`,
      actionDetail: `Next ${cat} kenar somoy ektu kom khoroch korun. Eta sudhu suggestion — kono taka sorano hobe na.`,
    },
  };
  const t = templates[resolved] || templates.mixed;
  if (unusual) {
    t.explanation +=
      resolved === "bn"
        ? ` একটি অস্বাভাবিক খরচও পাওয়া গেছে (${unusual.category || "খরচ"} ৳${Math.round(Number(unusual.amount) || 0)}) — এটি ঘাটতিতে অবদান রাখতে পারে।`
        : resolved === "en"
          ? ` One unusual expense was also found (${unusual.category || "expense"} ৳${Math.round(Number(unusual.amount) || 0)}) — it may be contributing.`
          : ` Ekta unusual khoroch-o pawa geche (${unusual.category || "khoroch"} ৳${Math.round(Number(unusual.amount) || 0)}) — eta shortfall-e contribute korte pare.`;
  }
  return {
    shown: true,
    cautious: false,
    risk: forecastRisk.forecastedShortfallRisk,
    headline: t.headline,
    explanation: t.explanation,
    driver: driver || null,
    action: { title: t.actionTitle, detail: t.actionDetail, movesMoney: false },
    language: resolved,
    moneyMoved: false,
  };
}

/**
 * Split completed-month stats into pre/post windows around first acceptance.
 * Pre = completed months ending strictly before acceptance date.
 * Post = completed months starting on/after acceptance month.
 * Current partial month is always excluded from both arms.
 */
export function computePrePost(transactions = [], firstAcceptedAt, now = new Date()) {
  if (!firstAcceptedAt) {
    return { pre: null, post: null, reason: "no_accepted_plan" };
  }
  const accepted = new Date(firstAcceptedAt);
  if (Number.isNaN(accepted.getTime())) return { pre: null, post: null, reason: "bad_acceptance_date" };
  const cutoff = startOfCurrentMonthUTC(now);
  const preTx = [];
  const postTx = [];
  for (const t of transactions || []) {
    const d = new Date(t?.date);
    if (Number.isNaN(d.getTime()) || d >= cutoff) continue; // exclude partial month
    if (d < accepted) preTx.push(t);
    else postTx.push(t);
  }
  const pre = computeShortfallBaseline(preTx, cutoff);
  const post = computeShortfallBaseline(postTx, cutoff);
  return { pre, post, reason: "observational_before_after_not_causal" };
}

/** Aggregate anonymised feedback into a feature-priority report. */
export function aggregateFeedback(events = []) {
  const fb = (events || []).filter((e) =>
    ["feedback_useful", "feedback_not_useful"].includes(e?.kind),
  );
  const total = fb.length;
  if (total < MIN_FEEDBACK_FOR_REPORT) {
    return {
      totalFeedbackResponses: total,
      status: "insufficient_feedback",
      message: `Insufficient feedback to rank features (need ${MIN_FEEDBACK_FOR_REPORT}, have ${total}). Do not overstate preferences from small samples.`,
      usefulRateByFeature: {},
      mostUsefulFeature: null,
      languagePreference: {},
    };
  }
  const byFeature = {};
  const lang = {};
  let useful = 0;
  for (const e of fb) {
    const f = String(e?.featureHelpful || "none");
    if (!byFeature[f]) byFeature[f] = { total: 0, useful: 0 };
    byFeature[f].total += 1;
    if (e?.kind === "feedback_useful") {
      byFeature[f].useful += 1;
      useful += 1;
    }
    const l = String(e?.language || "mixed");
    lang[l] = (lang[l] || 0) + 1;
  }
  const usefulRateByFeature = {};
  for (const [k, v] of Object.entries(byFeature)) {
    usefulRateByFeature[k] = Math.round((v.useful / v.total) * 1000) / 1000;
  }
  const mostUsefulFeature = Object.entries(byFeature).sort((a, b) => {
    const ra = a[1].useful / a[1].total;
    const rb = b[1].useful / b[1].total;
    if (rb !== ra) return rb - ra;
    return b[1].total - a[1].total;
  })[0]?.[0] ?? null;
  return {
    totalFeedbackResponses: total,
    overallUsefulRate: Math.round((useful / total) * 1000) / 1000,
    status: "ok",
    usefulRateByFeature,
    mostUsefulFeature,
    languagePreference: lang,
  };
}

/**
 * Deterministic SYNTHETIC fixture demonstrating calculation correctness.
 * Labelled synthetic demo evidence — never real-user impact.
 */
export function syntheticDemoTransactions() {
  // 6 completed months (Jan–Jun 2026), alternating shortfall / surplus.
  const tx = [];
  const push = (iso, type, category, amount) =>
    tx.push({ type, category, amount, date: new Date(iso), description: "synthetic demo" });
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
  months.forEach((m, i) => {
    push(`${m}-05T10:00:00Z`, "income", "Other", 20000);
    const spend = i % 2 === 0 ? 21450 : 18500; // shortfall on even idx
    push(`${m}-10T10:00:00Z`, "expense", "Food", Math.round(spend * 0.45));
    push(`${m}-15T10:00:00Z`, "expense", "Transport", Math.round(spend * 0.25));
    push(`${m}-20T10:00:00Z`, "expense", "Shopping", spend - Math.round(spend * 0.45) - Math.round(spend * 0.25));
  });
  return tx;
}

export function syntheticDemoOutcome(now = new Date("2026-07-15T00:00:00Z")) {
  const baseline = computeShortfallBaseline(syntheticDemoTransactions(), now);
  return {
    isSynthetic: true,
    syntheticLabel: "Synthetic demo evidence — not real-user impact.",
    baseline,
  };
}
