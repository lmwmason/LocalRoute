import type { Express } from "express";
declare const runtime: {
  default: Express;
  createVercelApp: (env?: NodeJS.ProcessEnv) => Express;
};
export = runtime;
