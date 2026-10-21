import { defineConfig } from "vite";
export default defineConfig({
  base: "/led-tasso/",
  build: { manifest: true, chunkSizeWarningLimit: 600 },
});
