# 识海系统 · 接续审计（2026-10-28）

## 完整性复核（2026-10-30）

后续容量接续补全：新增 `src/context-capacity.js`，`memory-context.js` 负责单次用量、有效工作预算与有来源的交接材料；`bridge.js` 在投递前执行交接。默认本地窗口预算 400000、比例 0.85，不再完全依赖引擎标称约 104 万的窗口。高容量与笼统 400 同时存在时可进入原有有界恢复；普通 400 不换会话。交接保存后才退役旧会话，新请求与已记录事项留在同一记忆工作区，发送中的旧回复先完成。完整边界及配置见 `docs/ocean-memory.md` 的“容量到达前自动交接”。源码的这部分已补，实际运行验证及另一台电脑部署尚未完成。

本次验证：新增 6 项交接场景测试通过；统一记忆、上下文可靠性、原有接续、召回接线、连续状态、模型错误/运行控制、设置导出及安装保留等隔离验证通过。额外的真实 DSH 会话退役测试因控制连接失败未通过，不能以假服务验证代替真实引擎验收。日志位于 `maintenance/ocean-handover-20261030/`；未重启生产桥接、未发送真实 QQ 消息、未做付费模型验证。

本节是对当前源码和本机只读统计的复核；下方 2026-10-28 的内容保留作历史记录。按照总入口及系统清单检查了接线、聊天原文、遗忘与来源、召回、连续状态、人格情感、Mnemon/Context、平台经历、星图和安装保留。没有启动真实自主活动、发送 QQ 消息、重启服务或改写用户记忆。

### 当前架构与完成范围

识海是 QQ Bridge 的内置协调系统，不是一个已经脱离宿主、可单独安装运行的插件。`bridge.js → memory-context.js` 连接原文主库、结构化识海、情感库、Mnemon 投影、Context 容量统计、平台经历及鱼窝/生活计划。当前聊天提示确实调用准备、连续状态、功能经历、召回和提示证据记录；星图是这些数据的管理与展示入口。

| 部分 | 复核结论 | 边界 |
|---|---|---|
| 原文、主记忆、来源、编辑撤回 | 已实现并接线 | 原文与结构化记录不是一条消息对应一个星点；半小时事件片段可关联多条消息 |
| 分层遗忘、证据卡、修正链 | 已实现 | 本地规则与半衰期近似；查看不强化可信度 |
| 联想召回 | 已实现 | BM25、有限本地同义词、字面近似和一跳关联；没有内置通用向量语义或任意深度推理 |
| 连续状态、备忘、约定 | 已实现 | 容量收紧与上下文交接已接线；待办不会自行执行外部动作 |
| 情感、亲属、相处侧面 | 已实现并复用原系统 | 当前人格卡和后台关系优先；自生副人格是表达倾向，不是独立智能体 |
| Mnemon/Context | 适配已实现，有外部依赖 | 主库只按容量投影，未投影不代表遗失；当前引擎实时启用状态未核实 |
| 平台经历 | 部分覆盖，已有真实数据 | 已支持空间、B站、抖音、直播、创作、任务及鱼窝；音乐播放控制没有解析器/回执接线 |
| 自言自语、反思、复习、虚拟生活计划 | 代码与预算控制已实现 | 当前真实库没有自主任务回执，不能声称已经持续运行；生活计划也沿用这条模型链 |
| 星图 | 当前范围自动分页展开、来源线、聊天轮转、日志和陨星已实现 | 使用 Canvas 2D 自行投影空间坐标，尚未实现 Three.js/WebGL + UnrealBloom；光丝和常规流动粒子是视觉装饰 |
| 安装保留 | 已实现并通过隔离测试 | 保留配置、人格、记忆库、会话工作区及媒体；源码参考包不是独立插件安装包 |

### 只读数据证据

2026-10-30 15:14（上海时间）采样：原始聊天 529 条，识海节点 280 个、关系 143 条、原文来源关联 544 条；529 条聊天均至少有一条来源关联，未关联原文为 0，回填游标 529。节点跨 2 个会话、5 个角色范围，不能把这个总数当成当前页面范围的应显示数量。

