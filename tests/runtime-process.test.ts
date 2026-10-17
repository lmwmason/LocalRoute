import { afterAll, describe, expect, it, vi } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { once } from "node:events";

const fixture = mkdtempSync(join(tmpdir(), "localroute-process-"));
afterAll(() => rmSync(fixture, { recursive: true, force: true }));
type Dev = {
  children: ChildProcess[];
  stop: (code?: number) => Promise<number>;
  finished: Promise<number>;
};
async function development(
  services: [string, string[]][],
  graceMs = 2000,
): Promise<Dev> {
  const module = await import(pathToFileURL(resolve("scripts/dev.mjs")).href);
  return module.startDevelopment({ services, graceMs });
}
const node = (code: string): [string, string[]] => [
  process.execPath,
  ["-e", code],
];
const worker = (ready: string, stopped: string) => `
  const fs=require('node:fs');const timer=setInterval(()=>{},1000);
  fs.writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:process.pid,host:process.env.HOST,port:process.env.PORT,mode:process.env.NODE_ENV}));
  process.on('SIGTERM',()=>{fs.writeFileSync(${JSON.stringify(stopped)},'stopped');clearInterval(timer);});`;

describe("development supervisor cleanup", () => {
  it("uses local development settings and waits for both child processes to stop", async () => {
    const files = [0, 1].map((id) => [
      join(fixture, `ready-${id}`),
      join(fixture, `stopped-${id}`),
    ]);
    const dev = await development(
      files.map(([ready, stopped]) => node(worker(ready, stopped))),
    );
    try {
      await vi.waitFor(
        () => {
          for (const [ready] of files) expect(existsSync(ready)).toBe(true);
        },
        { timeout: 5000 },
      );
      const env = JSON.parse(readFileSync(files[0][0], "utf8"));
      expect(env).toMatchObject({
        host: "127.0.0.1",
        port: "3001",
        mode: "development",
      });
      const first = dev.stop();
      expect(dev.stop()).toBe(first);
      expect(await first).toBe(0);
      for (const [, stopped] of files) expect(existsSync(stopped)).toBe(true);
      expect(
        dev.children.every(
          (child) => child.exitCode !== null || child.signalCode !== null,
        ),
      ).toBe(true);
    } finally {
      await dev.stop();
    }
  });
  it("cleans up watcher grandchildren as well as direct children on POSIX", async () => {
    if (process.platform === "win32") return;
    const ready = join(fixture, "grandchild-ready"),
      stopped = join(fixture, "grandchild-stopped");
    const parent = `const {spawn}=require('node:child_process');
      const child=spawn(process.execPath,['-e',${JSON.stringify(worker(ready, stopped))}],{stdio:'ignore'});
      let stopping=false;process.on('SIGTERM',()=>{stopping=true;if(child.exitCode!==null||child.signalCode!==null)process.exit(0)});
      child.on('exit',()=>{if(stopping)process.exit(0)});setInterval(()=>{},1000);`;
    const dev = await development([node(parent)]);
    try {
      await vi.waitFor(() => expect(existsSync(ready)).toBe(true), {
        timeout: 5000,
      });
      const { pid } = JSON.parse(readFileSync(ready, "utf8"));
      expect(await dev.stop()).toBe(0);
      expect(existsSync(stopped)).toBe(true);
      expect(() => process.kill(pid, 0)).toThrow();
    } finally {
      await dev.stop();
    }
  });
  it("terminates a service that ignores SIGTERM after the bounded grace period", async () => {
    const ready = join(fixture, "stubborn-ready");
    const dev = await development(
      [
        node(
          `require('node:fs').writeFileSync(${JSON.stringify(ready)},'ready');process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`,
        ),
      ],
      100,
    );
    try {
      await vi.waitFor(() => expect(existsSync(ready)).toBe(true), {
        timeout: 5000,
      });
      expect(await dev.stop()).toBe(0);
      expect(
        dev.children[0].exitCode !== null ||
          dev.children[0].signalCode !== null,
      ).toBe(true);
    } finally {
      await dev.stop();
    }
  });
  it("stops its sibling and reports failure when a child exits or cannot spawn", async () => {
    for (const failed of [
      node("process.exit(7)"),
      [join(fixture, "missing-executable"), []] as [string, string[]],
    ]) {
      const dev = await development([failed, node("setInterval(()=>{},1000)")]);
      try {
        expect(await dev.finished).toBeGreaterThan(0);
      } finally {
        await dev.stop();
      }
      expect(
        dev.children.every(
          (child) =>
            !child.pid || child.exitCode !== null || child.signalCode !== null,
        ),
      ).toBe(true);
    }
  });
});

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}
function cli(port: string) {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", resolve("server/index.ts")],
    {
      cwd: resolve("."),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "development",
        HOST: "0.0.0.0",
        PORT: port,
        VITE_DATA_MODE: "demo",
        SUPABASE_URL: "",
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_ANON_KEY: "",
        VITE_SUPABASE_PUBLISHABLE_KEY: "",
        SUPABASE_SECRET_KEY: "FAKE_PRIVATE_DO_NOT_PRINT",
        SUPABASE_SERVICE_ROLE_KEY: "",
        HEY_YUMI_API_KEY: "",
        GEMINI_API_KEY: "",
        KAKAO_REST_API_KEY: "",
        KAKAO_MOBILITY_API_KEY: "",
      },
    },
  );
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const exited = once(child, "exit");
  return { child, exited, output: () => output };
}
it.each(["SIGTERM", "SIGINT"] as const)(
  "the real CLI closes its HTTP listener on %s and never prints credentials",
  async (signal) => {
    const port = await freePort();
    const runtime = cli(String(port));
    try {
      await vi.waitFor(
        () => expect(runtime.output()).toContain(`http://127.0.0.1:${port}`),
        { timeout: 10000 },
      );
      expect((await fetch(`http://127.0.0.1:${port}/api/health`)).status).toBe(
        200,
      );
      runtime.child.kill(signal);
      const [code, exitSignal] = await runtime.exited;
      expect(code).toBe(0);
      expect(exitSignal).toBeNull();
      expect(runtime.output()).not.toContain("FAKE_PRIVATE_DO_NOT_PRINT");
      const probe = createServer();
      probe.listen(port, "127.0.0.1");
      await once(probe, "listening");
      await new Promise<void>((done) => probe.close(() => done()));
    } finally {
      if (runtime.child.exitCode === null && runtime.child.signalCode === null)
        runtime.child.kill("SIGKILL");
    }
  },
);
it("the real CLI reports invalid settings without echoing their values", async () => {
  const runtime = cli("FAKE_PRIVATE_PORT_VALUE");
  try {
    const [code] = await runtime.exited;
    expect(code).toBe(1);
    expect(runtime.output()).toContain("PORT must be an integer");
    expect(runtime.output()).not.toContain("FAKE_PRIVATE_PORT_VALUE");
    expect(runtime.output()).not.toContain("FAKE_PRIVATE_DO_NOT_PRINT");
  } finally {
    if (runtime.child.exitCode === null && runtime.child.signalCode === null)
      runtime.child.kill("SIGKILL");
  }
});
