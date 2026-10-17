import runtime from "../server-runtime/index.cjs";

// The explicit CJS boundary avoids Node's extensionless ESM import failures.
// Preserve the Express app itself so Vercel keeps upload request streams raw.
export const createVercelApp = runtime.createVercelApp;
export default runtime.default;
