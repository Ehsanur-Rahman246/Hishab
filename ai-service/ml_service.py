# Hishab AI Service — ML helpers (Scikit-learn forecasting + anomaly detection)
#
# Beginner's guide to this file:
# ---------------------------------------------------------------------------
# WHY WEEKLY AGGREGATION?
#   Daily spending is noisy (rent one day, coffee the next). Grouping every
#   transaction into Monday-starting weekly totals smooths that noise, so a
#   simple trend line can see "spending is drifting up" instead of chaos.
#
# WHY LinearRegression FOR THIS MVP?
#   It is the simplest honest model: it fits one straight trend line through
#   past weekly totals and extends it 4 weeks ahead. It needs little data,
#   trains instantly, and anyone can explain it on a dashboard. Fancier models
#   would pretend to be accurate on tiny hackathon datasets — this one does not.
#
# WHY FALLBACK LOGIC?
#   New users may have only 1-3 weeks of history. A trend line through 2 points
#   is meaningless, so we fall back to the plain historical average and SAY SO
#   in `dataQuality` / `modelUsed`. Never claim strong ML accuracy without data.
#
# WHAT DOES IsolationForest DO? (simple version)
#   Imagine sorting a user's own expense amounts and asking: "which few
#   purchases sit far away from the user's normal crowd of purchases?"
#   IsolationForest automates that: amounts that are easy to "isolate" from
#   the rest get flagged. We only use it with >= 10 expenses, only flag
#   amounts ABOVE the user's median (so cheap outliers never count), and we
#   cap results at 5 so the dashboard stays calm.
#
# PREDICTION, NOT FINANCIAL ADVICE:
#   Everything here is a rough statistical guess from past transactions only.
#   This service never sees the user's wallet balance, bills, or life events,
#   so its numbers must never be presented as financial advice.
# ---------------------------------------------------------------------------

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression

import evaluation as _evaluation
import patterns as _patterns

# --- Tunables (kept as named constants so beginners can find them) ---
HORIZON_WEEKS = 4          # how many future weeks to forecast
MIN_WEEKS_FOR_MODEL = 4    # need at least this many history weeks for LinearRegression
MIN_EXPENSES_FOR_IFOREST = 10  # need at least this many expenses for IsolationForest
MAX_UNUSUAL = 5            # never return more unusual transactions than this

UNUSUAL_REASON = "Amount is much higher than your usual expense pattern."

# Contextual anomaly tunables.
CATEGORY_MIN_HISTORY = 2       # need >=2 prior same-category points for a z-score
CATEGORY_FLAG_MULTIPLE = 2.0   # amount >= 2x category median is "abnormal"
CATEGORY_HIGH_MULTIPLE = 3.0   # amount >= 3x category median leans "high" severity
VELOCITY_WINDOW_DAYS = 7       # recent-spend window for velocity feature
VELOCITY_BASELINE_DAYS = 28    # prior baseline window for velocity feature


def _week_start(dates):
    """Convert a datetime column to its Monday 00:00 (UTC) week bucket."""
    parsed = pd.to_datetime(dates, errors="coerce", utc=True)
    normalized = parsed.dt.tz_convert("UTC").dt.normalize()
    weekday = parsed.dt.tz_convert("UTC").dt.weekday
    return normalized - pd.to_timedelta(weekday, unit="D")


def _safe_str(value):
    """Return a clean string even for None/NaN/missing descriptions."""
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass
    return str(value)


