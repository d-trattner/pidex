import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [
    tanstackStart({
      srcDirectory: 'app',
      router: {
        routesDirectory: '../routes',
        generatedRouteTree: './routeTree.gen.ts',
        routeFileIgnorePattern: '\\.(test|spec)\\.(ts|tsx)$',
      },
    }),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './app'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 18777,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 18777,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
  },
});
