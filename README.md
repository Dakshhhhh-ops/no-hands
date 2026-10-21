# VoiceArchitect

Voice keeps your architecture diagram in sync with your code.

Architecture diagrams go stale because updating them is slow. VoiceArchitect starts from your real docker-compose file. You hold your Wispr Flow hotkey and say a change, in English or Hinglish. A language model (Groq or Claude) turns it into a short list of explicit operations, a deterministic applier checks every operation against the current model and the Zod schema, and nothing reaches the diagram, API contract, risks, or tasks until you have reviewed the exact diff. When the code moves on, you check the diagram against the newer compose file.

Without an API key the app still runs, using a small set of offline rules.

## Features

- **Import docker-compose** — Builds the starting diagram from your real services, `depends_on`, and connection strings in environment variables
- **Spoken or typed changes, validated before they apply** — A model (Groq `openai/gpt-oss-120b` on the free tier, or Claude) turns each request into explicit operations. Every operation is checked against the current model and the Zod schema; invalid ones are skipped and shown, never applied. You review the exact before/after diff, and every applied change can be undone
- **Check against code** — Compare the diagram with a newer docker-compose file. New services, retired services, image changes, and new connections become one reviewable sync; components planned in the diagram but not built yet are reported, kept, and shown dashed as "planned"

### Also included

- A guided demo: one click imports an example stack and walks an English change, a Hinglish change, and a check against the next compose file
- Interactive diagram: layout, blast radius, cycle detection, deployment order, keyboard navigation
- OpenAPI 3.1 contract derived only from the model's API operations
- Risks with the facts behind each finding, and fixes you choose and review in one step
- Engineering tasks with acceptance criteria and requirement provenance
- Topology tab: components by type, recorded protocols, and checks for referential integrity, cycles, isolated components, and open requirements
- Branches with computed comparison and a semantic three-way merge
- Outage simulator, labeled simulated: cascades come from component types and connections, numbers from stated assumptions
- ADR drafts generated from each change, with sign-off pending until a reviewer marks it
- Exports: artifact ZIP, DevOps ZIP (Terraform and Kubernetes scaffolding, TypeScript client), SVG, PNG, Mermaid
- Server limits for a public deploy: per-IP rate limit, daily cap, timeout, and a badge when a preview falls back to the offline rules
- Light and dark themes, WCAG AA contrast checked with axe in the browser tests, offline PWA, Docker image

## Voice-first with Wispr Flow

