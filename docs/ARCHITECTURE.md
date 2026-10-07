# Hishab architecture

## Current (implemented)
Browser (React) -> Node/Express (JWT cookie) -> MongoDB
Node loads the user's stored transactions -> POST FastAPI /analyze-transactions
-> forecast + unusual expenses -> ForecastSnapshot + deduplicated Alerts (sourceKey)
-> Groq coach (backend only, aggregates only)

- The forecast is fitted per request (LinearRegression, or historical-average
  fallback under 4 weeks). There is NO saved model artifact; `modelUsed` records the path.
- Scheduling: node-cron (in-process). Money safety: MongoDB transactions, unique
  (user, goal, type, cycleKey) ledger index, and idempotency keys.
- Data is demo/synthetic: scripts/generateDemoTransactions.js (seeded, deterministic).

## Future (NOT implemented)
MFS event -> verify signature + dedupe provider event ID -> normalize to Hishab
transaction schema -> save via Node -> request FastAPI analysis -> save forecast and
alerts -> compare later actuals with forecast; log feedback.

Durable scheduling: job record -> worker claims with expiring lease -> run goal
automation service -> mark success, or record error + retry time -> expired lease
lets another worker resume. Duplicate/money safety stays with the ledger index and DB
transaction; the lease only handles recovery after a process crash.

Not yet built: model versioning, monitoring, rollback, load/latency measurements.