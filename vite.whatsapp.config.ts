import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "path";

// Separate WhatsApp-only site (Bulk WhatsApp for shops without the ERP). Never merged into the
// ERP bundle: own entry (whatsapp.html), own dist (dist-whatsapp), own public dir.
// Deployed as its own Vercel project from whatsapp-app/.
export default defineConfig({
  plugins: [react()],
  publicDir: resolve(__dirname, "public-whatsapp"),
  build: {
    outDir: "dist-whatsapp",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "whatsapp.html"),
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
    },
  },
});
