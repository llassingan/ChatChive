import { defineConfig, devices } from '@playwright/test';

// E2E tests live in tests/e2e. The critical one asserts zero network
// requests after the app shell loads (PRD S-2, backlog E1-3).
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './.playwright/output',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },

  // Screenshot settings belong here rather than repeated at each call
  // (SPRINT-6-PLAN §5.1 item 2). `animations` and `caret` are Playwright's own
  // defaults, set anyway because the visual baselines must not depend on a
  // future default changing. `maxDiffPixels: 0` states the intent that matters:
  // an exact comparison, with no pixel allowance that could quietly make the
  // suite vacuous (§3.5). The perceived-colour `threshold` is deliberately left
  // at Playwright's 0.2: two captures of the *same* frame differ by about a
  // hundred pixels of one to three RGB steps (the fixture JPEG's resampling,
  // which waiting longer does not remove), so a stricter threshold would make
  // the baselines flaky rather than strict.
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixels: 0,
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
