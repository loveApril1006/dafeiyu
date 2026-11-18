import {serveConsoleAsset} from '../src/console-assets.js';
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { createResourceControls } from "../src/resource-controls.js";
import { bridgeHarness } from "./audit-bridge-harness.mjs";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "resource-controls-"));
fs.symlinkSync(path.resolve("public"), path.join(root, "public"), "junction");
let voice = true,
  screen = false,
  requests = [],
  cfg = {
    socialV2: {
      proactive: { enabled: true, scope: "group" },
      voice: { enabled: true },
      tools: { sendVoice: true },
    },
    slang: { enabled: true, autoResearch: false },
    secret: "fixture-private-value",
  },
  creative = {
    revision: 0,
    rpg: { enabled: false },
    images: { enabled: true },
    memes: { enabled: false },
  };
const controller = createResourceControls({
  root,
  getDsh: () => ({ baseUrl: "http://127.0.0.1:17860" }),
  getApi: () => ({ ensureAuth: async () => "fixture-cookie" }),
  getConfig: () => cfg,
  fetchImpl: async (url, options) => {
    assert.equal(url.origin, "http://127.0.0.1:17860");
    requests.push({ route: url.pathname, method: options.method });
    const value = options.body ? JSON.parse(options.body) : null;
    if (url.pathname.endsWith("local-voice")) {
      if (value) voice = value.enabled;
      return Response.json({ enabled: voice });
    }
    if (url.pathname.endsWith("screen/settings")) {
      if (value) {
        assert.deepEqual(Object.keys(value), ["enabled"]);
        screen = value.enabled;
      }
      return Response.json({ enabled: screen });
    }
    assert(url.pathname.endsWith("/config"));
    return Response.json({ main: { pets: [{ whisperEnabled: true }] } });
  },
});
const token = "fixture-resource-token";
let voiceIdle = 300;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if(serveConsoleAsset(req,res,url,{root:process.cwd()}))return;
  if (
    req.headers["x-console-token"] !== token &&
    url.searchParams.get("token") !== token
  ) {
    res.writeHead(401);
    res.end("{}");
    return;
  }
  if (await controller.handle(req, res, url)) return;
  const json = (value) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(value));
  };
  if (url.pathname === "/api/creative/status")
    return json({ config: creative });
  if (url.pathname === "/api/voice/performance") {
    if (req.method === "POST") {
      let text = "";
      for await (const c of req) text += c;
      voiceIdle = JSON.parse(text).idleUnloadSeconds;
      assert([0, 60, 300, 600, 1800].includes(voiceIdle));
    }
    return json({ ok: true, idleUnloadSeconds: voiceIdle, modelState: "unloaded" });
  }
  if (url.pathname === "/api/creative/config") {
    let text = "";
    for await (const c of req) text += c;
    const value = JSON.parse(text);
    assert.equal(value.revision, creative.revision);
    for (const key of ["rpg", "images", "memes"])
      if (value[key]) Object.assign(creative[key], value[key]);
    creative.revision++;
    return json({ ok: true });
  }
  if (url.pathname === "/api/emotional-companion")
    return json({ ok: true, config: { enabled: true } });
  if (url.pathname === "/api/wechat/status")
    return json({ config: { enabled: false, revision: 0 } });
  if (url.pathname === "/api/qzone/status")
    return json({
      config: {
        enabled: false,
        autoWrite: false,
        autoPublish: false,
        withImages: false,
        scheduled: false,
      },
    });
  if (url.pathname === "/api/dsh/plugins") return json({ bundles: [] });
  res.writeHead(404);
  res.end("{}");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port,
  headers = { "X-Console-Token": token, "content-type": "application/json" };
