# Contributing to Agent Town

Thanks for helping improve Agent Town! Contributions are welcome.

## Ways to contribute

- **Bug reports**: include OS, Node version, agent source, steps to reproduce, and logs/screenshots.
- **Agent integrations**: add detection for new local agent tools.
- **Gameplay/visuals**: improve agent behavior, HUD, portal FX, city interactions.
- **Docs**: improve setup, screenshots, translations, troubleshooting.

## Development setup

Requirements: **Node.js 18+**.

```bash
git clone https://github.com/roddyka/AgentTown---Ratudan.git
cd AgentTown---Ratudan
node agent-server.cjs
```

Open `http://127.0.0.1:47110` for the city visualizer, or check `http://127.0.0.1:47110/api/state` for the local agent bridge.

## Pull Request guidelines

- Keep PRs focused.
- Do not include unrelated engine/game files.
- Do not commit secrets, local logs, or generated scratch files.
- Update README/docs when behavior or setup changes.
- Add screenshots/GIFs for visual changes.
- Describe how to test the PR.

## Commit style

Clear, descriptive commit messages are enough. Example:

```text
feat: add Cursor agent detection
fix: clamp RPG XP bar width
docs: add multilingual README
```

## Code of conduct

Be respectful and constructive. Assume good intent, give actionable feedback, and keep discussions technical.
