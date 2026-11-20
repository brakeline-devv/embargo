// Local preview of the website: node serve.js → http://127.0.0.1:6500
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import "./scripts/sync-web.mjs";

const WEB = fileURLToPath(new URL("./web/", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".json": "application/json", ".ico": "image/x-icon" };
createServer((req, res) => {
  let p = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^([/\\])+/, "");
  let f = join(WEB, p || "index.html");
  if (!f.startsWith(WEB)) { res.writeHead(403); return res.end(); }
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f)) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(f));
}).listen(6500, "127.0.0.1", () => console.log("site on http://127.0.0.1:6500"));
