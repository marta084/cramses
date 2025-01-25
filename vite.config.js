import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  optimizeDeps: {
    include: ['pdfjs-dist/build/pdf'],
  },
  server: {
    port: 5173,
  },
});
