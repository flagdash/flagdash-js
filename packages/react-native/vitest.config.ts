import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@flagdashio/sdk': resolve(__dirname, '../sdk/src'),
    },
  },
});
