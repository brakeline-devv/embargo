// Where embargo keeps the transaction ledger and the price cache.
// From a git checkout: ./data next to the code. Installed from npm (npx / global): ~/.embargo.
// EMBARGO_HOME overrides both.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const installed = pkgDir.split(/[\\/]/).some((part) => part === "node_modules" || part === "_npx");
export const DATA_DIR = process.env.EMBARGO_HOME || (installed ? join(homedir(), ".embargo") : join(pkgDir, "data"));
mkdirSync(DATA_DIR, { recursive: true });
export const dataFile = (name) => join(DATA_DIR, name);
