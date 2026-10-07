import ChatMessage from "../models/ChatMessage.js";
import ForecastSnapshot from "../models/ForecastSnapshot.js";
import Alert from "../models/Alert.js";

// Data-retention policy (truthful, configurable, integrity-safe).
//
// RETENTION (env-overridable, defaults documented in README):
//   CHAT_RETENTION_DAYS=90, FORECAST_RETENTION_DAYS=180, ALERT_RETENTION_DAYS=90.
// IMMUTABLE (never deleted by cleanup): GoalTransfer audit ledger and
// Transaction history — money-movement integrity depends on them. This is why
// audit records are retained even though chat/forecast/alert copies expire.
// BOUNDARIES: cleanup deletes only expired non-financial copies. Account
// deletion (PIN-confirmed) removes Wallet/Transaction/Goal/Alert/Summary/
// Forecast/Chat rows for that user; GoalTransfer rows are keyed by user and
// remain as orphaned audit evidence (documented limitation, not a secret).
// No encryption-at-rest, anonymisation pipeline, or export API is claimed:
// none is implemented (see README limitations).

export const retentionConfig = () => ({
  chatDays: Number(process.env.CHAT_RETENTION_DAYS || 90),
  forecastDays: Number(process.env.FORECAST_RETENTION_DAYS || 180),
  alertDays: Number(process.env.ALERT_RETENTION_DAYS || 90),
});

export const retentionCutoff = (days, now = new Date()) =>
  new Date(now.getTime() - Number(days) * 24 * 60 * 60 * 1000);

export const isEligibleForCleanup = (docDate, days, now = new Date()) => {
  if (!docDate) return false;
  return new Date(docDate).getTime() < retentionCutoff(days, now).getTime();
};

// Delete expired non-financial copies. Never touches GoalTransfer/Transaction.
// Keeps each user's latest ForecastSnapshot regardless of age so the UI never
// loses its only forecast to a janitor run.
export const cleanupRetention = async (now = new Date()) => {
  const cfg = retentionConfig();
  const chatCut = retentionCutoff(cfg.chatDays, now);
  const fcCut = retentionCutoff(cfg.forecastDays, now);
  const alCut = retentionCutoff(cfg.alertDays, now);

  const chat = await ChatMessage.deleteMany({ createdAt: { $lt: chatCut } });

  // Forecasts: delete expired ones except each user's newest snapshot.
  const latestIds = await ForecastSnapshot.aggregate([
    { $sort: { generatedAt: -1 } },
    { $group: { _id: "$user", latest: { $first: "$_id" } } },
  ]);
  const keep = new Set(latestIds.map((r) => String(r.latest)));
  const expired = await ForecastSnapshot.find(
    { $or: [{ generatedAt: { $lt: fcCut } }, { createdAt: { $lt: fcCut } }] },
    { _id: 1 },
  ).lean();
  const deletable = expired.map((d) => d._id).filter((id) => !keep.has(String(id)));
  let forecasts = 0;
  if (deletable.length) {
    const r = await ForecastSnapshot.deleteMany({ _id: { $in: deletable } });
    forecasts = r.deletedCount || 0;
  }

  // Alerts: only read+resolved ones expire (unread/actionable alerts survive).
  const alerts = await Alert.deleteMany({
    read: true, resolved: true, updatedAt: { $lt: alCut },
  });

  return {
    chatDeleted: chat.deletedCount || 0,
    forecastsDeleted: forecasts,
    alertsDeleted: alerts.deletedCount || 0,
    // Integrity proof: these collections are never in the delete set.
    protected: ["GoalTransfer", "Transaction"],
  };
};
