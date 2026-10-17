import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
} from "node:timers";

const root = resolve(import.meta.dirname, "..");
const commands = [
  [
    process.execPath,
    [
      resolve(root, "node_modules/tsx/dist/cli.mjs"),
      "watch",
      "server/index.ts",
    ],
  ],
  [
    process.execPath,
    [resolve(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1"],
  ],
];

/** Run each service in its own POSIX group so watcher grandchildren are cleaned up. */
export function startDevelopment({
  services = commands,
  graceMs = 12000,
} = {}) {
  const records = [];
  let stopping = false;
  let forced = false;
  let exitCode = 0;
  let deadline;
  let poll;
  let finish;
  const finished = new Promise((resolve) => {
    finish = resolve;
  });

  function signal(record, signal) {
    if (!record.child.pid) return;
    try {
      if (process.platform !== "win32") process.kill(-record.child.pid, signal);
      else {
        const killer = spawn(
          "taskkill",
          ["/PID", String(record.child.pid), "/T", "/F"],
          { stdio: "ignore" },
        );
        killer.on("error", () => record.child.kill(signal));
      }
    } catch (error) {
      if (error.code !== "ESRCH") record.child.kill(signal);
    }
  }
  function groupAlive(record) {
    if (!record.child.pid) return false;
    if (process.platform === "win32") return !record.closed;
    try {
      process.kill(-record.child.pid, 0);
      return true;
    } catch (error) {
      return error.code !== "ESRCH";
    }
  }
  function complete() {
    if (!stopping || records.some((record) => !record.closed)) return;
    if (!forced && records.some(groupAlive)) return;
    clearTimeout(deadline);
    clearInterval(poll);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    finish(exitCode);
  }
  function stop(code = 0) {
    if (stopping) return finished;
    stopping = true;
    exitCode = code;
    records.forEach((record) => signal(record, "SIGTERM"));
    deadline = setTimeout(() => {
      forced = true;
      records.forEach((record) => signal(record, "SIGKILL"));
      complete();
    }, graceMs);
    poll = setInterval(complete, 25);
    complete();
    return finished;
  }
  function onSignal() {
    void stop();
  }
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  for (const [command, args] of services) {
    try {
      const child = spawn(command, args, {
        cwd: root,
        stdio: "inherit",
        detached: process.platform !== "win32",
        // Keep Vite's fixed local proxy and API port aligned, even in a platform shell.
        env: {
          ...process.env,
          NODE_ENV: "development",
          HOST: "127.0.0.1",
          PORT: "3001",
        },
      });
      const record = { child, closed: false };
      records.push(record);
      child.on("error", () => {
        record.closed = true;
        void stop(1);
        complete();
      });
      child.on("close", (code) => {
        record.closed = true;
        if (!stopping) void stop(code || 1);
        complete();
      });
    } catch {
      void stop(1);
      break;
    }
  }
  return { children: records.map((record) => record.child), stop, finished };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dev = startDevelopment();
  void dev.finished.then((code) => {
    process.exitCode = code;
  });
}
