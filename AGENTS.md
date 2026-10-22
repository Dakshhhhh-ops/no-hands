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

- `src/App.tsx` — root component. CSS is imported in `src/main.tsx` in this order:
  `fonts.css` (self-hosted fonts from `src/fonts/`, OFL-licensed), `styles.css`, `responsive.css`, `theme.css` (legacy utility classes), `tokens.css`,
  `bridge.css`, `app-shell.css`, `landing.css`, `landing-v3.css`, `landing-canvas.css`
  (landing sections and the workspace studio layout), `theme-editorial.css` (the
  paper/ink/vermilion palette; overrides every earlier color), `panels.css` (the
  workspace output panels, built only from theme tokens; loaded last).
- `src/components/` — React components (`.tsx`, each with an exported props interface).
- `src/data/` — domain modules (`.ts`). Imports use the `.ts` extension
  (`allowImportingTsExtensions: true` in `tsconfig.json`), so Node runs them directly.
- All app code in `src/` and `server/` is strict TypeScript with no `any`; the Node unit
  tests in `tests/*.js` are plain JS.
- `src/types/schema.ts` — Zod schema (single source of truth for domain types).
- `tests/` — `node --test` unit tests (`*.test.js`), Vitest component tests (`*.test.tsx`),
  and Playwright browser tests (`*.spec.ts`, Chromium and WebKit, against a production build).
- `server/` — the production server (`serve.ts`), API routes, and `securityHeaders.ts`.
  The CSP allows only `'self'`: no inline styles or scripts, no third-party hosts.
- `index.html` — entry point. No inline styles or scripts, no external resources.

## Conventions

- Do not commit secrets or keys.
- Keep the CSP strict: no inline `<style>`/`style=""` markup (React `style` props are fine),
  no `eval`, no third-party URLs. `tests/security.spec.ts` fails on any violation.
- Keep the working tree clean; only commit when explicitly asked.
- CSS files: `tokens.css` (design tokens), `app-shell.css` (shell layout), `bridge.css`
  (legacy utility scoping under `.va-app`).