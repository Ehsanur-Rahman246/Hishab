# Graph Report - Hishab  (2026-10-03)

## Corpus Check
- 102 files · ~25,163 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 3, .example 3, .css 1)

## Summary
- 632 nodes · 1222 edges · 35 communities (33 shown, 2 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 99 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7edeb8c1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- backend/package.json
- frontend/package.json
- dependencies
- devDependencies
- server.js
- alertRoutes.js
- providers.jsx
- AiInsightsPage.jsx
- components.json
- dropdown-menu.jsx
- field.jsx
- aiControllers.js
- dialog.jsx
- utils.js
- main.py
- useGoals.js
- compilerOptions
- RiskBadge.jsx
- energy-chip.jsx
- button.jsx
- battery.jsx
- Frontend
- Hishab AI Service (Pandas + Scikit-learn)
- useAuth.js
- cn
- useChat.js
- @tanstack/react-query
- useSummaries.js
- useTransactions.js
- AI Integration: Node Backend ↔ FastAPI Service
- useWallet.js
- api.js
- vite.config.js
- scripts

## God Nodes (most connected - your core abstractions)
1. `cn()` - 96 edges
2. `AiInsightsPage()` - 27 edges
3. `AiCoach()` - 21 edges
4. `ForecastSection()` - 18 edges
5. `Card()` - 16 edges
6. `CardHeader()` - 16 edges
7. `CardContent()` - 16 edges
8. `Hishab AI Service (Pandas + Scikit-learn)` - 15 edges
9. `CardTitle()` - 14 edges
10. `Files` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Files` --references--> `RiskBadge()`  [INFERRED]
  backend/AI_INTEGRATION.md → frontend/src/components/ai/RiskBadge.jsx
- `Files` --references--> `AiCoach()`  [INFERRED]
  backend/AI_INTEGRATION.md → frontend/src/components/ai/AiCoach.jsx
- `Files` --references--> `DataQualityNotice()`  [INFERRED]
  backend/AI_INTEGRATION.md → frontend/src/components/ai/DataQualityNotice.jsx
- `Files` --references--> `ForecastSection()`  [INFERRED]
  backend/AI_INTEGRATION.md → frontend/src/components/ai/ForecastSection.jsx
- `Files` --references--> `InsightsSkeleton()`  [INFERRED]
  backend/AI_INTEGRATION.md → frontend/src/components/ai/InsightsSkeleton.jsx

## Import Cycles
- None detected.

## Communities (35 total, 2 thin omitted)

### Community 0 - "backend/package.json"
Cohesion: 0.07
Nodes (28): author, dependencies, bcryptjs, cookie-parser, cors, dotenv, express, express-rate-limit (+20 more)

### Community 1 - "frontend/package.json"
Cohesion: 0.10
Nodes (21): name, private, type, version, @babel/core, babel-plugin-react-compiler, eslint, @eslint/js (+13 more)

### Community 2 - "dependencies"
Cohesion: 0.09
Nodes (22): dependencies, axios, @base-ui/react, class-variance-authority, clsx, formik, lucide-react, next-themes (+14 more)

### Community 3 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @babel/core, babel-plugin-react-compiler, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+5 more)

### Community 4 - "server.js"
Cohesion: 0.06
Nodes (53): connectDB(), getLatestInsights(), createMessage(), deleteMessage(), deleteMessages(), getMessages(), getOneMessage(), createForecast() (+45 more)

### Community 5 - "alertRoutes.js"
Cohesion: 0.21
Nodes (12): deleteAlert(), getAlerts(), getOneAlert(), markAllAsRead(), markAsRead(), resolveAlert(), useAlertMutation(), useAlerts() (+4 more)

### Community 6 - "providers.jsx"
Cohesion: 0.25
Nodes (7): Providers(), queryClient, Toaster(), lucide-react, next-themes, react-dom, sonner

### Community 7 - "AiInsightsPage.jsx"
Cohesion: 0.11
Nodes (49): Files, App(), AiCoach(), CoachAnswer(), LANGUAGES, makeId(), starterList(), STARTERS (+41 more)

### Community 8 - "components.json"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+8 more)

### Community 9 - "dropdown-menu.jsx"
Cohesion: 0.13
Nodes (9): DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut(), DropdownMenuSubContent() (+1 more)

### Community 10 - "field.jsx"
Cohesion: 0.17
Nodes (13): Field(), FieldContent(), FieldDescription(), FieldError(), FieldGroup(), FieldLabel(), FieldLegend(), FieldSeparator() (+5 more)

### Community 11 - "aiControllers.js"
Cohesion: 0.06
Nodes (46): AI_SERVICE_URL, analyzeTransactions(), askCoach(), buildCoachContext(), checkAiHealth(), fetchWithTimeout(), readAiErrorMessage(), toSnapshotWeeks() (+38 more)

### Community 12 - "dialog.jsx"
Cohesion: 0.22
Nodes (7): DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogOverlay(), DialogPortal(), DialogTitle()

### Community 13 - "utils.js"
Cohesion: 0.21
Nodes (7): Input(), Progress(), Switch(), TooltipContent(), @base-ui/react, clsx, tailwind-merge

### Community 14 - "main.py"
Cohesion: 0.05
Nodes (14): analyze_transactions(), AnalyzeRequest, health(), TransactionIn, assess_weekly_risk(), build_ml_insights(), build_weekly_history(), detect_unusual_expenses() (+6 more)

### Community 15 - "useGoals.js"
Cohesion: 0.13
Nodes (12): useAddSavings(), useCreateGoal(), useDeleteGoal(), useGoalMutation(), useGoals(), useSelectPlan(), useUpdateGoal(), useUpdateGoalStatus() (+4 more)

### Community 16 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+2 more)

### Community 17 - "RiskBadge.jsx"
Cohesion: 0.43
Nodes (5): DOTS, RiskBadge(), STYLES, Badge(), badgeVariants

### Community 18 - "energy-chip.jsx"
Cohesion: 0.38
Nodes (4): EnergyChip(), energyChipTones, energyStatTones, Stat()

### Community 19 - "button.jsx"
Cohesion: 0.25
Nodes (7): buttonVariants, Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger(), class-variance-authority

### Community 20 - "battery.jsx"
Cohesion: 0.60
Nodes (4): BatteryLevel(), clamp(), fillByTone, resolveTone()

### Community 21 - "Frontend"
Cohesion: 0.50
Nodes (3): Frontend, Scripts, Structure

### Community 23 - "Hishab AI Service (Pandas + Scikit-learn)"
Cohesion: 0.12
Nodes (15): 10. Run the automated checks (no pytest needed), 1. Open PowerShell in this folder, 2. Create and activate a virtual environment, 3. Install requirements, 4. (Optional) Create your `.env` file, 5. Start the FastAPI server with auto-reload, 6. Open Swagger docs, 7. Test `/health` (+7 more)

### Community 24 - "useAuth.js"
Cohesion: 0.16
Nodes (11): ProtectedRoute(), useCurrentUser(), useDeleteAccount(), useLogin(), useLogout(), useRegister(), deleteAccount(), loginUser() (+3 more)

### Community 25 - "cn"
Cohesion: 0.29
Nodes (12): CardAction(), CardFooter(), SelectContent(), SelectGroup(), SelectItem(), SelectLabel(), SelectScrollDownButton(), SelectScrollUpButton() (+4 more)

### Community 26 - "useChat.js"
Cohesion: 0.23
Nodes (9): useChatMutation(), useCreateMessage(), useDeleteAllMessages(), useDeleteMessage(), useMessages(), createMessage(), deleteAllMessages(), deleteMessage() (+1 more)

### Community 27 - "@tanstack/react-query"
Cohesion: 0.18
Nodes (10): useCreateForecast(), useDeleteForecast(), useForecastMutation(), useForecasts(), useLatestForecast(), createForecast(), deleteForecast(), getForecasts() (+2 more)

### Community 28 - "useSummaries.js"
Cohesion: 0.21
Nodes (5): useDeleteSummary(), useGenerateSummary(), useSummaryMutation(), deleteSummary(), generateSummary()

### Community 29 - "useTransactions.js"
Cohesion: 0.21
Nodes (5): useCreateTransaction(), useDeleteTransaction(), useTransactionMutation(), createTransaction(), deleteTransaction()

### Community 30 - "AI Integration: Node Backend ↔ FastAPI Service"
Cohesion: 0.20
Nodes (9): AI Coach (Gemini, bilingual), AI Integration: Node Backend ↔ FastAPI Service, Expected responses, How snapshots are saved, Request flow, Running locally, Testing in PowerShell, Why Python does not connect to MongoDB (+1 more)

### Community 31 - "useWallet.js"
Cohesion: 0.29
Nodes (7): useAddMoney(), useWallet(), useWalletMutation(), useWithdrawMoney(), addMoney(), getWallet(), withdrawMoney()

### Community 33 - "vite.config.js"
Cohesion: 0.33
Nodes (4): @rolldown/plugin-babel, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 34 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, preview

## Knowledge Gaps
- **147 isolated node(s):** `name`, `version`, `description`, `main`, `dev` (+142 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 220 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Files` connect `AiInsightsPage.jsx` to `RiskBadge.jsx`, `aiControllers.js`, `server.js`, `AI Integration: Node Backend ↔ FastAPI Service`?**
  _High betweenness centrality (0.279) - this node is a cross-community bridge._
- **Why does `@tanstack/react-query` connect `@tanstack/react-query` to `api.js`, `frontend/package.json`, `alertRoutes.js`, `providers.jsx`, `AiInsightsPage.jsx`, `useGoals.js`, `useAuth.js`, `useChat.js`, `useSummaries.js`, `useTransactions.js`, `useWallet.js`?**
  _High betweenness centrality (0.182) - this node is a cross-community bridge._
- **Why does `authMiddleware()` connect `server.js` to `aiControllers.js`, `alertRoutes.js`, `AiInsightsPage.jsx`?**
  _High betweenness centrality (0.165) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _147 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `backend/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `frontend/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.10276679841897234 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._