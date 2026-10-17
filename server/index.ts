import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type ErrorRequestHandler } from "express";
import { readConfig } from "./config";
import { createApp } from "./app";
import { SupabaseRepository } from "./repository";
import { isLocalRouteSupabase } from "../shared/config";
import { legalDocuments } from "../shared/legal";

const applicationRoot = resolve(import.meta.dirname, "..");

class StartupError extends Error {}

export function readListenOptions(env: NodeJS.ProcessEnv) {
  const production = env.NODE_ENV === "production";
  const rawPort = env.PORT?.trim() || "3001";
  const port = Number(rawPort);
  if (
    !/^\d+$/.test(rawPort) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new StartupError("PORT must be an integer between 1 and 65535.");
  // Development never inherits a platform-wide HOST binding.
  const host = production ? env.HOST?.trim() || "0.0.0.0" : "127.0.0.1";
  if (!isIP(host) && host !== "localhost")
    throw new StartupError("HOST must be an IP address or localhost.");
  return { host, port, production };
}

function isFrontendPath(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (/^\/s\/[-_A-Za-z0-9]{43}$/.test(path)) return true;
  if (legalDocuments.some((document) => path === `/legal/${document}`))
    return true;
  // Keep in sync with the browser router without shipping browser source as a
  // server runtime dependency. Unknown pages/assets must retain a real 404.
  return (
    [
      "/",
      "/plan",
      "/discover",
      "/saved",
      "/contribute",
      "/login",
      "/account",
      "/account/booking",
      "/feedback",
      "/corrections",
      "/reports",
      "/admin",
    ].includes(path) ||
    /^\/plan\/new\/[1-4]$/.test(path) ||
    /^\/(?:places|itineraries)\/[^/]+$/.test(path) ||
    /^\/admin\/[^/]+(?:\/[^/]+)*$/.test(path)
  );
}

export function attachBuiltFrontend(app: Express, directory: string) {
  const index = resolve(directory, "index.html");
  // Reserve the API namespace even when this helper is used without createApp.
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  if (existsSync(index)) {
    app.use(
      express.static(directory, {
        index: false,
        redirect: false,
        dotfiles: "deny",
      }),
    );
    app.get("/{*path}", (req, res, next) => {
      if (!isFrontendPath(req.path) || !req.accepts("html")) return next();
      res.set("Cache-Control", "no-store").sendFile(index);
    });
  }
  app.use((_req, res) => res.status(404).json({ error: "Route not found." }));
  const errors: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    res
      .status(error.status === 404 ? 404 : 500)
      .json({ error: "Unable to serve this resource." });
  };
  app.use(errors);
}

export function createShutdown(server: Server, graceMs = 10000) {
  let closing: Promise<void> | undefined;
  return () =>
    (closing ||= new Promise<void>((done) => {
      const deadline = setTimeout(() => server.closeAllConnections(), graceMs);
      deadline.unref();
      server.close(() => {
        clearTimeout(deadline);
        done();
      });
      server.closeIdleConnections();
    }));
}

/** Configuration is injectable for local tests; only the CLI loads root .env. */
export async function startServer(
  env: NodeJS.ProcessEnv = process.env,
  root = applicationRoot,
) {
  const { host, port, production } = readListenOptions(env);
  for (const name of ["SUPABASE_URL", "VITE_SUPABASE_URL"] as const)
    if (env[name] && !isLocalRouteSupabase(env[name]))
      throw new StartupError(
        `${name} must use the LocalRoute Supabase project pjdawapasozsrpnrtsfx.`,
      );
  const directory = resolve(root, "dist");
  if (production && !existsSync(resolve(directory, "index.html")))
    throw new StartupError(
      "Production build missing. Run npm run build before starting the server.",
    );
  const config = readConfig(env);
  config.warnings.forEach((warning) => console.warn(warning));
  const repository =
    config.live && config.database ? new SupabaseRepository(config) : undefined;
  const app = createApp(config, repository);
  attachBuiltFrontend(app, directory);
  const server = createServer(app);
  await new Promise<void>((ready, reject) => {
    server.once("error", reject);
    server.listen({ host, port }, () => {
      server.off("error", reject);
      ready();
    });
  });
  return {
    server,
    shutdown: createShutdown(server),
    mode: config.live ? "live" : "demo",
  };
}

async function main() {
  const envPath = resolve(applicationRoot, ".env");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const runtime = await startServer();
  const stop = () => {
    void runtime.shutdown();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  runtime.server.once("close", () => {
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
  });
  runtime.server.on("error", () => {
    console.error("LocalRoute HTTP server failed.");
    process.exitCode = 1;
    stop();
  });
  const address = runtime.server.address();
  if (address && typeof address !== "string") {
    const host =
      isIP(address.address) === 6 ? `[${address.address}]` : address.address;
    console.log(
      `LocalRoute API: http://${host}:${address.port} (${runtime.mode})`,
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void main().catch((error) => {
    console.error(
      error instanceof StartupError
        ? error.message
        : "LocalRoute startup failed. Check configuration and port availability.",
    );
    process.exitCode = 1;
  });
}