def build_weekly_history(df):
    """
    Aggregate cleaned transactions into Monday-starting weekly totals.

    Returns a DataFrame with columns: weekStart (Timestamp), income, expense,
    sorted oldest week first. Weeks with only income (or only expense) get 0
    for the missing side. Returns an empty DataFrame if nothing is usable.
    """
    work = df.copy()
    work["amount"] = pd.to_numeric(work.get("amount"), errors="coerce")
    work["date"] = pd.to_datetime(work.get("date"), errors="coerce", utc=True)
    work = work.dropna(subset=["amount", "date"])
    if work.empty:
        return pd.DataFrame(columns=["weekStart", "income", "expense"])

    work["weekStart"] = _week_start(work["date"])

    # Pivot: one row per week, separate income/expense columns.
    pivot = work.pivot_table(
        index="weekStart", columns="type", values="amount",
        aggfunc="sum", fill_value=0.0,
    )
    # A user with only income (or only expenses) misses a column — add it.
    for col in ("income", "expense"):
        if col not in pivot.columns:
            pivot[col] = 0.0

    history = (
        pivot[["income", "expense"]]
        .reset_index()
        .sort_values("weekStart")
        .reset_index(drop=True)
    )
    full_range = pd.date_range(
        start=history["weekStart"].min(),
        end=history["weekStart"].max(),
        freq="7D",
    )
    history = (
        history.set_index("weekStart")
        .reindex(full_range, fill_value=0.0)
        .rename_axis("weekStart")
        .reset_index()
    )
    history["income"] = history["income"].astype(float)
    history["expense"] = history["expense"].astype(float)
    return history


def _forecast_series(values, horizon=HORIZON_WEEKS):
    """
    Forecast one weekly series (all income, or all expense).

    - 4+ data points -> Scikit-learn LinearRegression trend line.
    - Fewer points  -> transparent historical-average fallback
      (or zeros when there is no data at all).
    Negative predictions are impossible for money, so they are clipped to 0.
    Returns (predictions_list, method_name).
    """
    vals = [float(v) for v in values]

    if len(vals) >= MIN_WEEKS_FOR_MODEL:
        try:
            # X = week index (0, 1, 2, ...), y = weekly totals.
            model = LinearRegression()
            model.fit(
                [[i] for i in range(len(vals))],
                vals,
            )
            future_x = [[i] for i in range(len(vals), len(vals) + horizon)]
            preds = [max(0.0, float(p)) for p in model.predict(future_x)]
            return preds, "linear_regression"
        except Exception:
            # If fitting ever fails (e.g. numerical edge case), fall through
            # to the safe average instead of crashing the request.
            pass

    if len(vals) == 0:
        return [0.0] * horizon, "historical_average_fallback"
    avg = sum(vals) / len(vals)
    return [max(0.0, float(avg))] * horizon, "historical_average_fallback"


def assess_weekly_risk(predicted_income, predicted_expense):
    """
    Deterministic risk rule comparing ONE week's predicted expense vs income.

    No wallet balance is used (this service never receives it), so risk only
    describes the predicted cashflow shape, not the user's real solvency.
    Returns (level, machine_readable_reason).
    """
    income = float(predicted_income)
    expense = float(predicted_expense)

    if income <= 0 and expense <= 0:
        return "low", "No spending predicted for this week."
    if income <= 0:
        return "high", "Predicted expenses with no predicted income."
    ratio = expense / income
    if ratio <= 0.7:
        return "low", "Predicted income covers predicted expenses."
    if ratio <= 1.0:
        return "medium", "Predicted expenses are close to predicted income."
    return "high", "Predicted expenses exceed predicted income."


def _iqr_high_outliers(amounts):
    """
    Robust fallback anomaly rule for < 10 expenses (no ML needed).

    Flags only amounts above the upper fence Q3 + 1.5*IQR. If all amounts are
    identical (IQR == 0), nothing can be "unusual", so nothing is flagged.
    Returns a boolean mask over `amounts`.
    """
    import numpy as np

    arr = [float(a) for a in amounts]
    if len(arr) == 0:
        return []
    q1 = float(np.percentile(arr, 25))
    q3 = float(np.percentile(arr, 75))
    iqr = q3 - q1
    if iqr <= 0:
        # Every expense is (nearly) identical — flag nothing.
        median = float(np.median(arr))
        return [a > median for a in arr]
    fence = q3 + 1.5 * iqr
    return [a > fence for a in arr]


