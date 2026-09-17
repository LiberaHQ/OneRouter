import path from "node:path";

// The Next.js app lives in web/, one level below the repo root that holds the
// shared content source (docs/, pages/, data/) and, at runtime, this app's own
// gateway database. process.cwd() is web/ under both `next dev` and `next start`.
export const REPO_ROOT = path.join(process.cwd(), "..");
export const DOCS_DIR = path.join(REPO_ROOT, "docs");
export const PAGES_DIR = path.join(REPO_ROOT, "pages");
export const DATA_DIR = path.join(REPO_ROOT, "data");
export const GATEWAY_DB_PATH = path.join(process.cwd(), "data", "gateway.db");
// The old JSON store this replaced — read once, if present, to carry dev state over.
export const LEGACY_GATEWAY_STATE_PATH = path.join(process.cwd(), "data", "gateway-state.json");
