/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the app from /<repo-name>/; Firebase Hosting and Capacitor serve it from the root.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
