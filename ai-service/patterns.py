# Hishab AI Service — salary-cycle + Bangladesh festival signals.
#
# TIMEZONE: all calendar math uses Asia/Dhaka. Incoming timestamps are
#   normalised to UTC first, then converted to Asia/Dhaka before extracting
#   day-of-month / week buckets. Documented here and in README/EVALUATION.
#
# SALARY DETECTION (user history only, never global assumptions):
#   - Considers income transactions only.
#   - Groups by (category, normalised description) to find recurring
#     candidates, e.g. ("Salary", "monthly salary").
#   - Evidence threshold: >= SALARY_MIN_EVIDENCE (3) repeated receipts with
#     stable amounts (each within 25% of the group median) spanning at
#     least 2 distinct calendar months.
#   - Estimates payday = modal day-of-month (Asia/Dhaka) and typical amount
#     = median. Otherwise salaryPatternDetected=false.
#
# FESTIVAL HANDLING (no hard-coded bonus claims):
#   - A maintained, documented DEFAULT_FESTIVAL_CALENDAR below covers
#     Eid-ul-Fitr, Eid-ul-Adha, Pohela Boishakh, Ramadan/Eid shopping
#     windows and Durga Puja for 2025-2026 (approximate public dates).
#   - Callers may pass configurable `festivalDates` (list of
#     {name, start, end} YYYY-MM-DD) to override/extend the calendar.
#   - The per-user uplift is LEARNED from prior matching periods only:
#     festival-week mean vs non-festival baseline mean, separately for
#     income and expense. Applied ONLY with >= FESTIVAL_MIN_EVIDENCE_WEEKS
#     (2) prior festival weeks; otherwise festivalAdjustmentApplied=false
#     with an explanatory reason.
#   - No-leakage: uplift is estimated from history weeks strictly before
#     the forecast horizon; the evaluated holdout is never used to fit it.

from __future__ import annotations

import pandas as pd

DHAKA_TZ = "Asia/Dhaka"
SALARY_MIN_EVIDENCE = 3
SALARY_AMOUNT_TOLERANCE = 0.25  # each receipt within 25% of group median
FESTIVAL_MIN_EVIDENCE_WEEKS = 2
FESTIVAL_MAX_UPLIFT = 2.0  # clamp learned multipliers to [0.25, 3.0] band
FESTIVAL_MIN_MULT = 0.25
FESTIVAL_MAX_MULT = 3.0

# Approximate public dates (maintained; override via festivalDates input).
# Windows include a few days of shopping/travel around the main day.
DEFAULT_FESTIVAL_CALENDAR = [
    {"name": "Ramadan shopping window", "start": "2025-03-01", "end": "2025-03-30"},
    {"name": "Eid-ul-Fitr", "start": "2025-03-29", "end": "2025-04-04"},
    {"name": "Pohela Boishakh", "start": "2025-04-13", "end": "2025-04-15"},
    {"name": "Eid-ul-Adha", "start": "2025-06-05", "end": "2025-06-09"},
    {"name": "Durga Puja", "start": "2025-09-28", "end": "2025-10-02"},
    {"name": "Ramadan shopping window", "start": "2026-02-18", "end": "2026-03-19"},
    {"name": "Eid-ul-Fitr", "start": "2026-03-18", "end": "2026-03-24"},
    {"name": "Pohela Boishakh", "start": "2026-04-13", "end": "2026-04-15"},
    {"name": "Eid-ul-Adha", "start": "2026-05-25", "end": "2026-05-29"},
]


def _to_dhaka(dates):
    parsed = pd.to_datetime(dates, errors="coerce", utc=True)
    return parsed.dt.tz_convert(DHAKA_TZ)


def _norm_desc(value):
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass
    return " ".join(str(value).strip().lower().split())


def parse_festival_calendar(festival_dates=None):
    """Return validated calendar entries; None -> default calendar."""
    raw = DEFAULT_FESTIVAL_CALENDAR if festival_dates is None else festival_dates
    out = []
    if not raw:
        return out
    for entry in raw:
        try:
            name = str(entry.get("name", "Festival")).strip() or "Festival"
            start = pd.Timestamp(str(entry.get("start"))).date()
            end = pd.Timestamp(str(entry.get("end"))).date()
        except Exception:
            continue
        if end < start:
            continue
        out.append({"name": name, "start": start, "end": end})
    return out


