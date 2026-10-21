import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { apiMiddleware } from './server/interpret.ts';

/** Serves /api/status and /api/interpret from the dev and preview servers.
 * API keys are read server-side only and never bundled into the client. */
function voiceArchitectApi() {
  return {
    name: 'voicearchitect-api',
    configureServer(server) {
      server.middlewares.use(apiMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiMiddleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode, process.cwd(), ['ANTHROPIC_', 'GROQ_', 'VOICEARCHITECT_']);
  for (const [key, value] of Object.entries(serverEnv)) {
    if (!process.env[key]) process.env[key] = value;
  }
  return {
  plugins: [
    react(),
    voiceArchitectApi(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'VoiceArchitect',
        short_name: 'VoiceArchitect',
        description: 'Voice-first architecture workspace. Say the change, see the impact.',
        theme_color: '#131211',
        background_color: '#131211',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Pre-transform the lazily loaded modules so the first import or tab switch
    // on a cold dev server is not stalled behind on-demand transforms.
    warmup: {
      clientFiles: [
        './src/data/composeImport.ts',
        './src/data/driftCheck.ts',
        './src/components/ArchitectureDiagram.jsx',
        './src/components/OpenApiPanel.jsx',
        './src/components/RiskPanel.jsx',
        './src/components/TaskPanel.jsx',
        './src/components/ChangeImpactPanel.jsx',
        './src/components/TopologyPanel.jsx',
      ],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-lucide';
            }
            if (id.includes('dagre')) {
              return 'vendor-dagre';
            }
            return 'vendor-other';
          }
        },
      },
    },
  },
};
});
