# VoiceArchitect

VoiceArchitect is a deterministic React + Vite prototype for the WeMakeDevs × Wispr Flow challenge. It turns reviewed natural-language architecture requests into a current project model, an interactive diagram, OpenAPI views, evidence-based risks, proposed engineering tasks, and export files. It runs offline and needs no API key.

## Features

- **Voice-first input** — Dictate with Wispr Flow or type; transcription corrections handled locally
- **Interactive diagram** — Dagre layout, blast radius, cycle detection, deployment order, keyboard navigation
- **Multi-service OpenAPI 3.1** — Contract synthesis with drift detection vs requirements
- **Evidence-based risk audit** — Deterministic findings with explicit requirement foreign keys
- **Traceable engineering tasks** — Acceptance criteria, priority, requirement provenance
- **Scenario branching** — Serverless vs K8s comparison with cost/complexity deltas
- **Semantic 3-way merge** — Conflict detection with user resolution
- **Chaos engineering** — Redis/Postgres outage simulation with cascading failure modeling (Web Worker)
- **CRDT collaborative studio** — OrSet + peer cursors for real-time co-editing
- **ADR workflow** — Architecture Decision Records with multi-role governance sign-off
- **Verified exports** — ZIP bundles (artifacts, DevOps, IaC, SDK) with integrity checks
- **Dark/Light theme** — Persisted, respects system preference
- **PWA + Offline** — Service Worker caches all assets for offline demo
- **Docker ready** — One-command production deploy

## Quick Start

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The app is a single-page React app under `src/`; `index.html` is the Vite entry point.

## Verify

```sh
npm test           # 51 unit tests
npm run test:vitest  # 41 component tests (Vitest + RTL)
npm run typecheck    # TypeScript strict mode
npm run lint         # ESLint (0 errors)
npm run build        # Production build (554 kB, under 600 kB warning)
```

## Docker

```sh
# Production
docker compose up --build

# Development (hot reload)
docker compose --profile dev up --build
```

## Demo Walkthrough

1. **Load sample** — Choose Commerce Platform or Food Delivery → **Load sample**
2. **Dictate/enter instruction** — Use Wispr Flow or type; try the example cards
3. **Preview change** — Review interpretation, before/after diff, unresolved assumptions
4. **Apply** — Creates versioned, undoable history entry
5. **Explore tabs** — Diagram, API Contract, Risks, Tasks, Change Impact, Telemetry
6. **Export** — Verified ZIP (artifacts/DevOps) or standalone SVG/PNG/Mermaid
7. **Scenario compare** — Branch → Compare → Merge with conflict resolution
8. **Chaos inject** — Diagram tab → Kill Redis/Postgres → Watch graceful fallback
9. **ADR sign-off** — Open ADR modal → Approve roles → Download markdown
10. **Reload** — Command, sample choice, decisions persist via localStorage

## Architecture

```
src/
├── App.jsx                 # Root component (~900 lines, uses extracted hooks)
├── hooks/                  # 8 composable hooks
│   ├── useProjectState.ts   # Project, branches, history, merging
│   ├── useDictation.ts      # Web Speech API wrapper
│   ├── useJourney.ts        # Walkthrough progress
│   ├── useExport.ts         # All export logic
│   ├── useProposalReview.ts # Proposal dialog state
│   ├── useToast.ts          # Notifications
│   ├── useLocalStorage.ts   # Generic persistence
│   └── useTheme.ts          # Dark/Light toggle + persistence
├── components/              # 15+ components (lazy-loaded)
├── data/                    # Domain logic (pure TS/JS)
├── types/schema.ts          # Zod schema (single source of truth)
└── utils/                   # Shared utilities
```

## Testing

| Suite | Command | Tests |
|-------|---------|-------|
| Unit (Node) | `npm test` | 51 |
| Component (Vitest + RTL) | `npm run test:vitest` | 41 |
| E2E (Playwright) | `npm run test:e2e` | Demo flow, PWA, a11y |

CI runs on every push: Lint → Typecheck → Tests → Build.

## Limitations

- Wispr Flow writes into the instruction field; no direct Wispr API integration
- Command parsing uses deterministic local rules and a small transcription correction set
- OpenAPI output is derived from the demo model; not validated by a full OpenAPI validator
- Risks are deterministic findings from modeled evidence, not calibrated production telemetry
- Tasks are proposed work; not sent to GitHub/Jira
- PNG export uses browser canvas APIs; incomplete ZIP if canvas unavailable

## License

MIT — WeMakeDevs 2024 Hackathon Prototype