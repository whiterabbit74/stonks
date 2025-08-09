/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const publicBasePath = process.env.PUBLIC_BASE_PATH || '/';

export default defineConfig({
  base: publicBasePath,
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom'],
          'utils-vendor': ['papaparse', 'zustand'],
          
          // Core app components
          'app-core': ['./src/components/App.tsx', './src/components/DataUpload.tsx', './src/components/StrategySettings.tsx', './src/components/BacktestRunner.tsx', './src/components/Results.tsx'],
        }
      }
    },
    // Enable source maps for better debugging
    sourcemap: true,
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
  },
  // Performance optimizations
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'zustand',
      'papaparse',
      'lucide-react'
    ]
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**', '**/playwright-report/**', '**/test-results/**'],
  },
})
