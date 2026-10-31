import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CSP } from "./src/csp";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.resolve(here, "../pipeline/out");
const cesiumRoot = path.resolve(here, "node_modules/cesium/Build/Cesium");

// Cesium's runtime files (Workers, Assets, Widgets, ThirdParty) at /cesium: served in dev, copied on build.
function cesiumAssets(): Plugin {
  const types: Record<string, string> = { ".js": "text/javascript", ".json": "application/json", ".xml": "application/xml", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".wasm": "application/wasm" };
  return {
    name: "wildscope-cesium-assets",
    configureServer(s) {
      s.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
        if (!url.startsWith("/cesium/")) return next();
        const file = path.normalize(path.join(cesiumRoot, decodeURIComponent(url.slice("/cesium/".length))));
        if (!file.startsWith(cesiumRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          res.statusCode = 404;
          return res.end("not found");
        }
        res.setHeader("Content-Type", types[path.extname(file)] ?? "application/octet-stream");
        fs.createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      const out = path.join(options.dir ?? path.join(here, "dist"), "cesium");
      for (const d of ["Workers", "ThirdParty", "Assets", "Widgets"]) fs.cpSync(path.join(cesiumRoot, d), path.join(out, d), { recursive: true });
    },
  };
}

// Serves the local pipeline output at /data/v1/ in dev and preview, the same layout CloudFront serves.
function localData(): Plugin {
  const handler = (req: { url?: string }, res: import("node:http").ServerResponse, next: () => void) => {
    const url = (req.url || "").split("?")[0];
    if (!url.startsWith("/data/v1/")) return next();
    let rel = url.slice("/data/v1/".length);
    const [id, ...rest] = rel.split("/");
    if (rest.length && !fs.existsSync(path.join(dataRoot, id))) rel = [id.replace(/-[0-9a-f]{8}$/, ""), ...rest].join("/");
    const file = path.normalize(path.join(dataRoot, rel));
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
    cesiumAssets(),
    localData(),
  ],
  define: { CESIUM_BASE_URL: JSON.stringify("/cesium") },
  server: { port: 5173, proxy: process.env.WILDSCOPE_API ? { "/api": { target: process.env.WILDSCOPE_API, changeOrigin: true } } : undefined },
  preview: { port: 4173, headers: { "Content-Security-Policy": CSP } },
  build: { chunkSizeWarningLimit: 6000, sourcemap: false },
});
