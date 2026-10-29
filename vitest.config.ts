import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    // Whole-form integration tests take ~2.5 s on a fast machine; the 5 s default
    // made them fail on busy or slower machines (e.g. CI runners).
    testTimeout: 30_000,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/popup/**',
        // The editor shell is covered by e2e; the resume importer UI is unit tested.
        'src/options/options.ts',
        'src/options/schema.ts',
        'src/background/**',
        'src/content/index.ts',
      ],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 70, functions: 70, branches: 60, statements: 70 },
    },
  },
});
