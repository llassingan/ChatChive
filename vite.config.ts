/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static, client-side only. See PRD §10 (tech approach) and §8 (privacy).
export default defineConfig({
  plugins: [react()],
  // Relative base so the build works on any static host sub-path
  // (GitHub Pages project pages, Cloudflare Pages, Netlify).
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/unit/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
    },
  },
});
