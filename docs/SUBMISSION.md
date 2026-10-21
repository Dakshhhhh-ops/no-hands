# VoiceArchitect: submission notes

## Description

VoiceArchitect keeps your architecture diagram in sync with your code, by voice. Import a real docker-compose file and the diagram is drawn from your services and connections. Hold your Wispr Flow hotkey and say a change, in English or Hinglish: "order service ko Kafka se connect karo". A model turns it into explicit operations, every operation is checked against the current model, and you review the exact diff before anything applies. Say "make it PostgreSQL instead" to revise, "undo that" to step back, or "apply". The API contract, risks, and tasks update with the diagram. When the code moves on, check the diagram against the newer compose file: new and retired services become one reviewable sync, and planned work that is not built yet is kept. Without a model key, offline rules still handle common changes.

## The problem

Architecture diagrams go stale the week they are drawn. Updating them means opening a drawing tool, finding the right boxes, and remembering what the code actually runs, so nobody does it. Teams end up reviewing designs against a picture that no longer matches the services in production, and the API contract, risk notes, and tasks drift with it.

## How Wispr Flow is used

Wispr Flow is a system-wide dictation app: you hold your hotkey and the words are typed into the focused field. VoiceArchitect is designed around that, without any Wispr-specific code:

- The instruction box is the hero of the page and takes focus on load, so you can hold your Wispr Flow hotkey and speak immediately.
- English and Hinglish both work. The interpretation prompt reads Hinglish, and the offline rules understand four common change shapes in both languages.
- The review dialog's follow-up field takes focus too, so the whole loop is spoken: describe, revise, undo, apply.
- Flow's Command Mode can rewrite the instruction in place, because the box is ordinary text. It needs a paid plan or trial.
- One click copies the loaded model's component and technology names to add to your Flow dictionary.

Not integrated, because it is not documented for web pages: any Wispr API call, Wispr's MCP server (read-only, for AI clients), and a dictionary import file. A browser microphone button exists only as a labelled fallback for people without Wispr Flow. Sources: [docs/wispr-notes.md](wispr-notes.md).

## Tech stack

React 19 and Vite, TypeScript, Zod (single schema for the model, operations, and the model's structured output), a small Node server for `/api/interpret`, `/api/status`, and `/api/health` with per-IP rate limits and a daily cap, Groq (`openai/gpt-oss-120b`) or Claude for interpretation, Vitest and Testing Library, Playwright with axe-core, Docker, and a PWA build.

## Measured

On 22 labelled instructions (11 English, 11 Hinglish), scored by the structural change applied to the model:

| Interpreter | Correct cases | English | Hinglish |
|---|---|---|---|
| Groq `openai/gpt-oss-120b`, mean of 3 runs | 18.3 / 22 (range 18 to 19) | 9.3 / 11 (range 9 to 10) | 9 / 11 |
| Offline rules, no key | 13 / 22 | 6 / 11 | 7 / 11 |

The model was run 3 times with different seeds on 2026-10-21; 18 of 22 cases passed every run. In the app, Groq requests use a fixed seed and temperature 0.5 to keep proposals consistent, and the review step always shows the exact change. Method and full results are in the README's Evals section and `evals/results/`. Tests: 107 unit, 56 component, 16 browser (including axe accessibility checks in both themes).

## Limitations

- Without a model key, the offline rules cover only a few change shapes and the Commerce and Food Delivery demo phrases.
- The diagram is a model of the architecture, not of a running system. Risks and the outage simulator are computed from the model and labelled as such; nothing is measured from production.
- Drift checks compare services, images, and connections in docker-compose. Ports, volumes, and environment values are not modeled.
- Rate limits and the daily cap are kept in memory per server process.
- Tasks and exports are proposals; nothing is sent to an issue tracker or deployed.

## Judge checklist

1. `npm ci && npm run dev`, then open the printed URL. For model interpretation, put `GROQ_API_KEY` in `.env.local` first; without it the app runs on the offline rules.
2. Click **Start guided demo**. It imports an example docker-compose stack and walks three steps: an English change, a Hinglish change, and a check against the next version of the compose file.
3. With Wispr Flow, focus the instruction box at the top, hold your hotkey, and say a change, for example "catalog service ke aage Redis cache laga do". Preview it.
4. In the review dialog, say "undo that", "cancel", or "apply". Nothing changes until you apply.
5. Open **Risks** and resolve the open findings in one review. Open **What changed** to see every difference with its instruction.
6. Use **From code → Import docker-compose** with your own file, then **Check against code** with a newer version.
7. Verify: `npm test`, `npm run test:vitest`, `npm run typecheck`, `npm run lint`, `npm run build`, `npx playwright test`, and `npm run eval`.