def _norm_key(value):
    """Normalised description/merchant key for frequency counting."""
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass
    return " ".join(str(value).strip().lower().split())


def _context_features(expenses):
    """Explainable per-transaction context features (user history only).

    Returns (matrix, context_list) where each row is:
      [log_amount, category_deviation, merchant_novelty,
       day_of_week_norm, velocity_ratio]
    - log_amount: log1p(amount), dampens huge values.
    - category_deviation: amount / leave-one-out category median
      (1.0 = perfectly normal for that category). Falls back to amount /
      global median when fewer than CATEGORY_MIN_HISTORY other
      same-category points exist.
    - merchant_novelty: 1.0 when this normalised description never appeared
      before, else 0.0.
    - day_of_week_norm: Asia/Dhaka weekday / 6 in [0, 1].
    - velocity_ratio: 7-day spend ending that day vs prior 28-day daily
      average (1.0 = normal pace). Robust 1.0 fallback for sparse data.
    """
    amounts = [max(0.0, float(a)) for a in expenses["amount"].tolist()]
    cats = [_safe_str(c).strip().lower() or "uncategorised" for c in expenses.get("category", [""] * len(expenses))]
    descs = [_norm_key(d) for d in expenses.get("description", [""] * len(expenses))]
    try:
        dhaka = pd.to_datetime(expenses["date"], errors="coerce", utc=True).dt.tz_convert("Asia/Dhaka")
    except Exception:
        dhaka = pd.to_datetime(expenses["date"], errors="coerce", utc=True)
    dows = []
    for ts in dhaka.tolist():
        try:
            dows.append(float(pd.Timestamp(ts).weekday()) / 6.0)
        except Exception:
            dows.append(0.5)

    # Category baselines from the user's own history, LEAVE-ONE-OUT:
    # each transaction is compared against the median of the OTHER
    # same-category amounts (>=2 others needed). A lone outlier can never
    # inflate its own baseline (e.g. one 15000 laptop next to one 900 shoe
    # purchase must not normalise itself). With <2 other same-category
    # points we fall back to the global median.
    by_cat = {}
    for idx, (a, c) in enumerate(zip(amounts, cats)):
        by_cat.setdefault(c, []).append((idx, a))
    global_median = float(np.median(amounts)) if amounts else 0.0

    # Merchant frequency over the whole history.
    freq = {}
    for d in descs:
        if d:
            freq[d] = freq.get(d, 0) + 1

    # Velocity: for each expense, 7-day spend vs prior 28-day daily average.
    dates_utc = pd.to_datetime(expenses["date"], errors="coerce", utc=True)
    velocity = []
    for i in range(len(expenses)):
        try:
            day = pd.Timestamp(dates_utc.iloc[i]).normalize()
            if pd.isna(day):
                velocity.append(1.0)
                continue
            recent = sum(
                a for a, d in zip(amounts, dates_utc.tolist())
                if not pd.isna(d) and day - pd.Timedelta(days=6) <= pd.Timestamp(d).normalize() <= day
            )
            prior_vals = [
                a for a, d in zip(amounts, dates_utc.tolist())
                if not pd.isna(d) and day - pd.Timedelta(days=VELOCITY_BASELINE_DAYS + 6) <= pd.Timestamp(d).normalize() < day - pd.Timedelta(days=6)
            ]
            baseline_daily = (sum(prior_vals) / VELOCITY_BASELINE_DAYS) if prior_vals else None
            if not baseline_daily or baseline_daily <= 0:
                velocity.append(1.0)
            else:
                velocity.append(float((recent / 7.0) / baseline_daily))
        except Exception:
            velocity.append(1.0)

    matrix = []
    contexts = []
    for i, (amt, cat, desc) in enumerate(zip(amounts, cats, descs)):
        others = [a for j, a in by_cat.get(cat, []) if j != i]
        if len(others) >= CATEGORY_MIN_HISTORY:
            cat_med = float(np.median(others))
        else:
            cat_med = global_median if global_median > 0 else amt or 1.0
        dev = float(amt / cat_med) if cat_med and cat_med > 0 else 1.0
        novelty = 1.0 if (desc and freq.get(desc, 0) <= 1) else 0.0
        matrix.append([float(np.log1p(amt)), float(dev), float(novelty), float(dows[i]), float(velocity[i])])
        contexts.append({
            "categoryMedian": round(float(cat_med), 2),
            "categoryDeviation": round(float(dev), 3),
            "merchantNovel": bool(novelty == 1.0),
            "velocityRatio": round(float(velocity[i]), 3),
        })
    return matrix, contexts


