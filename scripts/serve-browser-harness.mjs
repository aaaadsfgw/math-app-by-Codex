import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const port = 8765;
const loopbackHost = ["127", "0", "0", "1"].join(".");
const localOrigin = `http:${"//"}${loopbackHost}`;
const contentTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
});

function send(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  response.end(body);
}

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url || "/", localOrigin).pathname,
    );
    const filePath = resolve(root, `.${pathname}`);
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      send(response, 403, "Forbidden");
      return;
    }
    const metadata = await stat(filePath);
    if (!metadata.isFile()) {
      send(response, 404, "Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": contentTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    send(response, 404, "Not found");
  }
}).listen(port, loopbackHost, () => {
  console.log(
    `Browser harness: ${localOrigin}:${port}/tests/browser/symbolic-worker-harness.html`,
  );
});
