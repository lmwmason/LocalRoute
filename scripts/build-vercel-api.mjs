import { build } from "vite";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export async function buildVercelRuntime() {
  await build({
    root,
    configFile: false,
    envDir: false,
    publicDir: false,
    build: {
      ssr: resolve(root, "server/vercel-runtime.ts"),
      outDir: resolve(root, "server-runtime"),
      emptyOutDir: false,
      sourcemap: false,
      rollupOptions: {
        output: {
          format: "cjs",
          exports: "named",
          entryFileNames: "index.cjs",
        },
      },
    },
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await buildVercelRuntime();
  if (!process.argv.includes("--server-only")) {
    const child = spawn("npm", ["run", "build"], {
      cwd: root,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      process.exitCode = code || 0;
    });
    child.on("error", () => {
      process.exitCode = 1;
    });
  }
}