def _explain_anomaly(amount, category, context):
    """Plain-English reasons + severity from context (deterministic)."""
    reasons = []
    dev = float(context["categoryDeviation"])
    cat = category or "Expense"
    if dev >= CATEGORY_HIGH_MULTIPLE:
        reasons.append(f"Amount is {dev:.1f}x above your normal {cat} spending")
    elif dev >= CATEGORY_FLAG_MULTIPLE:
        reasons.append(f"Amount is {dev:.1f}x above your normal {cat} spending")
    if context["merchantNovel"]:
        reasons.append("This merchant description has not appeared before")
    if float(context["velocityRatio"]) >= 2.0:
        reasons.append("Recent 7-day spending is running well above your usual pace")
    if not reasons:
        reasons.append(UNUSUAL_REASON)
    if dev >= CATEGORY_HIGH_MULTIPLE or (context["merchantNovel"] and dev >= CATEGORY_FLAG_MULTIPLE):
        severity = "high"
    elif dev >= CATEGORY_FLAG_MULTIPLE or context["merchantNovel"] or float(context["velocityRatio"]) >= 2.0:
        severity = "medium"
    else:
        severity = "low"
    return reasons, severity


def _robust_contextual_mask(expenses, contexts):
    """Explainable fallback flags for sparse data (no ML).

    Flags only genuinely abnormal category behaviour: amount >= 2x the
    user's own category median (with >=2 same-category points) AND above
    the global median. Routine high-but-consistent categories (rent, bills)
    with deviation ~1.0 are never flagged. Falls back to the IQR fence
    when no category history exists.
    """
    amounts = [float(a) for a in expenses["amount"].tolist()]
    if not amounts:
        return [False] * 0
    median = float(np.median(amounts))
    iqr_mask = _iqr_high_outliers(amounts)
    mask = []
    for i, ctx in enumerate(contexts):
        if ctx["categoryMedian"] and amounts[i] > 0:
            flag = bool(ctx["categoryDeviation"] >= CATEGORY_FLAG_MULTIPLE and amounts[i] > median)
        else:
            flag = bool(iqr_mask[i]) if i < len(iqr_mask) else False
        mask.append(flag)
    # If category logic flags nothing, keep the plain IQR answer (already
    # conservative: identical amounts flag nothing).
    if not any(mask):
        return [bool(m) for m in iqr_mask]
    return mask


