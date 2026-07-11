import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => ({
  root: 'src',
  envPrefix: ['VITE_', 'APPWRITE_'],
  publicDir: '../public',
  // 'dev' uses development mode, 'build' and 'preview' use production
  base: mode === 'development' ? '/' : '/FTF-Trade-Calculator/',
  server: {
    allowedHosts: true
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        inventory: resolve(__dirname, 'src/inventory.html'),
        guide: resolve(__dirname, 'src/guide.html'),
      }
    }
  }
}));
