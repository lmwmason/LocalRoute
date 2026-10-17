import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

beforeAll(() => {
  execFileSync(
    process.execPath,
    ["scripts/build-vercel-api.mjs", "--server-only"],
    {
      env: {
        ...process.env,
        SUPABASE_SERVICE_ROLE_KEY: "PRIVATE_RUNTIME_MARKER_NOT_IN_BUNDLE",
        GEMINI_API_KEY: "PRIVATE_GEMINI_MARKER_NOT_IN_BUNDLE",
      },
      stdio: "pipe",
    },
  );
}, 30_000);
describe("compiled Vercel runtime under plain Node", () => {
  it("loads the actual entry without TSX/Vite resolvers and preserves API JSON responses", () => {
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      process.env.VITE_DATA_MODE='demo';
      const {default: app}=await import('./api/index.ts');
      if(typeof app!=='function'||typeof app.listen!=='function')throw new Error('Expected Express app export');
      const {createServer}=await import('node:http');
      const server=createServer(app);
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      const base='http://127.0.0.1:'+server.address().port;
      try {
        const results=[];
        for(const path of ['/api/health?keep=original','/api/not-a-route']){
          const response=await fetch(base+path);
          results.push({status:response.status,type:response.headers.get('content-type'),body:await response.json()});
        }
        console.log(JSON.stringify(results));
      }finally{await new Promise(resolve=>server.close(resolve));}
    `,
      ],
      { encoding: "utf8", env: { ...process.env, VITE_DATA_MODE: "demo" } },
    );
    const result = JSON.parse(output);
    expect(result[0]).toMatchObject({
      status: 200,
      body: { ok: true, mode: "demo" },
    });
    expect(result[1]).toMatchObject({ status: 404 });
    expect(
      result.every((value: { type: string }) =>
        value.type.startsWith("application/json"),
      ),
    ).toBe(true);
  });
  it("does not bake server secret environment values into generated JavaScript", () => {
    const source = readFileSync("server-runtime/index.cjs", "utf8");
    expect(source).not.toContain("PRIVATE_RUNTIME_MARKER_NOT_IN_BUNDLE");
    expect(source).not.toContain("PRIVATE_GEMINI_MARKER_NOT_IN_BUNDLE");
    expect(source).not.toMatch(/(?:from|require\()["']\.\.\/server\/app["']/);
  });
});
