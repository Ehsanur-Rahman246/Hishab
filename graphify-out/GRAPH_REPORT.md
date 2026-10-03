# Graph Report - Hishab  (2026-10-04)

## Corpus Check
- 134 files · ~60,234 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 4, .example 3, .css 1)

## Summary
- 956 nodes · 2423 edges · 93 communities (42 shown, 51 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 104 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4e0fba38`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.js
- frontend/package.json
- dependencies
- devDependencies
- transactionRoutes.js
- alertService.js
- providers.jsx
- Card
- components.json
- Goals.jsx
- cn
- aiControllers.js
- Transactions.jsx
- marketDataService.js
- main.py
- useGoals.js
- compilerOptions
- Zakat.jsx
- AppRoutes.jsx
- formatBDT
- battery.jsx
- Frontend
- Hishab AI Service (Pandas + Scikit-learn)
- Notifications.jsx
- AiAssistant.jsx
- seedDemo.js
- Forecast.jsx
- Analytics.jsx
- Login.jsx
- authMiddleware
- Profile.jsx
- ForecastSection.jsx
- vite.config.js
- scripts
- authControllers.js
- goalRoutes.js
- routes/summaryRoutes.js
- routes/chatRoutes.js
- routes/forecastRoutes.js
- useAuth.js
- dependencies
- Settings.jsx

## God Nodes (most connected - your core abstractions)
1. `cn()` - 146 edges
2. `Button()` - 37 edges
3. `Card()` - 32 edges
4. `Skeleton()` - 29 edges
5. `Profile()` - 29 edges
6. `formatBDTWhole()` - 25 edges
7. `InsightsView()` - 25 edges
8. `Transactions()` - 24 edges
9. `Zakat()` - 24 edges
10. `lucide-react` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Files` --references--> `AiCoach()`  [INFERRED]
  backend/AI_INTEGRATION.md → frontend/src/components/ai/AiCoach.jsx
- `Files` --references--> `ForecastSection()`  [INFERRED]
  backend/AI_INTEGRATION.md → frontend/src/components/ai/ForecastSection.jsx
- `Files` --references--> `useAskCoach()`  [INFERRED]
  backend/AI_INTEGRATION.md → frontend/src/hooks/useAiCoach.js
- `Files` --references--> `DataQualityNotice()`  [INFERRED]
  backend/AI_INTEGRATION.md → frontend/src/components/ai/DataQualityNotice.jsx
- `Files` --references--> `InsightsSkeleton()`  [INFERRED]
  backend/AI_INTEGRATION.md → frontend/src/components/ai/InsightsSkeleton.jsx

## Import Cycles
- None detected.

## Communities (93 total, 51 thin omitted)

### Community 0 - "server.js"
Cohesion: 0.09
Nodes (25): author, description, devDependencies, nodemon, keywords, license, main, name (+17 more)

### Community 1 - "frontend/package.json"
Cohesion: 0.09
Nodes (24): name, private, type, version, @babel/core, babel-plugin-react-compiler, clsx, eslint (+16 more)

### Community 2 - "dependencies"
Cohesion: 0.09
Nodes (22): dependencies, axios, @base-ui/react, class-variance-authority, clsx, formik, lucide-react, next-themes (+14 more)

### Community 3 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @babel/core, babel-plugin-react-compiler, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+5 more)

### Community 4 - "transactionRoutes.js"
Cohesion: 0.16
Nodes (14): CATEGORIES, createTransaction(), deleteTransaction(), getSingleTransaction(), getTransactions(), addMoney(), getWallet(), withdrawMoney() (+6 more)

### Community 5 - "alertService.js"
Cohesion: 0.20
Nodes (15): deleteAlert(), getAlerts(), getOneAlert(), markAllAsRead(), markAsRead(), refreshAlerts(), resolveAlert(), Alert (+7 more)

### Community 6 - "providers.jsx"
Cohesion: 0.43
Nodes (5): Providers(), queryClient, Toaster(), next-themes, sonner

### Community 7 - "Card"
Cohesion: 0.45
Nodes (11): Files, DataQualityNotice(), InsightsSkeleton(), OverallRiskCard(), RiskBadge(), UnusualExpenses(), Card(), CardContent() (+3 more)

### Community 8 - "components.json"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+8 more)

### Community 9 - "Goals.jsx"
Cohesion: 0.10
Nodes (28): DropdownMenu(), DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut() (+20 more)

### Community 10 - "cn"
Cohesion: 0.09
Nodes (35): CardAction(), CardFooter(), EnergyChip(), energyChipTones, energyStatTones, Field(), FieldContent(), FieldDescription() (+27 more)

### Community 11 - "aiControllers.js"
Cohesion: 0.09
Nodes (34): AI_SERVICE_URL, analyzeTransactions(), askCoach(), buildCoachContext(), buildNoDataCoach(), checkAiHealth(), fetchWithTimeout(), getLatestInsights() (+26 more)

### Community 12 - "Transactions.jsx"
Cohesion: 0.15
Nodes (33): Button(), Dialog(), DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogOverlay(), DialogPortal() (+25 more)

### Community 13 - "marketDataService.js"
Cohesion: 0.10
Nodes (32): calculateZakatEstimate(), zakatOptions, cache, cacheGet(), cacheSet(), convertToBdt(), fetchJsonWithTimeout(), fetchLiveFxRate() (+24 more)

### Community 14 - "main.py"
Cohesion: 0.05
Nodes (14): analyze_transactions(), AnalyzeRequest, health(), TransactionIn, assess_weekly_risk(), build_ml_insights(), build_weekly_history(), detect_unusual_expenses() (+6 more)

### Community 15 - "useGoals.js"
Cohesion: 0.23
Nodes (18): addSavings(), createGoal(), deleteGoal(), getGoal(), getGoals(), selectPlan(), updateGoal(), updateGoalStatus() (+10 more)

### Community 16 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+2 more)

### Community 17 - "Zakat.jsx"
Cohesion: 0.25
Nodes (12): DOTS, STYLES, Badge(), badgeVariants, formatDate(), CURRENCIES, initialForm(), MarketBadge() (+4 more)

### Community 18 - "AppRoutes.jsx"
Cohesion: 0.14
Nodes (21): App(), AppRoutes(), PublicOnlyRoute(), AppLayout(), greetingFor(), initialsOf(), NAV, PAGE_TITLES (+13 more)

### Community 19 - "formatBDT"
Cohesion: 0.19
Nodes (15): AiInsightsPanel(), ICONS, InsightCard(), CategoryBreakdownCard(), COLORS, SpendingTrendCard(), DeltaChip(), Sparkline() (+7 more)

### Community 20 - "battery.jsx"
Cohesion: 0.60
Nodes (4): BatteryLevel(), clamp(), fillByTone, resolveTone()

### Community 21 - "Frontend"
Cohesion: 0.50
Nodes (3): Frontend, Scripts, Structure

### Community 23 - "Hishab AI Service (Pandas + Scikit-learn)"
Cohesion: 0.12
Nodes (15): 10. Run the automated checks (no pytest needed), 1. Open PowerShell in this folder, 2. Create and activate a virtual environment, 3. Install requirements, 4. (Optional) Create your `.env` file, 5. Start the FastAPI server with auto-reload, 6. Open Swagger docs, 7. Test `/health` (+7 more)

### Community 24 - "Notifications.jsx"
Cohesion: 0.16
Nodes (26): deleteAlert(), getAlert(), getAlerts(), markAlertRead(), markAllAlertsRead(), refreshAlerts(), resolveAlert(), useAlert() (+18 more)

### Community 25 - "AiAssistant.jsx"
Cohesion: 0.12
Nodes (33): AiCoach(), CoachAnswer(), LANGUAGES, makeId(), starterList(), STARTERS, Alert(), AlertDescription() (+25 more)

### Community 26 - "seedDemo.js"
Cohesion: 0.19
Nodes (18): buildAlerts(), buildGoals(), buildTxs(), DRY_RUN, dryRun(), forecastSeries(), generate(), mondayKey() (+10 more)

### Community 27 - "Forecast.jsx"
Cohesion: 0.10
Nodes (32): deleteForecast(), getForecast(), getForecasts(), useGenerateInsights(), useDeleteForecast(), useForecast(), useForecastMutation(), useForecasts() (+24 more)

### Community 28 - "Analytics.jsx"
Cohesion: 0.05
Nodes (66): api, deleteAllMessages(), deleteMessage(), getMessages(), deleteSummary(), generateSummary(), getSummaries(), getSummary() (+58 more)

### Community 29 - "Login.jsx"
Cohesion: 0.29
Nodes (12): AuthShell(), Label(), getAuthErrorMessage(), normalizePhone(), PHONE_REGEX, PIN_REGEX, validatePhone(), validatePin() (+4 more)

### Community 30 - "authMiddleware"
Cohesion: 0.17
Nodes (11): AI Coach (Groq, bilingual), AI Integration: Node Backend ↔ FastAPI Service, Expected responses, How snapshots are saved, ML alerts → Notifications, Request flow, Running locally, Testing in PowerShell (+3 more)

### Community 31 - "Profile.jsx"
Cohesion: 0.29
Nodes (10): Switch(), useGoals(), DetailLine(), initials(), MiniStat(), Profile(), RISK_LABEL, RISK_RANK (+2 more)

### Community 32 - "ForecastSection.jsx"
Cohesion: 0.40
Nodes (9): ForecastSection(), Table(), TableBody(), TableCaption(), TableCell(), TableFooter(), TableHead(), TableHeader() (+1 more)

### Community 33 - "vite.config.js"
Cohesion: 0.33
Nodes (4): @rolldown/plugin-babel, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 34 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, preview

### Community 39 - "authControllers.js"
Cohesion: 0.17
Nodes (15): cookieOptions, deleteAccount(), getMe(), login(), logout(), publicUser(), register(), signAndSetToken() (+7 more)

### Community 40 - "goalRoutes.js"
Cohesion: 0.21
Nodes (13): addSavings(), createGoal(), deleteGoal(), getGoals(), getOneGoal(), selectPlan(), updateGoal(), updateGoalStatus() (+5 more)

### Community 42 - "routes/summaryRoutes.js"
Cohesion: 0.24
Nodes (10): deleteSummary(), generateSummary(), getCategoryKey(), getOneSummary(), getPeriodDates(), getSummaries(), categorySchema, Summary (+2 more)

### Community 44 - "routes/chatRoutes.js"
Cohesion: 0.26
Nodes (8): deleteMessage(), deleteMessages(), getMessages(), getOneMessage(), validateIdParam(), ChatMessage, chatMessageSchema, chatRouter

### Community 48 - "routes/forecastRoutes.js"
Cohesion: 0.27
Nodes (8): deleteForecast(), getForecasts(), getLatestForecast(), getOneForecast(), ForecastSnapshot, forecastSnapshotSchema, weekForecastSchema, forecastRouter

### Community 50 - "useAuth.js"
Cohesion: 0.38
Nodes (8): deleteAccount(), getMe(), loginUser(), logoutUser(), registerUser(), useDeleteAccount(), useLogin(), useRegister()

### Community 51 - "dependencies"
Cohesion: 0.20
Nodes (10): dependencies, bcryptjs, cookie-parser, cors, dotenv, express, express-rate-limit, groq-sdk (+2 more)

### Community 52 - "Settings.jsx"
Cohesion: 0.31
Nodes (8): Input(), ComingSoon(), Panel(), SettingRow(), Settings(), TABS, THEMES, NumberField()

## Knowledge Gaps
- **206 isolated node(s):** `name`, `version`, `description`, `main`, `dev` (+201 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 302 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **51 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Files` connect `Card` to `ForecastSection.jsx`, `AiAssistant.jsx`, `aiControllers.js`, `authMiddleware`?**
  _High betweenness centrality (0.315) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `ForecastSection.jsx`, `Card`, `Goals.jsx`, `Transactions.jsx`, `Zakat.jsx`, `AppRoutes.jsx`, `formatBDT`, `battery.jsx`, `Frontend`, `Settings.jsx`, `Notifications.jsx`, `AiAssistant.jsx`, `Forecast.jsx`, `Analytics.jsx`, `Login.jsx`, `Profile.jsx`?**
  _High betweenness centrality (0.184) - this node is a cross-community bridge._
- **Why does `authMiddleware()` connect `authMiddleware` to `server.js`, `transactionRoutes.js`, `alertService.js`, `authControllers.js`, `Card`, `goalRoutes.js`, `routes/summaryRoutes.js`, `aiControllers.js`, `routes/chatRoutes.js`, `routes/forecastRoutes.js`?**
  _High betweenness centrality (0.184) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _206 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08620689655172414 - nodes in this community are weakly interconnected._
- **Should `frontend/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08923076923076922 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._