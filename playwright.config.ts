import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['json', { outputFile: 'docs/validation/playwright-results.json' }], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:3000', channel: 'msedge', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'Edge-1920x1080', use: { viewport: { width: 1920, height: 1080 } } },
    { name: 'Edge-1366x768', use: { viewport: { width: 1366, height: 768 } } },
  ],
  webServer: { command: 'npm start', url: 'http://localhost:3000', reuseExistingServer: true },
});
