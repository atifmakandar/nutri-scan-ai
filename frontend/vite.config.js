import { defineConfig, loadEnv } from 'vite';
import { publicPwaPlugin } from './pwa-plugin.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const target = env.VITE_PROXY_TARGET || env.VITE_API_URL || 'http://127.0.0.1:8000';
  return {
    plugins: [publicPwaPlugin()],
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: { groups: [{ name: 'react-vendor', test: /node_modules\/(?:react|react-dom|scheduler)\// }] },
        },
      },
    },
    server: {
      proxy: {
        '/api': { target, changeOrigin: false },
        '/health': { target, changeOrigin: false },
      },
    },
    preview: {
      proxy: {
        '/api': { target, changeOrigin: false },
        '/health': { target, changeOrigin: false },
      },
    },
  };
});
