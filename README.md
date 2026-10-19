# VoiceArchitect

VoiceArchitect is a deterministic React + Vite prototype for the WeMakeDevs × Wispr Flow challenge. It turns reviewed natural-language architecture requests into a current project model, an interactive diagram, OpenAPI views, evidence-based risks, proposed engineering tasks, and export files. It runs offline and needs no API key.

## Run locally

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The code is a single-page React app under `src/`; `index.html` is the Vite entry point.

## Verify

```sh
npm test
npm run typecheck
npm run build
```

GitHub Actions runs `npm ci`, `npm test`, and `npm run build` for pushes and pull requests.

## Demo walkthrough

1. In the workspace, choose **Commerce Platform** or **Food Delivery** and select **Load sample**. The sample selector does not change the loaded model until you load it.
2. Enter an instruction in the text field. Wispr Flow can dictate into that field; typing works too. The sample’s demo instruction is available in the example cards.
3. Select **Preview change**. Review the interpretation, before/after artifact diff, and unresolved assumptions. Rate-limit thresholds and Redis outage behavior remain unresolved until a person chooses them.
4. Apply the change. Each apply creates one model version and one undoable history entry. Review the diagram, API contract, risks, tasks, and change impact tabs. Select a diagram component to inspect its role and connections.
5. Use the Export menu for the verified **Export All** ZIP or standalone SVG, PNG, and Mermaid diagram files. The ZIP is generated from the current model and checks every entry before download.
6. **Reset sample** restores the currently loaded sample’s baseline and clears its history.

The Commerce Platform example includes commands for Redis session storage, PostgreSQL ownership, rate limiting, and Redis outage resilience. The Food Delivery example models orders, restaurants, couriers, payments, notifications, and its API operations.

## Limitations

- Wispr Flow writes into the instruction field; there is no direct Wispr API integration.
- Command parsing uses deterministic local rules and a small set of known transcription corrections. Unsupported instructions are surfaced as unresolved; this is not a general natural-language compiler.
- The OpenAPI output is derived from the demo model and receives basic structural checks. It is not validated by a full OpenAPI validator. Request and successful-response fields are left unspecified when they are absent from the model.
- Risks are deterministic findings from modeled evidence, not calibrated risk scores or production telemetry. Tasks are proposed work; they are not completed tickets and are not sent to GitHub or Jira.
- The PNG export uses the browser’s local SVG and canvas APIs. If the browser cannot render a canvas PNG, Export All reports an error rather than producing an incomplete ZIP.
