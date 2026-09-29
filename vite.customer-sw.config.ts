import { defineConfig } from "vite";
import { resolve } from "path";

// Customer-app service worker (firebase-messaging-sw.js), built on its own
// after vite.customer.config.ts. It is registered as a classic worker, so it
// must be one self-contained script: no `import` of shared chunks (Chrome
// rejects that with "Failed to register a ServiceWorker"). IIFE + no public
// dir copy + no emptyOutDir so the page build in dist-customer stays intact.
export default defineConfig({
  publicDir: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "dist-customer",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/customer/sw.ts"),
      formats: ["iife"],
      name: "ezzyCustomerSw",
      fileName: () => "firebase-messaging-sw.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@customer": resolve(__dirname, "src/customer"),
    },
  },
});
