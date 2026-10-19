# VoiceArchitect

VoiceArchitect is a deterministic React prototype for the WeMakeDevs × Wispr Flow challenge. The Commerce Platform sample turns a reviewed natural-language architecture change into an updated model, diagram, evidence-based risk findings, OpenAPI contract, and proposed engineering tasks.

## Run it

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The app needs no API key. `index.html` is only the Vite entry point; application code and feature panels live in `src/`.

Run the built-in logic checks with `npm test`; create a production bundle with `npm run build`.

## Try the demo

1. Select **Load Sample Architecture**.
2. Focus the instruction field and dictate with Wispr Flow, or use the supplied demo command.
3. Select **Preview change**, inspect the interpretation and unresolved assumptions, then apply it.
4. Explore Architecture Diagram, OpenAPI Contract, Risk & Consistency, and Engineering Tasks. All views derive from the same in-memory project model.
5. Select **Export All** to download a verified ZIP of the current model, diagram, contract, findings, proposed tasks, change log, and an export README.
6. Reset the demo to return to the unloaded state.

Wispr Flow dictates into the app's text field; there is no direct Wispr API integration. The OpenAPI request and success-response payload fields, rate-limit threshold, and Redis outage fallback are left unspecified when the model does not provide them. The OpenAPI panel runs basic structural checks; it is not a full external OpenAPI validator. Risk findings are deterministic model checks, not failure probabilities. Engineering tasks are proposed work, not completed tickets. Export All verifies each ZIP entry against its generated source content before starting the download.
