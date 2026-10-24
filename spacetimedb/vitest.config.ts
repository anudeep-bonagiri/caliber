import { defineConfig } from 'vitest/config';
import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest';

// The plugin inlines the SDK and stubs the `spacetime:sys` imports so the module
// can run inside Node against the SDK's portable datastore.
export default defineConfig({
  plugins: [spacetimedbModuleTestPlugin()],
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
