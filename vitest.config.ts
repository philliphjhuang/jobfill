import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/popup/**',
        'src/options/**',
        'src/background/**',
        'src/content/index.ts',
      ],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 70, functions: 70, branches: 60, statements: 70 },
    },
  },
});
