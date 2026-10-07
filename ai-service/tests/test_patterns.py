# Salary + festival signal tests — deterministic, no pytest needed.
# Run: python tests/test_patterns.py  (from ai-service/)
#
# Proves: payday detection, no-evidence fallback, learned festival
# uplift, no-adjustment fallback, no-leakage, no hard-coded bonus.

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ml_service import build_ml_insights  # noqa: E402
from patterns import (  # noqa: E402
    detect_salary_pattern,
    estimate_festival_adjustment,
)

PASS = []
FAIL = []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(("PASS " if condition else "FAIL ") + name + (f" — {detail}" if detail and not condition else ""))


def frame(rows):
    df = pd.DataFrame(
        [{"type": t, "category": c, "amount": a, "date": d, "description": desc}
         for t, c, a, d, desc in rows]
    )
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True)
    return df


# --- Salary: monthly 30000 on the 28th x5 -> detected --------------------------
salary_rows = []
for stamp in ["2026-05-28T10:00:00+06:00", "2026-06-28T10:00:00+06:00",
              "2026-07-28T10:00:00+06:00", "2026-08-28T10:00:00+06:00",
              "2026-09-28T10:00:00+06:00"]:
    salary_rows.append(("income", "Salary", 30000, stamp, "Monthly Salary"))
    salary_rows.append(("expense", "Food", 400, stamp, "groceries"))
sig = detect_salary_pattern(frame(salary_rows))
check("salary: detected", sig["salaryPatternDetected"] is True, str(sig))
check("salary: payday 28", sig["estimatedPaydayDayOfMonth"] == 28, str(sig))
check("salary: evidence count 5", sig["salaryEvidenceCount"] == 5, str(sig))
check("salary: typical amount ~30000", abs((sig["typicalSalaryAmount"] or 0) - 30000) < 1e-6, str(sig))

# --- Salary: only 2 receipts -> no-evidence fallback ----------------------------
thin = frame([
    ("income", "Salary", 30000, "2026-09-28T10:00:00+06:00", "Monthly Salary"),
    ("income", "Salary", 30000, "2026-10-28T10:00:00+06:00", "Monthly Salary"),
])
sig2 = detect_salary_pattern(thin)
check("salary thin: not detected", sig2["salaryPatternDetected"] is False, str(sig2))
check("salary thin: payday None", sig2["estimatedPaydayDayOfMonth"] is None)

# --- Salary: unstable amounts -> not detected -----------------------------------
wild = frame([
    ("income", "Salary", 10000 + 20000 * (i % 3), f"2026-0{5 + i}-28T10:00:00+06:00", "Monthly Salary")
    for i in range(4)
])
sig3 = detect_salary_pattern(wild)
check("salary unstable: not detected", sig3["salaryPatternDetected"] is False, str(sig3))

# --- Salary: single-month burst (same month) -> not detected --------------------
burst = frame([
    ("income", "Salary", 30000, f"2026-09-0{d}T10:00:00+06:00", "Monthly Salary")
    for d in [1, 8, 15, 22]
])
check("salary same-month: not detected",
      detect_salary_pattern(burst)["salaryPatternDetected"] is False)

# --- Festival: learned uplift with custom calendar ------------------------------
# 10 history weeks ending 2026-08-30; two prior festival weeks with 3x spend;
# one festival window overlapping the forecast horizon.
fest_cal = [
    {"name": "Test Festival A", "start": "2026-07-06", "end": "2026-07-12"},
    {"name": "Test Festival B", "start": "2026-07-20", "end": "2026-07-26"},
    {"name": "Test Festival C", "start": "2026-08-31", "end": "2026-09-06"},
]
rows = []
base = pd.Timestamp("2026-06-01", tz="UTC")  # a Monday
fest_weeks = {5, 7}  # 0-based week indexes overlapping A and B
for i in range(10):
    monday = base + pd.Timedelta(days=7 * i)
    exp = 3000 if i in fest_weeks else 1000
    rows.append(("income", "Salary", 20000, (monday + pd.Timedelta(hours=10)).isoformat(), "salary"))
    rows.append(("expense", "Food", exp, (monday + pd.Timedelta(days=1, hours=12)).isoformat(), "weekly shop"))
fest_res = build_ml_insights(frame(rows), festival_dates=fest_cal)
ps = fest_res["patternSignals"]
check("festival: adjustment applied", ps.get("festivalAdjustmentApplied") is True, str(ps))
check("festival: evidence >= 2 weeks", (ps.get("festivalEvidenceWeeks") or 0) >= 2, str(ps))
check("festival: expense multiplier > 1",
      (ps.get("festivalExpenseMultiplier") or 1.0) > 1.0, str(ps))
check("festival: income multiplier ~1 (no invented bonus)",
      abs((ps.get("festivalIncomeMultiplier") or 1.0) - 1.0) < 0.05, str(ps))

# --- Festival: no prior evidence -> fallback with reason -------------------------
plain_rows = []
base2 = pd.Timestamp("2026-06-01", tz="UTC")
for i in range(10):
    monday = base2 + pd.Timedelta(days=7 * i)
    plain_rows.append(("income", "Salary", 20000, (monday + pd.Timedelta(hours=10)).isoformat(), "salary"))
    plain_rows.append(("expense", "Food", 1000, (monday + pd.Timedelta(days=1, hours=12)).isoformat(), "weekly shop"))
plain_res = build_ml_insights(frame(plain_rows), festival_dates=[
    {"name": "Far Future Fest", "start": "2027-01-04", "end": "2027-01-10"},
])
pps = plain_res["patternSignals"]
check("festival none: not applied", pps.get("festivalAdjustmentApplied") is False, str(pps))
check("festival none: reason present",
      isinstance(pps.get("festivalReason"), str) and len(pps["festivalReason"]) > 10,
      str(pps.get("festivalReason")))

# --- Festival: every response carries patternSignals ------------------------------
for key in ("salaryPatternDetected", "festivalAdjustmentApplied"):
    check(f"signals expose {key}", key in ps, str(sorted(ps.keys())))

# --- No-leakage: custom-calendar uplift ignores holdout/future --------------------
from ml_service import build_weekly_history  # noqa: E402

hist = build_weekly_history(frame(rows))
mult, _sig = estimate_festival_adjustment(
    hist, ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"], fest_cal)
check("no-leakage: uplift learned (expense > 1)", mult["expense"] > 1.0, str(mult))
check("no-leakage: income untouched", abs(mult["income"] - 1.0) < 0.05, str(mult))

print(f"\n{len(PASS)} passed, {len(FAIL)} failed.")
sys.exit(1 if FAIL else 0)
