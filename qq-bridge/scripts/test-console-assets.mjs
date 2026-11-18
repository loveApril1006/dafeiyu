import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import {
  CONSOLE_SCRIPT_PARTS,
  readConsoleDocument,
} from "../src/console-assets.js";
import { bridgeHarness } from "./audit-bridge-harness.mjs";

const root = path.resolve(".");
const source = CONSOLE_SCRIPT_PARTS.map((p) =>
  fs.readFileSync(path.join(root, "public", p), "utf8"),
).join("");
const html = fs.readFileSync("public/console.html", "utf8");
assert(html.includes("/console-assets/app.js"));
assert(html.includes("/console-assets/console.css"));
assert(
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].every(
    (m) => Buffer.byteLength(m[1]) < 1000,
  ),
);
const expanded = readConsoleDocument(root);
assert(expanded.includes(source));
assert(expanded.includes("--accent:"));
const h = await bridgeHarness();
const server = h.startConsoleServer();
if (!server.listening) await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port;
try {
  const response = await fetch(base + "/console-assets/app.js");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), source);
  const etag = response.headers.get("etag");
  assert(etag);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const cached = await fetch(base + "/console-assets/app.js", {
    headers: { "if-none-match": etag },
  });
  assert.equal(cached.status, 304);
  assert.equal(await cached.text(), "");
  const css = await fetch(base + "/console-assets/console.css");
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type"), /text\/css/);
  for (const [name, mime] of [["workbench.css", "text/css"], ["workbench.js", "text/javascript"], ["blue-clay-geometry.png", "image/png"], ["assistant-avatar.webp", "image/webp"], ["video-cover.webp", "image/webp"]]) {
    const response = await fetch(base + "/console-assets/" + name);
    assert.equal(response.status, 200, name);
    assert(response.headers.get("content-type").startsWith(mime), name);
    const expected=fs.readFileSync(path.join(root, "public/console", name));
    const shared=name==='workbench.css'?fs.readFileSync(path.join(root,"public/console/design-system.css")):Buffer.alloc(0);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.concat([expected,shared]), name + " must preserve source order and shared design styles");
    const conditional = await fetch(base + "/console-assets/" + name, {headers:{"if-none-match":response.headers.get("etag")}});
    assert.equal(conditional.status, 304, name);
  }
  const head = await fetch(base + "/console-assets/app.js", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal(
    Number(head.headers.get("content-length")),
    Buffer.byteLength(source),
  );
  assert.equal(
    (
      await fetch(base + "/console-assets/app.js", {
        method: "POST",
        body: "{}",
      })
    ).status,
    405,
  );
  assert.equal((await fetch(base + "/api/status")).status, 401);
  assert.equal((await fetch(base + "/console-assets/unknown.js")).status, 401);
  const host = await new Promise((resolve, reject) =>
    http
      .get(
        base + "/console-assets/app.js",
        { headers: { Host: "evil.example" } },
        (r) => {
          r.resume();
          resolve(r.statusCode);
        },
      )
      .on("error", reject),
  );
  assert.equal(host, 403);
  const target = path.join(h.temp, "public", CONSOLE_SCRIPT_PARTS[0]);
  fs.appendFileSync(target, "\n// fixture asset update\n");
  const updated = await fetch(base + "/console-assets/app.js", {
    headers: { "if-none-match": etag },
  });
  assert.equal(updated.status, 200);
  assert.notEqual(updated.headers.get("etag"), etag);
  assert((await updated.text()).includes("// fixture asset update"));
  assert.equal(h.calls.prompts.length, 0);
  assert.equal(h.calls.sent.length, 0);
  console.log(
    "PASS split console: exact script bytes and order, compact HTML, CSS/JS MIME, ETag/304, HEAD, fixed asset routes, Host guard and authenticated APIs; zero messages/models",
  );
} finally {
  await new Promise((r) => server.close(r));
  await h.close();
}
