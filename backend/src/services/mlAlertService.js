import Alert from "../models/Alert.js";

// Turns FastAPI ML results (forecast risk + anomaly detections) into
// deduplicated in-app notifications. No new ML model: this file only
// reformats what the AI service already returned.
//
// Deduplication design: every machine-generated alert carries a `sourceKey`
// shaped as `user + type + event identity`:
//   - shortfall: `shortfall:<weekStart YYYY-MM-DD>` (one per forecast week)
//   - anomaly:   `anomaly:<date>:<category>:<amount>:<description>` (one per
//     flagged purchase; the detector gives no transaction id, so the stable
//     purchase identity is used instead)
// Sync uses updateOne + $setOnInsert + upsert, so a repeated
// "Refresh insights" touches nothing when the key already exists (the user's
// read state is preserved), while genuinely new weeks or new flagged
// purchases create new alerts. A sparse unique index on
// { user: 1, sourceKey: 1 } enforces this at the database level too.

export const SHORTFALL_TYPE = "future_shortfall";
export const ANOMALY_TYPE = "unusual_spending";
export const COACH_ALERT_LIMIT = 5;
const AI_ASSISTANT_LINK = "/ai-assistant";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const bdtFormatter = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 2,
});

const formatBDT = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "BDT —";
  try {
    return bdtFormatter.format(n);
  } catch {
    return `BDT ${n.toLocaleString("en-BD")}`;
  }
};

// "2026-10-12" / Date -> "12 Oct 2026". Never throws.
const formatDay = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "upcoming week";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

// Date -> "YYYY-MM-DD" (UTC). Null when unparseable.
const weekKey = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const slug = (value, max = 40) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max) || "unknown";

// A. Future shortfall alerts from saved snapshot weeks (which already carry
// the cumulative predictedBalance and the shortfallRisk, including the
// "negative balance is always high risk" rule). Triggers when any upcoming
// week has high risk OR a negative predicted balance.
export const buildShortfallAlertDocs = (weeks) => {
  const docs = [];
  for (const w of weeks ?? []) {
    const balance = Number(w?.predictedBalance);
    const risk = w?.shortfallRisk;
    const key = weekKey(w?.weekStart);
    if (!key || !Number.isFinite(balance)) continue;

    const isHigh = risk === "high";
    const isNegative = balance < 0;
    if (!isHigh && !isNegative) continue;

    const day = formatDay(w.weekStart);
    const shortfall = isNegative ? Math.abs(balance) : 0;
    docs.push({
      type: SHORTFALL_TYPE,
      severity: "high",
      title: `Possible shortfall — week of ${day}`,
      message:
        `Forecast for the week of ${day} shows ${isNegative ? "a negative balance" : "high shortfall risk"} ` +
        `with an estimated balance of ${formatBDT(balance)}` +
        (isNegative ? ` (about ${formatBDT(shortfall)} short)` : "") +
        `. Review the forecast and ask the AI coach what to adjust.`,
      weekStart: new Date(`${key}T00:00:00.000Z`),
      actionLink: AI_ASSISTANT_LINK,
      sourceKey: `shortfall:${key}`,
    });
  }
  return docs;
};

// B. Spending anomaly alerts — ONLY from the ML detector output
// (`mlInsights.unusualExpenses`). The "largest recent expenses" list used for
// coach context is never treated as anomalies here.
export const buildAnomalyAlertDocs = (unusualExpenses) => {
  const docs = [];
  for (const u of unusualExpenses ?? []) {
    const amount = Number(u?.amount);
    const dayKey = weekKey(u?.date);
    if (!dayKey || !Number.isFinite(amount) || amount <= 0) continue;

    const category = u?.category ? String(u.category) : "Expense";
    const description = u?.description ? String(u.description).trim() : "";
    const explanation = u?.reason
      ? String(u.reason).trim()
      : "Amount is much higher than your usual expense pattern.";

    docs.push({
      type: ANOMALY_TYPE,
      severity: "medium",
      title: `Unusual spending — ${category} ${formatBDT(amount)}`,
      message:
        `${category} purchase of ${formatBDT(amount)} on ${formatDay(u.date)}` +
        (description ? ` (${description.slice(0, 80)})` : "") +
        `. ${explanation} Flagged by the spending anomaly detector.`,
      weekStart: null,
      actionLink: AI_ASSISTANT_LINK,
      sourceKey: `anomaly:${dayKey}:${slug(category)}:${amount.toFixed(2)}:${slug(description)}`,
    });
  }
  return docs;
};

// Insert only the alerts whose sourceKey is new for this user.
// Returns { created, total }. Never throws for duplicate-key races.
export const syncMlAlerts = async ({ userId, weeks, unusualExpenses }) => {
  const docs = [
    ...buildShortfallAlertDocs(weeks),
    ...buildAnomalyAlertDocs(unusualExpenses),
  ];

  let created = 0;
  for (const doc of docs) {
    try {
      const res = await Alert.updateOne(
        { user: userId, sourceKey: doc.sourceKey },
        { $setOnInsert: { ...doc, user: userId } },
        { upsert: true }
      );
      if (res.upsertedCount > 0) created += 1;
    } catch (error) {
      // 11000 = lost a harmless upsert race with another refresh; anything
      // else is logged by the caller.
      if (error?.code !== 11000) throw error;
    }
  }
  return { created, total: docs.length };
};

// Compact unread shortfall/anomaly alerts for the AI coach context.
// Aggregates only (no raw transactions, no PII beyond what the alert itself
// says). The coach may explain these but must not invent new ones.
export const getActiveAlertsForCoach = async (userId, limit = COACH_ALERT_LIMIT) => {
  const alerts = await Alert.find({
    user: userId,
    read: false,
    type: { $in: [SHORTFALL_TYPE, ANOMALY_TYPE] },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("type severity title message weekStart createdAt")
    .lean();

  return alerts.map((a) => ({
    type: a.type,
    severity: a.severity,
    title: String(a.title).slice(0, 120),
    message: String(a.message).slice(0, 300),
    date:
      a.weekStart instanceof Date
        ? a.weekStart.toISOString().slice(0, 10)
        : null,
    createdAt:
      a.createdAt instanceof Date
        ? a.createdAt.toISOString()
        : String(a.createdAt ?? ""),
    note: "Already shown in Notifications; explain if asked, never invent new anomalies or risks.",
  }));
};
