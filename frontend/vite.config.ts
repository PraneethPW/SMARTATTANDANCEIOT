import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const localBackend = mode === "development";
  const target = localBackend
    ? env.VITE_DEV_API_TARGET || "http://localhost:8081"
    : env.VITE_LIVE_API_URL || "https://backend-production-586c.up.railway.app";
  const proxy: Record<string, ProxyOptions> = {
    "/api": { target, changeOrigin: true },
    "/health": { target, changeOrigin: true },
    "/socket.io": { target, changeOrigin: true, ws: true },
  };
  if (command === "serve") {
    console.info(
      localBackend
        ? "[TransitSync] Local frontend + local API. Configure backend/.env before starting."
        : "[TransitSync] Local frontend connected to the LIVE API. Registrations and saved changes affect production records.",
    );
  }
  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true, proxy },
    preview: { port: 4173, strictPort: true, proxy },
    build: {
      target: "es2022",
      sourcemap: true,
      // Three.js is isolated and loaded only when the immersive hero mounts.
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            visuals: ["three", "@react-three/fiber", "@react-three/drei"],
            charts: ["recharts"],
            motion: ["framer-motion", "gsap", "lenis"],
            realtime: ["socket.io-client"],
          },
        },
      },
    },
  };
});
