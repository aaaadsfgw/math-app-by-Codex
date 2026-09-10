const port = Number(process.argv[2] || 9333);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new TypeError("DevTools port must be an integer between 1 and 65535.");
}

const devtoolsBase = [`http:`, `//127.0.0.1:${port}`].join("");
const fixtureUrl = ["http:", "//127.0.0.1:8765/tests/browser/selection-structure-harness.html"].join("");

async function readJson(path, options) {
  const response = await fetch(`${devtoolsBase}${path}`, options);
  if (!response.ok) throw new Error(`DevTools request failed: ${response.status}`);
  return response.json();
}

function openProtocol(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return Object.freeze({
    async send(method, params = {}) {
      await ready;
      const id = nextId;
      nextId += 1;
      const result = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`DevTools command timed out: ${method}`));
        }, 10_000);
        pending.set(id, { resolve, reject, timer });
      });
      socket.send(JSON.stringify({ id, method, params }));
      return result;
    },
    close() { socket.close(); },
  });
}

const target = await readJson(`/json/new?${encodeURIComponent(fixtureUrl)}`, { method: "PUT" });
const protocol = openProtocol(target.webSocketDebuggerUrl);
try {
  await protocol.send("Runtime.enable");
  const deadline = Date.now() + 15_000;
  let snapshot = null;
  while (Date.now() < deadline) {
    const evaluation = await protocol.send("Runtime.evaluate", {
      expression: `(() => ({
        status: document.documentElement.dataset.testStatus || "running",
        summary: document.querySelector("#status")?.textContent || "",
        rows: [...document.querySelectorAll("#results tr")].map((row) => (
          [...row.cells].map((cell) => cell.textContent || "")
        )),
      }))()`,
      returnByValue: true,
    });
    snapshot = evaluation.result?.value ?? null;
    if (snapshot?.status && snapshot.status !== "running") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.log(JSON.stringify({
    ok: snapshot?.status === "passed" && snapshot?.rows?.length === 10,
    fixtureUrl,
    ...snapshot,
  }, null, 2));
  if (snapshot?.status !== "passed" || snapshot?.rows?.length !== 10) process.exitCode = 1;
} finally {
  await Promise.race([
    protocol.send("Page.close").catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 1_000)),
  ]);
  protocol.close();
}
