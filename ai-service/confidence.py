# Hishab AI Service — forecast confidence + calibration + fallback policy.
#
# CONFIDENCE (observable evidence only, never invented probabilities):
#   inputs: usable history weeks, rolling-origin holdout error, trend
#   stability (expense CV), salary/festival evidence quality.
#   output: { level: high|medium|low, reasons: [str], fallback: bool,
#             fallbackReason: str|None, reviewAction: str|None }
#
# CALIBRATION (honest):
#   error tolerance band per case: tol = max(500 BDT, 20% of mean weekly
#   expense). A forecast "meets tolerance" when income MAE <= tol AND
#   expense MAE <= tol. Calibration report measures, per confidence bucket,
#   coverage = share meeting tolerance. We NEVER claim "calibrated" unless
#   coverage(high) > coverage(medium) > coverage(low) with enough samples.
#
# FALLBACK (conservative, deterministic):
#   low confidence or insufficient data -> historical-average fallback,
#   uncertainty label, no strong recommendation, "Review manually" action.
#   High anomaly uncertainty -> "review this expense", never fraud.
#   Model failure -> deterministic fallback / unavailable state.
#   No model output may execute transfers or modify goals.

from __future__ import annotations

import math

TOLERANCE_FLOOR_BDT = 500.0
TOLERANCE_FRACTION = 0.20
MIN_WEEKS_MODEL = 4
MIN_WEEKS_ELIGIBLE = 8
CALIBRATION_MIN_SAMPLE = 4


def tolerance_band(mean_weekly_expense: float) -> float:
    m = float(mean_weekly_expense or 0)
    return max(TOLERANCE_FLOOR_BDT, TOLERANCE_FRACTION * max(0.0, m))


def _cv(values) -> float:
    vals = [float(v) for v in (values or []) if v is not None and math.isfinite(float(v))]
    if len(vals) < 2:
        return float("inf")
    mean = sum(vals) / len(vals)
    if mean <= 0:
        return 0.0 if all(v == 0 for v in vals) else float("inf")
    var = sum((v - mean) ** 2 for v in vals) / len(vals)
    return math.sqrt(var) / mean


def forecast_confidence(n_weeks: int, expense_cv: float | None,
                        holdout_mae_expense: float | None,
                        mean_weekly_expense: float | None,
                        salary_detected: bool = False,
                        festival_applied: bool = False) -> dict:
    """Deterministic confidence from observable evidence. Never throws."""
    reasons: list[str] = []
    n = int(n_weeks or 0)
    if n < MIN_WEEKS_MODEL:
        return {"level": "low",
                "reasons": [f"Only {n} weeks of history (need 4+ for a trend; 8+ for evaluation)."],
                "fallback": True,
                "fallbackReason": "insufficient_data: historical-average fallback with uncertainty label.",
                "reviewAction": "Review manually: add more weeks of transactions before relying on this forecast."}
    cv = float(expense_cv) if expense_cv is not None and math.isfinite(float(expense_cv)) else float("inf")
    tol = tolerance_band(mean_weekly_expense or 0)
    err_txt = f"{float(holdout_mae_expense):.1f}" if holdout_mae_expense is not None else "unknown"

    score = 0
    if n >= 16:
        score += 1
        reasons.append(f"{n} weeks of history (16+).")
    elif n >= 8:
        reasons.append(f"{n} weeks of history (8-15).")
    else:
        reasons.append(f"{n} weeks of history (below 8: cannot be honestly evaluated).")
    if cv < 0.5:
        score += 1
        reasons.append(f"Spending is stable (CV {cv:.2f} < 0.50).")
    else:
        reasons.append(f"Spending is volatile (CV {cv:.2f} >= 0.50).")
    if holdout_mae_expense is not None and math.isfinite(float(holdout_mae_expense)):
        if float(holdout_mae_expense) <= tol:
            score += 1
            reasons.append(f"Holdout miss BDT {err_txt} is within tolerance BDT {tol:.0f}.")
        else:
            reasons.append(f"Holdout miss BDT {err_txt} exceeds tolerance BDT {tol:.0f}.")
    else:
        reasons.append("No holdout error available (insufficient history for evaluation).")
    if salary_detected:
        reasons.append("Salary pattern detected from repeated receipts (supports income confidence).")
    if festival_applied:
        reasons.append("Festival uplift learned from prior festival weeks (horizon-adjusted).")

    if n < MIN_WEEKS_ELIGIBLE:
        return {"level": "low", "reasons": reasons, "fallback": True,
                "fallbackReason": "insufficient_data: historical-average fallback with uncertainty label.",
                "reviewAction": "Review manually: add more weeks of transactions before relying on this forecast."}
    if score >= 3:
        level = "high"
    elif score >= 1:
        level = "medium"
    else:
        level = "low"
    fallback = level == "low"
    return {
        "level": level,
        "reasons": reasons,
        "fallback": fallback,
        "fallbackReason": ("high_uncertainty: historical-average fallback with uncertainty label; no strong recommendation."
                           if fallback else None),
        "reviewAction": ("Review manually: treat this forecast as a rough estimate." if fallback else None),
    }


