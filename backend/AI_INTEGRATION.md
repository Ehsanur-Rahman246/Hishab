# AI Integration: Node Backend ↔ FastAPI Service

## Request flow

```text
React (5173) — NEVER talks to FastAPI directly
  │  POST /api/ai/analyze  (JWT cookie, empty body)
  ▼
Node backend (5001)
  │  1. authMiddleware verifies JWT cookie → req.user.userId
  │  2. Query MongoDB for THIS user's transactions only
  │  3. POST { userId, transactions } to FastAPI
  ▼
FastAPI (8000) — Pandas summary + Scikit-learn mlInsights, no database access
  │  returns { success, userId, summary: {...}, mlInsights: {...} }
  ▼
Node backend
  │  4. Map mlInsights.forecast.weeks -> ForecastSnapshot schema
  │     (predictedIncome→Inflow, predictedExpense→Outflow,
  │      predictedBalance = wallet balance + cumulative net cashflow)
  │  5. Save one ForecastSnapshot (dedup: refresh a snapshot < 5 min old)
  │  6. Return live analysis + savedForecastId
  ▼
React renders it; later visits read the saved copy:
  GET /api/ai/latest-insights (JWT cookie) → MongoDB → React
```

Health check follows the same proxied path:
`React → GET /api/ai/health (JWT cookie) → Node → GET FastAPI /health → Node → React`.

## Why React never talks to FastAPI directly

- **Auth lives in Node:** the browser holds an HttpOnly JWT cookie that only
  the Node backend can verify. FastAPI has no user concept — anyone who could
  reach it directly could analyze anyone's pasted-in data with no audit trail.
- **Data scoping lives in Node:** only Node decides which MongoDB rows belong
  to the caller. A direct frontend→FastAPI call would have to ship raw
  transactions from the browser, trusting the client about whose data it is.
- **One observable hop:** timeouts, 503s, and validation errors are normalized
  by Node, so the UI handles exactly one API contract.

## Why Python does not connect to MongoDB

- **Single source of truth for auth:** only Node verifies the JWT cookie and
  decides which user's data may leave the server. If Python had DB access,
  every service would need credentials, token logic, and user-scoping rules.
- **Least privilege:** the AI service is stateless — it only sees the JSON
  Node sends it for one request, then forgets it. A compromised AI container
  exposes no database credentials and no other users' data.
- **Simple to reason about:** Mongo queries, ownership checks, and field
  selection live in one place (`aiControllers.js`), so beginners can audit
  exactly what leaves the backend.

## How snapshots are saved

`POST /api/ai/analyze` persists one `ForecastSnapshot` per call:

- `weekStart` → same date; `predictedIncome` → `predictedInflow`;
  `predictedExpense` → `predictedOutflow`; ML `risk` → `shortfallRisk`
  (`low`/`medium`/`high`, anything else safely defaults to `low`).
- `estimatedNetCashflow` is a weekly **delta**, never a balance, so
  `predictedBalance` is computed cumulatively: current `Wallet.balance` +
  week-1 net, then previous balance + next week's net. Missing wallet → starts
  from `0` (analysis still succeeds).
- `modelUsed` is the honest FastAPI value (`linear_regression` or
  `historical_average_fallback`).
- **Deduplication:** if the same user already has a snapshot generated within
  the last 5 minutes, that snapshot is updated in place instead of inserting a
  duplicate. Older snapshots are never deleted, so forecast history is kept.
- The live response keeps every FastAPI field and adds `savedForecastId`.
- If the save fails after a successful analysis, the endpoint returns `500`
  (`"AI analysis succeeded, but saving the forecast failed..."`) rather than
  pretending the insight was saved. Details go to server logs only.

`GET /api/ai/latest-insights` returns `{ success: true, forecast }` with the
newest snapshot for the JWT user, or `404` when they never generated one.

## Running locally

Terminal 1 — AI service:

```powershell
cd D:\Projects\Hishab\ai-service
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2 — Node backend (needs `AI_SERVICE_URL` in `backend/.env`):

```powershell
cd D:\Projects\Hishab\backend
npm install
npm run dev
```

Terminal 3 — React frontend (needs `frontend/.env`, see `.env.example`):

```powershell
cd D:\Projects\Hishab\frontend
npm install
npm run dev
# open http://localhost:5173
```

Required env (`backend/.env`, see `.env.example` — never commit real secrets):

```text
AI_SERVICE_URL=http://127.0.0.1:8000
```

If `AI_SERVICE_URL` is missing, the backend falls back to
`http://127.0.0.1:8000` for local development.

## Testing in PowerShell

Login first and keep the auth cookie in a session (auth is a JWT cookie
named `token`, set by `POST /api/auth/login` with `{ phone, pin }`):

```powershell
# 1. Log in and store the session (cookies are kept in $s)
$s = $null
Invoke-RestMethod `
  -Uri "http://localhost:5001/api/auth/login" `
  -Method Post `
  -ContentType "application/json" `
  -Body (@{ phone = "01XXXXXXXXX"; pin = "123456" } | ConvertTo-Json) `
  -SessionVariable s
```

Health check proxy:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:5001/api/ai/health" `
  -Method Get `
  -WebSession $s
```

Analyze (note: **empty body** — userId comes from the JWT, transactions from MongoDB):

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:5001/api/ai/analyze" `
  -Method Post `
  -ContentType "application/json" `
  -Body (@{} | ConvertTo-Json) `
  -WebSession $s
```

Replace `phone`/`pin` with a real account created via `POST /api/auth/register`.

## Expected responses

Success (`200`) — the exact FastAPI analysis object plus the snapshot id:

