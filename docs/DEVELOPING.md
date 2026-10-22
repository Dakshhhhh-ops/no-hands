# Developing and deploying VoiceArchitect

The [README](../README.md) covers what the app does and how to try it. This file covers running it, deploying it, configuration, the evals, the code layout, and the tests.

## Run locally

```sh
npm ci
cp .env.example .env.local   # then set GROQ_API_KEY (free tier, measured below) or ANTHROPIC_API_KEY
npm run dev
```

The key is read only by the Vite dev and preview servers, which expose `/api/status`, `/api/interpret`, `/api/health`, and `/api/wispr/*`. It is never bundled into the browser code. When both keys are set, Claude is used. The label under the instruction box shows which provider is active.

With a key, every preview is a live model call. A recorded answer is used only when the live call cannot be made: no key, a rate limit, the daily cap, a timeout, or a provider error. The server then serves a recording of the same request if it has one, labelled "Recorded answer", and otherwise the browser uses the offline rules; either way a badge says why. Without any key the label reads "Recorded answers, then offline rules".

## Verify

```sh
npm test             # 150 unit tests, including Wispr sign-in and MCP against a fake server, the server's headers, and hostile or oversized request bodies
npm run test:vitest  # 61 component tests (Vitest + RTL)
npm run typecheck    # strict TypeScript with noUncheckedIndexedAccess across src/ and server/, no any
npm run lint         # ESLint, 0 problems
npm run build        # Production build
npx playwright test  # 23 browser tests in Chromium and the same 23 in WebKit, plus the offline (PWA) test
npm run eval         # labelled instructions; add -- --provider anthropic (or groq) to measure a model
```

The browser tests run one worker by default, as in CI. On a busy laptop more workers timed out WebKit tests that pass in seconds alone; on a fast machine, pass `--workers=4`.

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

**Render.** [render.yaml](../render.yaml) is a Render Blueprint for one Docker web service with `/api/health` as its health check, `VOICEARCHITECT_TRUST_PROXY=1`, and both keys as secrets that Render asks for when you create the service. Set `GROQ_API_KEY` and leave `ANTHROPIC_API_KEY` empty until Claude has eval numbers, since the server uses Claude whenever its key is set. Leave both empty to run on recorded answers and the offline rules. Render's free plan can run a Docker image (its own n8n Blueprint does), and each workspace gets 750 free instance hours a month. Render's free plan spins the service down after 15 minutes without traffic, and the next visit waits about a minute while it starts.

To avoid the cold start, [.github/workflows/keep-warm.yml](../.github/workflows/keep-warm.yml) pings `/api/health` every 10 minutes once you add a repository variable `LIVE_URL`; it does nothing until then. Check Render's free-hours allowance before leaving it on all month.

Any other host that runs a Node process or a Docker image works too. Set these as environment variables or secrets on the host:

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Claude key. When it is set, the server uses Claude instead of Groq. Claude is not measured yet (see Evals). |
| `GROQ_API_KEY` | none | Groq key, used when no Claude key is set or `VOICEARCHITECT_PROVIDER=groq`. Without any key the app runs on recorded answers and the offline rules. |
| `VOICEARCHITECT_PROVIDER` | auto | `anthropic`, `groq`, or `offline` to ignore keys. |
| `VOICEARCHITECT_MODEL` | `claude-opus-5-5` | Claude model id, for example `claude-sonnet-5-5` or `claude-haiku-5-5`. Opus and Sonnet requests ask for Anthropic's server-side fallback model if the first one is overloaded; Haiku 5.5 has no fallback. |
| `VOICEARCHITECT_EFFORT` | `medium` | Claude effort level. |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Groq model id. |
| `GROQ_TEMPERATURE` | `0.5` | Sampling temperature. Groq recommends 0.5 to 0.7 for reasoning models; the low end keeps proposals consistent. |
| `GROQ_SEED` | `7` | Fixed seed, so the same instruction tends to give the same proposal. Groq documents this as best effort, not a guarantee. |
| `VOICEARCHITECT_RATE_PER_MINUTE` | `6` | Model previews per client IP per minute. |
| `VOICEARCHITECT_DAILY_CAP` | `300` | Model previews per UTC day across all clients. |
| `VOICEARCHITECT_TIMEOUT_MS` | `45000` | Longest a preview may take before it falls back. |
| `VOICEARCHITECT_MAX_BODY_KB` | `256` | Largest accepted request body; anything larger gets a 413. |
| `VOICEARCHITECT_TRUST_PROXY` | off | Set to `1` behind a reverse proxy so limits use the `X-Forwarded-For` client address. |
| `VOICEARCHITECT_RECORD` | off | Set to `1` to save each successful live answer to `server/recordings/` as JSON. Use it locally to record fallbacks, then commit the files. |
| `VOICEARCHITECT_RECORDINGS_DIR` | `server/recordings` | Where recordings are read and saved. |
| `PORT` | `8080` | Port for `npm start` and the Docker image. |

