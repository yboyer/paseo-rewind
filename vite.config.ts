import { fileURLToPath } from 'node:url'

import config from '@yboyer/config/vite-plus'
import { defineConfig, mergeConfig } from 'vite-plus'

export default defineConfig(
  mergeConfig(config, {
    lint: {
      overrides: [
        { files: ['index.client.tsx'], rules: { 'no-console': 'off' } },
        {
          files: ['index.client.tsx', 'client/**/*.ts', 'client/**/*.tsx', 'tests/**/*.js'],
          env: { browser: true },
        },
        { files: ['vite.config.ts'], env: { node: true } },
      ],
    },
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.js'],
      alias: {
        'react-native': fileURLToPath(new URL('./tests/react-native.js', import.meta.url)),
      },
    },
  })
)
