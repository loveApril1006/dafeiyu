// 把一组覆盖项深合并进 config.json
import fs from "node:fs";
const [cfgPath, ovPath] = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const ov = JSON.parse(fs.readFileSync(ovPath, "utf8"));
function merge(dst, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === "object" && !Array.isArray(v)) dst[k] = merge(dst[k] && typeof dst[k] === "object" ? dst[k] : {}, v);
    else dst[k] = v;
  }
  return dst;
}
merge(cfg, ov);
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
console.log("config updated:", Object.keys(ov).join(", "));