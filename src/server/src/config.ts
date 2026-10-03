import path from "node:path";

// All scripts are run from src/server (via npm scripts), so the repo's /data is two levels up.
export const DATA_DIR = path.resolve(process.cwd(), "../../data");
export const PROCESSED_DIR = path.join(DATA_DIR, "processed");
