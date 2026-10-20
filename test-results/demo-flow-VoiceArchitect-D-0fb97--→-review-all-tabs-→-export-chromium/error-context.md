# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: demo-flow.spec.ts >> VoiceArchitect Demo Flow >> complete demo flow: load → dictate → preview → apply → review all tabs → export
- Location: tests\demo-flow.spec.ts:9:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=Review this change')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('text=Review this change') with timeout 5000ms
  - waiting for locator('text=Review this change')

```

```yaml
- main:
  - link "VoiceArchitect home":
    - /url: "#top"
    - text: VoiceArchitect
  - navigation "Page sections":
    - link "Overview":
      - /url: "#top"
    - link "How it works":
      - /url: "#how"
    - link "Workspace":
      - /url: "#workspace"
    - link "Capabilities":
      - /url: "#capabilities"
  - button "Dictation guide"
  - button "Reset sample"
  - button "Switch to dark theme"
  - button "Export"
  - region "Say the architecture change out loud. See what it affects.":
    - heading "Say the architecture change out loud. See what it affects." [level=1]
    - paragraph: VoiceArchitect turns a spoken instruction into a reviewable change, then updates the diagram, API contract, risks, and engineering tasks together.
    - button "Start guided demo"
    - link "Open the workspace":
      - /url: "#workspace"
    - figure "You say":
      - text: You say
      - blockquote: Move session storage to Redis, keep PostgreSQL as the source of truth, add rate limiting to the authentication endpoint, and make login resilient if Redis becomes unavailable.
      - text: You get
      - list:
        - listitem: An updated architecture diagram
        - listitem: A revised API contract
        - listitem: Risks found in the new design
        - listitem: Tasks your team can pick up
  - region "From a sentence to a reviewed change":
    - heading "From a sentence to a reviewed change" [level=2]
    - list:
      - listitem:
        - text: "1"
        - heading "Say it" [level=3]
        - paragraph: Dictate with Wispr Flow into the instruction box, or type it. Plain language is enough.
      - listitem:
        - text: "2"
        - heading "Review it" [level=3]
        - paragraph: See how the change was interpreted and which decisions are still open. Nothing is applied until you confirm.
      - listitem:
        - text: "3"
        - heading "See what follows" [level=3]
        - paragraph: Every view updates from the same model, so the diagram, contract, risks, and tasks never disagree.
  - region "Workspace":
    - heading "Workspace" [level=2]
    - paragraph: Follow the steps below. Use everyday language; the prototype shows what your request would affect.
    - region "Demo walkthrough progress":
      - text: YOUR WALKTHROUGH
      - paragraph: Your instruction is ready. Preview it to see what the prototype understood before anything changes.
      - combobox "Sample architecture":
        - option "Commerce Platform" [selected]
        - option "Food Delivery"
      - button "Load sample"
      - list:
        - listitem: Start with the sample
        - listitem: Enter or dictate a change
        - listitem: Preview the proposal
        - listitem: Review open decisions
        - listitem: Apply the change
        - listitem: Explore the updated outputs
    - region "What should change?":
      - heading "What should change?" [level=2]
      - paragraph: Use your own words, or start with the sample instruction below. You review it before anything is applied.
      - button "Start dictation"
      - text: Your instruction
      - textbox "Your instruction":
        - /placeholder: Move session storage to Redis, keep PostgreSQL as the source of truth, add login rate limiting, and keep login working if Redis is down.
        - text: Move session storage to Redis, keep PostgreSQL as the source of truth, add login rate limiting, and keep login working if Redis is down.
      - text: Type here, or hold your Wispr Flow shortcut to dictate. Ctrl + Enter to preview
      - paragraph: Or start from an example
      - text: QUICK START INSTRUCTIONS Click preset to load
      - button "DEMO MIGRATION & RATE LIMIT Redis Session Store & Auth Rate Limit “Move session storage to Redis, keep PostgreSQL as the source of truth, add rate limiting to the...” Redis Session Store PostgreSQL Truth Login Rate Limit Outage Resilience":
        - text: DEMO MIGRATION & RATE LIMIT Redis Session Store & Auth Rate Limit
        - paragraph: “Move session storage to Redis, keep PostgreSQL as the source of truth, add rate limiting to the...”
        - text: Redis Session Store PostgreSQL Truth Login Rate Limit Outage Resilience
      - button "DATA SAFETY DATA INTEGRITY Preserve PostgreSQL as Source of Truth “Keep PostgreSQL as the persistent source of truth for all user records and account state....” Zero data loss Audit integrity ACID compliance":
        - text: DATA SAFETY DATA INTEGRITY Preserve PostgreSQL as Source of Truth
        - paragraph: “Keep PostgreSQL as the persistent source of truth for all user records and account state....”
        - text: Zero data loss Audit integrity ACID compliance
      - button "RESILIENCE HIGH AVAILABILITY Redis Outage Resilience & Fallback “Make login resilient if Redis becomes unavailable, and add rate limiting to the authentication ...” Circuit breaker Degraded mode Failover safety":
        - text: RESILIENCE HIGH AVAILABILITY Redis Outage Resilience & Fallback
        - paragraph: “Make login resilient if Redis becomes unavailable, and add rate limiting to the authentication ...”
        - text: Circuit breaker Degraded mode Failover safety
      - button "SECURITY TRAFFIC CONTROL Authentication Endpoint Rate Limiting “Add rate limiting to the authentication endpoint to prevent brute-force attacks on login....” 429 Header Retry-After Abuse prevention":
        - text: SECURITY TRAFFIC CONTROL Authentication Endpoint Rate Limiting
        - paragraph: “Add rate limiting to the authentication endpoint to prevent brute-force attacks on login....”
        - text: 429 Header Retry-After Abuse prevention
      - button "Preview my change"
      - button "Play sample instruction"
      - button "Clear"
    - region "Generated architecture":
      - heading "Commerce Platform" [level=2]
      - text: v1 · baseline 9 components
      - button "2 open decisions"
      - text: Main Branch
      - button "Undo last change" [disabled]
      - button "Redo" [disabled]
      - button "Branches and history"
      - tablist "Architecture outputs":
        - tab "Diagram" [selected]
        - tab "API contract"
        - tab "Risks"
        - tab "Tasks"
        - tab "What changed"
        - tab "Telemetry"
        - status: Baseline loaded · unresolved decisions remain
      - tabpanel "Diagram": Diagram unavailable
  - region "Go beyond one change":
    - heading "Go beyond one change" [level=2]
    - article:
      - heading "Compare two designs" [level=3]
      - paragraph: Branch the model into a serverless and a Kubernetes version, then compare them side by side.
      - button "Compare scenarios"
    - article:
      - heading "Go back in time" [level=3]
      - paragraph: Undo, redo, or jump to any earlier version of the model without losing your place.
      - button "Open history"
    - article:
      - heading "Take it with you" [level=3]
      - paragraph: Export the model, contract, risks, and tasks, or a DevOps bundle with Terraform and Kubernetes manifests.
      - button "Artifacts ZIP"
      - button "DevOps ZIP"
  - text: Deterministic demo on a synthetic Commerce Platform model. Wispr Flow types into the instruction box; there is no direct Wispr API connection.
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('VoiceArchitect Demo Flow', () => {
  4   |   test.beforeEach(async ({ page }) => {
  5   |     await page.goto('/');
  6   |     await page.waitForLoadState('networkidle');
  7   |   });
  8   | 
  9   |   test('complete demo flow: load → dictate → preview → apply → review all tabs → export', async ({ page }) => {
  10  |     // 1. Load sample
  11  |     await page.click('button:has-text("Load sample")');
  12  |     await expect(page.locator('h2:has-text("Commerce Platform")')).toBeVisible();
  13  |     await expect(page.locator('text=What should change?')).toBeVisible();
  14  | 
  15  |     // 2. Dictate/enter instruction
  16  |     const textarea = page.locator('#architecture-command');
  17  |     await textarea.fill('Move session storage to Redis, keep PostgreSQL as the source of truth, add login rate limiting, and keep login working if Redis is down.');
  18  |     
  19  |     // 3. Preview change
  20  |     await page.click('button:has-text("Preview my change")');
> 21  |     await expect(page.locator('text=Review this change')).toBeVisible();
      |                                                           ^ Error: expect(locator).toBeVisible() failed
  22  |     await expect(page.locator('text=Move session storage to Redis')).toBeVisible();
  23  |     await expect(page.locator('text=Keep PostgreSQL as source of truth')).toBeVisible();
  24  |     await expect(page.locator('text=Add login rate limiting')).toBeVisible();
  25  |     await expect(page.locator('text=Keep login working if Redis is down')).toBeVisible();
  26  | 
  27  |     // 4. Apply change
  28  |     await page.click('button:has-text("Apply change")');
  29  |     await expect(page.locator('text=Change applied')).toBeVisible({ timeout: 5000 });
  30  | 
  31  |     // 5. Review all 5 tabs
  32  |     const tabs = ['Diagram', 'API contract', 'Risks', 'Tasks', 'What changed', 'Telemetry'];
  33  |     for (const tab of tabs) {
  34  |       await page.click(`button:has-text("${tab}")`);
  35  |       await page.waitForTimeout(300); // allow lazy load
  36  |     }
  37  | 
  38  |     // 6. Export All ZIP
  39  |     await page.click('button:has-text("Export")');
  40  |     await page.click('button:has-text("Engineering artifacts")');
  41  |     // Note: file download not easily testable in headless, but click works
  42  | 
  43  |     // 7. Open history panel
  44  |     await page.click('button:has-text("Branches and history")');
  45  |     await expect(page.locator('text=Main Branch')).toBeVisible();
  46  | 
  47  |     // 8. Compare scenarios
  48  |     await page.click('button:has-text("Compare scenarios")');
  49  |     await expect(page.locator('text=Scenario Comparison')).toBeVisible();
  50  |     await page.click('button:has-text("Close")');
  51  | 
  52  |     // 9. Kill Redis in chaos sim (in diagram tab)
  53  |     await page.click('button:has-text("Diagram")');
  54  |     await page.waitForTimeout(500);
  55  |     await page.click('button:has-text("Kill Redis")');
  56  |     await expect(page.locator('text=SEVERED')).toBeVisible({ timeout: 3000 });
  57  | 
  58  |     // 10. Open ADR modal and sign off
  59  |     await page.click('button:has-text("ADR Sign-Off")');
  60  |     await expect(page.locator('text=Architecture Decision Record')).toBeVisible();
  61  |     await page.click('button:has-text("Copy Markdown")');
  62  |     await page.click('button:has-text("Download Markdown")');
  63  |     await page.click('button:has-text("Close")');
  64  | 
  65  |     // 11. Verify persistence - reload page
  66  |     await page.reload();
  67  |     await page.waitForLoadState('networkidle');
  68  |     await expect(page.locator('#architecture-command')).toHaveValue(/Move session storage to Redis/);
  69  |   });
  70  | 
  71  |   test('keyboard navigation in diagram', async ({ page }) => {
  72  |     await page.click('button:has-text("Load sample")');
  73  |     await page.click('button:has-text("Diagram")');
  74  |     await page.waitForTimeout(500);
  75  | 
  76  |     const webNode = page.locator('[role="button"][aria-label*="Web Frontend"]');
  77  |     await webNode.focus();
  78  |     await expect(webNode).toBeFocused();
  79  | 
  80  |     // ArrowRight navigates downstream
  81  |     await page.keyboard.press('ArrowRight');
  82  |     const apiNode = page.locator('[role="button"][aria-label*="API Gateway"]');
  83  |     await expect(apiNode).toBeFocused();
  84  | 
  85  |     // ArrowLeft navigates upstream
  86  |     await page.keyboard.press('ArrowLeft');
  87  |     await expect(webNode).toBeFocused();
  88  | 
  89  |     // Escape clears selection
  90  |     await page.keyboard.press('Escape');
  91  |     await expect(webNode).not.toHaveAttribute('aria-pressed', 'true');
  92  |   });
  93  | 
  94  |   test('export menu keyboard accessible', async ({ page }) => {
  95  |     await page.click('button:has-text("Load sample")');
  96  |     const exportBtn = page.locator('button:has-text("Export")');
  97  |     await exportBtn.focus();
  98  |     await page.keyboard.press('Enter');
  99  |     await expect(page.locator('[role="menu"]')).toBeVisible();
  100 |     await page.keyboard.press('Escape');
  101 |   });
  102 | });
```