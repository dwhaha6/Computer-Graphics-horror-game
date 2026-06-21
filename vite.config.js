import { defineConfig } from 'vite';

// base: './' emits RELATIVE asset URLs so the build works under any GitHub
// Pages sub-path (https://user.github.io/<repo>/) without further config.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,   // deploy: drop the 2.9 MB source map (debug-only, not loaded by the game)
    chunkSizeWarningLimit: 2000,
  },
  server: {
    host: true,
    open: true,
  },
});
