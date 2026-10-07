# Goal Savings Automation

Safe, automatic, priority-based transfers between the in-app Wallet balance
and Goal balances. Deterministic rules only — no LLM, no bank/bKash/Nagad/
card/SMS/email integration. The AI Coach explains plans but can never move
money.

## Architecture

```text
node-cron (Asia/Dhaka)            authenticated user (demo)
  daily 00:15 ──► releases         POST /api/goals/automation/run-now
  Sun 00:05 ────► weekly cycle       releases + currently-due cycle
  1st 00:10 ───► monthly cycle       (same idempotency + atomicity)
        │                                │
        ▼                                ▼
  src/services/goalAutomationService.js (only place that moves auto money)
        │ per-goal MongoDB transaction (session/withTransaction):
        │  Wallet -$x  +  Goal +$x  +  GoalTransfer  +  Transaction  (+ Alert on release)
        ▼
  GoalTransfer ledger (immutable audit trail, never auto-deleted)
```

Files:

| File | Purpose |
| ---- | ------- |
| `src/models/Goal.js` | `automation { enabled, frequency, percentage, priority, paused, lastProcessedCycle, enabledAt }`, `status` gains `released`, plus `releasedAt`/`releasedAmount` |
| `src/models/GoalTransfer.js` | immutable ledger `{ user, goal, type, amount, cycleKey, walletBalanceBefore/After }`, unique index on `(user, goal, type, cycleKey)` |
| `src/services/goalAutomationService.js` | cycle keys, priority ordering, atomic contribution/release, per-user + all-user runners |
| `src/jobs/goalAutomationJob.js` | node-cron schedules (Asia/Dhaka), in-process overlap guard, no work at import time |
| `src/controllers/goalControllers.js` | create/update/automation/transfers/run-now handlers + validation |
| `src/routes/goalRoutes.js` | route wiring |
| `src/server.js` | `registerGoalAutomationJobs()` after DB connect |
| `src/controllers/aiControllers.js` | Coach context gains compact automation + latest transfers + wallet balance |
| `src/services/groqCoachService.js` | system rule: Coach explains automation, never executes transfers |

## Cycle definitions (Asia/Dhaka, UTC+6, no DST)

- Weekly key: ISO week on the Dhaka wall date, `YYYY-Www` (e.g. `2026-W40`).
- Monthly key: `YYYY-MM` on the Dhaka wall date (e.g. `2026-10`).
- Release key: `release-YYYY-MM-DD` (Dhaka date of execution).
- Weekly job (Sun 00:05) processes the **previous** week (`key(now - 1 day)`).
- Monthly job (1st 00:10) processes the **previous** month.
- Release job (daily 00:15) releases every goal with `targetDate <= now`.
- `POST /api/goals/automation/run-now` processes **releases + the current**
  weekly/monthly cycle for the JWT user only (demo/testing).

## Priority rules

Per cycle, per user:

1. Snapshot wallet once (`initialWalletBalance`).
2. Eligible goals: `status active`, `automation.enabled`, not `paused`,
   valid frequency/percentage/priority — sorted by `priority` ascending
   (1 first), oldest first on ties.
3. `planned = round2(initialBalance × percentage / 100)`.
4. `contribution = min(planned, targetAmount - savedAmount)`.
5. Skip (no transfer, cycle NOT locked) when: planned ≤ 0, target reached,
   `contribution > currently available wallet balance`, wallet missing.
   Lower-priority goals are still attempted after a skip.
6. Never negative wallet (guarded `$gte` check inside the transaction),
   never beyond `targetAmount`, zero amounts never move.
7. A contribution that fully funds the goal releases the full savedAmount
   back to the wallet **inside the same transaction** (early completion,
   even before `targetDate`): persisted state `released` with `completedAt`
   + `releasedAt` + `releasedAmount`, automation disabled, exactly one
   `goal_release` ledger row, one `Savings` income Transaction, one
   deduplicated alert. A fully funded goal releases its saved amount
   immediately to the wallet, even before target date, exactly once and
   atomically. Lifecycle: `active → completed → released` (`completed` is
   transient; `released` is final once money has returned).

## Duplicate prevention (three layers)

1. `Goal.automation.lastProcessedCycle` — application-level per-cycle mark,
   set only on success/duplicate (insufficient-funds skips stay retryable
   within the same cycle, e.g. after a top-up + Run now).
2. `GoalTransfer` unique index `(user, goal, type, cycleKey)` — scheduler
   restarts, endpoint retries, and multi-instance races collapse to one
   ledger row (`11000` → reported as `duplicate`, never a double deduction).
3. In-transaction re-checks (goal status, existing ledger row) inside the
   same MongoDB session, plus an in-process cron overlap guard.

Releases are once-ever per goal: a conditional `released`-status claim, a
same-day duplicate key, an any-existing-release check, and the `released`
status transition. Target-date release and early-completion release share one
release writer (`writeGoalReleaseInSession`), one `goal_release` ledger
namespace, and one alert dedupe key, so the two paths can never refund the
same goal twice — concurrent final contributions, scheduler runs, Run now,
and release-vs-delete races all collapse to a single refund.

## API

All routes require the JWT cookie (`authMiddleware`); ownership enforced
with `{ _id, user }` filters. Clients can never set `savedAmount` through
automation routes, and `released` is system-only (client `status` values:
`active | paused | cancelled | completed`).

