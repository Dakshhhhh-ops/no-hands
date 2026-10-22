import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { apiMiddleware } from './server/interpret.ts';
import { applySecurityHeaders } from './server/securityHeaders.ts';

/** Serves /api/status and /api/interpret from the dev and preview servers.
 * API keys are read server-side only and never bundled into the client. */
function voiceArchitectApi() {
  return {
    name: 'voicearchitect-api',
    configureServer(server) {
      server.middlewares.use(apiMiddleware);
    },
    configurePreviewServer(server) {
      // The preview runs the production build under the production headers, CSP included,
      // so the browser tests catch anything the policy would block.
      server.middlewares.use((req, res, next) => {
        applySecurityHeaders(req, res, false);
        next();
      });
      server.middlewares.use(apiMiddleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode, process.cwd(), ['ANTHROPIC_', 'GROQ_', 'VOICEARCHITECT_', 'WISPR_']);
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
        // Only React gets its own long-cached chunk. Everything else follows the import
        // graph, so libraries used by lazy features (yaml for compose import, fflate for
        // exports, dagre for the diagram) load with those features, not with the page.
        manualChunks: (id) => {
          if (/node_modules[\/](react|react-dom|scheduler)[\/]/.test(id)) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
};
});