def detect_unusual_expenses(df, max_results=MAX_UNUSUAL):
    """
    Context-rich unusual-expense detection (explainable, deterministic).

    Features per transaction (user history only): log amount,
    category-relative deviation, merchant-description novelty,
    Asia/Dhaka day-of-week, and 7-day spending velocity.

    - 10+ expenses: IsolationForest over the context features
      (random_state=42), keeping only flags ABOVE the user's median
      expense AND with abnormal category behaviour (>= 2x category
      median) — so routine rent/bills are never flagged for amount alone.
    - < 10 expenses: robust contextual fallback (same 2x-category rule,
      else IQR fence). Sparse data stays silent rather than guessing.
    - No expenses / income-only: always an empty list (never crash).
    Each item keeps the legacy `reason` plus `reasons`, `anomalyScore`
    and `severity`, with `detectionMethod` of
    "contextual_isolation_forest" or "robust_contextual_fallback".
    """
    if df is None or len(df) == 0 or "type" not in df.columns:
        return []
    expenses = df[df["type"] == "expense"].copy()
    if expenses.empty:
        return []

    # Newest first — the dashboard should show recent surprises at the top.
    expenses = expenses.sort_values("date", ascending=False).reset_index(drop=True)
    amounts = [float(a) for a in expenses["amount"].tolist()]
    median = float(np.median(amounts)) if amounts else 0.0
    matrix, contexts = _context_features(expenses)

    method = "robust_contextual_fallback"
    mask = _robust_contextual_mask(expenses, contexts)
    scores = [0.5 if m else 0.0 for m in mask]

    if len(expenses) >= MIN_EXPENSES_FOR_IFOREST:
        try:
            model = IsolationForest(contamination=0.15, random_state=42)
            labels = model.fit_predict(matrix)
            raw_scores = model.decision_function(matrix)  # higher = more normal
            # Normalise to anomalyScore in [0, 1] (higher = more anomalous).
            lo, hi = float(np.min(raw_scores)), float(np.max(raw_scores))
            span = (hi - lo) if (hi - lo) > 1e-9 else 1.0
            scores = [round(float((hi - s) / span), 4) for s in raw_scores]
            mask = [
                bool(label == -1 and amt > median and ctx["categoryDeviation"] >= CATEGORY_FLAG_MULTIPLE)
                for label, amt, ctx in zip(labels, amounts, contexts)
            ]
            method = "contextual_isolation_forest"
            if not any(mask):
                # ML found nothing contextual: stay silent (no amount-only flags).
                scores = [float(s) for s in scores]
        except Exception:
            mask = _robust_contextual_mask(expenses, contexts)
            scores = [0.75 if m else 0.0 for m in mask]
            method = "robust_contextual_fallback"

    unusual = []
    for is_flagged, score, ctx, (_, row) in zip(mask, scores, contexts, expenses.iterrows()):
        if not is_flagged:
            continue
        category = _safe_str(row.get("category"))
        reasons, severity = _explain_anomaly(float(row["amount"]), category, ctx)
        unusual.append(
            {
                "date": pd.Timestamp(row["date"]).strftime("%Y-%m-%d"),
                "category": category,
                "amount": float(row["amount"]),
                "description": _safe_str(row.get("description")),
                "detectionMethod": method,
                "reason": reasons[0],
                "reasons": reasons,
                "anomalyScore": float(score),
                "severity": severity,
            }
        )
        if len(unusual) >= max_results:
            break
    return unusual


