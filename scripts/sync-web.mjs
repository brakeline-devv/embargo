// Copies the pure engine files into web/engine/ so the site's demo runs the exact same code as the MCP server.
// The engine has no Node dependencies (engine.js, identical.js, guard.js, demo.js), so it runs in the browser as-is.
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
mkdirSync(join(root, "web", "engine"), { recursive: true });
for (const f of ["engine.js", "identical.js", "guard.js", "demo.js"]) copyFileSync(join(root, "src", f), join(root, "web", "engine", f));
console.log("web/engine synced");
