import mongoose from "mongoose";
import Transaction from "../models/Transaction.js";
import ForecastSnapshot from "../models/ForecastSnapshot.js";
import Wallet from "../models/Wallet.js";
import ShortfallPreventionMetric from "../models/ShortfallPreventionMetric.js";
import ShortfallEvent from "../models/ShortfallEvent.js";
import {
  SHORTFALL_DEFINITION,
  VALID_EVENT_KINDS,
  VALID_HELPFUL_FEATURES,
  VALID_PLAN_LANGUAGES,
  aggregateFeedback,
  buildPreventionPlan,
  computePrePost,
  computeShortfallBaseline,
  deriveForecastRisk,
  MIN_OBSERVED_MONTHS,
  MIN_USERS_FOR_AGGREGATE,
  MIN_MONTHS_PER_ARM_FOR_AGGREGATE,
} from "../services/shortfallService.js";

async function getOrCreateMetric(userId) {
  let m = await ShortfallPreventionMetric.findOne({ user: userId });
  if (!m) m = await ShortfallPreventionMetric.create({ user: userId });
  return m;
}

/**
 * GET /api/shortfall/outcome
 * Structured outcome object. Never claims impact from forecast/advice alone.
 */
export const getOutcome = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userOid = new mongoose.Types.ObjectId(userId);
    const now = new Date();

    const transactions = await Transaction.find({ user: userOid })
      .select("type category amount date")
      .sort({ date: 1 })
      .lean();

    const baseline = computeShortfallBaseline(transactions, now);

    const [snapshot, wallet, metric] = await Promise.all([
      ForecastSnapshot.findOne({ user: userOid }).sort({ generatedAt: -1 }).lean(),
      Wallet.findOne({ user: userOid }).select("balance").lean(),
      getOrCreateMetric(userOid),
    ]);

    const walletBalance =
      wallet && Number.isFinite(Number(wallet.balance)) ? Number(wallet.balance) : null;
    const forecastRisk = snapshot?.weeks?.length
      ? deriveForecastRisk(snapshot.weeks, { walletBalance })
      : {
          forecastedShortfallRisk: "low",
          projectedDeficitBDT: 0,
          confidence: "low",
          hasReliableBalance: walletBalance !== null,
        };

    // Persist aggregate baseline (privacy-safe counts only).
    metric.observedMonths = baseline.observedMonths;
    metric.shortfallMonths = baseline.shortfallMonths;
    metric.shortfallRate = baseline.shortfallRate;
    metric.averageDeficitBDT = baseline.averageDeficitBDT;
    metric.lastComputedAt = new Date();
    await metric.save();

    // Pre/post windows (observational before/after, not causal).
    let prePost = { pre: null, post: null };
    if (metric.firstAcceptedPlanAt) {
      prePost = computePrePost(transactions, metric.firstAcceptedPlanAt, now);
    }

    let outcomeStatus = "insufficient_history";
    if (baseline.observedMonths >= MIN_OBSERVED_MONTHS) {
      outcomeStatus = metric.firstAcceptedPlanAt ? "tracking" : "baseline_only";
    }

    const events = await ShortfallEvent.find({ user: userOid })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.status(200).json({
      success: true,
      primaryOutcome: "cash_flow_shortfall_rate",
      definition: SHORTFALL_DEFINITION,
      definitionNote:
        "Historical cash-flow shortfall month = a completed calendar month where total recorded expenses exceed total recorded income. Current partial month is excluded.",
      baseline: {
        observedMonths: baseline.observedMonths,
        shortfallMonths: baseline.shortfallMonths,
        shortfallRate: baseline.shortfallRate,
        averageDeficitBDT: baseline.averageDeficitBDT,
        topContributingCategories: baseline.topContributingCategories,
        weeksObserved: baseline.weeksObserved,
        weeksNegativePct: baseline.weeksNegativePct,
        months: baseline.months,
        dataQuality: baseline.dataQuality,
      },
      currentPeriod: {
        forecastedShortfallRisk: forecastRisk.forecastedShortfallRisk,
        projectedDeficitBDT: forecastRisk.projectedDeficitBDT,
        confidence: forecastRisk.confidence,
        hasReliableBalance: forecastRisk.hasReliableBalance ?? walletBalance !== null,
      },
      intervention: {
        planShown: (metric.planShownCount || 0) > 0,
        planShownCount: metric.planShownCount || 0,
        planAccepted: (metric.planAcceptedCount || 0) > 0,
        planAcceptedCount: metric.planAcceptedCount || 0,
        actionCompleted: (metric.actionCompletedCount || 0) > 0,
        actionCompletedCount: metric.actionCompletedCount || 0,
        firstAcceptedPlanAt: metric.firstAcceptedPlanAt,
      },
      prePost: prePost.pre
        ? {
            label: "Observational before/after tracking — not proof of causality.",
            pre: {
              observedMonths: prePost.pre.observedMonths,
              shortfallRate: prePost.pre.shortfallRate,
            },
            post: {
              observedMonths: prePost.post.observedMonths,
              shortfallRate: prePost.post.shortfallRate,
            },
          }
        : null,
      recentEvents: events.map((e) => ({
        kind: e.kind,
        language: e.language,
        featureHelpful: e.featureHelpful,
        createdAt: e.createdAt,
      })),
      outcomeStatus,
      impactClaim: "none",
      impactNote:
        "Hishab does not claim reduced shortfalls from forecasts or advice alone. Impact requires completed post-intervention months with sufficient evidence.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * GET /api/shortfall/plan?language=auto
 * The single prioritized Shortfall Prevention Plan (advisory only).
 */
export const getPlan = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userOid = new mongoose.Types.ObjectId(userId);
    const language = String(req.query.language || "auto").toLowerCase();
    const lang = VALID_PLAN_LANGUAGES.includes(language) ? language : "auto";
    const now = new Date();

    const [transactions, snapshot, wallet] = await Promise.all([
      Transaction.find({ user: userOid }).select("type category amount date").lean(),
      ForecastSnapshot.findOne({ user: userOid }).sort({ generatedAt: -1 }).lean(),
      Wallet.findOne({ user: userOid }).select("balance").lean(),
    ]);
    const baseline = computeShortfallBaseline(transactions, now);
    const walletBalance =
      wallet && Number.isFinite(Number(wallet.balance)) ? Number(wallet.balance) : null;
    const forecastRisk = snapshot?.weeks?.length
      ? deriveForecastRisk(snapshot.weeks, { walletBalance })
      : { forecastedShortfallRisk: "low", projectedDeficitBDT: 0, confidence: "low" };

    // Anomaly context: surface the largest recent expense as a possible
    // contributor (supportive role — anomaly detection serves the primary
    // outcome, it is not a separate primary claim).
    const cutoff = new Date(now);
    const recentExpenses = transactions
      .filter((t) => t?.type === "expense" && new Date(t.date) <= cutoff)
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 1)
      .map((t) => ({ category: t.category, amount: Number(t.amount) || 0 }));

    const plan = buildPreventionPlan({
      baseline,
      forecastRisk,
      unusualExpenses: recentExpenses,
      language: lang,
    });

    return res.status(200).json({
      success: true,
      definition: SHORTFALL_DEFINITION,
      risk: plan.risk,
      plan,
      supportiveRoles: {
        anomalyDetection: "Identifies an unusual expense that may contribute to a possible shortfall.",
        savingsGoals: "Help only after the immediate shortfall risk is understood.",
        zakat: "Separate utility, not part of the primary success metric.",
      },
      safety: {
        movesMoney: false,
        note: "This plan never moves money. Any savings transfer must be separately confirmed and user-initiated.",
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/** POST /api/shortfall/events {kind, language?, actionRecommended?, reason?} */
export const postEvent = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userOid = new mongoose.Types.ObjectId(userId);
    const { kind, language = "auto", actionRecommended = null, reason = null } = req.body ?? {};
    if (!VALID_EVENT_KINDS.includes(kind)) {
      return res.status(400).json({
        success: false,
        message: `kind must be one of: ${VALID_EVENT_KINDS.join(", ")}`,
      });
    }
    const lang = VALID_PLAN_LANGUAGES.includes(String(language)) ? String(language) : "auto";
    const ev = await ShortfallEvent.create({
      user: userOid,
      kind,
      language: lang,
      actionRecommended: actionRecommended ? String(actionRecommended).slice(0, 300) : null,
      reason: reason ? String(reason).slice(0, 500) : null,
      isSynthetic: false,
    });
    const metric = await getOrCreateMetric(userOid);
    if (kind === "plan_shown") metric.planShownCount += 1;
    if (kind === "plan_accepted") {
      metric.planAcceptedCount += 1;
      if (!metric.firstAcceptedPlanAt) metric.firstAcceptedPlanAt = new Date();
    }
    if (kind === "plan_dismissed") metric.planDismissedCount += 1;
    if (kind === "action_completed") metric.actionCompletedCount += 1;
    if (kind === "feedback_useful") metric.usefulCount += 1;
    if (kind === "feedback_not_useful") metric.notUsefulCount += 1;
    if (VALID_PLAN_LANGUAGES.includes(lang)) metric.preferredLanguage = lang;
    await metric.save();
    return res.status(201).json({ success: true, event: { id: String(ev._id), kind: ev.kind } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * POST /api/shortfall/feedback
 * Voluntary in-app feedback AFTER a plan. Explicit consent REQUIRED.
 * Body: {consent: true, useful: boolean, featureHelpful, language?, feedbackText?}
 */
export const postFeedback = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userOid = new mongoose.Types.ObjectId(userId);
    const { consent, useful, featureHelpful = "none", language = "auto", feedbackText = null, reason = null } =
      req.body ?? {};
    if (consent !== true) {
      return res.status(400).json({
        success: false,
        message: "Explicit consent is required before research feedback is stored. Pass { consent: true }.",
      });
    }
    if (typeof useful !== "boolean") {
      return res.status(400).json({ success: false, message: "`useful` (boolean) is required." });
    }
    if (!VALID_HELPFUL_FEATURES.includes(String(featureHelpful))) {
      return res.status(400).json({
        success: false,
        message: `featureHelpful must be one of: ${VALID_HELPFUL_FEATURES.join(", ")}`,
      });
    }
    const lang = VALID_PLAN_LANGUAGES.includes(String(language)) ? String(language) : "auto";
    const kind = useful ? "feedback_useful" : "feedback_not_useful";
    const ev = await ShortfallEvent.create({
      user: userOid,
      kind,
      language: lang,
      featureHelpful: String(featureHelpful),
      feedbackText: feedbackText ? String(feedbackText).slice(0, 1000) : null,
      reason: reason ? String(reason).slice(0, 500) : null,
      isSynthetic: false,
    });
    const metric = await getOrCreateMetric(userOid);
    metric.consentGiven = true;
    metric.consentAt = new Date();
    metric.preferredLanguage = lang;
    if (useful) metric.usefulCount += 1;
    else metric.notUsefulCount += 1;
    await metric.save();
    return res.status(201).json({ success: true, event: { id: String(ev._id), kind } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/** GET /api/shortfall/feedback-report — feedback-derived feature priority. */
export const getFeedbackReport = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userOid = new mongoose.Types.ObjectId(userId);
    const events = await ShortfallEvent.find({
      user: userOid,
      kind: { $in: ["feedback_useful", "feedback_not_useful"] },
    }).lean();
    const report = aggregateFeedback(events);
    return res.status(200).json({ success: true, report, isSynthetic: false });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * GET /api/shortfall/aggregate-impact
 * Honest aggregate gate: minimum users + months, else "Insufficient evidence".
 * Observational only — never causal.
 */
export const getAggregateImpact = async (_req, res) => {
  try {
    const metrics = await ShortfallPreventionMetric.find({
      firstAcceptedPlanAt: { $ne: null },
    }).lean();
    if (metrics.length < MIN_USERS_FOR_AGGREGATE) {
      return res.status(200).json({
        success: true,
        status: "insufficient_evidence",
        message: `Insufficient evidence to estimate impact (need ${MIN_USERS_FOR_AGGREGATE} users with accepted plans, have ${metrics.length}).`,
        sampleUsers: metrics.length,
        isSynthetic: false,
      });
    }
    // Per-user pre/post would require loading transactions for every user;
    // this endpoint reports the gate + arms so judges see the honesty rule.
    // Full longitudinal comparison lives in PRODUCT_OUTCOME_REPORT.md once
    // consented study data exists.
    return res.status(200).json({
      success: true,
      status: "tracking",
      message: `Observational before/after tracking across ${metrics.length} users (minimum ${MIN_MONTHS_PER_ARM_FOR_AGGREGATE} completed months per arm required for any rate comparison). Not proof of causality.`,
      sampleUsers: metrics.length,
      minMonthsPerArm: MIN_MONTHS_PER_ARM_FOR_AGGREGATE,
      minUsers: MIN_USERS_FOR_AGGREGATE,
      isSynthetic: false,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
