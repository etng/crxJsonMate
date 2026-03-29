import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  webServer: {
    command: 'node scripts/serve-e2e-fixtures.mjs',
    url: 'http://127.0.0.1:4311/fixtures/sample-tools.json',
    reuseExistingServer: true,
    timeout: 30_000
  }
});
