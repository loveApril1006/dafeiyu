// Fixed public UI assets only. Account/configuration APIs remain authenticated.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const CONSOLE_SCRIPT_PARTS = Object.freeze([
  "console/core.js",
  "console/official-qq.js",
  "console/persona-models.js",
  "console/social-v2.js",
  "console/social-slang.js",
  "console/shell.js",
]);
export const CONSOLE_ASSET_FILES = Object.freeze([
  "ocean-scene.js",
  "ocean-flow.js",
  "console/console.css",
  "console/workbench.css",
  "console/design-system.css",
  "console/workbench.js",
  "console/blue-clay-geometry.png",
  "console/assistant-avatar.webp",
  "console/video-cover.webp",
  ...CONSOLE_SCRIPT_PARTS,
]);
const assetDefinitions = Object.freeze({
  css: { files: ["console/console.css", "console/design-system.css"], mime: "text/css; charset=utf-8" },
  js: { files: CONSOLE_SCRIPT_PARTS, mime: "text/javascript; charset=utf-8" },
  ocean: { files: ["ocean-scene.js"], mime: "text/javascript; charset=utf-8" },
  "ocean-flow": { files: ["ocean-flow.js"], mime: "text/javascript; charset=utf-8" },
  "workbench-css": { files: ["console/workbench.css", "console/design-system.css"], mime: "text/css; charset=utf-8" },
  "workbench-js": { files: ["console/workbench.js"], mime: "text/javascript; charset=utf-8" },
  geometry: { files: ["console/blue-clay-geometry.png"], mime: "image/png", binary: true },
  avatar: { files: ["console/assistant-avatar.webp"], mime: "image/webp", binary: true },
  cover: { files: ["console/video-cover.webp"], mime: "image/webp", binary: true },
});
const assetRoutes = new Map([
  ["/console-assets/console.css", "css"],
  ["/console-assets/app.js", "js"],
  ["/console-assets/ocean-scene.js", "ocean"],
  ["/console-assets/ocean-flow.js", "ocean-flow"],
  ["/console-assets/workbench.css", "workbench-css"],
  ["/console-assets/workbench.js", "workbench-js"],
  ["/console-assets/blue-clay-geometry.png", "geometry"],
  ["/console-assets/assistant-avatar.webp", "avatar"],
  ["/console-assets/video-cover.webp", "cover"],
]);
const cache = new Map();
// Navigations cannot send the API header; restore the saved browser credential.
export function consoleLoginDocument(){
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登录控制台</title><body><main style="font:16px system-ui;max-width:480px;margin:15vh auto;padding:24px"><h1>登录控制台</h1><p id="loginHint">正在恢复本浏览器的登录状态…</p><button id="loginAgain" type="button">输入访问令牌</button><p>验证后会记住本浏览器；修改令牌或清除浏览器数据后需重新验证。</p></main><script>
(()=>{const url=new URL(location.href),supplied=url.searchParams.get('token')||'';let saved='';try{saved=localStorage.getItem('consoleToken')||'';}catch{}
function enter(value){const t=value.trim();if(!t)return;try{localStorage.setItem('consoleToken',t);}catch{}url.searchParams.set('token',t);location.replace(url.href);}
if(saved&&saved!==supplied){enter(saved);return;}
if(supplied){try{localStorage.removeItem('consoleToken');}catch{}url.searchParams.delete('token');history.replaceState(null,'',url.pathname+url.search+url.hash);}
document.getElementById('loginHint').textContent=supplied?'原访问令牌已失效，请输入当前令牌。':'首次访问，请输入控制台访问令牌。';
const login=()=>{const t=prompt('请输入控制台访问令牌');if(t)enter(t);};document.getElementById('loginAgain').onclick=login;login();})();
</script></body></html>`;
}
function asset(root, kind) {
  const { files, binary } = assetDefinitions[kind];
  const names = files.map((file) => path.join(root, "public", file));
  const signature = names
    .map((file) => {
      const s = fs.statSync(file);
      return `${s.mtimeMs}:${s.size}`;
    })
    .join("|");
  const key = root + ":" + kind;
  let value = cache.get(key);
  if (!value || value.signature !== signature) {
    // One classic script preserves global function hoisting and initialization
    // order exactly; no eval, extra runtime or new model request is introduced.
    const body = binary ? fs.readFileSync(names[0]) : names.map((file) => fs.readFileSync(file, "utf8")).join("");
    value = {
      signature,
      body,
      etag: '"' + createHash("sha256").update(body).digest("hex") + '"',
    };
    if (cache.size >= 16) cache.delete(cache.keys().next().value);
    cache.set(key, value);
  }
  return value;
}

export function serveConsoleAsset(req, res, url, { root, headers = {} }) {
  const kind = assetRoutes.get(url.pathname);
  if (!kind) return false;
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { ...headers, Allow: "GET, HEAD" });
    res.end();
    return true;
  }
  try {
    const value = asset(root, kind);
    const responseHeaders = {
      ...headers,
      "content-type": assetDefinitions[kind].mime,
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      ETag: value.etag,
    };
    if (req.headers["if-none-match"] === value.etag) {
      res.writeHead(304, responseHeaders);
      res.end();
      return true;
    }
    res.writeHead(200, {
      ...responseHeaders,
      "content-length": Buffer.byteLength(value.body),
    });
    res.end(req.method === "HEAD" ? undefined : value.body);
  } catch {
    res.writeHead(503, {
      ...headers,
      "content-type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end("Console assets are unavailable.");
  }
  return true;
}

// Static contract checks inspect the same script/style source that the server
// serves. Real browser fixtures still request the external assets over HTTP.
export function readConsoleDocument(root) {
  const html = fs.readFileSync(path.join(root, "public/console.html"), "utf8");
  return html
    .replace(
      '<link rel="stylesheet" href="/console-assets/console.css">',
      () => "<style>" + asset(root, "css").body + "</style>",
    )
    .replace(
      '<script src="/console-assets/app.js"></script>',
      () => "<script>" + asset(root, "js").body + "</script>",
    );
}
