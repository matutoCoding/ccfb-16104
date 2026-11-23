import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  timeout: 120000,
  use: {
    headless: true,
    baseURL: 'http://127.0.0.1:5183',
    viewport: { width: 1600, height: 900 },
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 5183 --strictPort',
    url: 'http://127.0.0.1:5183/',
    reuseExistingServer: false,
    timeout: 60000,
  },
})
