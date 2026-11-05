import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: {
      'virtual:pwa-register/react': fileURLToPath(new URL('./tests/pwa-stub.ts', import.meta.url)),
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 15000 },
});
