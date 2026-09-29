import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "path";

// Separate customer-app build. Never merged into the ERP bundle:
// own entry (customer.html), own dist (dist-customer), own public dir.
// Deploy dist-customer as its own Vercel project on its own domain.
export default defineConfig({
  plugins: [react()],
  publicDir: resolve(__dirname, "public-customer"),
  build: {
    outDir: "dist-customer",
    emptyOutDir: true,
    rollupOptions: {
      // The service worker (firebase-messaging-sw.js) is a separate,
      // self-contained build: vite.customer-sw.config.ts.
      input: {
        main: resolve(__dirname, "customer.html"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@customer": resolve(__dirname, "src/customer"),
    },
  },
});
