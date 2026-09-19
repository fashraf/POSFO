import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Where the API actually is. Only the proxy uses this, so it is a server-side
  // value and never reaches the browser bundle.
  const apiTarget = env.API_PROXY_TARGET ?? 'http://localhost:5001';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      strictPort: true,
      port: 9191,
      open: false,

      /*
       * Proxy /api to the backend.
       *
       * The browser then only ever talks to localhost:9191, so the request is
       * same-origin: no CORS, no preflight, and no mismatch between http and
       * https. Three separate failures this session came from the frontend
       * calling a different origin than it was served from, and a proxy removes
       * that entire category rather than configuring around it.
       *
       * It also matches production, where a reverse proxy serves the app and
       * forwards /api — so development and production behave the same way.
       */
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          // The dev certificate is self-signed; accept it when proxying to https.
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
