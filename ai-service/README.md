# Hishab AI Service (Foundation)

Small Python microservice built with **FastAPI + Pandas**.

It does **not** connect to MongoDB. The Node backend (port `5001`) sends
authenticated users' transaction JSON here for summarization.

No Scikit-learn, no LLM API in this step — just validation + Pandas stats.

## Files

| File | Purpose |
| ---- | ------- |
| `main.py` | FastAPI app: `GET /health`, `POST /analyze-transactions` |
| `requirements.txt` | Python dependencies |
| `.env.example` | Example env vars (copy to `.env`) |

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

Expected response shape (numbers will match your data):

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
  }
}
```

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