其中共同经历事件 175 个、事实偏好 3 个、功能经历节点 49 个；独立平台回执表 40 条。事件压缩组织、直接写入的鱼窝经历以及不同表的职责会导致这些数量不同，不表示丢失聊天。当前事实抽取主要依赖明确陈述模式及既有旧记忆导入，没有实现对每句自由表达都进行模型事实提炼。

实际会话工作区有 2 份 Mnemon 存储，共 6 条识海投影。这是精简副本，不是 280 个节点的完整镜像。配置默认启用识海，记忆工具开启且管理员已配置；本地 Mnemon 配置采用 workspace/storage、允许写入和生命周期，embedding 与插件自己的 idleReview 关闭。这些是落盘配置，不证明插件当前正在运行。

### 尚未闭环及需修正项

1. **模型运行链需恢复并验证**：对配置中的本机引擎地址发起只读插件列表请求，返回 `ECONNREFUSED`。可能是引擎未启动或地址已失效；没有据此认定源码缺失。真实库 `ocean_jobs=0`，也没有反思/自言自语/复习节点。修复连接后仍需检查预设、会话许可、忙碌状态、新材料阈值和预算，才能确认首次真实自主活动成功。
2. **音乐播放经历仍缺接线**：生成歌曲已经支持，播放控制的成功/失败回执未进入 `ACTIVITY_FILES` 或 `record()` 调用。旧文档把音乐控制与已支持来源一起列出，表述过度，本轮已更正。
3. **失败歌曲文案存在误报**：`parseActivitySource('creative-songs', ...)` 对 failed/cancelled/interrupted 仍生成“本机生成过一首歌曲”。合成失败回执可复现 `status=failed` 与成功措辞并存。需要按终态修正文案；本轮审查未修改业务实现或重写历史回执。
4. **渲染目标未完全实现**：当前星图有空间投影、辉光近似、圆环和神经光丝，但仍是 Canvas；参考描述中的真实 WebGL、UnrealBloom、13 个执行体调度不是现有识海后端能力。不能把装饰脉冲当作真实模型调用、token 流水或内部思考。
5. **“全部展示”有明确范围**：默认自动分页加载当前人格/会话的全部有效主记录；轨道只使用本范围仍有效的聊天证据，每轮桌面最多 10 段、手机最多 6 段轮转，日志是近期窗口，不是全历史同时常驻。另一人格、另一会话和已撤回证据不会混入。
6. **参考清单曾落后于源码**：本轮初查发现 11 个文件哈希与旧清单不符，含星图动画及生活总部的新改动；清单需要跟随最终源码重新导出，不能据旧清单判断文件不存在。

### 本轮验证

18 项隔离脚本通过：识海核心、检索、证据卡、连续状态、召回接线、自主活动控制、统一协调、上下文连续性及可靠性、Mnemon、人格、情感、平台经历、同图数据流、生命周期、便携设置、设置安装及覆盖保留。完整记忆管理浏览器回归通过；独立内嵌检查确认控制台中的星图加载且圆环相位推进。测试采用合成数据与假服务，不代表真实模型引擎已恢复。

本轮原始测试日志及去标识汇总位于 `maintenance/ocean-completeness-20261030/`。报告不附聊天正文、QQ 号、人格卡、登录态或密钥。

### DeepSeek 400 错误信息补查（2026-10-30）

本机实际 provider 是引擎 `app.asar` 内的 `@deepseek-ai/dsh-llm-deepseek@0.2.1-rc.2`。`providerError()` 只用 `error.message` 作为显示摘要，缺失时退回 `DeepSeek Messages request failed (400)`；HTTP 错误分支仍以 `cause: new Error(text)` 保存原始响应。随后 `LlmError.failure` 和 `normalizeLlmFailure()` 仅输出 message/code/status/requestId 等快照，不携带 cause，所以不能从 QQ 端的笼统提示恢复原始错误体。具体 body 未知时，不能认定为记忆过长、接口协议不匹配或任何单一原因。

