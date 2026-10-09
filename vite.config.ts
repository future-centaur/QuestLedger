import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    base: './',
    server: {
      proxy: { '/api': env.VITE_API_URL || 'http://localhost:8787' },
    },
    build: {
      rollupOptions: {
        maxParallelFileOps: 128,
      },
    },
  };
});
