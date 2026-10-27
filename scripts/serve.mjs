import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../example", import.meta.url));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".json": "application/json",
};
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/example" || url.pathname.startsWith("/example/")) {
      const page = url.pathname.slice("/example".length);
      response.writeHead(302, {
        Location: (!page || page === "/index.html" ? "/" : page) + url.search,
      });
      response.end();
      return;
    }
    let path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (path !== root && !path.startsWith(root + sep)) {
      response.writeHead(403);
      response.end();
      return;
    }
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    response.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(await readFile(path));
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(8080, "127.0.0.1", () =>
  console.log(
    "Examples: http://localhost:8080/\nLive editor: http://localhost:8080/editor.html",
  ),
);
