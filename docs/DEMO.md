# Demo script (2 minutes)

## Before recording

- `.env.local` has `ANTHROPIC_API_KEY`. Run `npm run dev` and check that the badge under the instruction box says "Interpreted by Claude".
- Open the app in a clean browser profile at 1440×900 or larger. Close other tabs.
- Have a stale diagram ready to show: a screenshot or an old slide of any architecture.
- Rehearse the two instructions below once. Claude takes a few seconds per preview, so pause while it thinks.
- Dictate the instructions with Wispr Flow into the instruction box. That moment is also your Wispr clip.

## Script

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:15 | The stale diagram next to a docker-compose file | "Architecture diagrams are wrong a week after someone draws them, because updating them is a chore nobody does." |
| 0:15–0:30 | Click **Try example stack**, then the Diagram tab | "VoiceArchitect starts from the real system. This diagram came from the docker-compose file, using only services, depends_on, and connection strings." |
| 0:30–1:05 | Dictate: "Add a notification service that consumes events from kafka and sends email and push updates to riders." Click **Preview my change**. | "I just say the change. Claude turns it into explicit operations, and the app checks each one against the model before I see it. Here's the exact diff, and here's the question it didn't guess: which channels." Click **Apply change**. |
| 1:05–1:35 | Dictate something unplanned, for example: "Put redis in front of postgres for the trips service and add a rule that cached trips expire after five minutes." Preview, then apply. | "This one wasn't scripted. Every change is versioned, undoable, and traced back to the sentence that caused it." |
| 1:35–1:50 | Click **Baseline / Current**, then the API contract, Risks, and Tasks tabs | "The diagram, API contract, risks, and tasks all update from the same model, so they never disagree." |
| 1:50–2:00 | Export menu | "And it all exports. Architecture docs that stay true, updated in a sentence." |

## If something goes wrong live

- If Claude is slow or rate limited, the app falls back to offline rules and says so. Keep talking and use the sample project's example cards, which the offline rules understand.
- If a preview misreads you, click **Keep editing**, rephrase, and say so on camera. Showing the review step catch a mistake is a strength, not a failure.

## Submission text

> Architecture diagrams and API docs go stale because updating them is slow and manual. VoiceArchitect imports a real docker-compose file, draws the architecture, and turns spoken or typed change requests into reviewed updates to the diagram, API contract, risks, and tasks. Claude proposes explicit operations, and the app validates every one against the model before anything changes. I built it by dictating with Wispr Flow throughout.
