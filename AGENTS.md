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

- `src/App.tsx` — root component; composes the landing sections, the studio toolbar,
  guided demo, composer, output panel, and review dialog from `src/components/`.
- CSS is imported in `src/main.tsx`, and that order is the cascade: `app-shell.css` (which
  `@import`s `ui-effects.css`), `fonts.css` (self-hosted fonts from `src/fonts/`, OFL),
  `styles.css`, `responsive.css`, `theme.css` (legacy component styles), `tokens.css` (every
  design token, defined once), `bridge.css`, `landing.css`, `landing-v3.css`,
  `landing-canvas.css`, `theme-editorial.css` (editorial component overrides), `panels.css`.
  Add tokens to `tokens.css` only; do not redefine a token in another file.
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