def detect_salary_pattern(df):
    """Detect the user's own salary cycle. Returns patternSignals fragment."""
    base = {
        "salaryPatternDetected": False,
        "estimatedPaydayDayOfMonth": None,
        "salaryEvidenceCount": 0,
        "typicalSalaryAmount": None,
    }
    try:
        if df is None or len(df) == 0 or "type" not in df.columns:
            return base
        inc = df[df["type"] == "income"].copy()
        if len(inc) < SALARY_MIN_EVIDENCE:
            return base
        inc["amount"] = pd.to_numeric(inc.get("amount"), errors="coerce")
        inc = inc.dropna(subset=["amount"])
        inc = inc[inc["amount"] > 0]
        if len(inc) < SALARY_MIN_EVIDENCE:
            return base
        dhaka = _to_dhaka(inc["date"])
        inc["_dom"] = dhaka.dt.day
        inc["_month"] = dhaka.dt.strftime("%Y-%m")
        inc["_cat"] = inc.get("category", "").astype(str).str.strip().str.lower()
        desc = inc.get("description", "")
        inc["_desc"] = [_norm_desc(v) for v in desc.tolist()]
        inc["_key"] = inc["_cat"] + "|" + inc["_desc"]

        best = None
        for _, group in inc.groupby("_key"):
            if len(group) < SALARY_MIN_EVIDENCE:
                continue
            median_amt = float(group["amount"].median())
            if median_amt <= 0:
                continue
            stable = all(
                abs(float(a) - median_amt) / median_amt <= SALARY_AMOUNT_TOLERANCE
                for a in group["amount"].tolist()
            )
            if not stable:
                continue
            if group["_month"].nunique() < 2:
                continue
            # Payday honesty: the modal day-of-month must concentrate
            # (>=3 receipts on that day and at least half the group).
            # Weekly payouts spread across many days have no monthly
            # payday, so they must NOT be reported as one.
            top_day_count = int((group["_dom"] == group["_dom"].mode().iloc[0]).sum())
            if top_day_count < 3 or top_day_count < (len(group) + 1) // 2:
                continue
            if best is None or len(group) > best[0]:
                best = (len(group), group, median_amt)
        if best is None:
            return base
        count, group, median_amt = best
        payday = int(group["_dom"].mode().iloc[0])
        return {
            "salaryPatternDetected": True,
            "estimatedPaydayDayOfMonth": payday,
            "salaryEvidenceCount": int(count),
            "typicalSalaryAmount": round(float(median_amt), 2),
        }
    except Exception:
        return base


def _festival_week_flags(week_starts, calendar):
    """Mark each Monday-start week as festival-affected if it overlaps a window."""
    flags = []
    for ws in week_starts:
        ws_date = pd.Timestamp(ws).date()
        week_end = ws_date + pd.Timedelta(days=6)
        hit = None
        for entry in calendar:
            if ws_date <= entry["end"] and week_end >= entry["start"]:
                hit = entry["name"]
                break
        flags.append(hit)
    return flags


def estimate_festival_adjustment(history, forecast_week_starts, festival_dates=None):
    """Learn per-user festival uplift from history; plan horizon adjustment.

    Only history weeks strictly before the forecast horizon are used
    (no leakage). Returns (multipliers_dict, signals_fragment).
    """
    no_adjust = (
        {"income": 1.0, "expense": 1.0},
        {
            "festivalAdjustmentApplied": False,
            "festivalReason": "Not enough prior festival history for this user.",
            "festivalEvidenceWeeks": 0,
        },
    )
    try:
        calendar = parse_festival_calendar(festival_dates)
        if not calendar or history is None or len(history) == 0:
            if not calendar:
                return {"income": 1.0, "expense": 1.0}, {
                    "festivalAdjustmentApplied": False,
                    "festivalReason": "No festival calendar configured.",
                    "festivalEvidenceWeeks": 0,
                }
            return no_adjust
        flags = _festival_week_flags(history["weekStart"].tolist(), calendar)
        hist = history.copy()
        hist["_festival"] = [f is not None for f in flags]
        fest = hist[hist["_festival"]]
        base = hist[~hist["_festival"]]
        if len(fest) < FESTIVAL_MIN_EVIDENCE_WEEKS or len(base) == 0:
            return no_adjust
        mult = {}
        for col in ("income", "expense"):
            f_mean = float(fest[col].mean())
            b_mean = float(base[col].mean())
            if b_mean <= 0:
                mult[col] = 1.0
            else:
                m = f_mean / b_mean
                mult[col] = float(min(FESTIVAL_MAX_MULT, max(FESTIVAL_MIN_MULT, m)))

        # Only adjust horizon weeks that actually overlap a festival window.
        horizon_flags = _festival_week_flags(list(forecast_week_starts), calendar)
        if not any(h is not None for h in horizon_flags):
            return {"income": 1.0, "expense": 1.0}, {
                "festivalAdjustmentApplied": False,
                "festivalReason": (
                    "No forecast week overlaps a festival window; "
                    "learned uplift kept off the horizon."
                ),
                "festivalEvidenceWeeks": int(len(fest)),
            }
        # If learned uplift is ~flat (<5% move), stay honest and skip.
        if abs(mult["income"] - 1.0) < 0.05 and abs(mult["expense"] - 1.0) < 0.05:
            return {"income": 1.0, "expense": 1.0}, {
                "festivalAdjustmentApplied": False,
                "festivalReason": (
                    "Prior festival weeks look similar to normal weeks "
                    "for this user (uplift under 5%)."
                ),
                "festivalEvidenceWeeks": int(len(fest)),
            }
        return mult, {
            "festivalAdjustmentApplied": True,
            "festivalReason": None,
            "festivalEvidenceWeeks": int(len(fest)),
            "festivalIncomeMultiplier": round(float(mult["income"]), 4),
            "festivalExpenseMultiplier": round(float(mult["expense"]), 4),
        }
    except Exception:
        return no_adjust
