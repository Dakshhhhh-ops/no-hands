# Demo script (2 minutes)

## Before recording

- `.env.local` has `GROQ_API_KEY`. Run `npm run dev` and check that the badge under the instruction box says "Interpreted by Groq".
- Groq's free tier allows about three previews a minute. Leave 20 seconds between previews, and don't spend previews right before recording.
- Open the app in a clean browser profile at 1440×900 or larger. Close other tabs.
- Have a stale diagram ready to show: a screenshot or an old slide of any architecture.
- Rehearse the instruction below once. A preview takes about 3 to 4 seconds; the code check is instant and needs no key.
- Dictate the instructions with Wispr Flow into the instruction box. That moment is also your Wispr clip.

## Script

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:15 | A stale diagram next to a docker-compose file | "Architecture diagrams are wrong a week after someone draws them, because updating them is a chore nobody does." |
| 0:15–0:30 | Open **From code** → **Try example stack**, then the Diagram tab | "VoiceArchitect starts from the real system. This diagram came from the docker-compose file: services, depends_on, and connection strings." |
| 0:30–0:55 | Dictate: "Add an audit service that reads trips from postgres." Preview, then apply. | "I say the change. The model proposes explicit operations, the app checks each one, and I review the exact diff. The new box is dashed: it's planned, not built yet." |
| 0:55–1:30 | Open **From code** → **Try example update** | "Two weeks later the code moved on. Check against code: two new services, one retired, Postgres upgraded to 17. My planned audit service isn't in code yet, so it's kept, not deleted." Apply. |
| 1:30–1:50 | **Topology** tab, then **Baseline / Current** | "Every view is computed from the same model, so the diagram, API contract, risks, and tasks never disagree. Nothing here is a made-up metric." |
| 1:50–2:00 | Export menu | "Architecture docs that stay true: updated in a sentence, checked against the code." |

## If something goes wrong live

- If Groq is slow or rate limited, the app falls back to offline rules and says so. Keep talking and use the sample project's example cards, which the offline rules understand.
- If a preview misreads you, click **Keep editing**, rephrase, and say so on camera. Showing the review step catch a mistake is a strength, not a failure.

## Submission text

> Architecture diagrams and API docs go stale because updating them is slow and manual. VoiceArchitect imports a real docker-compose file, draws the architecture, and turns spoken or typed change requests into reviewed updates to the diagram, API contract, risks, and tasks. When the code changes, it checks the diagram against the new compose file and proposes a reviewed sync, keeping planned work that isn't built yet. A language model proposes explicit operations, and the app validates every one against the model before anything changes. I built it by dictating with Wispr Flow throughout.
