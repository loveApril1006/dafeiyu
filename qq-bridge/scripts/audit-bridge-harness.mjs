// Execute the real bridge initialization/functions against temporary files and fake peers.
// No production config, QQ connection, DSH process, or persistent home is accessed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as markdown from '../src/md-to-plain.js';
import * as sensitive from '../src/sensitive.js';
import * as wait from '../src/v2-wait.js';
import * as safeFetch from '../src/safe-fetch.js';
import * as mediaNormalize from '../src/media-normalize.js';
import * as forward from '../src/forward.js';
import * as slang from '../src/slang-learner.js';
import * as sticker from '../src/sticker-lib.js';
import * as modelPrices from '../src/model-prices.js';
import * as tokenLedger from '../src/token-ledger.js';
import * as voiceLib from '../src/send-voice-lib.js';
import * as localTts from '../src/local-tts.js';
import * as sendLimits from '../src/send-limits.js';
import * as voiceErrors from '../src/voice-network-error.js';
import {createVoiceServiceControl} from '../src/voice-service-control.js';
import {createToolJsonRecovery,isToolJsonFailure} from '../src/tool-json-recovery.js';
import * as officialSettings from '../src/official-qq-settings.js';
import {OfficialQQClient,probeOfficialCredentials} from '../src/official-qq-client.js';
import * as qqStartup from '../src/qq-startup-state.js';
import * as companionCommand from '../src/companion-command.js';
import * as presetPrompt from '../src/preset-prompt.js';
import * as roleCard from '../src/role-card.js';
import * as roleRuntimeSupport from '../src/role-runtime.js';
import * as roleCatalog from '../src/role-catalog.js';
import {createConversationMemory} from '../src/conversation-memory.js';
import {createMemoryContext} from '../src/memory-context.js';
import {contextMemoryConfig} from '../src/context-capacity.js';
import {formatLightMemory} from '../src/memory-facts.js';
import {overflowFailure,cleanText} from '../plugins/qq-agent-presets/context-policy.mjs';
import {createEmotionalCompanion} from '../src/emotional-companion.js';
import {createDshHealth,probeDsh} from '../src/dsh-health.js';
import * as stateAcl from '../src/state-acl.mjs';
import * as qqMemoryScope from '../src/qq-memory-scope.js';
import * as creativeService from '../src/creative-service.js';
import * as creativeCommands from '../src/creative-commands.js';
import {createWechatService} from '../src/wechat/service.js';
import {createQzoneService} from '../src/qzone/service.js';
import {createReplyOptions} from '../src/reply-options.js';
import {createRobotOptionsService} from '../src/robot-options-service.js';
import {createResourceControls} from '../src/resource-controls.js';
import {createBilibiliChat} from '../src/bilibili-chat.js';
import {createHarnessControl,parseHarnessCommand} from '../src/harness-control.js';
import {extractBiliVideoLinks} from '../src/bilibili-video-links.js';
import {serveConsoleAsset,consoleLoginDocument,CONSOLE_ASSET_FILES} from '../src/console-assets.js';
import {serveFishHomeAsset} from '../src/fish-home-http.js';
import { unwrap, createTurnCollector } from '../src/dsh-client.js';

