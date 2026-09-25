import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* A two-core machine can take longer than the 30s default over one interaction-heavy test
   * (the full end-to-end test runs 20s here, and one test has hit 30.051s), and a test that is
   * merely slow should not read as a regression. A *hung* interaction is a different thing and
   * should say so quickly, by name, which is what actionTimeout below is for. */
  timeout: 60_000,
  expect: { timeout: 10_000 },
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'https://localhost:8443',
    ignoreHTTPSErrors: true,
    /* Bounds the wait for one element, so an interaction that can never happen fails naming the
     * locator that was waited for, instead of silently eating the whole test budget. */
    actionTimeout: 10_000,
    /* Keep the trace of a failure locally as well: with retries off there is no retry to collect
     * one, and the trace is what shows what was actually on the page at the time. */
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['clipboard-read', 'clipboard-write'],
        viewport: {
          width: 1920,
          height: 1080,
        },
      },
    },

    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: {
          width: 1920,
          height: 1080,
        },
      },
    },

    //{
    //  name: 'webkit',
    //  use: {
    //    ...devices['Desktop Safari'],
    //    permissions: ['clipboard-read'],
    //    viewport: {
    //      width: 1920,
    //      height: 1080,
    //    },
    //  },
    //},

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run build && npm run local-secure-start',
    port: 8443,
    /* Always start our own server: reusing whatever happens to be on the port means a stale or
     * dying server can serve a whole run, and its death arrives as a wall of connection failures
     * that look like test failures. If the port is taken, say so instead. */
    reuseExistingServer: false,
  },
});
