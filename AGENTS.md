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

- Routes (`src/router.ts`, a small History API router; `src/Root.tsx` picks the page):
  - `/` is the landing page, `src/Landing.tsx` (hero with the product card, the loop, your own stack).
  - `/app` is the workspace, `src/App.tsx`, lazy-loaded so the landing page downloads none of it.
    Deep links: `/app?demo=guided`, `/app?sample=commerce|food|ride-share`, `/app?import=compose`.
- `src/App.tsx` — the full-screen workspace (100dvh, panels scroll on their own): the top bar
  (`components/workspace/TopBar.tsx`), the composer with a keyboard-accessible splitter
  (`Splitter.tsx`), the diagram canvas, the details drawer (`Drawer.tsx`: the selected component,
  What changed, API contract, Risks, Tasks), the guided demo as a coach card, and the review dialog.
  Its styles are `src/workspace.css`, loaded with the workspace chunk.
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