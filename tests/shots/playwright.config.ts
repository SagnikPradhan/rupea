import { defineConfig } from '@playwright/test';

export default defineConfig({ testDir: '.', reporter: 'list', use: { browserName: 'chromium' } });
