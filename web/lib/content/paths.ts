import path from "node:path";

// The Next.js app lives in web/, one level below the repo root that holds the
// shared content source (docs/, pages/, data/) and, at runtime, this app's own
// gateway state file. process.cwd() is web/ under both `next dev` and `next start`.
export const REPO_ROOT = path.join(process.cwd(), "..");
export const DOCS_DIR = path.join(REPO_ROOT, "docs");
export const PAGES_DIR = path.join(REPO_ROOT, "pages");
export const DATA_DIR = path.join(REPO_ROOT, "data");
export const GATEWAY_STATE_PATH = path.join(process.cwd(), "data", "gateway-state.json");
