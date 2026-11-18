// 通用 OneBot v11 上游健康回归；保留历史文件名以兼容现有测试入口。
// QQ 网关连接、账号在线与上游 good 状态分别观测，不能绑定某个框架的实现。
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { readConsoleDocument } from '../src/console-assets.js';
import { bridgeHarness } from './audit-bridge-harness.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const bridge = fs.readFileSync(path.join(ROOT, 'src', 'bridge.js'), 'utf8');
const consoleHtml = readConsoleDocument(ROOT);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const example = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.example.json'), 'utf8'));

/** 只要可执行代码：注释里会大段解释这些名字（直接扫原文会把说明当成实现）。 */
const codeOf = (src) => src
  // 顺序很重要：先剥行注释，再剥块注释。行注释里出现的 `/*`（例如 `/api/send/*`）
  // 若先做块注释扫描，会被当成块注释开头、一路吞到后面某个 `*/` —— 实测吞掉过
  // 二十多万字符的代码，让本文件的断言对着"不存在的源码"误报。
  .split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const bridgeCode = codeOf(bridge);

test('外部网关状态不读取本地旧启动标记', async () => {
  const h = await bridgeHarness({config:{snowluma:{external:true}}});
  const server = h.startConsoleServer();
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/status', {headers:{'x-console-token':'fixture-console-token'}});
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.snowluma.startup.state, 'external');
    assert.match(result.snowluma.startup.message, /OneBot v11/);
    assert.doesNotMatch(result.snowluma.startup.message, /后台已关闭/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await h.close();
  }
});

test('通用客户端不依赖特定 QQ 框架的 SDK 或安装补丁', async () => {
  for (const name of ['@snowluma/sdk','@snowluma/mcp']) assert.equal(pkg.dependencies?.[name], undefined);
  assert.doesNotMatch(String(pkg.scripts?.postinstall ?? ''), /patch-snowluma-sdk/);
  const {OneBotWebSocketClient} = await import('../src/onebot-client.js');
  assert.equal(typeof OneBotWebSocketClient, 'function');
  const bot = new OneBotWebSocketClient({url:'ws://127.0.0.1:1',reconnect:false});
  for (const method of ['onEvent','onPrivateMessage','onGroupMessage','onBotStatus','getStatus','getLoginInfo','sendPrivateMessage','sendGroupMessage']) assert.equal(typeof bot[method], 'function', method);
  bot.close();
});

