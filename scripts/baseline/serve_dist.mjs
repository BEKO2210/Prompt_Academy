// Minimal static server mimicking GitHub Pages for this repo:
// base path /Prompt_Academy/, gzip only (no brotli — matches measured GH Pages
// behaviour), SPA fallback to index.html (CI copies it to 404.html).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve dist/ relative to this script so the harness is portable.
const ROOT = fileURLToPath(new URL("../../site/dist/", import.meta.url)).replace(/\/$/, "");
const BASE = "/Prompt_Academy";
const TYPES = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8",
  ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg",
  ".ico":"image/x-icon", ".xml":"text/xml", ".txt":"text/plain" };

createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!p.startsWith(BASE)) { res.writeHead(404).end("no"); return; }
  p = p.slice(BASE.length) || "/";
  let file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("no"); return; }
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(ROOT, "index.html");           // SPA fallback
  }
  let buf;
  try { buf = await readFile(file); } catch { res.writeHead(404).end("no"); return; }
  const ct = TYPES[extname(file)] || "application/octet-stream";
  const wantsGzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
  const compressible = /text|json|javascript|svg|xml/.test(ct);
  res.setHeader("Content-Type", ct);
  res.setHeader("Cache-Control", "max-age=600");   // matches measured GH Pages
  if (wantsGzip && compressible) {
    res.setHeader("Content-Encoding", "gzip");
    res.writeHead(200);
    await pipeline(Readable.from(buf), createGzip({ level: 6 }), res);
  } else {
    res.setHeader("Content-Length", buf.length);
    res.writeHead(200).end(buf);
  }
}).listen(4320, "127.0.0.1", () => console.log("ready on 4320"));
