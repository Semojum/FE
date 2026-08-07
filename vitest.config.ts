import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { alias } from './vite.config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
