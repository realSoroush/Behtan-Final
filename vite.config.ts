import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    // Raise the warning threshold a bit (Supabase + Framer Motion are heavy)
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor: React core
          'vendor-react': ['react', 'react-dom'],
          // Vendor: Animation
          'vendor-motion': ['framer-motion'],
          // Vendor: Supabase
          'vendor-supabase': ['@supabase/supabase-js'],
          // Vendor: UI utilities
          'vendor-ui': ['lucide-react', 'zustand'],
        },
      },
    },
  },
});
