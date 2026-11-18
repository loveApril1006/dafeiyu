// One-time, lossless source extraction; rerunning an already split page is safe.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const file = path.join(root, "public/console.html");
let html = fs.readFileSync(file, "utf8");
const beforeBytes = Buffer.byteLength(html);
if (html.includes("/console-assets/app.js")) {
  console.log("Console source is already split.");
  process.exit(0);
}
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(
  scripts.length,
  2,
  "Expected the theme bootstrap and the application script",
);
const main = scripts[1],
  source = main[1];
const boundaries = [
  ["core.js", 0],
  ["persona-models.js", source.indexOf("// ── 人格管理")],
  ["social-v2.js", source.indexOf("// ── 语音库与语音发送")],
  ["social-slang.js", source.indexOf("async function loadSocialForm()")],
  ["shell.js", source.indexOf("function openNativeLive()")],
];
assert(
  boundaries.slice(1).every((row, i) => row[1] > boundaries[i][1]),
  "All module boundaries must be present and ordered",
);
const output = path.join(root, "public/console");
fs.mkdirSync(output, { recursive: true });
for (let i = 0; i < boundaries.length; i++)
  fs.writeFileSync(
    path.join(output, boundaries[i][0]),
    source.slice(boundaries[i][1], boundaries[i + 1]?.[1] ?? source.length),
  );
assert.equal(
  boundaries
    .map(([name]) => fs.readFileSync(path.join(output, name), "utf8"))
    .join(""),
  source,
  "Application source must remain byte-for-byte identical",
);
const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
assert.equal(styles.length, 2);
fs.writeFileSync(
  path.join(output, "console.css"),
  styles.map((m) => m[1]).join("\n"),
);
html = html.replace(main[0], '<script src="/console-assets/app.js"></script>');
let first = true;
html = html.replace(/<style>([\s\S]*?)<\/style>/g, () => {
  if (!first) return "";
  first = false;
  return '<link rel="stylesheet" href="/console-assets/console.css">';
});
fs.writeFileSync(file, html);
fs.writeFileSync(
  path.join(root, "state/system-audit/console-source-split.json"),
  JSON.stringify(
    {
      htmlBeforeBytes: beforeBytes,
      htmlAfterBytes: Buffer.byteLength(html),
      scriptBytes: Buffer.byteLength(source),
      scriptUnchanged: true,
      parts: boundaries.map(([name]) => ({
        name,
        bytes: fs.statSync(path.join(output, name)).size,
      })),
    },
    null,
    2,
  ),
);
console.log(
  "Console script split without changing its source or execution order.",
);