```json
{
  "success": true,
  "userId": "671...",
  "summary": { "...": "unchanged" },
  "mlInsights": { "...": "unchanged" },
  "savedForecastId": "671..."
}
```

Latest saved forecast (`200` from `GET /api/ai/latest-insights`):

```json
{
  "success": true,
  "forecast": {
    "_id": "671...",
    "user": "671...",
    "modelUsed": "linear_regression",
    "horizonWeeks": 4,
    "generatedAt": "2026-10-02T10:00:00.000Z",
    "weeks": [
      {
        "weekStart": "2026-10-05T00:00:00.000Z",
        "predictedInflow": 20000.0,
        "predictedOutflow": 10891.33,
        "predictedBalance": 34108.67,
        "shortfallRisk": "low"
      }
    ]
  }
}
```

(`predictedBalance` = wallet balance at generation time + cumulative weekly nets.)

Failures (no stack traces are ever sent to clients):

| Situation | Status | Body |
| --------- | ------ | ---- |
| Not logged in (no/invalid JWT cookie) | `401` | `{ "success": false, "message": "Unauthorized. Please log in first" }` |
| User has zero transactions | `400` | `{ "success": false, "message": "Add at least one transaction before generating AI insights." }` |
| FastAPI down / timed out (>10s) | `503` | `{ "success": false, "message": "AI service is currently unavailable. Please try again later." }` |
| FastAPI rejects the data | `400`/`422` | `{ "success": false, "message": "<clean forwarded message>" }` |
| Never generated insights | `404` (latest-insights) | `{ "success": false, "message": "No saved insights yet. Generate your first AI insight..." }` |
| Save failed after analysis | `500` | `{ "success": false, "message": "AI analysis succeeded, but saving the forecast failed..." }` |

## Files

| File | Purpose |
| ---- | ------- |
| `src/controllers/aiControllers.js` | `analyzeTransactions` (+ snapshot save), `getLatestInsights`, `askCoach`, `checkAiHealth`, timeout + error mapping |
| `src/services/geminiCoachService.js` | Gemini SDK calls, strict system prompt, JSON validation (never sees DB code) |
| `src/middleware/rateLimit.js` | `coachRateLimit`: 10 questions / 10 min per user |
| `src/routes/aiRoutes.js` | `GET /health`, `POST /analyze`, `GET /latest-insights`, `POST /coach` (all behind `authMiddleware`) |
| `src/server.js` | mounts router at `/api/ai` |
| `.env.example` | documents `AI_SERVICE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL` (placeholders only, no real secrets) |
| `../frontend/src/pages/AiInsightsPage.jsx` | “AI Financial Insights” dashboard (live + saved data) |
| `../frontend/src/components/ai/` | `RiskBadge`, `OverallRiskCard`, `ForecastSection`, `UnusualExpenses`, `DataQualityNotice`, `InsightsSkeleton`, `AiCoach` |
| `../frontend/src/hooks/useAiInsights.js` | react-query hooks (cookie-auth axios client in `lib/api.js`, Taka formatting in `lib/format.js`) |
| `../frontend/src/hooks/useAiCoach.js` | `useAskCoach` mutation (`POST /api/ai/coach`) |

## AI Coach (Gemini, bilingual)

Secure flow — React never calls Gemini, the key never leaves the backend:

```text
React "Ask Hishab AI" (JWT cookie, { message, language })
  ▼
Node POST /api/ai/coach (auth → coachRateLimit → askCoach)
  │  1. Validate message (≤500 chars) + language (auto/bn/en)
  │  2. Build trusted context: totals, top-5 categories, latest snapshot,
  │     5 largest recent expenses (honestly labelled, NOT ML flags),
  │     active goals, last 8 chat messages — never raw transactions or PII
  │  3. Gemini (system prompt + structured JSON) → server-side validation
  │  4. Save user + assistant texts to ChatMessage (validated only)
  ▼
React renders headline / answer / action cards / disclaimer
```

Local Gemini setup (`backend/.env` — real values stay local, never committed):

```text
GEMINI_API_KEY=... (your own key)
GEMINI_MODEL=...  (your selected model)
```

Without both variables the endpoint returns `503` (not configured).

Language selection: `bn` forces Bangla, `en` forces English (server rejects
Bangla-contaminated English replies with `502`), `auto` (default) matches the
message — Bangla→`bn`, English→`en`, Banglish→`mixed`. The UI selector offers
Auto / বাংলা / English with matching starter prompts.

Rate limit: 10 questions per 10 minutes per user → `429` with a bilingual
“wait a few minutes” message (Bangla + English in one string).

Privacy: only aggregates cross the Gemini boundary — no transaction list, no
emails/phones/passwords/tokens/secrets. Chat history stores message texts only.

Limitation: generated explanations may be imperfect — they interpret rough
forecasts, not live balances, and are estimates, not financial advice. The
model is instructed to say when data is too thin and to give at most 3 actions.

Test after logging in (`$s` session as above):

```powershell
# English
Invoke-RestMethod `
  -Uri "http://localhost:5001/api/ai/coach" `
  -Method Post -ContentType "application/json" -WebSession $s `
  -Body (@{ message = "Where am I spending the most this month?"; language = "en" } | ConvertTo-Json)

# Bangla (needs Bangla-capable shell font to read; JSON is UTF-8)
Invoke-RestMethod `
  -Uri "http://localhost:5001/api/ai/coach" `
  -Method Post -ContentType "application/json" -WebSession $s `
  -Body (@{ message = "আমার আর্থিক ঝুঁকি কতটুকু?"; language = "bn" } | ConvertTo-Json)
```
