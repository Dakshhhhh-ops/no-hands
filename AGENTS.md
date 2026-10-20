# AGENTS.md

VoiceArchitect — Vite + React + TypeScript prototype. Dark theme, voice-first
architecture workspace.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite dev server (`vite`, opens browser) |qa
| `npm run build` | Production build (`vite build`) |
| `npm run preview` | Preview the production build |
| `npm run test` | Run all `tests/*.test.js` via `node --test` |
| `npm run typecheck` | Run `tsc --noEmit` against `src` + `tests` |

## Project layout

- `src/App.jsx` — root component, CSS load order: `styles.css`, `responsive.css`,
  `theme.css` (legacy utility classes), `tokens.css`, `bridge.css`,
  `app-shell.css`.
- `src/components/` — React components (`.jsx`).
- `src/data/` — domain modules (`.ts` and `.js`). Mixed extension is intentional:
  `.ts` modules use `.ts` extension imports (`allowImportingTsExtensions: true` in
  `tsconfig.json`); `.js` modules import bare specifiers.
- `src/types/schema.ts` — Zod schema (single source of truth for domain types).
- `tests/` — `node --test` test files.
- `index.html` — entry point; preconnects Google Fonts and loads Instrument Sans +
  JetBrains Mono via `<link>`.

## Conventions

- No linter is installed. `npm run typecheck` is the only static check.
- Do not commit secrets or keys.
- Keep the working tree clean; only commit when explicitly asked.
- CSS files: `tokens.css` (design tokens), `app-shell.css` (shell layout), `bridge.css`
  (legacy utility scoping under `.va-app`).