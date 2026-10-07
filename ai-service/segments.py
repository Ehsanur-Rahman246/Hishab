# Hishab AI Service — privacy-safe non-sensitive segment evaluation.
#
# PURPOSE (judge requirement J1.2 / J3.8):
#   Measure performance CONSISTENCY across usage patterns, NOT demographic
#   fairness. Hishab intentionally does not collect protected attributes
#   (age, gender, religion, ethnicity, location, disability, etc.) and never
#   infers them. Segments below use only observable transaction-shape signals.
#
# SEGMENTS (all derived from weekly aggregates / counts, never PII):
#   - history_length: "4-7 weeks" | "8-15 weeks" | "16+ weeks"
#   - income_regularity: "recurring" (salary-like, stable) | "irregular"
#   - spending_pattern: "stable" | "volatile"
#   - transaction_density: "low" | "medium" | "high" (avg txns per week)
#
# PRIVACY: this module accepts only numeric series + counts. It never accepts
#   raw descriptions, names, phones, or protected attributes. segment_evaluation
#   reports contain segment labels + metric numbers + sample counts only.
#
# ELIGIBILITY: below MIN_SEGMENT_SAMPLE cases per segment value, metrics are
#   None with status "insufficient_evidence" — callers must display
#   "not enough evidence", never claim fairness.

from __future__ import annotations

import math

MIN_SEGMENT_SAMPLE = 4  # documented minimum per segment value

FORBIDDEN_SEGMENT_KEYS = frozenset({
    "age", "gender", "sex", "religion", "ethnicity", "caste", "race",
    "location", "address", "phone", "email", "name", "disability",
    "nationality", "protected",
})


def assert_no_protected_attributes(segment: dict) -> None:
    keys = {str(k).lower() for k in (segment or {}).keys()}
    bad = keys & FORBIDDEN_SEGMENT_KEYS
    if bad:
        raise ValueError(f"protected/PII segment keys forbidden: {sorted(bad)}")


def _cv(values) -> float:
    vals = [float(v) for v in values if v is not None]
    vals = [v for v in vals if math.isfinite(v)]
    if not vals:
        return float("inf")
    mean = sum(vals) / len(vals)
    if mean <= 0:
        # all-zero series: perfectly stable, not volatile
        return 0.0 if all(v == 0 for v in vals) else float("inf")
    var = sum((v - mean) ** 2 for v in vals) / len(vals)
    return math.sqrt(var) / mean


def classify_history_length(n_weeks: int) -> str:
    n = int(n_weeks)
    if n < 8:
        return "4-7 weeks"
    if n <= 15:
        return "8-15 weeks"
    return "16+ weeks"


def classify_income_regularity(weekly_income) -> str:
    """Recurring = >=3 non-zero income weeks AND low variation (CV < 0.35)."""
    vals = [float(v) for v in (weekly_income or [])]
    nonzero = [v for v in vals if v > 0]
    if len(nonzero) >= 3 and _cv(nonzero) < 0.35:
        return "recurring"
    return "irregular"


def classify_spending_pattern(weekly_expense) -> str:
    """Stable = expense CV < 0.5 over non-trivial history, else volatile."""
    vals = [float(v) for v in (weekly_expense or [])]
    if len(vals) < 2:
        return "volatile"
    return "stable" if _cv(vals) < 0.5 else "volatile"


def classify_density(avg_tx_per_week: float) -> str:
    a = float(avg_tx_per_week or 0)
    if a < 3:
        return "low"
    if a <= 7:
        return "medium"
    return "high"


def classify_case(n_weeks, weekly_income, weekly_expense, avg_tx_per_week) -> dict:
    seg = {
        "history_length": classify_history_length(n_weeks),
        "income_regularity": classify_income_regularity(weekly_income),
        "spending_pattern": classify_spending_pattern(weekly_expense),
        "transaction_density": classify_density(avg_tx_per_week),
    }
    assert_no_protected_attributes(seg)
    return seg


