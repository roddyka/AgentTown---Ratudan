---
name: agent-town
description: Use when working on Agent Town / Ratudan, a standalone local AI agent visualizer in a Ratudan RPG city. Covers agent detection, portal sleep/wake, task monsters, HUD, classes, loot, and local bridge setup.
---

# Agent Town / Ratudan

Agent Town turns local AI coding agents into characters in a Ratudan RPG city. Use this skill when editing Agent Town behavior, visuals, agent detection, or setup docs.

## What this project is

- A **standalone local visualizer** - no external engine install required.
- `agent-server.cjs` serves the 3D city (`web/`) and the local agent bridge/API.
- Reads local agent state from (`/api/state`, `/stream`, `/events`, also `/__agent/*`).

## Key files

- `levels/vale.json` - Agent Town level config; `rpg.mode` should be `agents`.
- `agent-server.cjs` - legacy local bridge for detecting agents and exposing state/SSE.
- `assets/` - Ratudan RPG assets.
- `design/` - RPG/game design data.
- `README.md` - public setup and contribution guide.

When used inside JSRat GameEngine, key engine files are:

- `src/engine/rpg/Rpg.ts` - agent simulation, AI, portal, combat, loot, classes.
- `src/engine/rpg/Ui.ts` - HUD, minimap, agent panel, shop.
- `src/core/Game.ts` - direct Agent Town boot/render integration.
- `tools/agentTownApi.ts` - embedded dev agent API.

## Behavior rules

- **Idle**: agent stays in city, can wander a bit nearby.
- **Sleeping/inactive**: agent moves to portal, plays portal FX, becomes hidden; returns through portal when active.
- **Working/waiting**: agent leaves city to fight task monsters; `?` indicates attention needed.
- **Loot**: agents can collect loot; observer can fight too; floating damage/blood/FX should be visible.
- **Collision**: agents/NPCs/enemies should not occupy same space and should not stay stuck on walls.
- **Persistence**: agent meta/progression should be preserved in localStorage; do not lose task/state unnecessarily on reload.

## Setup checklist

1. Clone the repo and run `node agent-server.cjs`.
2. Open `http://127.0.0.1:47110`.
3. Confirm agent API responds (`/api/state`).
4. Verify local agents appear in the HUD/city.

## Safety

- Local-only detection. Never expose agent bridge publicly.
- Avoid including unrelated engine files when publishing this pack.
