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

import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression

# --- Tunables (kept as named constants so beginners can find them) ---
HORIZON_WEEKS = 4          # how many future weeks to forecast
MIN_WEEKS_FOR_MODEL = 4    # need at least this many history weeks for LinearRegression
MIN_EXPENSES_FOR_IFOREST = 10  # need at least this many expenses for IsolationForest
MAX_UNUSUAL = 5            # never return more unusual transactions than this

UNUSUAL_REASON = "Amount is much higher than your usual expense pattern."


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


def detect_unusual_expenses(df, max_results=MAX_UNUSUAL):
    """
    Find at most `max_results` unusual EXPENSE transactions, newest first.

    - 10+ expenses: IsolationForest on the amount, keeping only flags ABOVE
      the user's median expense (cheap anomalies are not "unusual spending").
    - < 10 expenses: IQR upper-fence fallback (explainable, no ML).
    - No expenses: always an empty list (never crash).
    Each item carries a plain-English `reason` for the dashboard.
    """
    expenses = df[df["type"] == "expense"].copy()
    if expenses.empty:
        return []

    # Newest first — the dashboard should show recent surprises at the top.
    expenses = expenses.sort_values("date", ascending=False).reset_index(drop=True)
    amounts = [float(a) for a in expenses["amount"].tolist()]

    import numpy as np

    median = float(np.median(amounts))
    method = "iqr_fallback"
    mask = _iqr_high_outliers(amounts)  # safe default for every path below

    if len(expenses) >= MIN_EXPENSES_FOR_IFOREST:
        try:
            model = IsolationForest(contamination=0.15, random_state=42)
            labels = model.fit_predict([[a] for a in amounts])
            # label -1 = anomaly; keep only genuinely large ones.
            mask = [
                bool(label == -1 and amount > median)
                for label, amount in zip(labels, amounts)
            ]
            method = "isolation_forest"
        except Exception:
            # Any ML hiccup -> explainable IQR fallback, never a crash.
            mask = _iqr_high_outliers(amounts)
            method = "iqr_fallback"

    unusual = []
    for is_flagged, (_, row) in zip(mask, expenses.iterrows()):
        if not is_flagged:
            continue
        unusual.append(
            {
                "date": pd.Timestamp(row["date"]).strftime("%Y-%m-%d"),
                "category": _safe_str(row.get("category")),
                "amount": float(row["amount"]),
                "description": _safe_str(row.get("description")),
                "detectionMethod": method,
                "reason": UNUSUAL_REASON,
            }
        )
        if len(unusual) >= max_results:
            break
    return unusual


def build_ml_insights(df):
    """
    Build the full `mlInsights` object for the API response.

    Input: the already-cleaned transactions DataFrame from main.py
    (numeric `amount`, UTC datetime `date`). Never crashes: every edge case
    (income-only, expense-only, one week, zeros, no expenses) yields a valid,
    honestly-labelled result.
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

    forecast_weeks = []
    for i in range(HORIZON_WEEKS):
        week_start = (last_monday + pd.to_timedelta(7 * (i + 1), unit="D")).strftime(
            "%Y-%m-%d"
        )
        inc = round(float(pred_income[i]), 2)
        exp = round(float(pred_expense[i]), 2)
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

    total_pred_income = round(float(sum(pred_income)), 2)
    total_pred_expense = round(float(sum(pred_expense)), 2)
    overall_level, overall_reason = assess_weekly_risk(
        total_pred_income, total_pred_expense
    )

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
    }
