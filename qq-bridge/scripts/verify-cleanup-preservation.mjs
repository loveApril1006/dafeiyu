import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bridge = fileURLToPath(new URL("..", import.meta.url)),
  root = path.resolve(bridge, "..");
const read = (name) =>
  JSON.parse(
    fs
      .readFileSync(path.join(bridge, "state/system-audit", name), "utf8")
      .replace(/^\uFEFF/, ""),
  );
const before = read("storage-before.json"),
  plan = read("cleanup-plan.json"),
  result = read("cleanup-result.json");
assert.equal(result.failed.length, 0);
assert.equal(result.removed.length, plan.targets.length);
for (const row of plan.targets)
  assert(!fs.existsSync(row.path), "An approved test copy remains");
const installers = before.largestFiles.filter((row) =>
  /^迁移包[/\\].+\.zip$/i.test(row.path),
);
assert.equal(installers.length, 4);
for (const row of installers)
  assert.equal(
    fs.statSync(path.join(root, row.path)).size,
    row.bytes,
    "Installer size changed",
  );
const releases = [
  "full-installer-v18",
  "full-installer-v20",
  "full-installer-v21",
];
for (const name of releases)
  assert(
    fs.statSync(path.join(root, "maintenance", name, "release")).isDirectory(),
  );
const active = [
  "engine",
  "engine-home",
  "GPT-SoVITS",
  "local-tts",
  "desktop-pet",
  "SnowLuma",
  "qq-bridge/state",
];
for (const name of active)
  assert(fs.statSync(path.join(root, name)).isDirectory());
const report = {
  at: new Date().toISOString(),
  removedTestDirectories: result.removed.length,
  remainingApprovedTargets: 0,
  installersPreserved: installers.length,
  installerVerification:
    "existence and exact original byte length; not a fresh ZIP hash",
  releaseDirectoriesPreserved: releases.length,
  activeDirectoriesPreserved: active.length,
  logicalBytesRemoved: plan.totalBytes,
  freeBytesBefore: result.freeBytesBefore,
  freeBytesAfter: result.freeBytesAfter,
  actualFreeBytesIncrease: result.freeBytesAfter - result.freeBytesBefore,
  failed: 0,
};
fs.writeFileSync(
  path.join(bridge, "state/system-audit/cleanup-verification.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    removed: report.removedTestDirectories,
    installersPreserved: report.installersPreserved,
    releaseDirectoriesPreserved: report.releaseDirectoriesPreserved,
    actualFreedGiB: report.actualFreeBytesIncrease / 1073741824,
    freeGiB: report.freeBytesAfter / 1073741824,
    failed: 0,
  }),
);