识海读取、索引与星图不发起模型请求；内部反思/复习/自言自语使用 `completeDshText()`，仍经过同一 provider，因而也可能遇到该类错误。附加提示的字符预算和上下文减压只能控制部分输入风险，不能保证服务商不会返回 400。

本轮修正 `src/dsh-completion.js`：优先识别错误快照的 HTTP status/code，同时兼容末尾括号中的 DeepSeek 状态码；余额、认证、限流与明确的上下文超限按已知类别提示。不会展示任意响应体或推理，不把未知 400 当作上下文超限，也不新增付费重试。`scripts/test-runtime-economy.mjs` 用假服务验证实际 fallback 字符串、结构化错误、部分输出拒绝与临时会话清理，通过。

这项修正没有修改引擎归档，也没有补回引擎已省略的 body；若要显示具体原因，仍需在引擎序列化之前兼容非标准 error/message/detail 格式，并向管理员提供有长度限制、脱敏后的诊断。当前没有取得用户所述那一次 400 的实际响应体，尚不能确认其根因或声称真实调用已验证成功。证据与测试日志：`maintenance/deepseek-error-diagnostics-20261030/`。

---

本文件由接续会话生成：以《识海系统总入口.md》和 `docs/ocean-system-manifest.json` 为纲，
逐模块核对“文档声称 vs 代码实现”，并记录已修复项与已知差异。以现有实现和测试为准。

## 测试基线（19 个隔离测试，全部通过）

```powershell
cd 桌宠素材目录
# 核心组（无需浏览器）
node scripts/test-ocean-memory.mjs
node scripts/test-ocean-retrieval.mjs
node scripts/test-ocean-evidence-cards.mjs
node scripts/test-ocean-continuity-state.mjs
node scripts/test-ocean-recall-integration.mjs
node scripts/test-ocean-cognition-controls.mjs
node scripts/test-memory-context.mjs
node scripts/test-context-continuity.mjs
node scripts/test-context-reliability.mjs
node scripts/test-mnemon-link.mjs
node scripts/test-character-core.mjs
node scripts/test-emotional-companion.mjs
node scripts/test-activity-memory.mjs
node scripts/test-portable-settings.mjs
node scripts/test-settings-install-integration.mjs
node scripts/test-install-preservation.mjs
node scripts/audit-bridge-harness.mjs

# UI 组（需要 playwright；本机位于 integrations/douyin-agent-upstream/node_modules）
$env:PLAYWRIGHT_MODULE = (Resolve-Path 'integrations\douyin-agent-upstream\node_modules\playwright').Path
node scripts/test-ocean-recall-ui.mjs
node scripts/test-memory-context-ui.mjs
```

不设 PLAYWRIGHT_MODULE 时两个 UI 测试会以 MODULE_NOT_FOUND 失败，这是环境缺依赖，不是代码问题。

## 调用链审计表（bridge → 协调器 → 模块）

### 接线与统一协调

| 位置 | 事实 |
|---|---|
| `src/bridge.js:2536` | `memoryHub()` 单例创建 `createMemoryContext`，注入 `oceanOptions`（getRole/getKinships/getEmergent/getEmotionProfiles/getEmotion/isAllowed/isBusy/model/onExperience） |
| `src/bridge.js:9864` | 每条 QQ 消息前 `prepare(key, state)`，`prepareTimeoutMs` 收敛 50–10000ms（config 默认 4000） |
| `src/bridge.js:9883-9895` | 提示组装顺序：contextHandover → supplementBudget（6000 上限）→ 连续状态 → 自生副人格 → 真实功能经历 → 精简记忆 → `recordPromptRecall` |
| `src/bridge.js:2558` | `contextHandover`：旧会话超限交接笔记，`deliveredTo` 防重复注入 |
| `src/bridge.js:2562` | `recoverContextOverflow`：每小时最多两次，交接后退役旧 DSH 会话、保留待处理消息 |
| `src/bridge.js:9622` | 启动即 `synchronize()`，失败降级为“保留原记录继续” |