def calibrate_confidence(cases) -> dict:
    """Honest calibration: coverage per confidence bucket.

    Each case: {confidence: high|medium|low, income_mae, expense_mae,
                mean_weekly_expense}. Meets tolerance when BOTH series MAE
    <= tolerance_band(mean_weekly_expense). Buckets with < 4 samples report
    status insufficient_evidence. calibrated=true only when
    coverage(high) > coverage(medium) > coverage(low), strictly.
    """
    buckets: dict[str, list] = {"high": [], "medium": [], "low": []}
    for c in (cases or []):
        b = str((c or {}).get("confidence", "low")).lower()
        if b in buckets:
            buckets[b].append(c)
    per_bucket = {}
    for b, group in buckets.items():
        if len(group) < CALIBRATION_MIN_SAMPLE:
            per_bucket[b] = {"sampleCount": len(group), "status": "insufficient_evidence",
                             "coverage": None, "errorRate": None}
            continue
        met = 0
        for c in group:
            tol = tolerance_band(c.get("mean_weekly_expense") or 0)
            try:
                ok = float(c["income_mae"]) <= tol and float(c["expense_mae"]) <= tol
            except Exception:
                ok = False
            met += 1 if ok else 0
        cov = met / len(group)
        per_bucket[b] = {"sampleCount": len(group), "status": "ok",
                         "coverage": round(cov, 4), "errorRate": round(1 - cov, 4),
                         "metTolerance": met}
    h, m, lo = per_bucket["high"], per_bucket["medium"], per_bucket["low"]
    calibrated = False
    if h.get("coverage") is not None and m.get("coverage") is not None and lo.get("coverage") is not None:
        calibrated = bool(h["coverage"] > m["coverage"] > lo["coverage"])
    return {
        "methodology": ("Tolerance band = max(BDT 500, 20% of mean weekly expense). "
                        "Meets tolerance = income MAE and expense MAE both within band. "
                        "Coverage = share meeting tolerance per confidence bucket."),
        "toleranceFloorBDT": TOLERANCE_FLOOR_BDT,
        "toleranceFraction": TOLERANCE_FRACTION,
        "minSample": CALIBRATION_MIN_SAMPLE,
        "buckets": per_bucket,
        "calibrated": calibrated,
        "calibrationClaim": ("High-confidence forecasts met tolerance more often than medium, "
                             "which beat low." if calibrated else
                             "Not calibrated: do not claim calibration (buckets ordered check failed or insufficient evidence)."),
    }


def human_review_policy(signal: str, uncertainty: str = "high") -> dict:
    """Conservative action labels. Never authorises automated money movement."""
    s = str(signal or "").lower()
    if s in ("low_confidence", "insufficient_data", "fallback"):
        return {"label": "Uncertain forecast — historical average shown",
                "action": "Review manually",
                "automatedTransferAllowed": False,
                "note": "No strong recommendation; add more history before relying on this."}
    if s in ("anomaly_uncertain", "anomaly_review"):
        return {"label": "Review this expense",
                "action": "Review manually",
                "automatedTransferAllowed": False,
                "note": "Flagged as unusual vs your own pattern; not fraud or wrongdoing."}
    if s in ("shortfall", "repeated_false_positives"):
        return {"label": "Predicted shortfall — review your plan",
                "action": "Review manually",
                "automatedTransferAllowed": False,
                "note": "Presents a user-review action, never moves money automatically."}
    if s in ("service_failure", "model_failure"):
        return {"label": "Forecast unavailable",
                "action": "Review manually",
                "automatedTransferAllowed": False,
                "note": "Deterministic fallback or clear unavailable state; try again later."}
    return {"label": "Review manually", "action": "Review manually",
            "automatedTransferAllowed": False,
            "note": f"Conservative default for signal '{signal}' (uncertainty {uncertainty})."}
