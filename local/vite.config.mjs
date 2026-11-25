import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
    root: fileURLToPath(new URL(demo ? "../demo/" : ".", import.meta.url)),
    base: demo ? "./" : "/",
    plugins: [react()],
    build: {
      outDir: fileURLToPath(new URL(demo ? "../dist-demo/" : "../dist-local/", import.meta.url)),
      emptyOutDir: true,
    },
  };
});