### 原文、旧记忆与索引

| 位置 | 事实 |
|---|---|
| `src/conversation-memory.js:13` | `messages` 表唯一聊天归档，`UNIQUE(channel,digest)` |
| `src/ocean-memory.js:40` | `ocean_fts` 中文 bigram + 拉丁整词索引，`index()` 在 upsert/mutate 后同步 |

### 分层、遗忘与证据卡

| 位置 | 事实 |
|---|---|
| `src/ocean-memory.js:14-19` | `memoryActivation`：`0.5^(age/(halfLife*(0.5+importance)))`，半衰期按 kind 分档（person 180d / fact 120d / impression 45d / event 14d / experience 45d / topic 3d / thought 1d / emotion 3d / reflection 30d / selfTalk 2d / review 7d） |
| `src/ocean-memory.js:71` | `view()` 分级：pinned/persona→`core`；archived/过期→`archive`；activation<.08→`archive`；<.4→`warm`；其余 `active` |
| `src/ocean-memory.js:42-48` | 证据记忆卡：同事件最多 80 条原文，`source_hash` 变更才重建 |
| `src/ocean-memory.js:49-54` | 偏好陈述修正链：`claimSlot/claimValue` + `supersededBy/validTo` + `corrects` 边，只对未编辑的 `qq-statement` 生效 |
| `src/ocean-memory.js:129-136` | mutate：edit/pin/archive/restore/delete（墓碑），版本 +1，409 拒绝过期提交；persona/kinship/subpersona/module 只读 |

### 联想召回与回忆路径

| 位置 | 事实 |
|---|---|
| `src/ocean-retrieval.js:61-64` | FTS5 BM25 先选候选（每级最多 3 页、页大小 `limit*4`），不做插入序截断 |
| `src/ocean-retrieval.js:11-16` | 四级：`direct`（人物与关键词）→ `synonym`（本地概念词典）→ `fuzzy`（编辑距离≤1，限最近 128 条内）→ `relation`（一跳关系，每种子最多 2 条、总量 6 条） |
| `src/ocean-retrieval.js:85` | 默认过滤 `archive` 且未 pinned 的节点；`includeArchive` 仅在“以前/之前/去年/归档/那次”等追忆词时开启 |
| `src/ocean-memory.js:142-153` | 回忆路径（traces）：预览不改记忆，节点/边版本重校验后才展示 |

### 连续状态、备忘与约定

| 位置 | 事实 |
|---|---|
| `src/ocean-continuity.js:210` | 导出 `{snapshot,context,saveMemo,updateMemo,listMemos}` |
| `src/memory-context.js:83-84` | 接续检查点：容量比≥.75 且 90 秒内压力新鲜时捕获；memo 变更会使旧交接缓存失效 |

### 自言自语、反思与复习

| 位置 | 事实 |
|---|---|
| `src/ocean-cognition.js:2` | 默认：30 分钟间隔 / 3 条新消息 / 每日 6 次 / 18000 token |
| `src/ocean-cognition.js:35-38` | 结果丢弃条件：人格 revision 变化、设置关闭、会话不允许、超时（默认 90s）；产出写入 `ocean_jobs`，正文只作 `inferred` 记忆，不改关系、不升级事实 |

### 情感、人物关系与自生风格

| 位置 | 事实 |
|---|---|
| `src/bridge.js:2537` | `onExperience` → `emotion.experience`；`getKinships` → `emotions.related`；`getEmergent` → `emotions.emergent`；`getEmotionProfiles` → `pageProfiles` |
| `src/ocean-memory.js:74-93` | `refreshCore`：亲属金色线（总览最多 6 个）、副人格紫色线（6 样本成型）、`activity-growth`/`reflection-source` 边 |
| `src/bridge.js:1456-1458` | 情感记忆三接口：`remember`→`ocean.rememberEmotion`、`recall`→`emotionMemories`、`forget`→墓碑删除 |

### Mnemon、Context 与工作区

