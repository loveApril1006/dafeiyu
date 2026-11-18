// 合并 API 密钥到 DSH 凭据库（只改 refs，不动 records）
// 用法: node merge-credentials.mjs <credentials.yaml> '{"SILICONFLOW_API_KEY":"sk-..."}'
import fs from "node:fs";
import yaml from "js-yaml";

const [credPath, json] = process.argv.slice(2);
if (!credPath || !json) {
  console.error("usage: merge-credentials.mjs <path> <json>");
  process.exit(1);
}
const add = JSON.parse(json);
let doc = { version: 1, records: {}, refs: {} };
if (fs.existsSync(credPath)) {
  try {
    const loaded = yaml.load(fs.readFileSync(credPath, "utf8"));
    if (loaded && typeof loaded === "object") doc = loaded;
  } catch {}
}
doc.refs = { ...(doc.refs ?? {}), ...add };
doc.records = doc.records ?? {};
fs.writeFileSync(credPath, yaml.dump(doc, { lineWidth: -1, noRefs: true }), "utf8");
console.log("credentials refs:", Object.keys(doc.refs).join(", "));