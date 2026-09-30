import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

type ReplitPluginModule = {
  cartographer: (options: { root: string }) => import("vite").Plugin;
  devBanner: () => import("vite").Plugin;
};

const loadReplitPlugin = (packageName: string) =>
  import(packageName) as Promise<ReplitPluginModule>;

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

const basePath = process.env.BASE_PATH ?? "/";

// Fallback hardcoded para builds locales sin env vars (proyecto privado).
// Las env vars siguen teniendo prioridad cuando estan definidas.
const FALLBACK_GOOGLE_MAPS_KEY_WEB = "AIzaSyBLqGtCFZG3-cl9oILRHE-1QOJATX-gm-4";
const FALLBACK_GOOGLE_MAPS_KEY_MOBILE = "AIzaSyBgqWClAVqHNOEXpNMCOEBYLf6btFPZugY";
const FALLBACK_GOOGLE_MAPS_MAP_ID = "779eb6873b48b48d3de54d56";

export default defineConfig({
  base: basePath,
  define: {
    // Key para WEB/PWA (Maps JavaScript API). Restringida por HTTP referrer.
    __GOOGLE_MAPS_KEY__: JSON.stringify(
      (process.env.GOOGLE_MAPS_API_KEY ?? "").trim() || FALLBACK_GOOGLE_MAPS_KEY_WEB,
    ),
    // Key para MOBILE (Maps SDK for Android / iOS). Restringida por package
    // name + SHA-1 del APK. Va separada para poder rotar y restringir cada
    // una de forma independiente y que el billing quede aislado por proyecto.
    __GOOGLE_MAPS_KEY_MOBILE__: JSON.stringify(
      (process.env.GOOGLE_MAPS_API_KEY_MOBILE ?? "").trim() ||
        FALLBACK_GOOGLE_MAPS_KEY_MOBILE,
    ),
    // Map ID estilizado creado en Google Cloud Console (Fixgo Dark).
    __GOOGLE_MAPS_MAP_ID__: JSON.stringify(
      (process.env.GOOGLE_MAPS_MAP_ID ?? "").trim() || FALLBACK_GOOGLE_MAPS_MAP_ID,
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    {
      name: "native-capacitor-stub",
      resolveId(id) {
        const NATIVE_ONLY = [
          "@capacitor/app-launcher",
          "@capacitor/browser",
          "@capacitor-community/keep-awake",
          "@mediapipe/tasks-vision",
        ];
        if (NATIVE_ONLY.includes(id)) return `\0native-stub:${id}`;
      },
      load(id) {
        if (!id.startsWith("\0native-stub:")) return;
        const pkg = id.replace("\0native-stub:", "");
        const noop = "async () => ({})";
        if (pkg === "@capacitor-community/keep-awake")
          return `export const KeepAwake = { keepAwake: ${noop}, allowSleep: ${noop}, isSupported: ${noop} }; export default { KeepAwake };`;
        if (pkg === "@capacitor/app-launcher")
          return `export const AppLauncher = { openUrl: ${noop}, canOpenUrl: ${noop} }; export default { AppLauncher };`;
        if (pkg === "@capacitor/browser")
          return `export const Browser = { open: ${noop}, close: ${noop}, addListener: ${noop} }; export default { Browser };`;
        return "export default {};";
      },
    },
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await loadReplitPlugin("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await loadReplitPlugin("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/scheduler/")) {
            return "react-vendor";
          }
          // Routing + query
          if (id.includes("node_modules/wouter/") || id.includes("node_modules/@tanstack/")) {
            return "query-vendor";
          }
          // Radix UI primitives + framer-motion + sonner (UI layer)
          if (id.includes("node_modules/@radix-ui/") || id.includes("node_modules/framer-motion/") || id.includes("node_modules/sonner/")) {
            return "ui-vendor";
          }
          // Firebase
          if (id.includes("node_modules/firebase/") || id.includes("node_modules/@firebase/")) {
            return "firebase-vendor";
          }
          // Maps
          if (id.includes("node_modules/leaflet/") || id.includes("node_modules/@googlemaps/")) {
            return "maps-vendor";
          }
          // Socket.IO client
          if (id.includes("node_modules/socket.io-client/") || id.includes("node_modules/engine.io-client/")) {
            return "socket-vendor";
          }
          // Zod + form libs
          if (id.includes("node_modules/zod/") || id.includes("node_modules/react-hook-form/") || id.includes("node_modules/@hookform/")) {
            return "form-vendor";
          }
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: false,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
