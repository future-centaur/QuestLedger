import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const http = env.VITE_AUTH === 'http';
  return {
    plugins: [react()],
    base: './',
    resolve: http
      ? { alias: { '@appdeploy/client': fileURLToPath(new URL('./src/shims/appdeploy-client.ts', import.meta.url)) } }
      : undefined,
    server: http
      ? { proxy: { '/api': env.VITE_API_URL || 'http://localhost:8787' } }
      : undefined,
    build: {
      rollupOptions: {
        maxParallelFileOps: 128,
      },
    },
  };
});
