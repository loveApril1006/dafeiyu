# dsh-diceframe

> [English](README.en.md) | **中文**

**DSH AI 跑团 / GM 插件**：给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）加上掷骰、检定判定、世界书与角色卡——让 agent 主持**有规则、有判定、有设定**的 TRPG 会话，而不是无结构的闲聊。**支持直接导入 [DiceFrame](https://github.com/diceframe/diceframe) 世界书 / 角色卡 / 内容包。**

## 功能

| 模块 | 提供能力 | 扩展点 |
|---|---|---|
| `dice` | `roll_dice` 工具：`3d6`、`d20`、`2d20kh1`（优势）、`2d20kl1`（劣势）、`4d6dl1`、`d100`、`3d6+2`、`1d6!`（爆炸骰），加密随机，逐骰明细 | 工具 + 提示段 |
| `gm` | `resolve_check` 工具：d100 / d20 / 求和三种模式，含大成功/成功/失败/大失败与 margin；附 GM 主持准则（有起始场景时直接开场） | 工具 + 提示段 |
| `lore` | 世界书 / 角色卡 / **DiceFrame 内容包**导入，注入系统提示词；加载 DiceFrame 内容时附一句多人引导 | 提示段 |
| `commands` | 斜杠命令 `/trpg`（开团）、`/roll`、`/check`，直接执行不经过模型，骰子永远真实 | 命令 |
| `table` | 会话状态：世界、玩家角色卡、场景笔记、NPC、先攻顺序（`table_state` / `table_update`），按会话隔离 | 工具 |
| `save` | **存档互通**：`save_import` 读 DiceFrame 存档（state.json / 可移植 zip）载入本局；`save_export` 把本局写成 DiceFrame 可导入的合法存档 | 工具 + 提示段 |

## DiceFrame 互通（导入 DiceFrame 内容）

`lore` 能直接加载 DiceFrame 生态的内容——不用转换、不用复制：

- **单个世界书 JSON**（含 `world_id`）→ `world_book_path`，自动识别；
- **单个角色卡 JSON**（含 `character_name`）→ `character_card_path`，自动识别；
- **整个内容包目录**（`plugin.json` + `content/worlds|characters|npc|items|spells|classes|rules`）→ `diceframe_pack_path`，一键全量导入。

```yaml
- id: dsh-diceframe-lore
  config:
    enabled: true
    diceframe_pack_path: "C:/games/diceframe-content-packs/my-pack"
    # diceframe_cta: true   # 加载 DiceFrame 内容时附加一句指向多人联机的引导，可设 false 关闭
```

导入后，世界书设定条目、角色属性技能、NPC、物品、法术、职业、规则会结构化进入系统提示词。加载到 DiceFrame 内容时，提示段会附加**一句**引导：

> —— 来自 DiceFrame（github.com/diceframe/diceframe）：单人先在这里试，和朋友一起跑，去 DiceFrame 多人联机。

只有加载到 DiceFrame 内容时才出现，不打扰纯通用世界书的用户。

> 版权提示：本插件**不内置任何第三方/IP 同人内容包**（如《葬送的芙莉莲》同人包）。请导入你自己的内容包，或使用原创内容。

## 存档互通（DiceFrame ↔ DSH）

`save` 模块在 DiceFrame 与 DSH 之间搬运**关键状态**（世界、玩家角色卡、NPC、场景、先攻、最近进展）：

- **导入**：`save_import <路径>` 读一个 DiceFrame 存档（`state.json` 或可移植 zip），把世界/角色/场景/NPC 载入本局——在 DSH 里接着 DiceFrame 的团继续。
- **导出**：`save_export <目录>` 把当前桌台状态写成合法的 DiceFrame 存档（`state.json` + `chatlog.jsonl` + 可移植 zip）。zip 可被 DiceFrame 的「导入存档」加载为新对局，也可把整个目录放进 DiceFrame 的 `data/saves/<game_key>/`。

### 怎么用

`save_import` / `save_export` 是 agent 调用的工具——**告诉它你想导入/导出什么即可**：

**导入**（DiceFrame → DSH）：对 agent 说
```
用 save_import 导入这个 DiceFrame 存档：
C:/路径/到/state.json
然后继续这局。
```
（路径可以是 `state.json`，也可以是 DiceFrame 导出的 zip。）

**导出**（DSH → DiceFrame）：对 agent 说
```
用 save_export 把当前进度导出到：
C:/路径/到/导出目录
```
会在该目录生成 `state.json` + `chatlog.jsonl` + `dsh-diceframe-export-<时间戳>.zip`。

**把导出带去 DiceFrame**（二选一）：
- **zip**：在 DiceFrame 用「导入存档」加载该 zip → 作为新对局恢复；
- **目录**：把 `state.json` + `chatlog.jsonl` 放进 DiceFrame 的 `data/saves/<游戏key>/`（key 自定）。

> 说明：这是"关键状态"互通（世界/角色/场景/历史），不是对 DiceFrame 全部机制（战斗、幸运、谜题等）的逐字段复刻——它在两套引擎间搬运"能继续玩下去"的要素。

导出后想和朋友一起多人跑团 → [DiceFrame](https://github.com/diceframe/diceframe)。

## 环境要求

- 已安装 DSH（`dsh` CLI），Node.js ≥ 22。

## 安装

```sh
# npm 安装（发布后可用）
dsh plugin --profile <名字> add dsh-diceframe

# 或直接从 GitHub 安装（建议固定 commit）
dsh plugin --profile <名字> add github:diceframe/dsh-diceframe
```

纯 ESM、无构建步骤（没有 `prepare` 脚本），GitHub 安装无需 `allowBuilds` 放行。若 pnpm 提示放行，把提示打印的包名写入 profile 的 `pnpm-workspace.yaml`：

```yaml
allowBuilds:
  dsh-diceframe: true
```

> **运行时零依赖。** 插件只 import Node 核心与自身本地模块，加载时**不需要**任何 `@deepseek-ai/*` 依赖。本地 `link:` 安装即装即用，无需 `npm install`，也不会再出现缺依赖导致启动失败。

## 配置

六个独立插件行（`dsh-diceframe/dice`、`dsh-diceframe/gm`、`dsh-diceframe/lore`、`dsh-diceframe/commands`、`dsh-diceframe/table`、`dsh-diceframe/save`），在 profile 的 `cordis.patch.yml` 覆盖。通用格式（Markdown 世界书 / `键: 值` 角色卡）也支持内联文本或文件路径：

```yaml
- id: dsh-diceframe-lore
  config:
    enabled: true
    world_book: |
      ## 迷雾王国
      大陆被永雾笼罩，只有灯塔之城仍有人烟。
    character_card: |
      姓名: 艾琳
      职业: 游侠
```

`enabled: false` 关闭对应功能；DiceFrame 配置见上方"互通"一节。

## 使用

告诉 agent 你想跑团即可——它会用 `roll_dice` 处理随机性、用 `resolve_check` 处理检定，然后叙述结果：

```
开始一个 D&D 5e 风格的一小时短团。我是 1 级游侠艾琳。
营地守夜的侦察检定用 resolve_check，d20，难度 12。
```

## 斜杠命令与会话状态

聊天框里的斜杠命令**直接执行**（不经过模型），骰子永远是真实的。输入 `/` 会在界面弹出命令菜单，可点选：

- `/trpg` —— 开团；GM 会用已加载世界书的「起始场景」直接开场。
- `/roll 3d6` —— 掷任意记法的骰子，返回真实结构化结果。
- `/check 侦察 d20 12` —— 检定（检定名 + 骰子 + 难度）。
- `/state` —— 查看当前桌台状态（世界 / 角色卡 / 场景 / NPC / 先攻）。
- `/save export <目录>` —— 导出当前进度为 DiceFrame 存档；`/save import <路径>` —— 导入 DiceFrame 存档。

agent 通过 `table_state` / `table_update` 按会话追踪**桌台状态**（世界、玩家角色卡、场景笔记、NPC 列表、先攻顺序）——玩的时候让 GM 记录，跨回合保持一致。

想要会话创建界面里有一张独立的**「跑团模式」**入口卡：复制 `standard` agent 预设并追加五个 `dsh-diceframe/*` 行即可（部署层配置；删除该预设即移除入口）。

## GitHub 曝光（重要）

本包通过 `dsh-plugin` 这个 GitHub topic 分发——DSH 插件生态的事实注册表（topic 页 + 自动同步的第三方插件市场）。要被人发现：

1. 仓库主页 → **About** → ⚙️ → **Topics**。
2. 添加：`deepseek`、`deepseek-harness`、`dsh`、`dsh-plugin`、`trpg`、`ai-roleplay`、`tabletop-rpg`、`diceframe`。

## 发布

```sh
npm publish            # 纯 JS 无需构建
# 用户随后执行：dsh plugin --profile <名字> add dsh-diceframe
```

## 开发

```sh
npm test               # node --test，覆盖骰子/检定/世界书/角色卡/DiceFrame 导入
```

目录结构：

```
dsh-diceframe/
├── package.json       # dsh.bundle 清单
├── cordis.patch.yml   # 插件行（patch 层）
├── index.js           # 合并入口（可选）
├── engine.js          # 纯逻辑：骰子、检定、世界书/角色卡/DiceFrame 解析（零依赖）
├── dice.js            # 骰子模块：roll_dice 工具 + 掷骰规则
├── gm.js              # GM 模块：resolve_check 工具 + 主持准则
├── lore.js            # 设定模块：世界书/角色卡/内容包导入 + 引导
├── commands.js        # 斜杠命令：/trpg /roll /check
├── table.js           # 会话状态：世界 / 角色卡 / 场景 / NPC / 先攻
├── save.js            # 存档互通：save_import / save_export（读/写 DiceFrame 存档）
└── tests/             # 纯逻辑单元测试（含原创 fixture 内容包）
```

## 路线图

- 骰子系统预设（D&D 5e、克苏鲁、通用）与房规配置。
- **存档互通深化**：更完整的角色卡字段映射、DiceFrame 战斗/幸运等机制字段的翻译。
- 暗骰：只向玩家叙述结论，不展示点数。
- 会话状态持久化：跨 DSH 重启恢复桌台状态。

## 许可证

[MIT](./LICENSE)
