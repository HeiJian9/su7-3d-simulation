import { defineConfig } from '@playwright/test';
import path from 'node:path';
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['json', { outputFile: 'docs/validation/i3-final/playwright-results.json' }], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:3003', channel: 'msedge', screenshot: 'only-on-failure', trace: 'retain-on-failure', permissions: ['microphone'], launchOptions: { args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${path.resolve('.tools/test-fixtures/mock-microphone.wav')}`] } },
  projects: [
    { name: 'Edge-1920x1080', use: { viewport: { width: 1920, height: 1080 } } },
    { name: 'Edge-1366x768', use: { viewport: { width: 1366, height: 768 } } },
  ],
  webServer: { command: 'npm run start:test', url: 'http://localhost:3003', reuseExistingServer: !process.env.CI },
});
