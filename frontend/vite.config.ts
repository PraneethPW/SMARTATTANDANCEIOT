import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Three.js is isolated and loaded only when the immersive hero mounts.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          visuals: ['three', '@react-three/fiber', '@react-three/drei'],
          charts: ['recharts'],
          motion: ['framer-motion', 'gsap', 'lenis'],
          realtime: ['socket.io-client'],
        },
      },
    },
  },
});
