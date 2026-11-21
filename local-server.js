"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const vagaHandler = require("./api/vaga");
const vagasHandler = require("./api/vagas");
const candidaturasHandler = require("./api/candidaturas");
const gestorAuthHandler = require("./api/gestor-auth");

const root = __dirname;
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/manifest+json; charset=utf-8",
  ".png": "image/png"
};
const publicAssets = new Map([
  ["/manifest.json", path.join("public", "manifest.json")],
  ["/gestor-manifest.json", path.join("public", "gestor-manifest.json")],
  ["/sw.js", path.join("public", "sw.js")],
  ["/icon-192.png", path.join("public", "icon-192.png")],
  ["/icon-512.png", path.join("public", "icon-512.png")]
]);
const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, "http://127.0.0.1");
  if (requestUrl.pathname === "/api/vaga") {
    vagaHandler(request, response);
    return;
  }
  if (requestUrl.pathname === "/api/vagas") {
    vagasHandler(request, response);
    return;
  }
  if (requestUrl.pathname === "/api/candidaturas") {
    candidaturasHandler(request, response);
    return;
  }
  if (requestUrl.pathname === "/api/gestor-auth") {
    gestorAuthHandler(request, response);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400);
    response.end("Invalid path");
    return;
  }
  const relativePath = publicAssets.get(pathname) || (pathname === "/" ? "index.html" : pathname.slice(1));
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Could not read file");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  });
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, "127.0.0.1", () => {
  console.log(`Sua Vaga RS disponível em http://127.0.0.1:${port}`);
});
