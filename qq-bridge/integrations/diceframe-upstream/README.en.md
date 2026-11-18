# dsh-diceframe

> **English** | [中文](README.md)

**AI tabletop / GM plugin for DeepSeek Harness (DSH)**: dice rolls, check resolution, world books and character cards — so a DSH agent runs a **structured TRPG session** with rules, checks and setting, instead of free-form chat. **Imports [DiceFrame](https://github.com/diceframe/diceframe) world books, character cards and content packs directly.**

## Features

| Module | What it adds | Extension point |
|---|---|---|
| `dice` | `roll_dice` tool: `3d6`, `d20`, `2d20kh1` (advantage), `2d20kl1` (disadvantage), `4d6dl1`, `d100`, `3d6+2`, `1d6!` (exploding), crypto-random, per-die detail | tool + prompt section |
| `gm` | `resolve_check` tool: d100 / d20 / sum modes with critical-success / success / failure / fumble and margin; plus GM conduct guidance (opens with the world's starter scene) | tool + prompt section |
| `lore` | World books / character cards / **DiceFrame content pack** import into the system prompt; a single-line multiplayer nudge when DiceFrame content is loaded | prompt section |
| `commands` | **Slash commands** `/trpg` (start a run), `/roll 3d6`, `/check 侦察 d20 12` — run directly, never through the model, so dice are always real | commands |
| `table` | **Session state**: world, player character sheets, scene notes, NPCs, initiative via `table_state` / `table_update`, keyed per session | tools |
| `save` | **Save interoperability**: `save_import` loads a DiceFrame save (`state.json` or portable zip) into this run; `save_export` writes this run as a DiceFrame-importable save | tools + prompt section |

## DiceFrame interoperability (import DiceFrame content)

`lore` loads DiceFrame content directly — no conversion, no copying:

- **A single world book JSON** (has `world_id`) → `world_book_path`, auto-detected;
- **A single character card JSON** (has `character_name`) → `character_card_path`, auto-detected;
- **A whole content pack directory** (`plugin.json` + `content/worlds|characters|npc|items|spells|classes|rules`) → `diceframe_pack_path`, one-shot full import.

```yaml
- id: dsh-diceframe-lore
  config:
    enabled: true
    diceframe_pack_path: "C:/games/diceframe-content-packs/my-pack"
    # diceframe_cta: true   # appends one line pointing at multiplayer; set false to disable
```

Imported setting entries, character attributes/skills, NPCs, items, spells, classes and rules flow into the system prompt in a structured form. When DiceFrame content is loaded, the section appends **one line**:

> — from DiceFrame (github.com/diceframe/diceframe): try it solo here; to play with friends, DiceFrame multiplayer.

The nudge only appears for DiceFrame content, never for plain world books.

> Copyright note: this plugin ships **no third-party / fan IP content packs** (e.g. Frieren fan packs). Import your own packs, or use original content.

## Save interoperability (DiceFrame ↔ DSH)

The `save` module carries the **essential state** (world, player character sheets, NPCs, scene, initiative, recent history) between DiceFrame and DSH:

- **Import**: `save_import <path>` reads a DiceFrame save (`state.json` or the portable zip) and loads its world / characters / scene / NPCs into this run — continue a DiceFrame campaign in DSH.
- **Export**: `save_export <dir>` writes the current table state as a valid DiceFrame save (`state.json` + `chatlog.jsonl` + a portable zip). The zip loads via DiceFrame's "import save" as a new game, or drop the folder into DiceFrame's `data/saves/<game_key>/`.

### How to use

`save_import` / `save_export` are agent-called tools — **just tell the agent what you want**:

**Import** (DiceFrame → DSH): say
```
Use save_import to load this DiceFrame save:
C:/path/to/state.json
then continue this game.
```
(The path can be a `state.json` or a DiceFrame-exported zip.)

**Export** (DSH → DiceFrame): say
```
Use save_export to write the current progress to:
C:/path/to/export-dir
```
It writes `state.json` + `chatlog.jsonl` + `dsh-diceframe-export-<timestamp>.zip` there.

**Bring the export into DiceFrame** (either):
- **zip**: use DiceFrame's "import save" on that zip → restored as a new game;
- **folder**: put `state.json` + `chatlog.jsonl` under DiceFrame's `data/saves/<game_key>/` (pick any key).

> This is an "essential state" bridge (world / characters / scene / history), not a field-for-field replica of every DiceFrame mechanic (combat, luck, puzzles…) — it carries what you need to keep playing across the two engines.

After exporting, to run a multiplayer game with friends → [DiceFrame](https://github.com/diceframe/diceframe).

## Requirements

- DSH installed (the `dsh` CLI), Node.js ≥ 22.

## Install

```sh
# from npm (once published)
dsh plugin --profile <name> add dsh-diceframe

# or directly from GitHub (pinned commit recommended)
dsh plugin --profile <name> add github:diceframe/dsh-diceframe
```

No build step (plain ESM, no `prepare` script), so a GitHub install needs no `allowBuilds` allowance. If pnpm asks, copy the key it prints into the profile's `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  dsh-diceframe: true
```

> **Runtime zero-dependency.** The plugin imports only Node core and its own local modules — it never needs `@deepseek-ai/*` installed to load. A local `link:` install works immediately, with no `npm install` step and no missing-dependency boot failure.

## Configuration

Six independent plugin rows (`dsh-diceframe/dice`, `dsh-diceframe/gm`, `dsh-diceframe/lore`, `dsh-diceframe/commands`, `dsh-diceframe/table`, `dsh-diceframe/save`); override them in your profile's `cordis.patch.yml`. Generic formats (markdown world book / `Key: value` card) support inline text or file paths:

```yaml
- id: dsh-diceframe-lore
  config:
    enabled: true
    world_book: |
      ## The Mist Kingdom
      The continent is shrouded in eternal fog.
    character_card: |
      姓名: 艾琳
      职业: 游侠
```

Set `enabled: false` to turn a feature off. See "DiceFrame interoperability" above for DiceFrame config.

## Usage

Tell the agent you want to play — it calls `roll_dice` for randomness and `resolve_check` for checks, then narrates:

```
Run a one-hour D&D 5e style session. I'm Erin, a level 1 ranger.
Perception check to search the room — use resolve_check, d20, difficulty 12.
```

## Slash commands & session state

Chat-UI commands run **directly** (never through the model), so dice are always real. Typing `/` opens the in-UI command menu for picking:

- `/trpg` — start a run; the GM opens with the loaded world's starter scene.
- `/roll 3d6` — roll any notation and get a real structured result.
- `/check 侦察 d20 12` — resolve a check (action, dice, difficulty).
- `/state` — view the current table state (world / character sheets / scene / NPCs / initiative).
- `/save export <dir>` — export the current progress as a DiceFrame save; `/save import <path>` — import a DiceFrame save.

The agent tracks **session state** (world, player character sheets, scene notes, NPCs, initiative order) per session via `table_state` / `table_update` — just ask the GM to record facts during play, and it stays consistent across turns.

For a dedicated **跑团模式** entry card at session creation, copy the `standard` agent preset and append the five `dsh-diceframe/*` rows (deployment config; delete the preset to remove).

## Discoverability on GitHub

This package is distributed through the `dsh-plugin` topic — the de-facto registry for the DSH plugin ecosystem (topic page plus marketplaces that live-sync it):

1. Repo → **About** → ⚙️ → **Topics**.
2. Add: `deepseek`, `deepseek-harness`, `dsh`, `dsh-plugin`, `trpg`, `ai-roleplay`, `tabletop-rpg`, `diceframe`.

## Publishing

```sh
npm publish            # ships prebuilt plain JS; no build step
# users then run: dsh plugin --profile <name> add dsh-diceframe
```

## Development

```sh
npm test               # node --test: dice / checks / world books / character cards / DiceFrame import
```

Structure:

```
dsh-diceframe/
├── package.json       # dsh.bundle manifest
├── cordis.patch.yml   # plugin rows (patch layer)
├── index.js           # combined entry (optional)
├── engine.js          # pure logic: dice, checks, world-book/card/DiceFrame parsing (zero deps)
├── dice.js            # dice module: roll_dice tool + dice guidance
├── gm.js              # GM module: resolve_check tool + conduct rules
├── lore.js            # lore module: world book / card / content-pack import + nudge
├── commands.js        # slash commands: /trpg /roll /check
├── table.js           # session state: world / character sheets / scene / NPC / initiative
├── save.js            # save interop: save_import / save_export (read/write DiceFrame saves)
└── tests/             # unit tests incl. an original fixture content pack
```

## Roadmap

- Dice system presets (D&D 5e, Call of Cthulhu, generic) and house-rule config.
- **Deeper save interop**: richer character-sheet field mapping, translation of DiceFrame combat/luck/puzzle mechanics.
- Hidden ("behind the screen") rolls with narrated-only results.
- Table-state persistence across DSH restarts.

## License

[MIT](./LICENSE)
