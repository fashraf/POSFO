import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Fallback configuration, identical in behaviour to vite.config.ts.
 *
 * Vite transpiles a TypeScript config with esbuild before it can read it, so a
 * broken esbuild fails at "failed to load config" — before any of your code is
 * touched, which makes it look like a project problem rather than a toolchain
 * one. Plain ESM needs no transform, so this file loads even when that path is
 * broken.
 *
 * To use it:
 *   rename vite.config.ts  vite.config.ts.bak
 *   rename vite.config.mjs vite.config.js
 *
 * Worth knowing: this only sidesteps the *config* transform. Vite still uses
 * esbuild to pre-bundle dependencies, so if esbuild is genuinely broken the dev
 * server will fail a moment later instead. That is the point — it tells you
 * which of the two you are dealing with.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Where the API is. Only the proxy reads this, so it never reaches the bundle.
  const apiTarget = env.API_PROXY_TARGET ?? 'http://localhost:5001';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(dirname, './src'),
      },
    },
    server: {
      strictPort: true,
      port: 9191,
      open: false,

      /*
       * Proxy /api to the backend.
       *
       * The browser then only ever talks to localhost:9191, so requests are
       * same-origin: no CORS, no preflight, and no mismatch between http and
       * https. It also matches production, where a reverse proxy serves the app
       * and forwards /api.
       */
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          // The development certificate is self-signed.
          secure: false,
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.error(`\n[proxy] Cannot reach the API at ${apiTarget}`);
              console.error(`[proxy] ${err.message}`);
              console.error('[proxy] Is it running? Try: dotnet run --project src/PosApi\n');
            });
          },
        },
      },
    },
    preview: {
      port: 9191,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