| Method | Path | Body |
| ------ | ---- | ---- |
| POST | `/api/goals` | `title, targetAmount, targetDate, description?, automation? { enabled, frequency, percentage, priority }` |
| PATCH | `/api/goals/:id` | `title?, description?, targetAmount?, targetDate?` |
| PATCH | `/api/goals/:id/automation` | `enabled?, frequency?, percentage?, priority?, paused?` |
| PATCH | `/api/goals/:id/status` | `status: active\|paused\|cancelled\|completed` |
| GET | `/api/goals/:id/transfers` | — (newest first) |
| POST | `/api/goals/automation/run-now` | `{}` (any `userId` in body → `400`) |

Validation: target date in future for active goals; percentage must be one
of the five fixed options `5, 10, 15, 20, 25` for new/changed automations
(legacy stored values keep working and are never rewritten); priority
positive integer; frequency `weekly|monthly`; only active goals enable
automation; paused/cancelled/completed/released receive nothing.

Manual transfers: `POST /api/goals/:id/add-savings` takes
`{ amount, idempotencyKey? }` and moves Wallet → Goal inside one MongoDB
transaction (Wallet deduct + Goal credit + `manual_contribution` ledger row
+ Savings expense Transaction). Amounts above the remaining target are
capped (only what is still needed is taken). Resending the same
`idempotencyKey` returns `{ success: true, duplicate: true, transfer }`
without moving money again (unique partial index on `user + idempotencyKey`
for string keys; keyless ledger rows never collide). A contribution that
fully funds the goal releases it in the same transaction and the response
carries `{ completed: true, released: true, releasedAmount, walletBalance }`.

## Local testing (PowerShell)

```powershell
# 1. Log in, keep the cookie session
$s = $null
Invoke-RestMethod -Uri "http://localhost:5001/api/auth/login" -Method Post `
  -ContentType "application/json" `
  -Body (@{ phone = "01XXXXXXXXX"; pin = "123456" } | ConvertTo-Json) `
  -SessionVariable s

# 2. Create a weekly automated goal (priority 1, 10%)
Invoke-RestMethod -Uri "http://localhost:5001/api/goals" -Method Post `
  -ContentType "application/json" -WebSession $s `
  -Body (@{
    title = "Emergency fund"; targetAmount = 50000
    targetDate = "2027-12-31T00:00:00.000Z"
    automation = @{ enabled = $true; frequency = "weekly"; percentage = 10; priority = 1 }
  } | ConvertTo-Json -Depth 4)

# 3. Run the due cycle (demo) — repeat clicks must not double-deduct
Invoke-RestMethod -Uri "http://localhost:5001/api/goals/automation/run-now" `
  -Method Post -ContentType "application/json" -WebSession $s -Body (@{} | ConvertTo-Json)
Invoke-RestMethod -Uri "http://localhost:5001/api/goals/automation/run-now" `
  -Method Post -ContentType "application/json" -WebSession $s -Body (@{} | ConvertTo-Json)

# 4. History for one goal (second call has the goal id from step 2)
Invoke-RestMethod -Uri "http://localhost:5001/api/goals/<goalId>/transfers" `
  -Method Get -WebSession $s
```

Scenarios to verify: one weekly goal; A(10%,p1)+B(10%,p2)+C(25%,p3) on
৳10,000 → A funded ৳1,000, B funded ৳1,000, C funded ৳2,500; duplicate Run
now → `duplicate`, one ledger row per goal/cycle; past-due goal →
`released`, wallet credited once, `savings_goal` alert linking `/goals`;
 paused goal skipped; contribution capped at `targetAmount`; manual add ৳500
on ৳9,000 wallet → ৳8,500 with `manual_contribution` ledger row; final
contribution completing a goal → `released` in the same transaction with the
full saved amount back in the wallet (“Goal completed early”); Zakat
pension appears in the breakdown but never persists (page refresh clears it).

## Deployment warnings

- The scheduler only runs while the Node backend process is alive. Use a
  single long-lived process (or accept that N instances race harmlessly —
  the unique index decides the single winner).
- **MongoDB must be a replica set (or sharded cluster)** — standalone
  servers cannot do multi-document transactions. When unsupported, every
  transfer aborts with HTTP `503`
  `"MongoDB replica set is required for safe automatic goal transfers."`
  There is intentionally no non-atomic fallback.
- Timezone data: schedules use `timezone: "Asia/Dhaka"` (requires full
  ICU in Node 18+; official builds include it).
- Disable safely: set `GOAL_AUTOMATION_DISABLED=1` in `backend/.env`
  (jobs log a message and register nothing), or per-goal
  `PATCH /:id/automation { "enabled": false }` / `{ "paused": true }`.
- **Index migration (one-time):** the `GoalTransfer` idempotency index
  changed from `sparse` to a partial filter on string keys (a compound
  sparse index still indexed every row because `user` is always present, so
  any two keyless rows for one user collided). Mongoose will not replace the
  old index automatically on existing databases — drop
  `user_1_idempotencyKey_1` once so it is recreated with the new definition.
  Fresh databases (and all tests) build the correct index directly.

## Honest limitations

- Standalone MongoDB (no replica set) = automation refuses to move money.
- Cron is in-process: restarts miss nothing (next tick recomputes the same
  previous-cycle key) but a process down exactly at tick time delays that
  cycle until manual Run now.
- No catch-up for cycles older than the immediately previous one.
- Manual “Add money” deducts the wallet atomically (same-transaction
  ledger + Transaction rows); insufficient balance changes nothing.
- Rounding is to 2 decimals; sub-poisha planned amounts are skipped.
```

> Note: `backend/.env.example` gains `GOAL_AUTOMATION_DISABLED=0`
> (documented placeholder; real `.env` values stay local).
