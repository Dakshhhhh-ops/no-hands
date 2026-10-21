# AGENTS.md

VoiceArchitect — Vite + React + TypeScript prototype. Dark theme, voice-first
architecture workspace.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite dev server (`vite`, opens browser) |
| `npm run build` | Production build (`vite build`) |
| `npm run preview` | Preview the production build |
| `npm run test` | Run all `tests/*.test.js` via `node --test` |
| `npm run typecheck` | Run `tsc --noEmit` against `src` + `tests` |
| `npm run lint` | Run ESLint on the project |
| `npm run test:vitest` | Run the component tests (Vitest + Testing Library) |
| `npx playwright test` | Browser tests against a production build, with axe checks |
| `npm run eval` | Score labelled instructions; add `-- --provider groq` to measure the model |

## Project layout

- `src/App.jsx` — root component. CSS is imported in `src/main.jsx` in this order:
  `styles.css`, `responsive.css`, `theme.css` (legacy utility classes), `tokens.css`,
  `bridge.css`, `app-shell.css`, `landing.css`, `landing-v3.css`, `landing-canvas.css`
  (landing sections and the workspace studio layout), `theme-editorial.css` (the
  paper/ink/vermilion palette; overrides every earlier color), `panels.css` (the
  workspace output panels, built only from theme tokens; loaded last).
- `src/components/` — React components (`.jsx`).
- `src/data/` — domain modules (`.ts` and `.js`). Mixed extension is intentional:
  `.ts` modules use `.ts` extension imports (`allowImportingTsExtensions: true` in
  `tsconfig.json`); `.js` modules import bare specifiers.
- `src/types/schema.ts` — Zod schema (single source of truth for domain types).
- `tests/` — `node --test` test files.
- `index.html` — entry point; preconnects Google Fonts and loads Instrument Sans +
  JetBrains Mono via `<link>`.

## Conventions

- Do not commit secrets or keys.
- Keep the working tree clean; only commit when explicitly asked.
- CSS files: `tokens.css` (design tokens), `app-shell.css` (shell layout), `bridge.css`
  (legacy utility scoping under `.va-app`).