const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: '../artifacts/e2e/test-results',
  reporter: [
    ['line'],
    ['junit', { outputFile: '../artifacts/e2e/junit.xml' }],
    ['json', { outputFile: '../artifacts/e2e/report.json' }],
    ['html', { outputFolder: '../artifacts/e2e/html-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.E2E_FRONTEND_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20000,
    navigationTimeout: 30000,
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 5'] }, testMatch: /public-mobile\.spec\.js/ },
  ],
});