[Wispr Flow](https://wisprflow.ai) is a system-wide dictation app: you hold your Wispr Flow hotkey, speak, and the text is typed into whichever field has focus. VoiceArchitect is built around that.

- **The instruction box is the hero of the page** and takes focus on load, so you can hold your hotkey and speak straight away. Dictation lands there as plain text; no Wispr code is involved.
- **English and Hinglish.** Wispr Flow supports Hinglish, and so does the interpreter: "order service ko Kafka se connect karo" becomes the same operations as "connect the order service to Kafka". Without a model key, offline rules still understand four common change shapes in both languages.
- **Follow-ups by voice.** In the review dialog, say "make it PostgreSQL instead" to revise the change, "undo that" to step back, "cancel" to discard it, or "apply" (or "haan apply karo") to apply it. Nothing applies without an explicit apply.
- **Cleanup for architecture words.** Flow's Backtrack already removes fillers and self-corrections. The app also fixes product names that dictation tends to get wrong, such as "post gres" → PostgreSQL and "rabbit mq" → RabbitMQ.
- **Command Mode works here** because the box is ordinary text: select your instruction and use Flow's Command Mode to rewrite it in place. Command Mode needs a paid Wispr Flow plan or trial.
- **Dictionary help.** One click copies the loaded model's component and technology names so you can add them to your Flow dictionary.

What is *not* integrated: the app does not call any Wispr Flow API (none is documented for web pages), does not connect to Wispr's MCP server (it is read-only, for AI clients, and does not expose dictation), and does not produce a dictionary import file (the format is undocumented). Without Wispr Flow you can type, or use the **Browser mic (fallback)** button, which uses the browser's own speech recognition. Sources for every statement are in [docs/wispr-notes.md](docs/wispr-notes.md).

## Quick Start

```sh
npm ci
cp .env.example .env.local   # then set GROQ_API_KEY (free) or ANTHROPIC_API_KEY
npm run dev
```

The key is read only by the Vite dev and preview servers, which expose `/api/status`, `/api/interpret`, and `/api/health`. It is never bundled into the browser code. The label under the instruction box shows which provider is active. Without a key it shows "Offline rules only" and the app uses the built-in rules. When a preview hits a rate limit, the daily cap, or a timeout, that preview uses the offline rules and a badge says why.

Open the local URL printed by Vite. The app is a single-page React app under `src/`; `index.html` is the Vite entry point.

## Verify

```sh
npm test             # 106 unit tests
npm run test:vitest  # 56 component tests (Vitest + RTL)
npm run typecheck    # TypeScript strict mode
npm run lint         # ESLint, 0 problems
npm run build        # Production build
npx playwright test  # 16 browser tests against the production build, including axe checks
npm run eval         # labelled instructions; add -- --provider groq to measure the model
```

## Deploy

Production runs a small Node server (`server/serve.ts`) that serves the built app and the interpretation API. Keys are read only on the server, at run time; they are never baked into the image or the browser bundle.

```sh
# Without Docker
npm ci && npm run build
npm start                      # reads the environment, or .env.local if present

# Docker (serves on http://localhost:8080)
GROQ_API_KEY=gsk_... docker compose up --build

# Development with hot reload
docker compose --profile dev up --build
```

Any host that runs a Node process or a Docker image works. Set these as environment variables or secrets on the host:

| Variable | Default | Purpose |
|---|---|---|
| `GROQ_API_KEY` | none | Groq key. Without any key the app runs on the offline rules. |
| `ANTHROPIC_API_KEY` | none | Claude key, used when no Groq key is set or `VOICEARCHITECT_PROVIDER=anthropic`. |
| `VOICEARCHITECT_PROVIDER` | auto | `groq`, `anthropic`, or `offline` to ignore keys. |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Groq model id. |
| `VOICEARCHITECT_RATE_PER_MINUTE` | `6` | Model previews per client IP per minute. |
| `VOICEARCHITECT_DAILY_CAP` | `300` | Model previews per UTC day across all clients. |
| `VOICEARCHITECT_TIMEOUT_MS` | `45000` | Longest a preview may take before it falls back. |
| `VOICEARCHITECT_MAX_BODY_KB` | `256` | Largest accepted request body. |
| `VOICEARCHITECT_TRUST_PROXY` | off | Set to `1` behind a reverse proxy so limits use the `X-Forwarded-For` client address. |
| `PORT` | `8080` | Port for `npm start` and the Docker image. |

When a limit is reached, the provider rate-limits, or a preview times out, the server answers with a reason and the browser uses the offline rules for that preview, with a badge saying why. `GET /api/health` reports `{ "status": "ok" }` for health checks. The server never logs instructions or keys. Limits are kept in memory, so they reset when the process restarts and are per process, not shared across replicas.

## Demo Walkthrough

1. **Start guided demo** on the first screen. It imports an example docker-compose stack and shows three steps: what to say and what will change.
2. **Say a change** into the instruction box with your Wispr Flow hotkey, or type it. English and Hinglish both work. Try "Add a Redis cache in front of the trips API" or "payment service ko alag container mein daalo".
3. **Review** the exact diff and any open questions. In the follow-up field, say "make it PostgreSQL instead", "undo that", "cancel", or "apply".
4. **Explore** Diagram, API contract, Risks, Tasks, and What changed. In Risks, choose fixes for open findings and review them together.
5. **Check against code** from the **From code** menu with a newer compose file, or **Try example update**. New and retired services become one reviewable sync; planned work is kept.
6. **Undo** by saying "undo" in the instruction box, or with Ctrl+Z.
7. **Advanced** holds branches and history, the outage simulator and decision records, Topology, and the DevOps bundle.
8. **Export** the artifact ZIP, SVG, PNG, or Mermaid source.

## Evals

Measured on 2026-10-21 with `npm run eval`: 22 labelled instructions (11 English, 11 Hinglish, two of them not architecture changes) against the three built-in models. Each result is applied with the app's own applier and scored by the structural change it makes: components and connections added or removed, and requirements recorded. A case is correct only when every expected change happened and nothing else did. Recall is the share of expected changes made; precision is the share of changes made that were expected. One run per interpreter; model output varies between runs. Cases are in [evals/cases.ts](evals/cases.ts), full results in [evals/results/](evals/results/).

| Interpreter | Cases | Correct | Recall | Precision |
|---|---|---|---|---|
| Groq `openai/gpt-oss-120b` | All 22 | 18 / 22 | 96% | 82% |
| Groq `openai/gpt-oss-120b` | English 11 | 9 / 11 | 100% | 80% |
| Groq `openai/gpt-oss-120b` | Hinglish 11 | 9 / 11 | 92% | 85% |
| Offline rules, no key | All 22 | 13 / 22 | 58% | 88% |
| Offline rules, no key | English 11 | 6 / 11 | 50% | 86% |
| Offline rules, no key | Hinglish 11 | 7 / 11 | 67% | 89% |

The model's misses were stricter-than-needed failures, not wrong edits: it added a new cache in front of the restaurant service instead of reusing Redis (twice), recorded an extra requirement, and added a Payment Service without connecting it to the gateway. The offline rules cover only four change shapes, so removals and "add a service behind X" fall outside them.

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
│                            # operations applier, risks and fixes, OpenAPI, exports,
│                            # dictation cleanup, Hinglish and English patterns, follow-ups
├── types/schema.ts          # Zod schema (single source of truth)
└── utils/                   # Sound cues
server/                      # /api/health, /api/status, /api/interpret (Groq or Claude), limits
scripts/eval.ts              # npm run eval
evals/cases.ts               # labelled instructions, English and Hinglish
docs/                        # Wispr Flow research notes, submission notes, demo script
```

## Testing

| Suite | Command | Tests |
|-------|---------|-------|
| Unit (Node) | `npm test` | 106 |
| Component (Vitest + RTL) | `npm run test:vitest` | 56 |
| E2E (Playwright, with axe) | `npm run test:e2e` | 16 |

CI runs on every push: Lint → Typecheck → Tests → Build.

## Limitations

- Claude interpretation needs the Node server (`npm run dev`, `npm run preview`, `npm start`, or the Docker image); static-only hosting runs on offline rules
- Offline mode understands only a handful of request patterns; full understanding needs a model key. See Evals for measured numbers
- Drift checks compare services, images, and connections. Ports, volumes, and environment values are not modeled
- Rate limits and the daily cap live in memory: they reset on restart and are per process
- OpenAPI output is derived from the demo model; not validated by a full OpenAPI validator
- Risks are deterministic findings from modeled evidence, not calibrated production telemetry
- Tasks are proposed work; not sent to GitHub/Jira
- PNG export uses browser canvas APIs; incomplete ZIP if canvas unavailable

## License

MIT, 2026. Built for the WeMakeDevs x Wispr Flow No Hands challenge.