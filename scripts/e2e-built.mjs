import { spawn } from "node:child_process";
const build = spawn("npm", ["run", "build"], {
  stdio: "inherit",
  env: { ...process.env, VITE_DATA_MODE: "demo" },
});
build.on("exit", (code) => {
  if (code) {
    process.exitCode = code;
    return;
  }
  const server = spawn("npm", ["start"], {
    stdio: "inherit",
    env: { ...process.env, PORT: "3101", VITE_DATA_MODE: "demo" },
  });
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => server.kill(signal));
  server.on("exit", (status) => {
    process.exitCode = status || 0;
  });
});
