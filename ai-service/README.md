# Hishab AI Service (Pandas + Scikit-learn)

Small Python microservice built with **FastAPI + Pandas + Scikit-learn**.

It does **not** connect to MongoDB. The Node backend (port `5001`) sends
authenticated users' transaction JSON here for summarization and forecasting.

No LLM API — just transparent stats plus two small, explainable ML models.

## What the endpoint returns

`POST /analyze-transactions` returns two top-level objects:

| Field | How it is made | ML? |
| ----- | -------------- | --- |
| `summary` | Pandas sums/means/group-bys (totals, categories, weekly history) | No — exact calculation |
| `mlInsights.forecast` | `LinearRegression` trend on weekly totals (or historical-average fallback) | Yes / fallback |
| `mlInsights.unusualExpenses` | `IsolationForest` on expense amounts (or IQR fallback) | Yes / fallback |
| `mlInsights.overallRisk` + per-week `risk` | Fixed rules comparing predicted expense vs predicted income | No — deterministic rules |

> **New users get a fallback estimate.** With fewer than 4 weeks of history
> the forecast repeats the user's own weekly average (`modelUsed =
> "historical_average_fallback"`), and with fewer than 10 expenses the anomaly
> check uses a simple IQR rule. The response always says which method was used
> in `modelUsed`, `dataQuality`, and each item's `detectionMethod`.

## Files

| File | Purpose |
| ---- | ------- |
| `main.py` | FastAPI app: `GET /health`, `POST /analyze-transactions` (validation + `summary`) |
| `ml_service.py` | Forecasting, anomaly detection, risk rules → `mlInsights` |
| `requirements.txt` | Python dependencies |
| `.env.example` | Example env vars (copy to `.env`) |
| `tests/sample_large.json` | 23 txns / 6 weeks → exercises `linear_regression` + `isolation_forest` |
| `tests/sample_small.json` | 3 txns / 1 week → proves the average fallback works |
| `tests/sample_income_only.json` | Income only, one txn without description → proves no-expense path never crashes |
| `tests/test_ml_service.py` | 23 automated checks, no pytest needed (`python tests/test_ml_service.py`) |

## 1. Open PowerShell in this folder

```powershell
cd D:\Projects\Hishab\ai-service
```

## 2. Create and activate a virtual environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

> If activation is blocked, run once (then retry):
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

You should now see `(.venv)` at the start of your prompt.

## 3. Install requirements

```powershell
pip install -r requirements.txt
```

This installs FastAPI, Pandas, Scikit-learn, and friends (Scikit-learn pulls
in its own SciPy/NumPy dependencies automatically).

## 4. (Optional) Create your `.env` file

```powershell
Copy-Item .env.example .env
```

Defaults work without a `.env` file (`HOST=127.0.0.1`, `PORT=8000`).

## 5. Start the FastAPI server with auto-reload

```powershell
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Leave this window running. You should see something like:

```text
Uvicorn running on http://127.0.0.1:8000
```

## 6. Open Swagger docs

Open this in your browser:

```text
http://127.0.0.1:8000/docs
```

You can try both endpoints from that page.

## 7. Test `/health`