test('桥接订阅了「上游还活着」的证据（onEvent）', () => {
  assert.match(bridgeCode, /bot\.onEvent\(/, '必须用 onEvent 旁路统计上游事件包（静默检测的依据）');
  assert.match(bridgeCode, /noteUpstreamPacket\(/, 'onEvent 回调必须记账到 noteUpstreamPacket');
});

test('桥接订阅了 bot_status（账号上下线），且对老运行时优雅降级', () => {
  assert.match(bridgeCode, /bot\.onBotStatus\(/, '必须订阅 bot_status');
  // 老运行时不会发这个事件；订阅调用被 try 包住，失败只提示不致命
  assert.match(bridgeCode, /bot_status 订阅不可用/, '订阅失败必须明确提示（老运行时应优雅降级）');
});

test('good 取自心跳 status.good / get_status —— 绝不能取自 get_login_info', () => {
  // 这是本文件存在的最重要理由。SnowLuma 的字段分布（实测核对过 1.14.9 运行时源码）：
  //   get_login_info → 只有 { user_id, nickname }
  //   get_status     → { online, good }
  //   30 秒一次的心跳载荷 → status: { online, good: online && receiveHealthy }
  // 而 SDK **只校验 status/retcode 信封、不校验 data 载荷**，所以取错字段不会报错 ——
  // 它只会让 good 永远停在 null，把"权威信号"变成一条永不触发的死分支。
  // 本文件第一版就是这么写错的（health 代码的第一次实现整条 dead code），故立此断言。
  assert.match(bridgeCode, /\/get_status/, '必须轮询 get_status 拿 online/good');
  assert.match(bridgeCode, /body\.data\?\.good/, 'get_status 的 good 必须被读取');
  // 主信号：心跳里的 status.good（免费、30 秒一次、老运行时也有）
  assert.match(bridgeCode, /meta_event_type === 'heartbeat'/, '必须识别 meta_event/heartbeat');
  assert.match(bridgeCode, /event\.status\?\.good/, '必须从心跳载荷读 status.good（主信号）');
  assert.match(bridgeCode, /noteReceiveHealth\(/, '心跳/轮询都必须经 noteReceiveHealth 归一记录');
  // 反面：不得再从 get_login_info 取 good
  const loginCall = bridgeCode.slice(
    Math.max(0, bridgeCode.indexOf('/get_login_info') - 400),
    bridgeCode.indexOf('/get_login_info') + 900,
  );
  assert.ok(loginCall.length > 0, '应能定位 get_login_info 调用点');
  assert.ok(
    !/good/.test(loginCall.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')),
    'get_login_info 的返回里没有 good —— 不要从它身上取（会静默失效）。'
    + '若要昵称就用它，要 online/good 就用 get_status 或心跳。',
  );
});

test('静默检测不得声称能判断 hook 死活（心跳是本地生成的）', () => {
  // SnowLuma 的心跳由**它自己的定时器无条件**发出（HEARTBEAT_INTERVAL = 3e4），
  // 不经过 QQ 事件流水线。所以「没有事件包」只能证明 SnowLuma 进程/WS 卡住了，
  // **不能**证明它的 [Hook] 收不到 QQ 数据 —— 那个只能靠 status.good。
  // 措辞若写成"沉默=hook 死了"，运维会被引到错误的结论上。
  const silentHint = bridgeCode.slice(
    bridgeCode.indexOf('else if (silent)'),
    bridgeCode.indexOf('else if (silent)') + 420,
  );
  assert.ok(silentHint.length > 0, '应能定位静默分支的提示文案');
  assert.ok(
    !/\[Hook\]/.test(silentHint),
    '静默分支不得把结论指向 [Hook]（心跳会一直来，沉默说明的是进程/WS 层面）',
  );
  assert.match(silentHint, /心跳/, '静默分支应点明"连心跳都没有"，把结论落在进程/WS 上');
});

test('/api/status 暴露 snowluma 健康快照，且只给操作者', () => {
  assert.match(bridgeCode, /snowluma: snowlumaHealthSnapshot\(\)/, '/api/status 必须带 snowluma 字段');
  // 智能体视图（带 x-agent-token 的那支）不得包含它
  const agentBranch = bridgeCode.slice(
    bridgeCode.indexOf("req.headers['x-agent-token'] || req.headers['x-agent-call'] !== undefined"),
    bridgeCode.indexOf('snowluma: snowlumaHealthSnapshot()'),
  );
  assert.ok(agentBranch.length > 0, '应能定位智能体分支与操作者分支');
  assert.ok(
    !/snowluma\s*:/.test(agentBranch),
    '受限的智能体视图不得带 snowluma 诊断字段（那是管理侧观测）',
  );
});

test('控制台有对应的告警条与卡片', () => {
  assert.match(consoleHtml, /id="snowlumaWarn"/, '控制台应有 SnowLuma 告警条');
  assert.match(consoleHtml, /renderSnowlumaHealth\(/, '告警条必须被接线到 /api/status 的渲染路径');
  assert.match(consoleHtml, /NapCat、SnowLuma 等兼容 OneBot v11/, '告警应说明通用协议接入');
  assert.doesNotMatch(consoleHtml, /logs\/snowluma-\*\.log/, '通用诊断不应要求某个框架的日志路径');
});

test('端点自愈可关，且默认保持「跟随」（向后兼容）', () => {
  assert.match(
    bridgeCode,
    /cfg\.snowluma\?\.followDiscoveredEndpoint !== false/,
    '必须支持 snowluma.followDiscoveredEndpoint 关闭端点跟随',
  );
  assert.equal(
    example.snowluma?.followDiscoveredEndpoint, true,
    '示例配置里默认值必须是 true —— 关闭会改变既有自愈行为，不能悄悄改默认',
  );
  // 关掉时不得把发现的端点写回文件
  assert.match(
    bridgeCode,
    /\.\.\.\(followEndpoint \? \{ wsUrl, httpUrl: r\.baseUrl \} : \{\}\)/,
    '关闭跟随时不得把 wsUrl 写回 config.json（否则"我设了别处"会被持久化抹掉）',
  );
  assert.equal(typeof example.snowluma?.silenceWarnMs, 'number', '示例配置应记录静默告警阈值');
});