try {
  const states = await Promise.all([
    fetch(base + "/api/resources/status", { headers }).then((r) => r.json()),
    fetch(base + "/api/resources/status", { headers }).then((r) => r.json()),
  ]);
  assert.equal(requests.length, 3);
  assert(states.every((s) => s.desktop.voice === true));
  assert(!JSON.stringify(states).includes(cfg.secret));
  assert(!JSON.stringify(states).includes("fixture-cookie"));
  assert.equal(
    (
      await fetch(base + "/api/resources/status", {
        headers: { ...headers, "x-agent-call": "1" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/resources/toggle", {
        method: "POST",
        headers,
        body: JSON.stringify({ target: "publish", enabled: true }),
      })
    ).status,
    400,
  );
  assert.equal(requests.length, 3);
  const { chromium } = createRequire(import.meta.url)(
      process.env.PLAYWRIGHT_MODULE || "playwright",
    ),
    browser = await chromium.launch({
      headless: true,
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    });
  try {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === base
        ? route.continue()
        : route.abort(),
    );
    await page.goto(base + "/resources/?token=" + token);
    await page.locator("#voice-idle:not([disabled])").waitFor();
    await page.locator("#voice-idle").selectOption("0");
    await page.locator("#voice-save").click();
    await page.waitForFunction(() => !document.getElementById("voice-idle").disabled);
    assert.equal(voiceIdle, 0);
    assert.equal(await page.locator("#voice-idle").inputValue(), "0");
    const get = (id) => page.locator('[data-feature="' + id + '"]');
    await get("desktopVoice").waitFor();
    assert.equal(await get("desktopVoice").isChecked(), true);
    await get("desktopVoice").uncheck();
    await page.waitForFunction(() =>
      document.getElementById("notice").textContent.includes("开关已保存"),
    );
    assert.equal(voice, false);
    assert.equal(screen, false);
    await get("rpg").check();
    await page.waitForFunction(() => {
      const c = document.querySelector('[data-feature="rpg"]');
      return c.checked && !c.disabled;
    });
    assert.equal(creative.rpg.enabled, true);
    assert.equal(creative.images.enabled, true);
    assert.equal(creative.music, undefined);
    fs.mkdirSync("state/system-audit/previews", { recursive: true });
    await page.screenshot({
      path: "state/system-audit/previews/resources-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: "state/system-audit/previews/resources-mobile.png",
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
  console.log(
    "PASS resource controls: shared existing switches, one-flight desktop reads, private-field filtering, no model calls, independent toggles, unchanged sibling settings and mobile layout",
  );
} finally {
  await new Promise((r) => server.close(r));
  assert(root.startsWith(path.join(os.tmpdir(), "resource-controls-")));
  fs.rmSync(root, { recursive: true, force: true });
}

const h = await bridgeHarness(),
  consoleServer = h.startConsoleServer();
if (!consoleServer.listening)
  await new Promise((r) => consoleServer.once("listening", r));
const url = "http://127.0.0.1:" + consoleServer.address().port;
try {
  assert.equal((await fetch(url + "/api/resources/status")).status, 401);
  assert.equal(
    (
      await fetch(url + "/api/resources/status", {
        headers: {
          "X-Console-Token": "fixture-console-token",
          "x-agent-call": "1",
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(url + "/api/resources/toggle", {
        method: "POST",
        headers: {
          "X-Console-Token": "fixture-console-token",
          Origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ target: "desktopVoice", enabled: false }),
      })
    ).status,
    403,
  );
  const post = (body) =>
    fetch(url + "/api/socialV2/config", {
      method: "POST",
      headers: {
        "X-Console-Token": "fixture-console-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }).then((r) => {
      assert.equal(r.status, 200);
      return r.json();
    });
  await post({
    voice: {
      enabled: true,
      dir: "fixture-audio",
      maxPerHour: 7,
      defaultVolume: 1.4,
    },
    tools: { sendVoice: true, sendPoke: false },
  });
  const disabled = await post({
    voice: { enabled: false },
    tools: { sendVoice: false },
  });
  assert.equal(disabled.config.voice.dir, "fixture-audio");
  assert.equal(disabled.config.voice.maxPerHour, 7);
  assert.equal(disabled.config.voice.defaultVolume, 1.4);
  assert.equal(disabled.config.tools.sendPoke, false);
  const invalid = await post({ voice: null });
  assert.equal(invalid.config.voice.dir, "fixture-audio");
  assert.equal(invalid.config.voice.enabled, false);
  assert.equal(h.calls.prompts.length, 0);
  assert.equal(h.calls.sent.length, 0);
  console.log(
    "PASS real bridge resource routes: authentication, Origin and agent restrictions; partial voice switches retain limits/library/volume and sibling tools; zero platform writes",
  );
} finally {
  await new Promise((r) => consoleServer.close(r));
  await h.close();
}