Open a **second** PowerShell window and run:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/health"
```

Expected:

```json
{
  "status": "ok",
  "service": "hishab-ai-service"
}
```

## 8. Test `/analyze-transactions`

In PowerShell, run:

```powershell
$body = @{
  userId = "example-user-id"
  transactions = @(
    @{ type = "income";  category = "Salary"; amount = 5000; date = "2026-09-29T10:00:00.000Z"; description = "Salary" },
    @{ type = "expense"; category = "Food";   amount = 250;  date = "2026-10-01T10:00:00.000Z"; description = "Lunch" },
    @{ type = "expense"; category = "Food";   amount = 150;  date = "2026-10-02T10:00:00.000Z"; description = "Dinner" }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri "http://127.0.0.1:8000/analyze-transactions" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

Expected response shape (numbers will match your data).
With only 1 week of history you get the fallback (`modelUsed =
"historical_average_fallback"`):

```json
{
  "success": true,
  "userId": "example-user-id",
  "summary": {
    "transactionCount": 3,
    "totalIncome": 5000.0,
    "totalExpense": 400.0,
    "netSavings": 4600.0,
    "topExpenseCategory": { "name": "Food", "amount": 400.0 },
    "categoryExpenses": [{ "category": "Food", "amount": 400.0 }],
    "weeklySummary": [
      { "weekStart": "2026-09-28", "income": 5000.0, "expense": 400.0 }
    ]
  },
  "mlInsights": {
    "modelUsed": "historical_average_fallback",
    "dataQuality": {
      "historicalWeeks": 1,
      "hasEnoughDataForModel": false,
      "message": "Using historical-average fallback because fewer than 4 weeks of data are available."
    },
    "forecast": {
      "horizonWeeks": 4,
      "weeks": [
        {
          "weekStart": "2026-10-05",
          "predictedIncome": 5000.0,
          "predictedExpense": 400.0,
          "estimatedNetCashflow": 4600.0,
          "risk": "low"
        }
      ]
    },
    "overallRisk": {
      "level": "low",
      "reason": "Predicted income covers predicted expenses."
    },
    "unusualExpenses": []
  }
}
```

## 9. Try the full ML path (10+ transactions across several weeks)

The bundled fixture has 23 transactions over 6 weeks, including one large
outlier (a 15000 laptop purchase), so it exercises `linear_regression` and
`isolation_forest`:

```powershell
$body = Get-Content -Raw "tests\sample_large.json"

Invoke-RestMethod `
  -Uri "http://127.0.0.1:8000/analyze-transactions" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

Expected `mlInsights` (forecast numbers move with the data, but the shape is stable):

```json
{
  "modelUsed": "linear_regression",
  "dataQuality": {
    "historicalWeeks": 6,
    "hasEnoughDataForModel": true,
    "message": "Linear regression trained on 6 weeks of history. Treat forecasts as rough estimates, not financial advice."
  },
  "forecast": {
    "horizonWeeks": 4,
    "weeks": [
      {
        "weekStart": "2026-10-12",
        "predictedIncome": 20000.0,
        "predictedExpense": 10891.33,
        "estimatedNetCashflow": 9108.67,
        "risk": "low"
      }
    ]
  },
  "overallRisk": { "level": "low", "reason": "Predicted income covers predicted expenses." },
  "unusualExpenses": [
    {
      "date": "2026-10-06",
      "category": "Shopping",
      "amount": 15000.0,
      "description": "Laptop purchase",
      "detectionMethod": "isolation_forest",
      "reason": "Amount is much higher than your usual expense pattern."
    }
  ]
}
```

Other fixtures:

```powershell
# Too little data -> fallback path (modelUsed = historical_average_fallback)
Invoke-RestMethod -Uri "http://127.0.0.1:8000/analyze-transactions" `
  -Method Post -ContentType "application/json" `
  -Body (Get-Content -Raw "tests\sample_small.json")

# No expenses at all -> unusualExpenses is [], service does not crash
Invoke-RestMethod -Uri "http://127.0.0.1:8000/analyze-transactions" `
  -Method Post -ContentType "application/json" `
  -Body (Get-Content -Raw "tests\sample_income_only.json")
```

## 10. Run the automated checks (no pytest needed)

```powershell
python tests/test_ml_service.py
```

You should see `23 passed, 0 failed.` It covers: regression vs fallback
selection, consecutive-Monday forecast weeks, non-negative clipping,
`net = income - expense`, risk-rule table, outlier flagging with cap/newest-first,
and the income-only / identical-amount edge cases.

## Error cases

| Case | HTTP status | Example |
| ---- | ----------- | ------- |
| Empty `transactions` | `400` | `{ "transactions": [] }` |
| Invalid `type` (not `income`/`expense`) | `422` | `{ "type": "gift", ... }` |
| Negative `amount` | `422` | `{ "amount": -50, ... }` |
| Missing field (e.g. no `category`) | `422` | `{ "type": "expense", "amount": 10, ... }` |
| All rows have bad `amount`/`date` | `422` | `{ "date": "not-a-date", ... }` |

Rows with an unparseable `amount`/`date` are ignored safely
(Pandas `errors="coerce"` + `dropna`) instead of crashing the server.

## Notes

- CORS allows `http://localhost:5001` so the Node backend can call this service locally.
- All numbers returned are plain JSON numbers (NumPy/Pandas types are converted with `float()` / `int()`).
- Weeks start on **Monday** (`weekStart` formatted as `YYYY-MM-DD`).
- Forecasts are rough statistical guesses from past transactions only — the
  service never sees the wallet balance, so its output is a **prediction, not
  financial advice**. Say exactly that in the demo.
- One honest quirk: a single huge purchase (e.g. a laptop) pulls the
  `LinearRegression` trend line upward, so predicted expenses can look high.
  That is expected behavior for a straight-line MVP model, and `dataQuality`
  always shows how much history the model had.
