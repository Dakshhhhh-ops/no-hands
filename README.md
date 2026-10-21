# VoiceArchitect

Architecture diagrams go stale because updating them is slow. VoiceArchitect starts from your real docker-compose file, and you describe changes in plain language, typed or dictated. A language model (Groq or Claude) turns each request into a short list of explicit operations. A deterministic applier checks every operation against the current model and the Zod schema, so nothing reaches the diagram, API contract, risks, or tasks until you have reviewed the exact diff.

Without an API key the app still runs, using a small set of offline rules.

## Features

- **Import docker-compose** — Builds the starting diagram from your real services, `depends_on`, and connection strings in environment variables
- **Spoken or typed changes, validated before they apply** — A model (Groq `openai/gpt-oss-120b` on the free tier, or Claude) turns each request into explicit operations. Every operation is checked against the current model and the Zod schema; invalid ones are skipped and shown, never applied. You review the exact before/after diff, and every applied change can be undone
- **Check against code** — Compare the diagram with a newer docker-compose file. New services, retired services, image changes, and new connections become one reviewable sync; components planned in the diagram but not built yet are reported, kept, and shown dashed as "planned"

### Also included

- Interactive diagram: layout, blast radius, cycle detection, deployment order, keyboard navigation
- OpenAPI 3.1 contract derived only from the model's API operations
- Risks with the facts behind each finding, and fixes you choose and review in one step
- Engineering tasks with acceptance criteria and requirement provenance
- Topology tab: components by type, recorded protocols, and checks for referential integrity, cycles, isolated components, and open requirements
- Branches with computed comparison and a semantic three-way merge
- Outage simulator, labeled simulated: cascades come from component types and connections, numbers from stated assumptions
- ADR drafts generated from each change, with sign-off pending until a reviewer marks it
- Exports: artifact ZIP, DevOps ZIP (Terraform and Kubernetes scaffolding, TypeScript client), SVG, PNG, Mermaid
- Light and dark themes, offline PWA, Docker image

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
npm test             # 82 unit tests
npm run test:vitest  # 54 component tests (Vitest + RTL)
npm run typecheck    # TypeScript strict mode
npm run lint         # ESLint, 0 problems
npm run build        # Production build
npx playwright test  # 9 browser tests against the production build
```

## Deploy

Production runs a small Node server that serves the built app and the interpretation API routes (`/api/status` and `/api/interpret`). Pass the key (`GROQ_API_KEY` or `ANTHROPIC_API_KEY`) as an environment variable at run time; it is never baked into the image or the browser bundle.

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

1. **Load a system** — **Import docker-compose** with your own file, **Try example stack**, or **Load sample**. Later, **Check against code** with a newer compose file (or **Try example update**) to sync the diagram with what changed
2. **Enter instruction** — Type or dictate; try the example cards
3. **Preview change** — Review interpretation, before/after diff, unresolved assumptions
4. **Apply** — Creates versioned, undoable history entry
5. **Explore tabs** — Diagram, API contract, Risks, Tasks, What changed, Topology
6. **Export** — Verified ZIP (artifacts/DevOps) or standalone SVG/PNG/Mermaid
7. **Branches** — Fork this version → apply a change → Compare with main → Merge to main
8. **Outage simulator** — Diagram tab → More tools → take down the cache or database (simulated)
9. **ADR draft** — Diagram tab → More tools → ADR Sign-Off → mark roles approved → Download markdown
10. **Reload** — Command, sample choice, decisions persist via localStorage

## Architecture

```
src/
├── App.jsx                  # Root component: landing page and the workspace studio
├── main.jsx                 # Entry point and CSS load order
├── hooks/                   # 14 hooks
│   ├── useProjectState.ts    # Project, branches, history, merging
│   ├── useProposalReview.ts  # Interpretation, review dialog, apply
│   ├── useDictation.ts       # Web Speech API wrapper
│   ├── useExport.ts          # ZIP, SVG, PNG, and Mermaid exports
│   ├── useDialog.ts          # Focus, Escape, and stacking for every modal
│   ├── useJourney.ts         # Walkthrough progress
│   ├── useChaosWorker.ts     # Outage simulation in a Web Worker
│   └── ...                   # Theme, toast, storage, motion, scroll
├── components/              # Workspace panels (lazy-loaded) and dialogs
│   └── landing/             # Landing page sections
├── data/                    # Domain logic, pure TS/JS: compose import, drift check,
│                            # operations applier, risks and fixes, OpenAPI, exports
├── types/schema.ts          # Zod schema (single source of truth)
└── utils/                   # Sound cues
server/                      # /api/status and /api/interpret (Groq or Claude)
```

## Testing

| Suite | Command | Tests |
|-------|---------|-------|
| Unit (Node) | `npm test` | 82 |
| Component (Vitest + RTL) | `npm run test:vitest` | 54 |
| E2E (Playwright) | `npm run test:e2e` | 9 |

CI runs on every push: Lint → Typecheck → Tests → Build.

## Limitations

- Claude interpretation needs the Node server (`npm run dev`, `npm run preview`, `npm start`, or the Docker image); static-only hosting runs on offline rules
- Offline mode understands only a handful of request patterns; full understanding needs a model key
- OpenAPI output is derived from the demo model; not validated by a full OpenAPI validator
- Risks are deterministic findings from modeled evidence, not calibrated production telemetry
- Tasks are proposed work; not sent to GitHub/Jira
- PNG export uses browser canvas APIs; incomplete ZIP if canvas unavailable

## License

MIT. Prototype built for a WeMakeDevs hackathon, October 2026.