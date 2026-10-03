# Graph Report - Hishab  (2026-10-03)

## Corpus Check
- 174 files · ~40,313 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: (none) 3, .example 3, .css 2)

## Summary
- 989 nodes · 1789 edges · 79 communities (57 shown, 22 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 127 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `68cd220c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- backend/package.json
- frontend/package.json
- dependencies
- devDependencies
- routes/transactionRoutes.js
- routes/alertRoutes.js
- lucide-react
- ForecastSection.jsx
- components.json
- dropdown-menu.jsx
- cn
- controllers/aiControllers.js
- dialog.jsx
- files/utils.js
- ai-service/ml_service.py
- hooks/useGoals.js
- compilerOptions
- RiskBadge.jsx
- energy-chip.jsx
- mongoose
- battery.jsx
- Frontend
- Hishab AI Service (Pandas + Scikit-learn)
- src/AppRoutes.jsx
- AiAssistant.jsx
- hooks/useChat.js
- hooks/useForecasts.js
- hooks/useSummaries.js
- hooks/useTransactions.js
- AI Integration: Node Backend ↔ FastAPI Service
- hooks/useWallet.js
- files/api.js
- vite.config.js
- scripts
- express
- files/summaryControllers.js
- tests/test_ml_service.py
- files/aiControllers.js
- controllers/authControllers.js
- routes/goalRoutes.js
- files/authControllers.js
- routes/summaryRoutes.js
- files/authApi.js
- routes/chatRoutes.js
- files/server.js
- files/useGoals.js
- routes/forecastRoutes.js
- files/alertRoutes.js
- TransactionIn
- dependencies
- src/server.js
- files/geminiCoachService.js
- TransactionIn
- files/useAlerts.js
- files/forecastRoutes.js
- @tanstack/react-query
- files/alertApi.js
- files/useChat.js
- files/useSummaries.js
- files/useTransactions.js
- files/useForecasts.js
- files/useWallet.js
- eslint.config.js
- files/chatControllers.js
- files/format.js
- files/rateLimit.js
- analyze_transactions
- health
- scripts
- analyze_transactions
- health
- api/api.js

## God Nodes (most connected - your core abstractions)
1. `cn()` - 95 edges
2. `AiAssistant()` - 27 edges
3. `@tanstack/react-query` - 22 edges
4. `express` - 21 edges
5. `mongoose` - 21 edges
6. `AiCoach()` - 21 edges
7. `ForecastSection()` - 18 edges
8. `AppRoutes()` - 16 edges
9. `Card()` - 16 edges
10. `CardHeader()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Files` --references--> `AiCoach()`  [INFERRED]
  backend/AI_INTEGRATION.md → frontend/src/components/ai/AiCoach.jsx
- `Files` --references--> `DataQualityNotice()`  [INFERRED]
  backend/AI_INTEGRATION.md → frontend/src/components/ai/DataQualityNotice.jsx
- `Files` --references--> `ForecastSection()`  [INFERRED]
  backend/AI_INTEGRATION.md → frontend/src/components/ai/ForecastSection.jsx
- `Files` --references--> `InsightsSkeleton()`  [INFERRED]
  backend/AI_INTEGRATION.md → frontend/src/components/ai/InsightsSkeleton.jsx
- `Files` --references--> `OverallRiskCard()`  [INFERRED]
  backend/AI_INTEGRATION.md → frontend/src/components/ai/OverallRiskCard.jsx

## Import Cycles
- None detected.

## Communities (79 total, 22 thin omitted)

### Community 0 - "backend/package.json"
Cohesion: 0.17
Nodes (11): author, description, devDependencies, nodemon, keywords, license, main, name (+3 more)

### Community 1 - "frontend/package.json"
Cohesion: 0.12
Nodes (16): name, private, type, version, @babel/core, babel-plugin-react-compiler, formik, react-hot-toast (+8 more)

### Community 2 - "dependencies"
Cohesion: 0.09
Nodes (22): dependencies, axios, @base-ui/react, class-variance-authority, clsx, formik, lucide-react, next-themes (+14 more)

### Community 3 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @babel/core, babel-plugin-react-compiler, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+5 more)

### Community 4 - "routes/transactionRoutes.js"
Cohesion: 0.16
Nodes (15): CATEGORIES, createTransaction(), deleteTransaction(), getSingleTransaction(), getTransactions(), addMoney(), getWallet(), withdrawMoney() (+7 more)

### Community 5 - "routes/alertRoutes.js"
Cohesion: 0.31
Nodes (8): deleteAlert(), getAlerts(), getOneAlert(), markAllAsRead(), markAsRead(), resolveAlert(), Alert, alertSchema

### Community 6 - "lucide-react"
Cohesion: 0.36
Nodes (6): Providers(), queryClient, Toaster(), lucide-react, next-themes, sonner

### Community 7 - "ForecastSection.jsx"
Cohesion: 0.20
Nodes (25): Files, DataQualityNotice(), ForecastSection(), InsightsSkeleton(), OverallRiskCard(), RiskBadge(), UnusualExpenses(), Card() (+17 more)

### Community 8 - "components.json"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+8 more)

### Community 9 - "dropdown-menu.jsx"
Cohesion: 0.13
Nodes (9): DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut(), DropdownMenuSubContent() (+1 more)

### Community 10 - "cn"
Cohesion: 0.11
Nodes (33): Field(), FieldContent(), FieldDescription(), FieldError(), FieldGroup(), FieldLabel(), FieldLegend(), FieldSeparator() (+25 more)

### Community 11 - "controllers/aiControllers.js"
Cohesion: 0.14
Nodes (20): AI_SERVICE_URL, analyzeTransactions(), askCoach(), buildCoachContext(), checkAiHealth(), fetchWithTimeout(), getLatestInsights(), readAiErrorMessage() (+12 more)

### Community 12 - "dialog.jsx"
Cohesion: 0.21
Nodes (9): Button(), buttonVariants, DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogOverlay(), DialogPortal() (+1 more)

### Community 14 - "ai-service/ml_service.py"
Cohesion: 0.08
Nodes (16): assess_weekly_risk(), build_ml_insights(), build_weekly_history(), detect_unusual_expenses(), _forecast_series(), _iqr_high_outliers(), _safe_str(), _week_start() (+8 more)

### Community 15 - "hooks/useGoals.js"
Cohesion: 0.21
Nodes (19): addSavings(), createGoal(), deleteGoal(), getGoal(), getGoals(), selectPlan(), updateGoal(), updateGoalStatus() (+11 more)

### Community 16 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+2 more)

### Community 17 - "RiskBadge.jsx"
Cohesion: 0.38
Nodes (5): DOTS, STYLES, Badge(), badgeVariants, class-variance-authority

### Community 18 - "energy-chip.jsx"
Cohesion: 0.38
Nodes (4): EnergyChip(), energyChipTones, energyStatTones, Stat()

### Community 19 - "mongoose"
Cohesion: 0.06
Nodes (20): Alert, alertSchema, ChatMessage, chatMessageSchema, ForecastSnapshot, forecastSnapshotSchema, weekForecastSchema, Goal (+12 more)

### Community 20 - "battery.jsx"
Cohesion: 0.60
Nodes (4): BatteryLevel(), clamp(), fillByTone, resolveTone()

### Community 21 - "Frontend"
Cohesion: 0.50
Nodes (3): Frontend, Scripts, Structure

### Community 23 - "Hishab AI Service (Pandas + Scikit-learn)"
Cohesion: 0.12
Nodes (15): 10. Run the automated checks (no pytest needed), 1. Open PowerShell in this folder, 2. Create and activate a virtual environment, 3. Install requirements, 4. (Optional) Create your `.env` file, 5. Start the FastAPI server with auto-reload, 6. Open Swagger docs, 7. Test `/health` (+7 more)

### Community 24 - "src/AppRoutes.jsx"
Cohesion: 0.06
Nodes (41): deleteAlert(), getAlert(), getAlerts(), markAlertRead(), markAllAlertsRead(), resolveAlert(), deleteAccount(), getMe() (+33 more)

### Community 25 - "AiAssistant.jsx"
Cohesion: 0.16
Nodes (25): AiCoach(), CoachAnswer(), LANGUAGES, makeId(), starterList(), STARTERS, Alert(), AlertDescription() (+17 more)

### Community 26 - "hooks/useChat.js"
Cohesion: 0.38
Nodes (7): deleteAllMessages(), deleteMessage(), getMessages(), useChatMutation(), useDeleteAllMessages(), useDeleteMessage(), useMessages()

### Community 27 - "hooks/useForecasts.js"
Cohesion: 0.42
Nodes (7): deleteForecast(), getForecast(), getForecasts(), useDeleteForecast(), useForecast(), useForecastMutation(), useForecasts()

### Community 28 - "hooks/useSummaries.js"
Cohesion: 0.36
Nodes (9): deleteSummary(), generateSummary(), getSummaries(), getSummary(), useDeleteSummary(), useGenerateSummary(), useSummaries(), useSummary() (+1 more)

### Community 29 - "hooks/useTransactions.js"
Cohesion: 0.36
Nodes (9): createTransaction(), deleteTransaction(), getTransaction(), getTransactions(), useCreateTransaction(), useDeleteTransaction(), useTransaction(), useTransactionMutation() (+1 more)

### Community 30 - "AI Integration: Node Backend ↔ FastAPI Service"
Cohesion: 0.20
Nodes (9): AI Coach (Gemini, bilingual), AI Integration: Node Backend ↔ FastAPI Service, Expected responses, How snapshots are saved, Request flow, Running locally, Testing in PowerShell, Why Python does not connect to MongoDB (+1 more)

### Community 31 - "hooks/useWallet.js"
Cohesion: 0.44
Nodes (7): addMoney(), getWallet(), withdrawMoney(), useAddMoney(), useWallet(), useWalletMutation(), useWithdrawMoney()

### Community 33 - "vite.config.js"
Cohesion: 0.33
Nodes (4): @rolldown/plugin-babel, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 34 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, preview

### Community 35 - "express"
Cohesion: 0.11
Nodes (12): authMiddleware(), getOneMessage(), chatRouter, getOneGoal(), goalRouter, getOneSummary(), summaryRouter, transactionRouter (+4 more)

### Community 36 - "files/summaryControllers.js"
Cohesion: 0.12
Nodes (5): generateSummary(), getCategoryKey(), getPeriodDates(), CATEGORIES, getSingleTransaction()

### Community 37 - "tests/test_ml_service.py"
Cohesion: 0.13
Nodes (4): frame(), monday_sequence(), frame(), monday_sequence()

### Community 38 - "files/aiControllers.js"
Cohesion: 0.18
Nodes (11): AI_SERVICE_URL, analyzeTransactions(), askCoach(), buildCoachContext(), checkAiHealth(), fetchWithTimeout(), getLatestInsights(), readAiErrorMessage() (+3 more)

### Community 39 - "controllers/authControllers.js"
Cohesion: 0.23
Nodes (12): cookieOptions, deleteAccount(), getMe(), login(), logout(), publicUser(), register(), signAndSetToken() (+4 more)

### Community 40 - "routes/goalRoutes.js"
Cohesion: 0.23
Nodes (12): addSavings(), createGoal(), deleteGoal(), getGoals(), getOneGoal(), selectPlan(), updateGoal(), updateGoalStatus() (+4 more)

### Community 41 - "files/authControllers.js"
Cohesion: 0.22
Nodes (9): cookieOptions, getMe(), login(), logout(), publicUser(), register(), signAndSetToken(), authRouter (+1 more)

### Community 42 - "routes/summaryRoutes.js"
Cohesion: 0.24
Nodes (10): deleteSummary(), generateSummary(), getCategoryKey(), getOneSummary(), getPeriodDates(), getSummaries(), categorySchema, Summary (+2 more)

### Community 43 - "files/authApi.js"
Cohesion: 0.18
Nodes (6): loginUser(), logoutUser(), registerUser(), useLogin(), useLogout(), useRegister()

### Community 44 - "routes/chatRoutes.js"
Cohesion: 0.26
Nodes (8): deleteMessage(), deleteMessages(), getMessages(), getOneMessage(), validateIdParam(), ChatMessage, chatMessageSchema, chatRouter

### Community 46 - "files/useGoals.js"
Cohesion: 0.27
Nodes (8): useAddSavings(), useCreateGoal(), useDeleteGoal(), useGoalMutation(), useSelectPlan(), useUpdateGoal(), useUpdateGoalStatus(), useUpdatePlan()

### Community 48 - "routes/forecastRoutes.js"
Cohesion: 0.27
Nodes (8): deleteForecast(), getForecasts(), getLatestForecast(), getOneForecast(), ForecastSnapshot, forecastSnapshotSchema, weekForecastSchema, forecastRouter

### Community 49 - "files/alertRoutes.js"
Cohesion: 0.22
Nodes (4): getOneAlert(), markAllAsRead(), markAsRead(), alertRouter

### Community 51 - "dependencies"
Cohesion: 0.20
Nodes (10): dependencies, bcryptjs, cookie-parser, cors, dotenv, express, express-rate-limit, @google/genai (+2 more)

### Community 52 - "src/server.js"
Cohesion: 0.22
Nodes (8): connectDB(), aiRouter, alertRouter, goalRouter, app, cookie-parser, cors, dotenv

### Community 53 - "files/geminiCoachService.js"
Cohesion: 0.24
Nodes (9): buildCoachPrompt(), cleanText(), COACH_REPLY_LANGUAGES, COACH_REQUEST_LANGUAGES, COACH_RESPONSE_SCHEMA, COACH_TONES, generateCoachReply(), parseAndValidateCoachJson() (+1 more)

### Community 57 - "files/useAlerts.js"
Cohesion: 0.33
Nodes (5): useAlertMutation(), useDeleteAlert(), useMarkAlertRead(), useMarkAllAlertsRead(), useResolveAlert()

### Community 58 - "files/forecastRoutes.js"
Cohesion: 0.29
Nodes (3): getLatestForecast(), getOneForecast(), forecastRouter

### Community 61 - "files/useChat.js"
Cohesion: 0.38
Nodes (4): deleteAllMessages(), useChatMutation(), useDeleteAllMessages(), useDeleteMessage()

### Community 62 - "files/useSummaries.js"
Cohesion: 0.38
Nodes (3): useDeleteSummary(), useGenerateSummary(), useSummaryMutation()

### Community 63 - "files/useTransactions.js"
Cohesion: 0.38
Nodes (3): useCreateTransaction(), useDeleteTransaction(), useTransactionMutation()

### Community 66 - "files/useWallet.js"
Cohesion: 0.47
Nodes (3): useAddMoney(), useWalletMutation(), useWithdrawMoney()

### Community 67 - "eslint.config.js"
Cohesion: 0.33
Nodes (5): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals

### Community 70 - "files/rateLimit.js"
Cohesion: 0.40
Nodes (4): authRateLimit, coachRateLimit, loginRateLimit, express-rate-limit

### Community 74 - "scripts"
Cohesion: 0.67
Nodes (3): scripts, dev, start

## Knowledge Gaps
- **191 isolated node(s):** `name`, `version`, `description`, `main`, `dev` (+186 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 363 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@tanstack/react-query` connect `@tanstack/react-query` to `frontend/package.json`, `lucide-react`, `hooks/useGoals.js`, `src/AppRoutes.jsx`, `AiAssistant.jsx`, `hooks/useChat.js`, `hooks/useForecasts.js`, `hooks/useSummaries.js`, `hooks/useTransactions.js`, `hooks/useWallet.js`, `files/authApi.js`, `files/useGoals.js`, `files/useAlerts.js`, `files/useChat.js`, `files/useSummaries.js`, `files/useTransactions.js`, `files/useForecasts.js`, `files/useWallet.js`, `api/api.js`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `ForecastSection.jsx`, `dropdown-menu.jsx`, `dialog.jsx`, `RiskBadge.jsx`, `energy-chip.jsx`, `battery.jsx`, `AiAssistant.jsx`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `express` connect `express` to `backend/package.json`, `routes/transactionRoutes.js`, `routes/alertRoutes.js`, `files/aiControllers.js`, `controllers/authControllers.js`, `routes/goalRoutes.js`, `files/authControllers.js`, `routes/summaryRoutes.js`, `controllers/aiControllers.js`, `routes/chatRoutes.js`, `files/server.js`, `routes/forecastRoutes.js`, `files/alertRoutes.js`, `src/server.js`, `files/forecastRoutes.js`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _191 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `frontend/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `components.json` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._