A recording is keyed by a SHA-256 of the model, the system prompt, the output schema, and the exact message sent to the model (instruction, current architecture, and any imported notes), so it only answers the identical request, and editing the prompt or schema retires old recordings. Recordings hold the model's answer only, never a key.

`GET /api/health` reports `{ "status": "ok" }` for health checks. The server never logs instructions or keys. Limits are kept in memory, so they reset when the process restarts and are per process, not shared across replicas.

### Security headers

Every response from `server/serve.ts`, and from `vite preview` so the browser tests run under the same policy, carries the headers in [server/securityHeaders.ts](../server/securityHeaders.ts):

- `Content-Security-Policy` allowing only this origin: no `'unsafe-inline'`, no `'unsafe-eval'`, no third-party hosts, `frame-ancestors 'none'`, `object-src 'none'`. Fonts are self-hosted, React sets styles through the DOM rather than inline markup, and Zod runs in jitless mode so it never probes for `eval`.
- `Strict-Transport-Security` (two years) on HTTPS requests, including behind Render's proxy when `VOICEARCHITECT_TRUST_PROXY=1`.
- `Permissions-Policy` turning off camera, geolocation, payment, USB, and motion sensors, and allowing the microphone only for this origin, for the browser-mic fallback.
- `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` set to `same-origin`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`.

[tests/security.test.js](../tests/security.test.js) checks the policy and the server; [tests/security.spec.ts](../tests/security.spec.ts) walks the guided demo, every export, the generated docs, and the import dialog in Chromium and fails on any CSP violation or third-party request. Text assets are sent Brotli- or gzip-compressed (Render's edge also compresses).

## Evals

Measured on 2026-10-21 with `npm run eval`: 22 labelled instructions (11 English, 11 Hinglish, two of them not architecture changes) against the three built-in models. Each result is applied with the app's own applier and scored by the structural change it makes: components and connections added or removed, and requirements recorded. A case is correct only when every expected change happened and nothing else did. Recall is the share of expected changes made; precision is the share of changes made that were expected. Cases are in [evals/cases.ts](../evals/cases.ts), full results in [evals/results/](../evals/results/).

Model output varies between runs, so the model was run 3 times with seeds 1, 2, 3 (Groq's advice for benchmarking); the table gives the mean and range. The offline rules are deterministic, so one run is exact. No request failed.

| Interpreter | Cases | Correct (mean) | Recall | Precision |
|---|---|---|---|---|
| Groq `openai/gpt-oss-120b`, 3 runs | All 22 | 18.3 / 22 (range 18 to 19) | 93% | 81% |
| Groq `openai/gpt-oss-120b`, 3 runs | English 11 | 9.3 / 11 (range 9 to 10) | 94% | 76% |
| Groq `openai/gpt-oss-120b`, 3 runs | Hinglish 11 | 9 / 11 | 92% | 87% |
| Offline rules, no key | All 22 | 13 / 22 | 58% | 88% |
| Offline rules, no key | English 11 | 6 / 11 | 50% | 86% |
| Offline rules, no key | Hinglish 11 | 7 / 11 | 67% | 89% |

Run to run, 18 of 22 cases passed every time, one passed in some runs (R1 (1/3)), and 3 never passed (R8, F3, F4). The variable and failing cases are mostly one ambiguity: for "a cache in front of" a service, the model sometimes reuses the existing Redis and sometimes adds a new cache, and the labels expect reuse. The other miss adds the Payment Service without connecting it to the gateway. The offline rules cover only four change shapes, so removals and "add a service behind X" fall outside them.

A repeat on 2026-10-22, after the system prompt gained the rule for imported notes, completed one full run before Groq's free tier rate-limited it: 19 / 22, with the same three misses. It is not in the table because it is incomplete.

**Claude: not measured yet.** The server prefers Claude whenever `ANTHROPIC_API_KEY` is set, so do not set that key on a public deploy until Claude has numbers here. To compare the three Claude models:

```sh
# PowerShell: $env:VOICEARCHITECT_MODEL="claude-opus-5-5"; npm run eval -- --provider anthropic --runs 1
VOICEARCHITECT_MODEL=claude-opus-5-5   npm run eval -- --provider anthropic --runs 1
VOICEARCHITECT_MODEL=claude-sonnet-5-5 npm run eval -- --provider anthropic --runs 1
VOICEARCHITECT_MODEL=claude-haiku-5-5  npm run eval -- --provider anthropic --runs 1
```

Each run prints correct cases, recall, precision, and average tokens per preview (input including cached input, the share read from cache, and output; token counts only, never instruction text) and writes `evals/results/anthropic-<model>.json`.

To reduce variation in the app itself, Groq requests use a fixed seed and temperature 0.5. Groq documents the seed as best-effort determinism, so the same instruction usually, not always, gives the same proposal; the review step shows exactly what will change either way.

## Code layout

```
src/
├── App.tsx                  # Root component: landing page and the workspace studio
├── main.tsx                 # Entry point and CSS load order
├── hooks/                   # Project state and branches, interpretation and review, dictation,
│                            # exports, dialogs, walkthrough, theme, toast, storage, motion, scroll
├── components/              # Studio toolbar, composer, output panel (lazy-loaded views), review dialog,
│   ├── diagram/             # the diagram and its dialogs
│   └── landing/             # landing page sections
├── data/                    # Domain logic, pure TypeScript: compose import, drift check,
│                            # operations applier, risks and fixes, OpenAPI, exports,
│                            # dictation cleanup, Hinglish and English patterns, follow-ups
├── types/schema.ts          # Zod schema (single source of truth)
└── utils/                   # Sound cues
server/                      # /api/health, /api/status, /api/interpret (Claude or Groq), limits
├── recordings.ts            # Recorded answers, keyed by a SHA-256 of the exact request
├── recordings/              # Recordings that back up the guided demo
└── wisprMcp.ts              # /api/wispr/*: Wispr Flow sign-in (OAuth 2.1, PKCE) and MCP client
scripts/eval.ts              # npm run eval
evals/cases.ts               # labelled instructions, English and Hinglish
docs/                        # Wispr Flow research notes, submission notes, demo script
```

## Tests

| Suite | Command | Tests |
|-------|---------|-------|
| Unit (Node) | `npm test` | 150 |
| Component (Vitest + RTL) | `npm run test:vitest` | 61 |
| Browser (Playwright: axe, CSP, every flow) | `npx playwright test` | 23 in Chromium + the same 23 in WebKit + 1 offline (PWA) |

App code in `src/` and `server/` is strict TypeScript (including `noUncheckedIndexedAccess`) with no `any`; the Node unit tests are plain JS. Measured on the production build (Brotli), the landing page's own scripts and stylesheets are 121 KB of JS and 15 KB of CSS; the four self-hosted font files total 100 KB; the page makes no third-party request.

No test calls Wispr Flow, Anthropic, or Groq: the Wispr tests run against a fake sign-in and MCP server whose fetch throws on any other address.

CI runs on every push: lint, typecheck, unit tests, component tests, build, a smoke test of the production server (headers, Brotli, health), and the browser tests.

## Other limitations

- Model interpretation, recorded answers, and the Wispr Flow import need the Node server (`npm run dev`, `npm run preview`, `npm start`, or the Docker image); static-only hosting runs on the offline rules.
- Rate limits and the daily cap live in memory: they reset on restart and are per process.
- OpenAPI output is derived from the model and is not checked by a full OpenAPI validator.
- PNG export uses the browser's canvas APIs; the ZIP is incomplete where canvas is unavailable.
