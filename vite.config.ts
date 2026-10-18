import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    outDir: path.resolve(root, 'dist'),
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api/mangadex-covers': {
        target: 'https://uploads.mangadex.org/covers',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mangadex-covers/, ''),
        headers: {
          Referer: 'https://mangadex.org',
        },
      },
      '/api/mangadex': {
        target: 'https://api.mangadex.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mangadex/, ''),
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api/mangadex-covers': {
        target: 'https://uploads.mangadex.org/covers',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mangadex-covers/, ''),
        headers: {
          Referer: 'https://mangadex.org',
        },
      },
      '/api/mangadex': {
        target: 'https://api.mangadex.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mangadex/, ''),
      },
    },
  },
});
