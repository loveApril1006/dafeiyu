// Extended audit: isolated fixtures only. No live accounts, model APIs or publications.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "state/system-audit/features");
fs.mkdirSync(output, { recursive: true });
const tests = [
  "test-harness-control.mjs",
  "test-harness-control-http.mjs",
  "test-harness-control-ui.mjs",
  "test-bilibili-chat.mjs",
  "test-bilibili-video-links.mjs",
  "test-bilibili-shared.mjs",
  "test-bilibili-shared-native.mjs",
  "test-bilibili-shared-reader.py",
  "test-bilibili-chat-http.mjs",
  "test-bilibili-chat-ui.mjs",
  "test-local-tts.mjs",
  "test-voice-performance.mjs",
  "test-voice-lifecycle.py",
  "test-voice-storage.py",
  "test-runtime-economy.mjs",
  "test-optional-dsh.mjs",
  "test-optional-dsh-ui.mjs",
  "test-emotional-companion.mjs",
  "test-proactive-contact.mjs",
  "test-resource-controls.mjs",
  "test-companion.mjs",
  "test-companion-qq.mjs",
  "test-creative.mjs",
  "test-creative-provider.mjs",
  "test-creative-http.mjs",
  "test-creative-ui.mjs",
  "test-wechat.mjs",
  "test-wechat-driver.mjs",
  "test-wechat-http.mjs",
  "test-wechat-ui.mjs",
  "test-wechat-worker.py",
  "test-wechat-db.py",
  "test-qzone.mjs",
  "test-qzone-ui.mjs",
  "test-qzone-worker.py",
  "test-qzone-transport.py",
  "test-bilibili.mjs",
  "test-bilibili-console.mjs",
  "test-bilibili-native-ui.mjs",
  "test-bilibili-live.mjs",
  "test-bilibili-live-wire.mjs",
  "test-bilibili-live-http.mjs",
  "test-bilibili-live-preset.mjs",
  "test-bilibili-live-persona.mjs",
  "test-bilibili-live-ui.mjs",
  "test-bilibili-live-studio.mjs",
  "test-bilibili-live-studio-ui.mjs",
  "test-bilibili-live-controls.mjs",
  "test-bilibili-live-design.mjs",
  "test-bilibili-live-television.mjs",
  "test-bilibili-live-video-requests.mjs",
  "test-bilibili-live-video-requests-ui.mjs",
  "test-bilibili-live-video-reader.py",
  "test-douyin.mjs",
  "test-douyin-vision.mjs",
  "test-douyin-media.mjs",
  "test-douyin-image-guard.mjs",
  "test-douyin-fixed-model.mjs",
  "test-douyin-control.mjs",
  "test-douyin-ui.mjs",
  "test-douyin-native-ui.mjs",
  "test-console-ui.mjs",
  "test-performance-ui.mjs",
];
const bundledPython = path.resolve(root, "../GPT-SoVITS/runtime/python.exe");
const python =
  process.env.QQ_BRIDGE_TEST_PYTHON ||
  (fs.existsSync(bundledPython) ? bundledPython : "python");
const bundledPlaywright = path.join(
  process.env.USERPROFILE || "",
  ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const results = [];
for (const name of tests) {
  const started = Date.now();
  const result = spawnSync(
    name.endsWith(".py") ? python : process.execPath,
    [path.join(root, "scripts", name)],
    {
      cwd: root,
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        QQ_BRIDGE_TEST_LIVE: "0",
        PYTHONIOENCODING: "utf-8",
        ...(process.env.PLAYWRIGHT_MODULE
          ? {}
          : fs.existsSync(bundledPlaywright)
            ? { PLAYWRIGHT_MODULE: bundledPlaywright }
            : {}),
      },
    },
  );
  const passed = result.status === 0 && !result.error;
  const log = path.join(output, name + ".log");
  fs.writeFileSync(
    log,
    String(result.stdout || "") +
      String(result.stderr || "") +
      (result.error ? "\n" + result.error.message : ""),
  );
  results.push({
    name,
    passed,
    code: result.status,
    ms: Date.now() - started,
    log: path.relative(root, log),
  });
  fs.writeFileSync(
    path.join(output, "results.json"),
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
  );
  console.log(`${passed ? "PASS" : "FAIL"} ${name} (${results.at(-1).ms} ms)`);
}
const passed = results.filter((r) => r.passed).length;
console.log(
  `Feature audit: ${passed}/${results.length} scripts passed. Logs: state/system-audit/features/`,
);
process.exitCode = passed === results.length ? 0 : 1;