| 位置 | 事实 |
|---|---|
| `src/memory-context.js:44-46` | 刷新引擎 bundles：`mnemon`/`context` 插件启用 + `fiberPhase==='active'`；storageScope 必须 `workspace` 才同步 |
| `src/memory-context.js:58-63` | `canSync`：enabled + `socialV2.tools.memory` + adapter 可用 + mnemon + 隔离 + writeEnabled |
| `src/memory-context.js:125-133` | `inspectMnemon`：`dshMnemon/read`(runtime-memory) 只读核对，路径与 `qqMemoryWorkspace` 一致，防止误读默认根工作区 |
| `src/mnemon-memory-adapter.js` | 投影同步与冲突保护；手工内容按文件版本重导 |

### 功能经历入口

| 位置 | 事实 |
|---|---|
| `src/activity-sources.js:3` | 来源：qzone/bilibili/douyin/live/creative/harness |
| `src/activity-sources.js:26-28` | 文件映射含 `creative-songs`（本审计新增，见下） |
| `src/activity-memory.js:31-35` | 每轮同步最多 120 个候选；JSONL 字节游标；直播会话目录游标；rpg 会话按 scope 哈希文件 |
| `src/activity-memory.js:17-26` | `record()`：source+原生ID 去重；编辑/删除的记忆不被导入复活；`historical` 不回放情感 |

### 星海、脑图与后台入口

| 位置 | 事实 |
|---|---|
| `src/bridge.js:7334-7361` | `/memory-context/` 及 13 个 `/api/memory-context/*` 端点；拒绝 `x-agent-token`/`x-agent-call`，仅控制台 `X-Console-Token` |
| `public/memory-context.html:45` | 前端统一 `api(action,body)`，全部走同一 token 校验 |
| `public/ocean-scene.js` | 3D 星海/脑图 Canvas：旋转缩放、光点呼吸、动效可关、还原运动、160 节点分页（UI 测试覆盖） |

### 安装默认与覆盖保留

| 位置 | 事实 |
|---|---|
| `src/portable-settings.js:14` | `contextMemory:{enabled,prepareTimeoutMs}` 在配置加载时生效 |
| `packaging/installer/install-engine.mjs` + `configure-update.mjs` | 覆盖安装保留 state/roles/config（test-install-preservation 覆盖） |

## 本审计的代码改动

1. `src/activity-sources.js`：新增 `creative-songs` 解析（终态才导入；正文固定“不表示已经播放或发送”；channel=job.scope；id=`song:<jobId>`），并注册到 `ACTIVITY_FILES` 指向 `companion/creative-data/songs/jobs.json`。
   依据：`docs/ocean-memory.md` “生成图片/歌曲/虚构剧情及音乐控制，均进入同一识海数据库”。此前歌曲从未进入识海。
   验证：`scripts/test-activity-memory.mjs` 5/5 通过；其余受影响测试复跑全绿。

## 已知差异与未实现（未擅自改动）

1. **音乐控制未接入**：`src/` 与 `companion/` 中没有任何 `music-player-upstream` 回执读取/记录代码，也没有回执文件格式定义。文档提及但无实现，需产品确认回执位置后才能补。
2. **第三层命名**：代码 `stages=['core','active','warm','archive']`，文档称“渐淡”。UI 显示名与文档一致，代码内部名为 `warm`，未重命名。
3. **归档召回口径**：默认不召回归档（非“概率降低”），带追忆词提问时 `includeArchive`。属有意设计，未改。
4. **“五层处理”**：指锁定/归档/片段/索引/摘要五种机制，非五个存储层；存储层为四层。

## 数据安全边界（接续时遵守）

- 不直接改写 `state/conversation-memory.sqlite`、`state/emotional-companion.sqlite`、`roles/`、`config.json`。
- schema 变更只用 `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN`；动数据前先备份到 `state/memory-backups/<日期>/`。
- 参考包（`outputs\识海系统源码参考包-*.zip`）只作对照；它不含聊天、人格卡、记忆库、媒体、登录态与密钥。
