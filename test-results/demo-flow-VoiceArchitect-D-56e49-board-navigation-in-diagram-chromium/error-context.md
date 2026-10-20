# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: demo-flow.spec.ts >> VoiceArchitect Demo Flow >> keyboard navigation in diagram
- Location: tests\demo-flow.spec.ts:71:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.focus: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('[role="button"][aria-label*="Web Frontend"]')

```

# Page snapshot

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - link "VoiceArchitect home" [ref=e5] [cursor=pointer]:
      - /url: "#top"
      - generic [ref=e8]: VoiceArchitect
    - navigation "Page sections" [ref=e9]:
      - link "Overview" [ref=e10] [cursor=pointer]:
        - /url: "#top"
      - link "How it works" [ref=e11] [cursor=pointer]:
        - /url: "#how"
      - link "Workspace" [ref=e12] [cursor=pointer]:
        - /url: "#workspace"
      - link "Capabilities" [ref=e13] [cursor=pointer]:
        - /url: "#capabilities"
    - generic [ref=e14]:
      - button "Dictation guide" [ref=e15] [cursor=pointer]
      - button "Reset sample" [ref=e20] [cursor=pointer]
      - button "Switch to dark theme" [ref=e25] [cursor=pointer]
      - button "Export" [ref=e29] [cursor=pointer]
  - region [ref=e36]:
    - generic [ref=e37]:
      - heading "Say the architecture change out loud. See what it affects." [level=1] [ref=e38]
      - paragraph [ref=e39]: VoiceArchitect turns a spoken instruction into a reviewable change, then updates the diagram, API contract, risks, and engineering tasks together.
      - generic [ref=e40]:
        - button "Start guided demo" [ref=e41] [cursor=pointer]
        - link "Open the workspace" [ref=e44] [cursor=pointer]:
          - /url: "#workspace"
    - figure "You say" [ref=e47]:
      - blockquote [ref=e49]: Move session storage to Redis, keep PostgreSQL as the source of truth, add rate limiting to the authentication endpoint, and make login resilient if Redis becomes unavailable.
      - generic [ref=e50]:
        - generic [ref=e51]: You get
        - list [ref=e52]:
          - listitem [ref=e53]: An updated architecture diagram
          - listitem [ref=e59]: A revised API contract
          - listitem [ref=e65]: Risks found in the new design
          - listitem [ref=e68]: Tasks your team can pick up
  - region [ref=e72]:
    - generic [ref=e73]:
      - heading "From a sentence to a reviewed change" [level=2] [ref=e74]
      - list [ref=e75]:
        - listitem [ref=e76]:
          - generic [ref=e77]: "1"
          - heading "Say it" [level=3] [ref=e78]
          - paragraph [ref=e79]: Dictate with Wispr Flow into the instruction box, or type it. Plain language is enough.
        - listitem [ref=e80]:
          - generic [ref=e81]: "2"
          - heading "Review it" [level=3] [ref=e82]
          - paragraph [ref=e83]: See how the change was interpreted and which decisions are still open. Nothing is applied until you confirm.
        - listitem [ref=e84]:
          - generic [ref=e85]: "3"
          - heading "See what follows" [level=3] [ref=e86]
          - paragraph [ref=e87]: Every view updates from the same model, so the diagram, contract, risks, and tasks never disagree.
  - region [ref=e88]:
    - generic [ref=e89]:
      - heading "Workspace" [level=2] [ref=e90]
      - paragraph [ref=e91]: Follow the steps below. Use everyday language; the prototype shows what your request would affect.
    - region "Demo walkthrough progress" [ref=e92]:
      - generic [ref=e93]:
        - generic [ref=e94]:
          - text: YOUR WALKTHROUGH
          - paragraph [ref=e95]: The sample is ready. Type a change below, use Wispr Flow in the text box, or play the sample dictation.
        - generic [ref=e96]:
          - combobox "Sample architecture" [ref=e97]:
            - option "Commerce Platform" [selected]
            - option "Food Delivery"
          - button "Load sample" [ref=e98] [cursor=pointer]
      - list [ref=e102]:
        - listitem [ref=e103]:
          - generic [ref=e107]: Start with the sample
        - listitem [ref=e108]:
          - generic [aria-hidden] [ref=e109]: "2"
          - generic [ref=e110]: Enter or dictate a change
        - listitem [ref=e111]:
          - generic [aria-hidden] [ref=e112]: "3"
          - generic [ref=e113]: Preview the proposal
        - listitem [ref=e114]:
          - generic [aria-hidden] [ref=e115]: "4"
          - generic [ref=e116]: Review open decisions
        - listitem [ref=e117]:
          - generic [aria-hidden] [ref=e118]: "5"
          - generic [ref=e119]: Apply the change
        - listitem [ref=e120]:
          - generic [aria-hidden] [ref=e121]: "6"
          - generic [ref=e122]: Explore the updated outputs
    - generic [ref=e123]:
      - region [ref=e124]:
        - generic [ref=e125]:
          - generic [ref=e126]:
            - heading "What should change?" [level=2] [ref=e127]
            - paragraph [ref=e128]: Use your own words, or start with the sample instruction below. You review it before anything is applied.
          - button "Start dictation" [ref=e129] [cursor=pointer]
        - generic [ref=e166]:
          - generic [ref=e167]: Your instruction
          - textbox "Your instruction" [ref=e168]:
            - /placeholder: Move session storage to Redis, keep PostgreSQL as the source of truth, add login rate limiting, and keep login working if Redis is down.
          - generic [ref=e169]:
            - generic [ref=e170]: Type here, or hold your Wispr Flow shortcut to dictate.
            - generic [ref=e171]: Ctrl + Enter to preview
        - generic [ref=e172]:
          - paragraph [ref=e173]: Or start from an example
          - generic "Architecture command presets" [ref=e174]:
            - generic [ref=e175]:
              - generic [ref=e176]: QUICK START INSTRUCTIONS
              - generic [ref=e180]: Click preset to load
            - generic [ref=e181]:
              - button "DEMO MIGRATION & RATE LIMIT Redis Session Store & Auth Rate Limit “Move session storage to Redis, keep PostgreSQL as the source of truth, add rate limiting to the...” Redis Session Store PostgreSQL Truth Login Rate Limit Outage Resilience" [ref=e182] [cursor=pointer]:
                - generic [ref=e183]:
                  - generic [ref=e184]: DEMO
                  - generic [ref=e185]: MIGRATION & RATE LIMIT
                - generic [ref=e186]: Redis Session Store & Auth Rate Limit
                - paragraph [ref=e188]: “Move session storage to Redis, keep PostgreSQL as the source of truth, add rate limiting to the...”
                - generic [ref=e189]:
                  - generic [ref=e190]: Redis Session Store
                  - generic [ref=e191]: PostgreSQL Truth
                  - generic [ref=e192]: Login Rate Limit
                  - generic [ref=e193]: Outage Resilience
              - button "DATA SAFETY DATA INTEGRITY Preserve PostgreSQL as Source of Truth “Keep PostgreSQL as the persistent source of truth for all user records and account state....” Zero data loss Audit integrity ACID compliance" [ref=e194] [cursor=pointer]:
                - generic [ref=e195]:
                  - generic [ref=e196]: DATA SAFETY
                  - generic [ref=e197]: DATA INTEGRITY
                - generic [ref=e198]: Preserve PostgreSQL as Source of Truth
                - paragraph [ref=e200]: “Keep PostgreSQL as the persistent source of truth for all user records and account state....”
                - generic [ref=e201]:
                  - generic [ref=e202]: Zero data loss
                  - generic [ref=e203]: Audit integrity
                  - generic [ref=e204]: ACID compliance
              - button "RESILIENCE HIGH AVAILABILITY Redis Outage Resilience & Fallback “Make login resilient if Redis becomes unavailable, and add rate limiting to the authentication ...” Circuit breaker Degraded mode Failover safety" [ref=e205] [cursor=pointer]:
                - generic [ref=e206]:
                  - generic [ref=e207]: RESILIENCE
                  - generic [ref=e208]: HIGH AVAILABILITY
                - generic [ref=e209]: Redis Outage Resilience & Fallback
                - paragraph [ref=e211]: “Make login resilient if Redis becomes unavailable, and add rate limiting to the authentication ...”
                - generic [ref=e212]:
                  - generic [ref=e213]: Circuit breaker
                  - generic [ref=e214]: Degraded mode
                  - generic [ref=e215]: Failover safety
              - button "SECURITY TRAFFIC CONTROL Authentication Endpoint Rate Limiting “Add rate limiting to the authentication endpoint to prevent brute-force attacks on login....” 429 Header Retry-After Abuse prevention" [ref=e216] [cursor=pointer]:
                - generic [ref=e217]:
                  - generic [ref=e218]: SECURITY
                  - generic [ref=e219]: TRAFFIC CONTROL
                - generic [ref=e220]: Authentication Endpoint Rate Limiting
                - paragraph [ref=e222]: “Add rate limiting to the authentication endpoint to prevent brute-force attacks on login....”
                - generic [ref=e223]:
                  - generic [ref=e224]: 429 Header
                  - generic [ref=e225]: Retry-After
                  - generic [ref=e226]: Abuse prevention
        - generic [ref=e227]:
          - button "Preview my change" [disabled] [ref=e228]
          - button "Play sample instruction" [ref=e233] [cursor=pointer]
          - button "Clear" [disabled] [ref=e236]
      - region "Generated architecture" [ref=e237]:
        - generic [ref=e238]:
          - generic [ref=e239]:
            - heading "Commerce Platform" [level=2] [ref=e240]
            - generic [ref=e241]: v1 · baseline
          - generic [ref=e242]:
            - generic [ref=e243]: 9 components
            - button "2 open decisions" [ref=e244] [cursor=pointer]
        - generic [ref=e245]:
          - generic [ref=e246]: Main Branch
          - button "Undo last change" [disabled] [ref=e251]
          - button "Redo" [disabled] [ref=e255]
          - button "Branches and history" [ref=e259] [cursor=pointer]
        - generic [ref=e262]:
          - tablist "Architecture outputs" [ref=e263]:
            - tab "Diagram" [active] [selected] [ref=e264] [cursor=pointer]
            - tab "API contract" [ref=e270] [cursor=pointer]
            - tab "Risks" [ref=e276] [cursor=pointer]
            - tab "Tasks" [ref=e279] [cursor=pointer]
            - tab "What changed" [ref=e283] [cursor=pointer]
            - tab "Telemetry" [ref=e286] [cursor=pointer]
            - status [ref=e291]: Baseline loaded · unresolved decisions remain
          - tabpanel "Diagram" [ref=e292]:
            - generic [ref=e293]: Diagram unavailable
  - region [ref=e294]:
    - generic [ref=e295]:
      - heading "Go beyond one change" [level=2] [ref=e296]
      - generic [ref=e297]:
        - article [ref=e298]:
          - heading "Compare two designs" [level=3] [ref=e303]
          - paragraph [ref=e304]: Branch the model into a serverless and a Kubernetes version, then compare them side by side.
          - button "Compare scenarios" [ref=e305] [cursor=pointer]
        - article [ref=e306]:
          - heading "Go back in time" [level=3] [ref=e310]
          - paragraph [ref=e311]: Undo, redo, or jump to any earlier version of the model without losing your place.
          - button "Open history" [ref=e312] [cursor=pointer]
        - article [ref=e313]:
          - heading "Take it with you" [level=3] [ref=e318]
          - paragraph [ref=e319]: Export the model, contract, risks, and tasks, or a DevOps bundle with Terraform and Kubernetes manifests.
          - generic [ref=e320]:
            - button "Artifacts ZIP" [ref=e321] [cursor=pointer]
            - button "DevOps ZIP" [ref=e322] [cursor=pointer]
  - generic [ref=e323]:
    - generic [ref=e324]: Deterministic demo on a synthetic Commerce Platform model.
    - generic [ref=e325]: Wispr Flow types into the instruction box; there is no direct Wispr API connection.
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
  21  |     await expect(page.locator('text=Review this change')).toBeVisible();
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
> 77  |     await webNode.focus();
      |                   ^ Error: locator.focus: Test timeout of 30000ms exceeded.
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