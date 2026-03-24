import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { config as loadEnvFile } from "dotenv";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";

const repoRoot = path.resolve(__dirname, "../..");

loadEnvFile({ path: path.join(repoRoot, ".env") });
loadEnvFile({ path: path.join(repoRoot, ".env.local"), override: true });

export default defineConfig({
  envDir: repoRoot,
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          build: {
            rollupOptions: {
              external: ["keytar"],
            },
          },
        },
      },
      preload: {
        input: "electron/preload.ts",
      },
    }),
  ],
});
