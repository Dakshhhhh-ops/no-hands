import { defineConfig, devices } from '@playwright/test';

// Browser tests never use a model provider: VOICEARCHITECT_PROVIDER=offline makes the
// server ignore any GROQ_API_KEY / ANTHROPIC_API_KEY in .env.local, so results are
// deterministic and no API quota is spent. The server gets its own port and is
// never reused, so a dev server you have running (with your key) is never touched.
//
// Every test runs against a production build served by `vite preview`: pages load a
// few bundled files instead of hundreds of dev modules, so parallel runs stay fast
// on a busy machine, and the tests exercise what users actually get.
const PREVIEW_PORT = 5188;
const PREVIEW_DIR = 'node_modules/.playwright-dist';
const offline = { VOICEARCHITECT_PROVIDER: 'offline' };

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Each worker is a full Chrome process; more than three starves the CPU on a typical laptop
  // (especially with OneDrive syncing the project folder) and tests time out waiting to render.
  workers: process.env.CI ? 1 : 3,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      // App behaviour against the production build.
      name: 'chromium',
      testIgnore: /pwa\.spec\.ts/,
      // The service worker is covered by the pwa project; here it would hide requests from page.route in WebKit.
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PREVIEW_PORT}`, serviceWorkers: 'block' },
    },
    {
      // The same tests in Safari's engine: catches CSS and API differences Chromium hides.
      name: 'webkit',
      testIgnore: /pwa.spec.ts/,
      use: { ...devices['Desktop Safari'], baseURL: `http://localhost:${PREVIEW_PORT}`, serviceWorkers: 'block' },
    },
    {
      // The service worker is only registered by a production build, so the
      // offline test runs against `vite preview` of a separate build folder.
      name: 'pwa',
      testMatch: /pwa\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PREVIEW_PORT}` },
    },
  ],
  webServer: [
    {
      // Built inside node_modules so a dev server you have running, which watches the
      // project folder, is not reloaded by a new index.html appearing in the project.
      command: `npx vite build --outDir ${PREVIEW_DIR} --emptyOutDir && npx vite preview --outDir ${PREVIEW_DIR} --port ${PREVIEW_PORT} --strictPort`,
      url: `http://localhost:${PREVIEW_PORT}`,
      reuseExistingServer: false,
      timeout: 180000,
      env: offline,
    },
  ],
});
