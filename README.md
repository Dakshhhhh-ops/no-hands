# VoiceArchitect

A small, deterministic VoiceArchitect demo for the WeMakeDevs × Wispr Flow challenge. The workspace has no pre-existing React, Next.js, or Vite setup, so this first vertical slice is a self-contained HTML/CSS/JavaScript app with no dependencies.

## Run it

Open `index.html` in a modern browser. No install or API key is needed.

## Try the demo

1. Select **Load Sample Architecture** to render the synthetic Commerce Platform and its service/data-flow relationships.
2. Enter or dictate the example instruction shown in the left panel. Wispr Flow can dictate into the focused text box; there is no direct Wispr API integration.
3. Select **Preview change** and inspect the proposed interpretation and open decisions.
4. Choose **Apply reviewed change**. The model version and diagram update; the Auth Service → Redis relationship is highlighted.
5. Select **Reset Demo** to return to the unloaded state.

The current demo slice supports deterministic rules for Redis session storage, PostgreSQL source-of-truth constraints, authentication rate limiting, and Redis outage resilience. It does not yet generate OpenAPI, risk audits, or engineering tasks; their tabs are visibly disabled. The demo does not claim that proposed requirements are implemented by the modeled system.
