/**
 * Production server for the PREGA SQUAD Manager.
 *
 * - Serves Vite static build from ./dist/public
 * - Proxies /api/* and /socket.io/* to the API_URL env var
 * - Falls back to index.html for SPA client-side routing
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = parseInt(process.env.PORT || "8080", 10);
const API_URL = (process.env.API_URL || "").replace(/\/+$/, "");
const STATIC_DIR = path.resolve(__dirname, "dist", "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".webmanifest": "application/manifest+json",
};

function proxy(req, res) {
  if (!API_URL) {
    res.writeHead(502);
    res.end(JSON.stringify({ message: "API_URL is not configured on this server." }));
    return;
  }

  const target = url.parse(API_URL);
  const options = {
    hostname: target.hostname,
    port: target.port || (target.protocol === "https:" ? 443 : 80),
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: target.hostname,
    },
  };

  const transport = target.protocol === "https:" ? https : http;
  const proxyReq = transport.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error("[Proxy Error]", err.message);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end(JSON.stringify({ message: "Bad gateway" }));
    }
  });

  req.pipe(proxyReq, { end: true });
}

function serveStatic(reqPath, res) {
  const safePath = path.normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = path.join(STATIC_DIR, safePath);

  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(STATIC_DIR, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";

  const isHtml = contentType.startsWith("text/html");
  const cacheControl = isHtml
    ? "no-cache, no-store, must-revalidate"
    : "public, max-age=31536000, immutable";

  res.writeHead(200, {
    "content-type": contentType,
    "cache-control": cacheControl,
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const reqUrl = req.url || "/";

  if (reqUrl.startsWith("/api/") || reqUrl === "/api" || reqUrl.startsWith("/socket.io")) {
    proxy(req, res);
    return;
  }

  serveStatic(reqUrl, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Manager server listening on port ${PORT}`);
  console.log(`Static files: ${STATIC_DIR}`);
  console.log(`API proxy target: ${API_URL || "(not set — /api/* will return 502)"}`);
});
