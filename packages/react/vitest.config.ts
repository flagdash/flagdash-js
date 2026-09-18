import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    // Mirrors the tsconfig `paths` so tests resolve the workspace dependency
    // from source. Without this, vitest follows @flagdashio/sdk's `exports` to
    // dist/ and fails with "Failed to resolve entry for package" unless that
    // package happens to have been built first — which CI does not do, since it
    // lints and tests each package in isolation. react-native already does this.
    //
    // The subpath alias has to come first: the bare specifier would otherwise
    // match '@flagdashio/sdk/replay' as a prefix and rewrite it to
    // '../sdk/src/replay', which resolves only by accident of directory layout.
    alias: [
      { find: '@flagdashio/sdk/replay', replacement: resolve(__dirname, '../sdk/src/replay.ts') },
      { find: /^@flagdashio\/sdk$/, replacement: resolve(__dirname, '../sdk/src') },
    ],
  },
});
