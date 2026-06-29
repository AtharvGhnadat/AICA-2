import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',  // Required for Electron file:// protocol
    server: {
      port: 3000,
      host: '0.0.0.0', // Listen on all local IPs
      https: true,
      watch: {
        ignored: ['**/android/**', '**/dist/**', '**/electron/**']
      }
    },
    optimizeDeps: {
      entries: ['index.html']
    },
    plugins: [react(), tailwindcss(), basicSsl()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.SERPER_API_KEY': JSON.stringify(env.SERPER_API_KEY || env.VITE_SERPER_API_KEY || '')
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
