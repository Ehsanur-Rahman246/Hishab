# Labelled anomaly-model validation — deterministic, no pytest needed.
# Run: python tests/test_anomaly_validation.py  (from ai-service/)
#
# Measures the PRODUCTION detector against INDEPENDENT ground truth:
# labels were fixed by construction rules in labelled_anomalies_v1.json
# BEFORE any detector ran, and are never passed to the detector.
# Reports TP/FP/FN + precision/recall/F1 via evaluation.score_labeled_detections.

import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import evaluation as EVAL  # noqa: E402
from ml_service import build_ml_insights, detect_unusual_expenses  # noqa: E402

PASS = []
FAIL = []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(("PASS " if condition else "FAIL ") + name + (f" — {detail}" if detail and not condition else ""))


FIXTURE_PATH = Path(__file__).resolve().parent / "labelled_anomalies_v1.json"
doc = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
cases = doc["cases"]

# --- Fixture integrity: labels exist, are boolean, and carry reasons ---------
check("fixture: dataset name pinned",
      doc["dataset"] == "synthetic_labelled_cases_v1", doc["dataset"])
check("fixture: 38 cases, 4 known anomalies",
      len(cases) == 38 and sum(1 for c in cases if c["isKnownAnomaly"]) == 4,
      f"{len(cases)} cases, {sum(1 for c in cases if c['isKnownAnomaly'])} known")
check("fixture: every case has a stable caseId + boolean label + reason",
      all(c.get("caseId") and isinstance(c.get("isKnownAnomaly"), bool)
          and isinstance(c.get("labelReason"), str) and c["labelReason"].strip()
          for c in cases))
check("fixture: caseIds unique",
      len({c["caseId"] for c in cases}) == len(cases))
check("fixture: covers rent/bills normals + 4 abnormal archetypes",
      {c["caseId"] for c in cases if c["isKnownAnomaly"]}
      == {"a-vel-01", "a-vel-02", "a-food-01", "a-shop-01"}
      and any(c["category"] == "Rent" and not c["isKnownAnomaly"] for c in cases))

# --- Run production detector on LABEL-STRIPPED transactions only --------------
label_index = {}
stripped_rows = []
for c in cases:
    key = EVAL.detection_key(
        pd.Timestamp(c["date"]).strftime("%Y-%m-%d"),
        c["category"], c["amount"], c["description"])
    label_index[key] = (c["caseId"], c["isKnownAnomaly"])
    stripped_rows.append({k: c[k] for k in ("type", "category", "amount", "date", "description")})

df = pd.DataFrame(stripped_rows)
df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True)
check("harness: stripped frame carries no labels",
      not any(col in df.columns for col in ("caseId", "isKnownAnomaly", "labelReason")),
      str(list(df.columns)))

detections = detect_unusual_expenses(df)
result = EVAL.score_labeled_detections(detections, label_index)

# --- Structured object ---------------------------------------------------------
check("result: dataset echoed", result["dataset"] == "synthetic_labelled_cases_v1")
for key in ("totalCases", "knownAnomalies", "truePositives", "falsePositives", "falseNegatives"):
    check(f"result: {key} is an int", isinstance(result[key], int), f"{key}={result[key]}")
for key in ("precision", "recall", "f1"):
    check(f"result: {key} in [0,1]", 0.0 <= result[key] <= 1.0, f"{key}={result[key]}")

# --- Measured values (computed, then pinned — deterministic) --------------------
check("measured: totalCases=38, knownAnomalies=4",
      result["totalCases"] == 38 and result["knownAnomalies"] == 4, str(result))
check("measured: TP=4, FP=0, FN=0",
      (result["truePositives"], result["falsePositives"], result["falseNegatives"]) == (4, 0, 0),
      str(result))
check("measured: precision=recall=f1=1.0",
      result["precision"] == 1.0 and result["recall"] == 1.0 and result["f1"] == 1.0,
      str(result))

# --- Cross-check PRF definitions independently -----------------------------------
tp, fp, fn = result["truePositives"], result["falsePositives"], result["falseNegatives"]
p = tp / (tp + fp)
r = tp / (tp + fn)
f1 = 2 * p * r / (p + r)
check("definitions: precision/recall/f1 match TP/FP/FN math",
      abs(result["precision"] - p) < 1e-9 and abs(result["recall"] - r) < 1e-9
      and abs(result["f1"] - f1) < 1e-9)

# --- Required behaviors ----------------------------------------------------------
flagged_ids = set()
for u in detections:
    key = EVAL.detection_key(u["date"], u["category"], u["amount"], u["description"])
    if key in label_index:
        flagged_ids.add(label_index[key][0])
rent_ids = {c["caseId"] for c in cases if c["category"] == "Rent"}
check("rent: recurring high rent never flagged for amount alone",
      len(rent_ids & flagged_ids) == 0, str(sorted(rent_ids & flagged_ids)))
check("recall: every independently labelled anomaly detected",
      {"a-vel-01", "a-vel-02", "a-food-01", "a-shop-01"} <= flagged_ids,
      str(sorted(flagged_ids)))
check("precision: no normal case flagged",
      all(label_index[EVAL.detection_key(u["date"], u["category"], u["amount"], u["description"])][1]
          for u in detections
          if EVAL.detection_key(u["date"], u["category"], u["amount"], u["description"]) in label_index))

# --- Labels never leak into production API output ---------------------------------
insights = build_ml_insights(df)
blob = json.dumps(insights, default=str)
check("privacy: no label fields in production response",
      all(token not in blob for token in ("isKnownAnomaly", "labelReason", "caseId", "a-food-01")),
      "label tokens must stay in the test fixture only")
check("privacy: detector items carry no label keys",
      all("isKnownAnomaly" not in u and "caseId" not in u for u in detections))

# --- Determinism --------------------------------------------------------------------
check("determinism: identical flags on repeat run",
      detect_unusual_expenses(df) == detections)

print(f"\n{len(PASS)} passed, {len(FAIL)} failed.")
sys.exit(1 if FAIL else 0)
