import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CSP } from "./src/csp";

const cesiumSource = "node_modules/cesium/Build/Cesium";
const dataRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../pipeline/out");

// Serves the local pipeline output at /data/v1/ in dev and preview, the same layout CloudFront serves.
function localData(): Plugin {
  const handler = (req: { url?: string }, res: import("node:http").ServerResponse, next: () => void) => {
    const url = (req.url || "").split("?")[0];
    if (!url.startsWith("/data/v1/")) return next();
    const file = path.normalize(path.join(dataRoot, url.slice("/data/v1/".length)));
    if (!file.startsWith(dataRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404;
      return res.end("not found");
    }
    res.setHeader("Content-Type", file.endsWith(".bin") ? "application/octet-stream" : "application/json");
    fs.createReadStream(file).pipe(res);
  };
  return {
    name: "wildscope-local-data",
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  };
}

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: ["Workers", "ThirdParty", "Assets", "Widgets"].map((d) => ({ src: `${cesiumSource}/${d}`, dest: "cesium" })),
    }),
    localData(),
  ],
  define: { CESIUM_BASE_URL: JSON.stringify("/cesium") },
  server: { port: 5173, proxy: process.env.WILDSCOPE_API ? { "/api": { target: process.env.WILDSCOPE_API, changeOrigin: true } } : undefined },
  preview: { port: 4173, headers: { "Content-Security-Policy": CSP } },
  build: { chunkSizeWarningLimit: 6000, sourcemap: false },
});
