# Frontend

React 19 + Vite + Tailwind CSS v4, with shadcn (base-nova) components in `src/components/ui`.

## Scripts

```
npm install
npm run dev      # start dev server
npm run build    # production build
npm run preview  # preview the build
npm run lint     # eslint
```

## Structure

- `src/components/ui/` — shared UI components (import as `@/components/ui/button`)
- `src/components/` — app components, `providers.jsx` (React Query, theme, toaster)
- `src/lib/utils.js` — `cn()` helper
- `src/hooks/` — custom hooks
- `src/styles/globals.css` — Tailwind, theme tokens, keyframes

Add more shadcn components with `npx shadcn@latest add <name>`.
