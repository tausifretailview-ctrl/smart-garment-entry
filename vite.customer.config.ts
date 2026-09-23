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
      input: {
        main: resolve(__dirname, "customer.html"),
        sw: resolve(__dirname, "src/customer/sw.ts"),
      },
      output: {
        // The service worker must be served at the domain root with a fixed name.
        entryFileNames: (chunk) =>
          chunk.name === "sw" ? "firebase-messaging-sw.js" : "assets/[name]-[hash].js",
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
