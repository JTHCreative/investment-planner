import { defineConfig } from 'vitest/config';

// Security rules tests need the Firestore emulator; `npm run test:rules` starts it around this run.
export default defineConfig({
  test: {
    include: ['rules-tests/**/*.test.ts'],
    fileParallelism: false,
  },
});
