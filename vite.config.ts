import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function localApi(): Plugin {
  return {
    name: 'roam-local-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'])
        if (env[key]) process.env[key] = env[key];
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0];
        try {
          if (pathname === '/api/auth') {
            const { authHandler } = await server.ssrLoadModule('/server/auth.ts');
            return await authHandler(req, res);
          }
          if (pathname === '/api/sync') {
            const { syncHandler } = await server.ssrLoadModule('/server/sync.ts');
            return await syncHandler(req, res);
          }
          next();
        } catch {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'The local server could not handle this request.' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    localApi(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Roam — your travel companion',
        short_name: 'Roam',
        description:
          'A little plan, a great trip. Save places, plan your days, and get directions in one tap.',
        theme_color: '#6336dc',
        background_color: '#f5f4fc',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'any',
        id: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        categories: ['travel', 'lifestyle', 'productivity'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,webp,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        cleanupOutdatedCaches: true,
        // Public map tiles and authenticated API responses are deliberately not cached.
        // Only the app shell, fonts, and bundled images are precached for offline use.
      },
    }),
  ],
  build: {
    rollupOptions: { output: { manualChunks: { map: ['leaflet'], icons: ['lucide-react'] } } },
  },
});
