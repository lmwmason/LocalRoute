import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import { readConfig } from "./config";
import { createApp } from "./app";
import { SupabaseRepository } from "./repository";

const root = resolve(import.meta.dirname, "..");
if (existsSync(resolve(root, ".env")))
  process.loadEnvFile(resolve(root, ".env"));
const config = readConfig(process.env);
config.warnings.forEach((warning) => console.warn(warning));
const repository =
  config.live && config.database ? new SupabaseRepository(config) : undefined;
const app = createApp(config, repository);
if (existsSync(resolve(root, "dist/index.html"))) {
  app.use(express.static(resolve(root, "dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve(root, "dist/index.html")),
  );
}
const port = Number(process.env.PORT) || 3001;
const server = app.listen(port, "127.0.0.1", () =>
  console.log(
    `LocalRoute API: http://127.0.0.1:${port} (${config.live ? "live" : "demo"})`,
  ),
);
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
