# Basic checks for ml_service.py — no pytest needed.
#
# Run from the ai-service folder (with requirements installed):
#   python tests/test_ml_service.py
#
# The script builds small DataFrames that look exactly like the cleaned data
# main.py produces (numeric `amount`, UTC datetime `date`), then asserts the
# mlInsights contract: shapes, methods, fallbacks, and edge cases.

import sys
from pathlib import Path

import pandas as pd

# Allow `import ml_service` when running from inside tests/ or ai-service/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ml_service import (  # noqa: E402
    assess_weekly_risk,
    build_ml_insights,
    build_weekly_history,
)

PASS = []
FAIL = []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(("PASS " if condition else "FAIL ") + name + (f" — {detail}" if detail and not condition else ""))


def frame(rows):
    """Mimic main.py's cleaned DataFrame for a list of (type, category, amount, date, desc)."""
    df = pd.DataFrame(
        [
            {"type": t, "category": c, "amount": a, "date": d, "description": desc}
            for t, c, a, d, desc in rows
        ]
    )
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True)
    return df


def monday_sequence(start, weeks):
    """Monday 00:00 UTC timestamps, one per week."""
    base = pd.Timestamp(start, tz="UTC")
    return [base + pd.Timedelta(days=7 * i) for i in range(weeks)]


# --- Scenario 1: rich history -> LinearRegression + IsolationForest --------
rich_rows = []
for i, monday in enumerate(monday_sequence("2026-08-31", 6)):
    stamp = monday + pd.Timedelta(hours=10)
    rich_rows.append(("income", "Salary", 20000, stamp.isoformat(), "pay"))
    rich_rows.append(("expense", "Food", 300 + 20 * i, (monday + pd.Timedelta(days=1)).isoformat(), "food"))
    rich_rows.append(("expense", "Transport", 150, (monday + pd.Timedelta(days=2)).isoformat(), "bus"))
rich_rows.append(("expense", "Shopping", 15000, "2026-10-06T15:00:00+00:00", "Laptop purchase"))

rich = build_ml_insights(frame(rich_rows))
check("rich: modelUsed is linear_regression", rich["modelUsed"] == "linear_regression", rich["modelUsed"])
check("rich: 6 historical weeks, enough data",
      rich["dataQuality"]["historicalWeeks"] == 6 and rich["dataQuality"]["hasEnoughDataForModel"] is True)
check("rich: 4 forecast weeks", len(rich["forecast"]["weeks"]) == 4)
check("rich: forecast weeks are consecutive Mondays",
      [w["weekStart"] for w in rich["forecast"]["weeks"]] == ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"],
      str([w["weekStart"] for w in rich["forecast"]["weeks"]]))
check("rich: no negative predictions",
      all(w["predictedIncome"] >= 0 and w["predictedExpense"] >= 0 for w in rich["forecast"]["weeks"]))
check("rich: net = income - expense",
      all(abs(w["estimatedNetCashflow"] - round(w["predictedIncome"] - w["predictedExpense"], 2)) < 1e-9
          for w in rich["forecast"]["weeks"]))
check("rich: overallRisk level valid", rich["overallRisk"]["level"] in ("low", "medium", "high"))
check("rich: outlier flagged (<=5, newest first, has reason)",
      1 <= len(rich["unusualExpenses"]) <= 5
      and rich["unusualExpenses"][0]["amount"] == 15000.0
      and all("reason" in u and "detectionMethod" in u for u in rich["unusualExpenses"]),
      str(rich["unusualExpenses"]))

# --- Scenario 2: one week -> historical-average fallback + IQR -------------
small = build_ml_insights(frame([
    ("income", "Salary", 5000, "2026-09-29T10:00:00+00:00", "pay"),
    ("expense", "Food", 250, "2026-10-01T12:00:00+00:00", "lunch"),
    ("expense", "Food", 150, "2026-10-02T12:00:00+00:00", "dinner"),
]))
check("small: fallback method", small["modelUsed"] == "historical_average_fallback", small["modelUsed"])
check("small: 1 week, not enough data",
      small["dataQuality"]["historicalWeeks"] == 1 and small["dataQuality"]["hasEnoughDataForModel"] is False)
check("small: fallback repeats weekly average expense (400)",
      all(w["predictedExpense"] == 400.0 for w in small["forecast"]["weeks"]),
      str([w["predictedExpense"] for w in small["forecast"]["weeks"]]))
check("small: small regular expenses not flagged", small["unusualExpenses"] == [], str(small["unusualExpenses"]))

# --- Scenario 3: income only -> no crash, no unusual, low risk -------------
inc_only = build_ml_insights(frame([
    ("income", "Salary", 5000, "2026-09-29T10:00:00+00:00", "pay"),
    ("income", "Other", 800, "2026-10-03T10:00:00+00:00", None),  # missing description
    ("income", "Salary", 5000, "2026-10-06T10:00:00+00:00", "pay"),
]))
check("income-only: no crash, unusual is []", inc_only["unusualExpenses"] == [])
check("income-only: predicted expenses are 0",
      all(w["predictedExpense"] == 0.0 for w in inc_only["forecast"]["weeks"]))
check("income-only: overall risk low", inc_only["overallRisk"]["level"] == "low")

# --- Scenario 4: expense only, single identical amounts -> no crash ---------
exp_only = build_ml_insights(frame([
    ("expense", "Food", 100, "2026-10-01T12:00:00+00:00", "a"),
    ("expense", "Food", 100, "2026-10-02T12:00:00+00:00", "b"),
]))
check("expense-only identical: fallback + nothing flagged",
      exp_only["modelUsed"] == "historical_average_fallback" and exp_only["unusualExpenses"] == [])
check("expense-only: overall risk high (expense, no income)",
      exp_only["overallRisk"]["level"] == "high", exp_only["overallRisk"]["level"])

# --- Unit: risk rules -------------------------------------------------------
check("risk: 0/0 -> low", assess_weekly_risk(0, 0)[0] == "low")
check("risk: 0 income + expense -> high", assess_weekly_risk(0, 50)[0] == "high")
check("risk: covered -> low", assess_weekly_risk(1000, 500) == ("low", "Predicted income covers predicted expenses."))
check("risk: close -> medium", assess_weekly_risk(1000, 900)[0] == "medium")
check("risk: over -> high", assess_weekly_risk(1000, 1200) == ("high", "Predicted expenses exceed predicted income."))

# --- Unit: weekly history helper -------------------------------------------
hist = build_weekly_history(frame([
    ("income", "Salary", 100, "2026-09-29T10:00:00+00:00", "x"),
    ("expense", "Food", 40, "2026-09-30T10:00:00+00:00", "y"),
]))
check("history: one Monday bucket with income+expense",
      len(hist) == 1 and hist.iloc[0]["income"] == 100.0 and hist.iloc[0]["expense"] == 40.0,
      str(hist.to_dict("records")))

print(f"\n{len(PASS)} passed, {len(FAIL)} failed.")
sys.exit(1 if FAIL else 0)
