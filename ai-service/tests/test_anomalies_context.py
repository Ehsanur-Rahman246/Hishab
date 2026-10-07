# Context-rich anomaly tests — deterministic, no pytest needed.
# Run: python tests/test_anomalies_context.py  (from ai-service/)
#
# Proves the 5 required behaviours:
#  1. recurring rent NOT flagged, 2. unusual Food flagged,
#  3. novel merchant + abnormal category flagged, 4. sparse fallback,
#  5. income-only never crashes.

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ml_service import detect_unusual_expenses  # noqa: E402

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


def has_required_fields(items):
    for u in items:
        if not all(k in u for k in ("reason", "reasons", "anomalyScore", "severity", "detectionMethod")):
            return False
        if u["severity"] not in ("low", "medium", "high"):
            return False
        if u["detectionMethod"] not in ("contextual_isolation_forest", "robust_contextual_fallback"):
            return False
    return True


# --- 1. Large but recurring rent (15000 x5, consistent) is NOT flagged -----------
rent_rows = []
for i, day in enumerate(["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]):
    rent_rows.append(("expense", "Rent", 15000, f"{day}T10:00:00+00:00", "Monthly house rent"))
    rent_rows.append(("expense", "Food", 300 + 10 * i, f"{day}T12:00:00+00:00", "lunch"))
    rent_rows.append(("expense", "Transport", 150, f"{day}T13:00:00+00:00", "bus"))
rent_rows.append(("income", "Salary", 50000, "2026-10-01T09:00:00+00:00", "salary"))
rent_flags = detect_unusual_expenses(frame(rent_rows))
rent_flagged = [u for u in rent_flags if u["category"] == "Rent"]
check("rent: recurring 15000 NOT flagged", rent_flagged == [], str(rent_flags))
check("rent: schema valid when empty-or-not", has_required_fields(rent_flags))

# --- 2. Genuinely unusual high Food purchase IS flagged ---------------------------
food_rows = []
for i in range(12):
    monday = pd.Timestamp("2026-07-06", tz="UTC") + pd.Timedelta(days=7 * i)
    food_rows.append(("expense", "Food", 300, (monday + pd.Timedelta(days=1)).isoformat(), "lunch"))
    food_rows.append(("expense", "Transport", 150, (monday + pd.Timedelta(days=2)).isoformat(), "bus"))
food_rows.append(("expense", "Food", 5000, "2026-10-05T12:00:00+00:00", "fancy dinner"))
food_flags = detect_unusual_expenses(frame(food_rows))
big_food = [u for u in food_flags if u["amount"] == 5000.0]
check("food: 5000 outlier flagged", len(big_food) == 1, str(food_flags))
if big_food:
    check("food: reasons mention Food multiple",
          any("Food" in r for r in big_food[0]["reasons"]), str(big_food[0]["reasons"]))
    check("food: severity medium-or-high", big_food[0]["severity"] in ("medium", "high"), str(big_food[0]))
    check("food: legacy reason kept", isinstance(big_food[0]["reason"], str) and len(big_food[0]["reason"]) > 0)
    check("food: contextual method", big_food[0]["detectionMethod"] == "contextual_isolation_forest",
          big_food[0]["detectionMethod"])
check("food: schema valid", has_required_fields(food_flags))

# --- 3. Novel merchant + abnormal category behaviour -------------------------------
novel_rows = []
for i in range(11):
    monday = pd.Timestamp("2026-07-06", tz="UTC") + pd.Timedelta(days=7 * i)
    novel_rows.append(("expense", "Shopping", 400, (monday + pd.Timedelta(days=1)).isoformat(), "local shop"))
    novel_rows.append(("expense", "Food", 300, (monday + pd.Timedelta(days=2)).isoformat(), "lunch"))
novel_rows.append(("expense", "Shopping", 2500, "2026-10-05T12:00:00+00:00", "brand new unseen store xyz"))
novel_flags = detect_unusual_expenses(frame(novel_rows))
novel_hit = [u for u in novel_flags if u["description"] == "brand new unseen store xyz"]
check("novel: unseen merchant flagged", len(novel_hit) == 1, str(novel_flags))
if novel_hit:
    check("novel: reasons mention merchant novelty",
          any("merchant" in r.lower() for r in novel_hit[0]["reasons"]), str(novel_hit[0]["reasons"]))

# --- 4a. Sparse fallback: one clear outlier among few ------------------------------
sparse = frame([
    ("expense", "Food", 200, "2026-10-01T12:00:00+00:00", "lunch"),
    ("expense", "Food", 220, "2026-10-02T12:00:00+00:00", "lunch"),
    ("expense", "Food", 210, "2026-10-03T12:00:00+00:00", "lunch"),
    ("expense", "Food", 205, "2026-10-04T12:00:00+00:00", "lunch"),
    ("expense", "Food", 5000, "2026-10-05T12:00:00+00:00", "party"),
])
sparse_flags = detect_unusual_expenses(sparse)
check("sparse: outlier flagged via fallback",
      any(u["amount"] == 5000.0 for u in sparse_flags), str(sparse_flags))
check("sparse: fallback method label",
      all(u["detectionMethod"] == "robust_contextual_fallback" for u in sparse_flags),
      str([u.get("detectionMethod") for u in sparse_flags]))

# --- 4b. Sparse identical amounts -> silence -----------------------------------------
identical = frame([
    ("expense", "Food", 100, "2026-10-01T12:00:00+00:00", "a"),
    ("expense", "Food", 100, "2026-10-02T12:00:00+00:00", "b"),
])
check("sparse identical: nothing flagged", detect_unusual_expenses(identical) == [])

# --- 5. Income-only never crashes ------------------------------------------------------
inc_only = frame([
    ("income", "Salary", 5000, "2026-09-29T10:00:00+00:00", "pay"),
    ("income", "Other", 800, "2026-10-03T10:00:00+00:00", None),
])
check("income-only: [] no crash", detect_unusual_expenses(inc_only) == [])
check("empty df: [] no crash",
      detect_unusual_expenses(pd.DataFrame(columns=["type", "category", "amount", "date", "description"])) == [])

# --- Determinism: same input twice -> same output ----------------------------------------
twice_a = detect_unusual_expenses(frame(food_rows))
twice_b = detect_unusual_expenses(frame(food_rows))
check("anomalies deterministic", twice_a == twice_b)

print(f"\n{len(PASS)} passed, {len(FAIL)} failed.")
sys.exit(1 if FAIL else 0)