def build_ml_insights(df, festival_dates=None):
    """
    Build the full `mlInsights` object for the API response.

    Input: the already-cleaned transactions DataFrame from main.py
    (numeric `amount`, UTC datetime `date`). Never crashes: every edge case
    (income-only, expense-only, one week, zeros, no expenses) yields a valid,
    honestly-labelled result.

    `festival_dates` is an optional configurable calendar override
    (list of {name, start, end}); None uses the maintained default
    Bangladesh calendar in patterns.py. Dates are handled in Asia/Dhaka.

    The production forecast trains ONLY on all historical weeks before
    the forecast horizon. The `evaluation` block separately retrains on
    the truncated training period and scores the untouched final 4-week
    holdout, so held-out future values never leak into any training fit.
    """
    history = build_weekly_history(df)
    historical_weeks = int(len(history))
    has_enough = historical_weeks >= MIN_WEEKS_FOR_MODEL

    if has_enough:
        model_used = "linear_regression"
        quality_message = (
            f"Linear regression trained on {historical_weeks} weeks of history. "
            "Treat forecasts as rough estimates, not financial advice."
        )
    else:
        model_used = "historical_average_fallback"
        quality_message = (
            "Using historical-average fallback because fewer than 4 weeks "
            "of data are available."
        )

    income_vals = history["income"].tolist() if not history.empty else []
    expense_vals = history["expense"].tolist() if not history.empty else []

    pred_income, income_method = _forecast_series(income_vals)
    pred_expense, expense_method = _forecast_series(expense_vals)
    # The reported method is the honest one: regression only when BOTH series
    # had enough history (which is exactly when has_enough is true).
    if not has_enough:
        assert income_method == expense_method == "historical_average_fallback"

    if not history.empty:
        last_monday = pd.Timestamp(history["weekStart"].max())
    else:
        # Defensive: should not happen (main.py rejects empty data), but
        # anchor on the current Monday instead of crashing.
        now_utc = pd.Timestamp.now(tz="UTC").normalize()
        last_monday = now_utc - pd.to_timedelta(now_utc.weekday(), unit="D")

    horizon_starts = [
        (last_monday + pd.to_timedelta(7 * (i + 1), unit="D")).strftime("%Y-%m-%d")
        for i in range(HORIZON_WEEKS)
    ]

    # --- Salary + festival pattern signals (user history only) ---
    try:
        salary = _patterns.detect_salary_pattern(df)
    except Exception:
        salary = {
            "salaryPatternDetected": False,
            "estimatedPaydayDayOfMonth": None,
            "salaryEvidenceCount": 0,
            "typicalSalaryAmount": None,
        }
    try:
        fest_mult, fest_sig = _patterns.estimate_festival_adjustment(
            history, horizon_starts, festival_dates
        )
    except Exception:
        fest_mult, fest_sig = {"income": 1.0, "expense": 1.0}, {
            "festivalAdjustmentApplied": False,
            "festivalReason": "Festival estimation unavailable for this data.",
            "festivalEvidenceWeeks": 0,
        }
    pattern_signals = {**salary, **fest_sig}

    # Apply learned festival multipliers ONLY to horizon weeks overlapping
    # a festival window (never a blanket claim like "everyone gets Eid bonus").
    try:
        _cal = _patterns.parse_festival_calendar(festival_dates)
        _flags = _patterns._festival_week_flags(horizon_starts, _cal)
    except Exception:
        _flags = [None] * HORIZON_WEEKS
    adj_income, adj_expense = list(pred_income), list(pred_expense)
    if fest_sig.get("festivalAdjustmentApplied"):
        for i, flag in enumerate(_flags):
            if flag is not None:
                adj_income[i] = max(0.0, float(adj_income[i]) * float(fest_mult.get("income", 1.0)))
                adj_expense[i] = max(0.0, float(adj_expense[i]) * float(fest_mult.get("expense", 1.0)))

    forecast_weeks = []
    for i in range(HORIZON_WEEKS):
        week_start = horizon_starts[i]
        inc = round(float(adj_income[i]), 2)
        exp = round(float(adj_expense[i]), 2)
        net = round(float(inc - exp), 2)
        level, _ = assess_weekly_risk(inc, exp)
        forecast_weeks.append(
            {
                "weekStart": week_start,
                "predictedIncome": inc,
                "predictedExpense": exp,
                "estimatedNetCashflow": net,
                "risk": level,
            }
        )

    total_pred_income = round(float(sum(adj_income)), 2)
    total_pred_expense = round(float(sum(adj_expense)), 2)
    overall_level, overall_reason = assess_weekly_risk(
        total_pred_income, total_pred_expense
    )

    # --- Honest temporal evaluation (leakage-safe, final holdout only) ---
    try:
        evaluation = _evaluation.evaluate_history(history)
    except Exception:
        evaluation = {
            "splitStrategy": "expanding_window_temporal_split",
            "finalHoldoutWeeks": HORIZON_WEEKS,
            "eligible": False,
            "reason": "Evaluation unavailable for this data.",
            "linearRegression": None,
            "historicalAverageBaseline": None,
            "winner": "insufficient_data",
        }

    # --- Machine-readable forecast benchmark (additive, leakage-safe) ---
    # Same chronological discipline at transaction level: every fitting /
    # baseline / feature input is sliced strictly before the holdout
    # cutoff inside evaluate_forecast_from_transactions. Never raises.
    try:
        forecast_evaluation = _evaluation.evaluate_forecast_from_transactions(
            df, horizon=HORIZON_WEEKS, festival_dates=festival_dates
        )
    except Exception:
        forecast_evaluation = {
            "splitStrategy": _evaluation.SPLIT_STRATEGY_HOLDOUT,
            "horizonWeeks": HORIZON_WEEKS,
            "trainStart": None,
            "trainEnd": None,
            "testStart": None,
            "testEnd": None,
            "eligible": False,
            "reason": "Forecast evaluation unavailable for this data.",
            "linearRegression": None,
            "historicalAverageBaseline": None,
            "winner": None,
        }

    # --- Segment assignment + confidence + human-review guidance (additive) ---
    # All derived from observable evidence only (no protected attributes,
    # no PII). Never raises; falls back to low-confidence conservative state.
    try:
        import segments as _segments
        import confidence as _confidence
        n_tx = int(len(df)) if df is not None else 0
        avg_density = (n_tx / historical_weeks) if historical_weeks > 0 else 0.0
        segment = _segments.classify_case(
            historical_weeks, income_vals, expense_vals, avg_density)
        import math as _math
        vals_e = [float(v) for v in expense_vals if _math.isfinite(float(v))]
        mean_e = (sum(vals_e) / len(vals_e)) if vals_e else 0.0
        if len(vals_e) >= 2 and mean_e > 0:
            _var = sum((v - mean_e) ** 2 for v in vals_e) / len(vals_e)
            exp_cv = _math.sqrt(_var) / mean_e
        else:
            exp_cv = float("inf") if len(vals_e) >= 2 else 0.0
        holdout_err = None
        try:
            lr_block = (forecast_evaluation or {}).get("linearRegression") or {}
            holdout_err = float((lr_block.get("expense") or {}).get("mae"))
        except Exception:
            holdout_err = None
        confidence = _confidence.forecast_confidence(
            historical_weeks, exp_cv, holdout_err, mean_e,
            salary_detected=bool(pattern_signals.get("salaryPatternDetected")),
            festival_applied=bool(pattern_signals.get("festivalAdjustmentApplied")),
        )
        review = _confidence.human_review_policy(
            "insufficient_data" if historical_weeks < 8
            else ("low_confidence" if confidence.get("fallback") else "standard"))
    except Exception:
        segment = {"history_length": "unknown", "income_regularity": "unknown",
                   "spending_pattern": "unknown", "transaction_density": "unknown"}
        confidence = {"level": "low", "reasons": ["Confidence unavailable; treating as low."],
                      "fallback": True, "fallbackReason": "service_failure",
                      "reviewAction": "Review manually."}
        try:
            import confidence as _cf2
            review = _cf2.human_review_policy("service_failure")
        except Exception:
            review = {"label": "Forecast unavailable", "action": "Review manually",
                      "automatedTransferAllowed": False}

    return {
        "modelUsed": model_used,
        "dataQuality": {
            "historicalWeeks": historical_weeks,
            "hasEnoughDataForModel": bool(has_enough),
            "message": quality_message,
        },
        "forecast": {
            "horizonWeeks": HORIZON_WEEKS,
            "weeks": forecast_weeks,
        },
        "overallRisk": {
            "level": overall_level,
            "reason": overall_reason,
        },
        "unusualExpenses": detect_unusual_expenses(df),
        "evaluation": evaluation,
        "forecastEvaluation": forecast_evaluation,
        "patternSignals": pattern_signals,
        "segment": segment,
        "confidence": confidence,
        "humanReview": review,
    }