def _mean(vals):
    vals = [float(v) for v in vals if v is not None and math.isfinite(float(v))]
    return sum(vals) / len(vals) if vals else None


def _summarise_forecast(group):
    n = len(group)
    if n < MIN_SEGMENT_SAMPLE:
        return {"sampleCount": n, "status": "insufficient_evidence",
                "income": None, "expense": None}
    return {
        "sampleCount": n,
        "status": "ok",
        "income": {
            "mae": round(_mean([c["income_mae"] for c in group]), 4),
            "rmse": round(_mean([c["income_rmse"] for c in group]), 4),
        },
        "expense": {
            "mae": round(_mean([c["expense_mae"] for c in group]), 4),
            "rmse": round(_mean([c["expense_rmse"] for c in group]), 4),
        },
    }


def _summarise_anomaly(group):
    n = len(group)
    if n < MIN_SEGMENT_SAMPLE:
        return {"sampleCount": n, "status": "insufficient_evidence",
                "precision": None, "recall": None, "f1": None,
                "falsePositiveRate": None}
    tp = sum(int(c.get("tp", 0)) for c in group)
    fp = sum(int(c.get("fp", 0)) for c in group)
    fn = sum(int(c.get("fn", 0)) for c in group)
    tn = sum(int(c.get("tn", 0)) for c in group)
    precision = (tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    recall = (tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    fpr = (fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    return {
        "sampleCount": n,
        "status": "ok",
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "falsePositiveRate": round(fpr, 4),
        "truePositives": tp, "falsePositives": fp,
        "falseNegatives": fn, "trueNegatives": tn,
    }


def evaluate_segments(cases) -> dict:
    """Aggregate per-case results into a deterministic segmentEvaluation report.

    Each case: {
      segment: {history_length, income_regularity, spending_pattern,
                transaction_density},
      eligible: bool,
      income_mae, income_rmse, expense_mae, expense_rmse (when eligible),
      tp, fp, fn, tn (anomaly counts; tn = non-anomaly cases correctly silent),
    }
    Returns {dimensions: {dim: {value: forecast|anomaly summaries}},
             overall: {eligibilityRate, fallbackRate, casesEvaluated},
             minSample: MIN_SEGMENT_SAMPLE,
             methodology: str}
    """
    cases = list(cases or [])
    for c in cases:
        assert_no_protected_attributes((c or {}).get("segment", {}))
    dims = ["history_length", "income_regularity", "spending_pattern",
            "transaction_density"]
    out_dims = {}
    for dim in dims:
        values: dict = {}
        for c in cases:
            v = (c.get("segment") or {}).get(dim)
            if v is None:
                continue
            values.setdefault(str(v), []).append(c)
        dim_out = {}
        for v, group in sorted(values.items()):
            elig = [g for g in group if g.get("eligible")]
            forecast = _summarise_forecast([
                {"income_mae": g["income_mae"], "income_rmse": g["income_rmse"],
                 "expense_mae": g["expense_mae"], "expense_rmse": g["expense_rmse"]}
                for g in elig
                if g.get("income_mae") is not None and g.get("expense_mae") is not None
            ])
            anomaly = _summarise_anomaly(group)
            dim_out[v] = {"cases": len(group),
                          "eligibleCases": len(elig),
                          "forecast": forecast, "anomaly": anomaly}
        out_dims[dim] = dim_out
    eligible = sum(1 for c in cases if c.get("eligible"))
    return {
        "methodology": ("Performance consistency across non-sensitive usage-pattern "
                        "segments (history length, income regularity, spending pattern, "
                        "transaction density). NOT demographic fairness: Hishab does not "
                        "collect protected attributes."),
        "minSample": MIN_SEGMENT_SAMPLE,
        "casesEvaluated": len(cases),
        "overall": {
            "eligibleCases": eligible,
            "ineligibleCases": len(cases) - eligible,
            "eligibilityRate": round(eligible / len(cases), 4) if cases else 0.0,
            "fallbackRate": round((len(cases) - eligible) / len(cases), 4) if cases else 0.0,
        },
        "dimensions": out_dims,
    }
