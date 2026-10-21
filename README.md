# VoiceArchitect

Architecture diagrams go stale because updating them is slow. VoiceArchitect starts from your real docker-compose file, and you describe changes in plain language, typed or dictated. A language model (Groq or Claude) turns each request into a short list of explicit operations. A deterministic applier checks every operation against the current model and the Zod schema, so nothing reaches the diagram, API contract, risks, or tasks until you have reviewed the exact diff.

Without an API key the app still runs, using a small set of offline rules.

## Features

- **Model interpretation** — Groq (`openai/gpt-oss-120b`, free tier) or Claude returns schema-constrained operations; invalid ones are skipped and shown to the reviewer, never applied
- **Import docker-compose** — Builds the starting diagram from services, `depends_on`, and connection strings in environment variables
- **Plain-language input** — Type or dictate; common transcription errors are corrected locally
- **Interactive diagram** — Dagre layout, blast radius, cycle detection, deployment order, keyboard navigation
- **Multi-service OpenAPI 3.1** — Contract synthesis with drift detection vs requirements
- **Evidence-based risk audit** — Deterministic findings with explicit requirement foreign keys
- **Traceable engineering tasks** — Acceptance criteria, priority, requirement provenance
- **Branches** — Fork your current model, try changes on the branch, compare it with main using computed metrics, then merge
- **Semantic 3-way merge** — Conflict detection with user resolution
- **Outage simulator (simulated)** — Take down any model's cache or database and see a cascade computed from component types and connections; throughput and latency come from stated assumptions, not measurement
- **ADR drafts** — Architecture Decision Records generated from each change; every sign-off starts pending until a reviewer marks it
- **Model inventory** — Component counts, connection labels, and checks for cycles, isolated components, and open requirements
- **Verified exports** — ZIP bundles (artifacts, DevOps, IaC, SDK) with integrity checks
- **Dark/Light theme** — Persisted, respects system preference
- **PWA + Offline** — Service Worker caches all assets for offline demo
- **Docker ready** — One-command production deploy

## Quick Start

```sh
npm ci
cp .env.example .env.local   # then set GROQ_API_KEY (free) or ANTHROPIC_API_KEY
npm run dev
```

The key is read only by the Vite dev and preview servers, which expose `/api/status` and `/api/interpret`. It is never bundled into the browser code. The badge under the instruction box shows which provider is active. Without a key it shows "Offline rules only" and the app falls back to the built-in rules. Groq's free tier allows about three previews a minute; a rate-limited preview is retried once and otherwise falls back to the offline rules.

Open the local URL printed by Vite. The app is a single-page React app under `src/`; `index.html` is the Vite entry point.

## Verify

```sh
npm test           # 61 unit tests
npm run test:vitest  # 43 component tests (Vitest + RTL)
npm run typecheck    # TypeScript strict mode
npm run lint         # ESLint (0 errors)
npm run build        # Production build
```

## Deploy

Production runs a small Node server that serves the built app and the Claude API routes. Pass the key (`GROQ_API_KEY` or `ANTHROPIC_API_KEY`) as an environment variable at run time; it is never baked into the image or the browser bundle.

```sh
# Without Docker
npm run build
npm start                      # reads the key from the environment or .env.local

# Docker (serves on http://localhost:8080)
GROQ_API_KEY=gsk_... docker compose up --build

# Development with hot reload
docker compose --profile dev up --build
```

Any host that runs a Docker image or a Node process works, for example Render, Railway, or Fly.io. Set `GROQ_API_KEY` in the host's secret settings. A static-only host serves the app in offline mode.

## Demo Walkthrough

1. **Load a system** — **Import docker-compose** with your own file, **Try example stack**, or **Load sample**
2. **Enter instruction** — Type or dictate; try the example cards
3. **Preview change** — Review interpretation, before/after diff, unresolved assumptions
4. **Apply** — Creates versioned, undoable history entry
5. **Explore tabs** — Diagram, API Contract, Risks, Tasks, Change Impact, Telemetry
6. **Export** — Verified ZIP (artifacts/DevOps) or standalone SVG/PNG/Mermaid
7. **Branches** — Fork this version → apply a change → Compare with main → Merge to main
8. **Outage simulator** — Diagram tab → More tools → take down the cache or database (simulated)
9. **ADR draft** — Diagram tab → More tools → ADR Sign-Off → mark roles approved → Download markdown
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
| Unit (Node) | `npm test` | 61 |
| Component (Vitest + RTL) | `npm run test:vitest` | 43 |
| E2E (Playwright) | `npm run test:e2e` | Demo flow, PWA, a11y |

CI runs on every push: Lint → Typecheck → Tests → Build.

## Limitations

- Claude interpretation needs the Node server (`npm run dev`, `npm run preview`, `npm start`, or the Docker image); static-only hosting runs on offline rules
- Offline mode understands only a handful of request patterns; full understanding needs a model key
- OpenAPI output is derived from the demo model; not validated by a full OpenAPI validator
- Risks are deterministic findings from modeled evidence, not calibrated production telemetry
- Tasks are proposed work; not sent to GitHub/Jira
- PNG export uses browser canvas APIs; incomplete ZIP if canvas unavailable

## License

MIT — WeMakeDevs 2024 Hackathon Prototype