const root = fileURLToPath(new URL('..', import.meta.url));
export async function bridgeHarness({ config = {}, savedState, files = {}, globals = {} } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-audit-bridge-'));
  fs.mkdirSync(path.join(temp, 'src'));
  fs.copyFileSync(path.join(root,'src/fish-home-space.js'),path.join(temp,'src/fish-home-space.js'));
  fs.copyFileSync(path.join(root,'src/fish-hq-furniture.js'),path.join(temp,'src/fish-hq-furniture.js'));
  fs.copyFileSync(path.join(root,'src/fish-hq-layout.js'),path.join(temp,'src/fish-hq-layout.js'));
  fs.mkdirSync(path.join(temp, 'state'));
  for(const asset of CONSOLE_ASSET_FILES){const target=path.join(temp,'public',asset);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,'public',asset),target);}
  fs.writeFileSync(path.join(temp, 'config.json'), JSON.stringify({
    dsh: { authToken: 'fixture-only' }, ownerQQ: 123,
    allow: { private: ['123'], groups: ['456'] }, consolePort: 0,
    consoleToken: 'fixture-console-token', slang: { enabled: false }, ...config,
  }));
  if (savedState) fs.writeFileSync(path.join(temp, 'state/sessions.json'), JSON.stringify(savedState));
  // 额外状态文件（用于测试"启动时读到损坏/旧版文件"这类路径）。
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(temp, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content));
  }
  const calls = { created: [], archived: [], sent: [], prompts: [], follows: [], cancelled: [], images: [], faces: [], http: [] };
  // 语音发送在桥接里是**直接 fetch 网关**（与文本/表情共用 sendChain，但要自己带 record 段），
  // 所以这里给 VM 注入一个记录型 fetch：既不让测试真的发 QQ 消息，又能断言发出的段内容。
  const fakeFetch = async (url, init = {}) => {
    const body = (() => { try { return JSON.parse(init.body ?? '{}'); } catch { return init.body; } })();
    calls.http.push({ url: String(url), body });
    const action = String(url).split('/').pop();
    // fetch_custom_face_detail：同步收藏表情的 HTTP 兜底路径要拿到**数组**（WS 失败时用）。
    if (action === 'fetch_custom_face_detail') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          retcode: 0,
          data: [{ emoji_id: 'http-fixture-sticker', resId: 'http-fixture-sticker', url: 'https://public.invalid/http-sticker', md5: 'AABBCCDDEEFF00112233445566778899', desc: 'HTTP 兜底表情' }]
        })
      };
    }
    if (action === 'fetch_ptt_text') {
      return { ok: true, status: 200, json: async () => ({ status: 'ok', retcode: 0, data: { text: 'fixture-transcript' } }) };
    }
    // get_msg：语音落地校验用 —— 回一个带 record 段的消息，模拟真实网关
    if (action === 'get_msg') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          retcode: 0,
          data: { message_id: 9001, message: [{ type: 'record', data: { file: 'fixture-record.amr', duration: 3 } }] }
        })
      };
    }
    return { ok: true, status: 200, json: async () => ({ status: 'ok', retcode: 0, data: { message_id: 9001 } }) };
  };
  const success = (value) => ({ result: { ok: true, value } });
  const api = {
    events: { follow: (id) => calls.follows.push(id) },
    // settings.describe 的默认桩：没有 qq-mode 命名空间 ⇒ refreshMode() 回退到本地 mode.json。
    // 测试可覆盖它来验证「DSH 设置里的空 ownerQQ 不得覆盖 config.json」等契约。
    settings: {
      describe: async () => success({ namespaces: [] }),
      update: async () => success({ updated: true })
    },
    workspace: {
      create: async () => success({ created: false, workspace: { workspaceId: 'fixture-workspace' } }),
      archiveSession: async ({ sessionId }) => { calls.archived.push(sessionId); return success({}); },
    },
    sessions: {
      create: async (params) => { calls.created.push(params); return success({ sessionId: `fixture-${calls.created.length}` }); },
      selectModel: async () => success({ selected: { provider: 'fixture', model: 'fixture' } }),
      prompt: async (params) => { calls.prompts.push(params); return success({}); },
    },
    respond: async () => success({}),
    stopSessionWork: async (sessionId) => { calls.cancelled.push(sessionId); return { removed: 0 }; },
    callUnary: async (method, params) => { calls.cancelled.push({ method, params }); return success({ accepted: true }); },
  };
  class FakeBot {
    async sendPrivateMessage(id, text) { calls.sent.push({ kind: 'private', id, text }); }
    async sendGroupMessage(id, text) { calls.sent.push({ kind: 'group', id, text }); }
    async getImage({ file }) {
      calls.images.push(file);
      // Valid 1 × 1 PNG, supplied entirely in memory by the fixture gateway.
      return { base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+k3ioAAAAASUVORK5CYII=' };
    }
    async fetchFaceEntity(id) { calls.faces.push(id); return null; }
    async request(action, params = {}) {
      // 群成员列表：v2 读工具 qq_get_group_members 会用到（含 WS 不可用时的 HTTP 兜底路径）。
      if (action === 'get_group_member_list') {
        return {
          status: 'ok', retcode: 0,
          data: [
            { user_id: 111, nickname: '小明', card: '小明', role: 'member' },
            { user_id: 222, nickname: '路人', card: '' },
            { user_id: 123, nickname: '管理员', card: '群主', role: 'owner' }
          ]
        };
      }
      return { status: 'ok', retcode: 0, data: [{ emoji_id: 'fixture-sticker', url: 'https://public.invalid/sticker' }] };
    }
  }
  let source = fs.readFileSync(path.join(root, 'src/bridge.js'), 'utf8');
  // 去掉顶层 import（VM 里靠 context 注入提供这些绑定）。
  // 必须按行处理：这些 import 有**多行**写法，用单行正则（/^import[\s\S]*?;/gm）会在
  // 第一个分号处停下，把紧跟其后的正常代码一起删掉（曾把 `cfg.socialV2.voice = {…}`
  // 整段吞掉，导致语音相关断言在虚拟环境里悄悄失真）。
  source = source.split(/\r?\n/).reduce((acc, line) => {
    if (acc.droppingImport) {
      if (/;\s*$/.test(line)) acc.droppingImport = false;
      return acc;
    }
    if (/^import[\s{*]/.test(line) || /^import\s+['"]/.test(line)) {
      if (!/;\s*$/.test(line)) acc.droppingImport = true;
      return acc;
    }
    acc.out.push(line);
    return acc;
  }, { out: [], droppingImport: false }).out.join('\n');
  source = source.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(path.join(temp, 'src/bridge.js')).href));
  source = source.slice(0, source.indexOf("process.on('SIGINT'"));
  source = source.replace('  bot.onPrivateMessage(async (event) => {', `
  return {
    async closeUnifiedMemory(){await unifiedMemory?.close();},closeMemory(){historyMemory?.close();historyMemory=null;},closeBilibiliChat(){bilibiliChatService?.close();},closeHarness(){harnessControlService?.close();},harness,biliChat,memoryHub,recoverContextOverflow,handoverContext,recordSessionUsage,recordSessionSnapshot,contextMemoryHint,contextHandover,contextHealth,
    ensureSession, ensureSlangLearnerSession, resolvePresetName, deliverPrompt, drainPromptQueue,currentRoleRuntime,
    runSlangExtraction, queueSlangExtraction, queueSlangResearch, invalidateSlangLearnerSession,
    slangWindows, learnerWaiters, learnerSessions, slangResearchingIds, slangExtractionPendingKeys,
    sendToQQ, sendStickerV2, handleIncoming, startConsoleServer, cfg, state, api, promptQueues,
    getSocialV2State, appendSocialV2Message, recordSentMessagesV2, scheduleProactiveCheckV2, normalizeProactiveContactV2, reconcileProactiveContactsV2, captureSendGuard, interactionPolicyV2, activeRepliesV2, requiredRepliesV2,
    buildWakePromptV2, buildWakeSnapshotV2, sendWakePromptV2, socialV2,
    syncStickerLibrary, listStickersForV2, getStickerImageData,
    refreshMode, modeAllowed, trackTurnEvent, replayPendingWakeReasonsV2,
    collectors, finishingContextTurns, setupSleepTimerV2, pumpMux, toolJsonRecovery, pendingWakeKeys, wakeConfigMissCount,
    getInitialPrompt, setInitialPrompt, loadInitialPrompts, formatInitialPromptV2,
    initialPrompts, initialPromptMaxChars,
    extractMediaFromSegments, segmentsToText, fetchOneBotImage, fetchMediaData, resolveMediaList,
    emojiCdnCandidates, getImageDimensions, acceptImageBuffer, MAX_MEDIA_BYTES, bot,
    isConversationBusyV2, v2TurnStartAt, turnLeaseNoted, TURN_BUSY_LEASE_MS,
    settingFromDshNamespace, selfIdentityTextV2, buildWakeReminderPromptV2,
    getMode() { return currentMode; },
    setSelfIdentity(display, id) {
      selfDisplayName = String(display ?? '');
      selfUserId = String(id ?? '');
      selfNickname = selfDisplayName.toLowerCase() || 'deepseek';
    },
    flushQueue, retireSession, checkDsh, enqueueForRetry, queued, queueRetries, queueRetryAt,
    voiceCfg, voiceLibrary, resolveVoicePathForV2, resolveVoicePathForOperator, synthesizeVoiceFile,
    voiceBudgetCheck, sendVoiceV2, sendVoiceForV2, assertOutboundAuditOk,
    setMode(value) { currentMode = value; },
    setReady(value) { dshReady = value; },
    setPresets(value) { dshPresetIds = value; dshDefaultPreset = 'standard'; },
    resetEpoch() { sessionEpoch++; },
  };
  bot.onPrivateMessage(async (event) => {`);
  const timers = new Set();
  const emotionInstances = [];
  const context = vm.createContext({
    fs, os, path, http, crypto, fileURLToPath, URL, Buffer, AbortSignal, AbortController, console: { log() {}, error() {} },
    fetch: fakeFetch,
    // 锁文件探测用（bridge.js 顶层的 consolePortInUse）；
    // 固定桩掉：测试不应该真去 netstat 宿主机。
    execFileSync: () => '',
    // process 桩要带 env：voice-core / bridge 会读 process.env.FFMPEG_PATH、FFPROBE_PATH 等。
    // 之前只给 pid/platform/kill/exit，导致 `process.env.FFMPEG_PATH` 直接抛 TypeError。
    process: { pid: process.pid, platform: process.platform, kill: process.kill, env: {}, exit: (code) => { throw new Error('unexpected exit ' + code); } },
    setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timers.add(timer); return timer; },
    clearTimeout, setInterval: () => ({ unref() {} }), clearInterval: () => {},
    NodeApiClient: class { constructor() { return api; } },
    OneBotWebSocketClient: FakeBot, text: (s) => s,
    ...officialSettings,OfficialQQClient,probeOfficialCredentials,
    createEmotionalCompanion:options=>{const e=createEmotionalCompanion(options);emotionInstances.push(e);return e;},
    createDshHealth,probeDsh,createConversationMemory,createMemoryContext,contextMemoryConfig,formatLightMemory,overflowFailure,cleanText,serveConsoleAsset,serveFishHomeAsset,consoleLoginDocument,createToolJsonRecovery,isToolJsonFailure,
    discoverDshLaunchToken: () => '', unwrap, createTurnCollector,
    ...markdown, ...sensitive, ...wait, ...safeFetch, ...forward, ...slang, ...sticker,...roleCard,...roleRuntimeSupport,
    ...modelPrices, ...tokenLedger, ...voiceLib, ...localTts, ...sendLimits, ...voiceErrors, ...companionCommand, ...stateAcl, ...presetPrompt, ...qqMemoryScope, ...creativeService, ...creativeCommands, ...qqStartup,...roleCatalog,createReplyOptions,createRobotOptionsService,createVoiceServiceControl,
    // 桥接的出图出口会调归一化（体积/动图抽帧）：VM 里必须能拿到这几个函数。
    createBilibiliLive:()=>({handle:async()=>false,handleView:async()=>false,close(){}}),
    createWechatService:options=>createWechatService({...options,dependencies:{harden:false,locateData:()=>({root:'',accounts:[]})}}),
    createResourceControls:options=>createResourceControls({...options,fetchImpl:async()=>Response.json({ok:false})}),
    extractBiliVideoLinks,
    createHarnessControl,parseHarnessCommand,
    createBilibiliChat:options=>createBilibiliChat({...options,login:async()=>({loggedIn:false,reason:'fixture: not logged in'}),source:async()=>({ok:true,loggedIn:false,venvReady:true,items:[],config:{enabled:true}})}),
    createQzoneService:options=>createQzoneService({...options,dependencies:{harden:false,model:async()=>{throw Error('Fixture model not configured');},publish:async()=>{throw Error('No live publication in fixtures');},checkPublisher:async()=>{}}}),
    normalizeImageForModel: mediaNormalize.normalizeImageForModel,
    sniffImage: mediaNormalize.sniffImage,
    planNormalization: mediaNormalize.planNormalization,
    planAnimation: mediaNormalize.planAnimation,
    // ACL 收紧会 spawn icacls 去改**真实**文件系统；测试不该做这件事（同理见下面的
    // cleanupTemp / processAudioVolume 桩）。桩成成功，让 hardenStateDirAcl 走正常分支。
    hardenDir: () => ({ ok: true, detail: 'stub' }),
    // 音量靠 ffmpeg；测试环境不该真跑 ffmpeg（也不该在沙箱里 spawn）。
    // 默认桩成"按倍数记账但不转码"，调用方可用 globals 覆盖来断言真实行为。
    processAudioVolume: async (file, { volume = 1, normalize = false, loudness = 'normal' } = {}) => {
      const v = Number(volume);
      const changed = normalize === true || Math.abs(v - 1) > 1e-9;
      return {
        path: changed ? `${file}.vol` : file,
        converted: changed,
        applied: changed,
        volume: normalize ? 1 : v,
        loudness: normalize ? -16 : null,
        mode: normalize ? 'loudnorm' : (changed ? 'volume' : 'original'),
        detail: normalize ? `智能音量（响度归一 ${loudness === 'loud' ? -13 : loudness === 'quiet' ? -20 : -16} LUFS）`
          : (changed ? `音量 ${Math.round(v * 100)}%` : '原始音量')
      };
    },
    cleanupTemp: () => {},
    ...globals,
  });
  // Execute the pure model view in the bridge realm. Its plain-object checks
  // should see the same prototypes as real bridge messages, just as in Node.
  const modelViewSource = fs.readFileSync(path.join(root, 'src/qq-model-view.js'), 'utf8').replace(/^export /gm, '');
  vm.runInContext(`Object.assign(globalThis, (() => { ${modelViewSource}\nreturn { compactModelMessage, compactModelData, serializeModelData, describeAge }; })());`, context);
  vm.runInContext(source + '\nglobalThis.auditReady = main();', context);
  const bridge = await context.auditReady;
  bridge.setPresets(['standard', 'qq-chat', 'qq-chat-v2']);
  bridge.setReady(true);
  return { ...bridge, calls, temp, async close() {
    await bridge.closeUnifiedMemory();
    bridge.closeMemory();
    bridge.closeBilibiliChat();
    bridge.closeHarness();
    for (const timer of timers) clearTimeout(timer);
    emotionInstances.forEach(e=>e.close());
    fs.rmSync(temp, { recursive: true, force: true });
  } };
}
