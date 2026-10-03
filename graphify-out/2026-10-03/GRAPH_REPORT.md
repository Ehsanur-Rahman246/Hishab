# Graph Report - Hishab  (2026-10-03)

## Corpus Check
- 63 files · ~11,411 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .example 2, .css 1)

## Summary
- 377 nodes · 672 edges · 23 communities (22 shown, 1 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 55 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dfa601a4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.js
- frontend/package.json
- dependencies
- devDependencies
- authControllers.js
- alertRoutes.js
- card.jsx
- cn
- components.json
- dropdown-menu.jsx
- field.jsx
- goalRoutes.js
- dialog.jsx
- utils.js
- summaryRoutes.js
- forecastRoutes.js
- compilerOptions
- alert.jsx
- energy-chip.jsx
- tabs.jsx
- battery.jsx
- Frontend

## God Nodes (most connected - your core abstractions)
1. `cn()` - 92 edges
2. `@base-ui/react` - 12 edges
3. `express` - 10 edges
4. `mongoose` - 10 edges
5. `authMiddleware()` - 9 edges
6. `compilerOptions` - 9 edges
7. `Button()` - 8 edges
8. `validateIdParam()` - 7 edges
9. `App()` - 7 edges
10. `aliases` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Structure` --references--> `cn()`  [INFERRED]
  frontend/README.md → frontend/src/lib/utils.js
- `AlertTitle()` --calls--> `cn()`  [EXTRACTED]
  frontend/src/components/ui/alert.jsx → frontend/src/lib/utils.js
- `AlertDescription()` --calls--> `cn()`  [EXTRACTED]
  frontend/src/components/ui/alert.jsx → frontend/src/lib/utils.js
- `CardDescription()` --calls--> `cn()`  [EXTRACTED]
  frontend/src/components/ui/card.jsx → frontend/src/lib/utils.js
- `CardAction()` --calls--> `cn()`  [EXTRACTED]
  frontend/src/components/ui/card.jsx → frontend/src/lib/utils.js

## Import Cycles
- None detected.

## Communities (23 total, 1 thin omitted)

### Community 0 - "server.js"
Cohesion: 0.06
Nodes (33): author, dependencies, bcryptjs, cookie-parser, cors, dotenv, express, express-rate-limit (+25 more)

### Community 1 - "frontend/package.json"
Cohesion: 0.07
Nodes (32): name, private, scripts, build, dev, lint, preview, type (+24 more)

### Community 2 - "dependencies"
Cohesion: 0.09
Nodes (22): dependencies, axios, @base-ui/react, class-variance-authority, clsx, formik, lucide-react, next-themes (+14 more)

### Community 3 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @babel/core, babel-plugin-react-compiler, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+5 more)

### Community 4 - "authControllers.js"
Cohesion: 0.09
Nodes (29): cookieOptions, deleteAccount(), login(), logout(), publicUser(), register(), signAndSetToken(), CATEGORIES (+21 more)

### Community 5 - "alertRoutes.js"
Cohesion: 0.14
Nodes (17): deleteAlert(), getAlerts(), getOneAlert(), markAllAsRead(), markAsRead(), resolveAlert(), createMessage(), deleteMessage() (+9 more)

### Community 6 - "card.jsx"
Cohesion: 0.14
Nodes (17): App(), Providers(), queryClient, Card(), CardAction(), CardContent(), CardDescription(), CardFooter() (+9 more)

### Community 7 - "cn"
Cohesion: 0.18
Nodes (19): SelectContent(), SelectGroup(), SelectItem(), SelectLabel(), SelectScrollDownButton(), SelectScrollUpButton(), SelectSeparator(), SelectTrigger() (+11 more)

### Community 8 - "components.json"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+8 more)

### Community 9 - "dropdown-menu.jsx"
Cohesion: 0.13
Nodes (9): DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut(), DropdownMenuSubContent() (+1 more)

### Community 10 - "field.jsx"
Cohesion: 0.17
Nodes (13): Field(), FieldContent(), FieldDescription(), FieldError(), FieldGroup(), FieldLabel(), FieldLegend(), FieldSeparator() (+5 more)

### Community 11 - "goalRoutes.js"
Cohesion: 0.23
Nodes (12): addSavings(), createGoal(), deleteGoal(), getGoals(), getOneGoal(), selectPlan(), updateGoal(), updateGoalStatus() (+4 more)

### Community 12 - "dialog.jsx"
Cohesion: 0.21
Nodes (9): Button(), buttonVariants, DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogOverlay(), DialogPortal() (+1 more)

### Community 13 - "utils.js"
Cohesion: 0.18
Nodes (8): Input(), Progress(), Switch(), Textarea(), TooltipContent(), @base-ui/react, clsx, tailwind-merge

### Community 14 - "summaryRoutes.js"
Cohesion: 0.24
Nodes (10): deleteSummary(), generateSummary(), getCategoryKey(), getOneSummary(), getPeriodDates(), getSummaries(), categorySchema, Summary (+2 more)

### Community 15 - "forecastRoutes.js"
Cohesion: 0.26
Nodes (9): createForecast(), deleteForecast(), getForecasts(), getLatestForecast(), getOneForecast(), ForecastSnapshot, forecastSnapshotSchema, weekForecastSchema (+1 more)

### Community 16 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, jsx, lib, module, moduleResolution, noEmit, paths, skipLibCheck (+2 more)

### Community 17 - "alert.jsx"
Cohesion: 0.28
Nodes (7): Alert(), AlertDescription(), AlertTitle(), alertVariants, Badge(), badgeVariants, class-variance-authority

### Community 18 - "energy-chip.jsx"
Cohesion: 0.38
Nodes (4): EnergyChip(), energyChipTones, energyStatTones, Stat()

### Community 19 - "tabs.jsx"
Cohesion: 0.40
Nodes (5): Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger()

### Community 20 - "battery.jsx"
Cohesion: 0.60
Nodes (4): BatteryLevel(), clamp(), fillByTone, resolveTone()

### Community 21 - "Frontend"
Cohesion: 0.50
Nodes (3): Frontend, Scripts, Structure

## Knowledge Gaps
- **115 isolated node(s):** `name`, `version`, `description`, `main`, `dev` (+110 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 129 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `card.jsx`, `dropdown-menu.jsx`, `field.jsx`, `dialog.jsx`, `utils.js`, `alert.jsx`, `energy-chip.jsx`, `tabs.jsx`, `battery.jsx`, `Frontend`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `frontend/package.json`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `@base-ui/react` connect `utils.js` to `frontend/package.json`, `cn`, `dropdown-menu.jsx`, `field.jsx`, `dialog.jsx`, `alert.jsx`, `tabs.jsx`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _115 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06190476190476191 - nodes in this community are weakly interconnected._
- **Should `frontend/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._