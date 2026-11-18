// Console-only view of existing controls. It owns no schedulers or model calls.
import fs from "node:fs";
import path from "node:path";
import { isLoopbackBase } from "./dsh-client.js";
export function createResourceControls({
  root,
  getDsh,
  getApi,
  getConfig = () => ({}),
  fetchImpl = fetch,
}) {
  let pending = null,
    cached = null,
    until = 0,
    changing = false;
  async function pet(route, body, signal) {
    const cfg = getDsh();
    if (!isLoopbackBase(cfg?.baseUrl)) throw Error("请先连接本机聊天引擎");
    const client = getApi(),
      cookie = await client.ensureAuth(signal);
    const response = await fetchImpl(
      new URL("/dsh-pet-7340/" + route, cfg.baseUrl),
      {
        method: body === undefined ? "GET" : "POST",
        headers: { cookie, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal,
        redirect: "error",
      },
    );
    if (!response.ok) throw Error("桌宠接口暂不可用，请先启动桌宠");
    const value = await response.json();
    if (value.ok === false || value.error)
      throw Error("桌宠未接受设置，请在桌宠设置页检查");
    return value;
  }
  async function desktop() {
    if (cached && Date.now() < until) return cached;
    if (pending) return pending;
    pending = (async () => {
      try {
        const signal = AbortSignal.timeout(5000),
          [voice, screen, config] = await Promise.all([
            pet("local-voice", undefined, signal),
            pet("screen/settings", undefined, signal),
            pet("config", undefined, signal),
          ]),
          pets = Object.values(config).flatMap((c) => c?.pets || []);
        cached = {
          available: true,
          voice: voice.enabled === true,
          screen: screen.enabled === true,
          screenBusy: screen.busy === true,
          whisper: pets.some((p) => p.whisperEnabled),
          whisperPets: pets.filter((p) => p.whisperEnabled).length,
        };
      } catch {
        cached = {
          available: false,
          error: "桌宠未连接，其他模块开关仍可使用",
        };
      }
      until = Date.now() + 2000;
      return cached;
    })().finally(() => {
      pending = null;
    });
    return pending;
  }
  function runtime() {
    const cfg = getConfig();
    return {
      proactive: cfg.socialV2?.proactive?.enabled === true,
      proactiveScope: cfg.socialV2?.proactive?.scope || "",
      qqVoice:
        cfg.socialV2?.voice?.enabled === true &&
        cfg.socialV2?.tools?.sendVoice === true,
      slang: cfg.slang?.enabled === true,
      slangResearch: cfg.slang?.autoResearch === true,
    };
  }
  function storage() {
    try {
      const after = path.join(root, "state/system-audit/storage-after.json"),
        file = fs.existsSync(after)
          ? after
          : path.join(root, "state/system-audit/storage-before.json");
      if (fs.statSync(file).size > 1024 * 1024) throw Error();
      const value = JSON.parse(fs.readFileSync(file, "utf8"));
      return {
        available: true,
        at: value.at,
        directories: value.directories
          .filter((r) => r.path === "." || !r.path.includes("/"))
          .slice(0, 10)
          .map(({ path, bytes }) => ({ path, bytes })),
      };
    } catch {
      return { available: false };
    }
  }
  async function change(target, enabled) {
    if (
      !["desktopVoice", "desktopScreen"].includes(target) ||
      typeof enabled !== "boolean"
    )
      throw Error("不支持的资源开关");
    if (changing)
      throw Object.assign(Error("另一个资源开关正在保存，请稍后重试"), {
        status: 409,
      });
    changing = true;
    try {
      await pet(
        target === "desktopVoice" ? "local-voice" : "screen/settings",
        { enabled },
        AbortSignal.timeout(8000),
      );
      if (pending) await pending;
      cached = null;
      until = 0;
      return { ok: true };
    } finally {
      changing = false;
    }
  }
  const json = (res, status, value) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(value));
  };
  async function handle(req, res, url) {
    if (
      url.pathname !== "/resources/" &&
      !url.pathname.startsWith("/api/resources/")
    )
      return false;
    try {
      if (
        req.headers["x-agent-token"] !== undefined ||
        req.headers["x-agent-call"] !== undefined
      ) {
        json(res, 403, { ok: false, error: "资源开关仅控制台可用" });
        return true;
      }
      if (req.method === "GET" && url.pathname === "/resources/") {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "X-Frame-Options": "SAMEORIGIN",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'",
        });
        res.end(
          fs.readFileSync(path.join(root, "public/resources.html"), "utf8"),
        );
        return true;
      }
      if (req.method === "GET" && url.pathname === "/api/resources/status") {
        json(res, 200, {
          ok: true,
          desktop: await desktop(),
          runtime: runtime(),
          storage: storage(),
        });
        return true;
      }
      if (req.method === "POST" && url.pathname === "/api/resources/toggle") {
        let text = "";
        for await (const part of req) {
          text += part;
          if (Buffer.byteLength(text) > 2048) throw Error("请求过大");
        }
        const value = JSON.parse(text || "{}");
        json(res, 200, await change(value.target, value.enabled));
        return true;
      }
      json(res, 404, { ok: false, error: "未知资源接口" });
      return true;
    } catch (error) {
      json(res, Number(error.status) || 400, {
        ok: false,
        error: /^(请先|桌宠|不支持|另一个|请求过大)/.test(String(error.message))
          ? String(error.message)
          : "资源设置未完成，请检查本机服务",
      });
      return true;
    }
  }
  return { handle };
}
