import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer, get } from "node:http";
import { connect } from "node:net";
import { once } from "node:events";
import express from "express";
import request from "supertest";
import { build } from "vite";
import { chromium, expect as browserExpect } from "@playwright/test";
import {
  attachBuiltFrontend,
  createShutdown,
  readListenOptions,
  startServer,
} from "../server/index";

const fixture = mkdtempSync(join(tmpdir(), "localroute-runtime-"));
const dist = join(fixture, "dist");
beforeAll(() => {
  mkdirSync(join(dist, "assets"), { recursive: true });
  mkdirSync(join(dist, "api"));
  writeFileSync(
    join(dist, "index.html"),
    "<!doctype html><title>LocalRoute fixture</title><div id='root'>APP_SHELL</div>",
  );
  writeFileSync(
    join(dist, "assets", "fixture.js"),
    "window.fixtureLoaded=true;",
  );
  writeFileSync(join(dist, "api", "missing"), "NOT_AN_API_RESPONSE");
  writeFileSync(join(dist, ".env"), "FAKE_SECRET_MUST_NOT_BE_SERVED");
});
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

async function freePort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("No TCP port");
  await new Promise<void>((done) => probe.close(() => done()));
  return address.port;
}

describe("runtime binding and static/API routing", () => {
  it("keeps development on loopback and accepts platform PORT/HOST only for production", () => {
    expect(readListenOptions({ HOST: "0.0.0.0", PORT: "4321" })).toEqual({
      host: "127.0.0.1",
      port: 4321,
      production: false,
    });
    expect(readListenOptions({ NODE_ENV: "production", PORT: "4321" })).toEqual(
      { host: "0.0.0.0", port: 4321, production: true },
    );
    expect(
      readListenOptions({ NODE_ENV: "production", HOST: "::", PORT: "4321" })
        .host,
    ).toBe("::");
    for (const value of [
      "0",
      "-1",
      "65536",
      "3.5",
      "1e3",
      "pipe-name",
      "SECRET_BAD_PORT",
    ])
      expect(() => readListenOptions({ PORT: value })).toThrow(
        "PORT must be an integer between 1 and 65535.",
      );
    expect(() =>
      readListenOptions({
        NODE_ENV: "production",
        HOST: "https://secret@example.test",
      }),
    ).toThrow("HOST must be an IP address or localhost.");
  });
  it("serves known browser routes, refreshes and assets without rewriting unknown/API requests to HTML", async () => {
    const app = express();
    attachBuiltFrontend(app, dist);
    for (const path of [
      "/",
      "/plan",
      "/plan/new/2",
      "/discover",
      "/legal/privacy",
      "/legal/terms",
      "/account/booking",
      "/saved",
      `/s/${"a".repeat(43)}`,
    ]) {
      for (let repeat = 0; repeat < 2; repeat++) {
        const response = await request(app)
          .get(path)
          .set("Accept", "text/html");
        expect(response.status, path).toBe(200);
        expect(response.text).toContain("APP_SHELL");
        expect(response.headers["cache-control"]).toBe("no-store");
      }
    }
    expect(
      (await request(app).head("/legal/privacy").set("Accept", "text/html"))
        .status,
    ).toBe(200);
    const asset = await request(app).get("/assets/fixture.js");
    expect(asset.status).toBe(200);
    expect(asset.text).toContain("fixtureLoaded");
    for (const path of [
      "/api",
      "/api/missing",
      "/api/plan",
      "/API/missing",
      "/assets/missing.js",
      "/not-a-route",
      "/administrator",
      "/legal/missing",
      "/.env",
    ]) {
      const response = await request(app).get(path).set("Accept", "text/html");
      expect(response.status, path).toBe(404);
      expect(response.type).toBe("application/json");
      expect(response.text).not.toContain("APP_SHELL");
      expect(response.text).not.toContain("FAKE_SECRET");
    }
    expect(
      (await request(app).get("/plan").set("Accept", "application/json"))
        .status,
    ).toBe(404);
    expect((await request(app).post("/discover")).status).toBe(404);
  });
  it("rejects wrong database projects before listening, and requires built files only in production", async () => {
    for (const name of ["SUPABASE_URL", "VITE_SUPABASE_URL"]) {
      await expect(
        startServer({ [name]: "https://wrong.supabase.co" }, fixture),
      ).rejects.toThrow("must use the LocalRoute Supabase project");
    }
    await expect(
      startServer({ NODE_ENV: "production" }, join(fixture, "missing")),
    ).rejects.toThrow("Production build missing");
    const runtime = await startServer(
      { VITE_DATA_MODE: "demo", PORT: String(await freePort()) },
      join(fixture, "missing"),
    );
    try {
      expect(runtime.server.address()).toMatchObject({ address: "127.0.0.1" });
      expect((await request(runtime.server).get("/api/health")).status).toBe(
        200,
      );
      expect((await request(runtime.server).get("/plan")).status).toBe(404);
      expect((await request(runtime.server).get("/api/missing")).status).toBe(
        404,
      );
    } finally {
      await runtime.shutdown();
    }
  });
  it("binds production to the configured interface and port with demo API and build files", async () => {
    const port = await freePort();
    const runtime = await startServer(
      { NODE_ENV: "production", PORT: String(port), VITE_DATA_MODE: "demo" },
      fixture,
    );
    try {
      expect(runtime.server.address()).toMatchObject({
        address: "0.0.0.0",
        port,
      });
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(response.status).toBe(200);
      expect((await response.json()).mode).toBe("demo");
      expect((await request(runtime.server).get("/api/missing")).type).toBe(
        "application/json",
      );
    } finally {
      await runtime.shutdown();
    }
    expect(runtime.server.listening).toBe(false);
  });
  it("drains an active HTTP response, closes idle connections and makes shutdown idempotent", async () => {
    let finishResponse: (() => void) | undefined;
    let arrived: (() => void) | undefined;
    const received = new Promise<void>((done) => {
      arrived = done;
    });
    const server = createServer((_req, res) => {
      finishResponse = () => res.end("complete");
      arrived!();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No address");
    const response = new Promise<string>((done, reject) => {
      get(`http://127.0.0.1:${address.port}/slow`, (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => done(text));
      }).on("error", reject);
    });
    await received;
    const stop = createShutdown(server, 1000);
    const first = stop();
    expect(stop()).toBe(first);
    expect(server.listening).toBe(false);
    finishResponse!();
    expect(await response).toBe("complete");
    await first;
    expect(server.address()).toBeNull();
  });
  it("forcibly closes a stalled HTTP request after the drain deadline", async () => {
    const server = createServer(() => {});
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No address");
    const received = once(server, "request");
    const socket = connect(address.port, "127.0.0.1");
    socket.on("error", () => {});
    const disconnected = once(socket, "close");
    await once(socket, "connect");
    socket.write("GET /stalled HTTP/1.1\r\nHost: localhost\r\n\r\n");
    await received;
    await createShutdown(server, 30)();
    await disconnected;
    expect(socket.destroyed).toBe(true);
    expect(server.listening).toBe(false);
  });
});

it("loads and refreshes /plan, /discover and /legal/privacy from an actual production build", async () => {
  const buildRoot = mkdtempSync(join(tmpdir(), "localroute-runtime-build-"));
  const originalEnv = { ...process.env };
  const publicNames = [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_MAP_STYLE_URL",
  ];
  let runtime: Awaited<ReturnType<typeof startServer>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    for (const name of publicNames) vi.stubEnv(name, "");
    vi.stubEnv("VITE_DATA_MODE", "demo");
    vi.stubEnv("NODE_ENV", "production");
    await build({
      envDir: false,
      logLevel: "silent",
      build: { outDir: join(buildRoot, "dist"), emptyOutDir: true },
    });
    const index = readFileSync(join(buildRoot, "dist", "index.html"), "utf8");
    expect(index).toContain("/assets/");
    expect(
      readdirSync(join(buildRoot, "dist", "assets")).length,
    ).toBeGreaterThan(0);
    const port = await freePort();
    runtime = await startServer(
      {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: String(port),
        VITE_DATA_MODE: "demo",
      },
      buildRoot,
    );
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      locale: "ko-KR",
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    const base = `http://127.0.0.1:${port}`;
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === base &&
      ["GET", "HEAD"].includes(route.request().method())
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const path of ["/plan", "/discover", "/legal/privacy"]) {
      const first = await page.goto(`${base}${path}`);
      expect(first?.status()).toBe(200);
      await browserExpect(page.locator("#root")).not.toBeEmpty();
      await browserExpect(page.getByRole("heading").first()).toBeVisible();
      const refresh = await page.reload();
      expect(refresh?.status()).toBe(200);
      await browserExpect(page.getByRole("heading").first()).toBeVisible();
      if (path === "/legal/privacy")
        await browserExpect(
          page.getByRole("heading", { name: "개인정보 처리방침", exact: true }),
        ).toBeVisible();
    }
    const missing = await page.request.get(`${base}/api/no-such-route`);
    expect(missing.status()).toBe(404);
    expect(missing.headers()["content-type"]).toContain("application/json");
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    await runtime?.shutdown();
    vi.unstubAllEnvs();
    // Vite can set NODE_ENV when invoked programmatically; leave the test runner intact.
    if (originalEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv.NODE_ENV;
    rmSync(buildRoot, { recursive: true, force: true });
  }
}, 60000);
