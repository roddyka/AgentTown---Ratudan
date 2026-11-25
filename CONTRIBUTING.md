# Contributing to Agent Town

Thanks for helping improve Agent Town! Contributions are welcome.

## Ways to contribute

- **Bug reports**: include OS, Node version, agent source, steps to reproduce, and logs/screenshots.
- **Agent integrations**: add detection for new local agent tools.
- **Gameplay/visuals**: improve agent behavior, HUD, portal FX, city interactions.
- **Docs**: improve setup, screenshots, translations, troubleshooting.

## Development setup

1. Clone [JSRat GameEngine](https://github.com/roddyka/jsrat-gameengine).
2. Place this repo in `games/agent-town/`.
3. Run the engine dev server (`npm install`, `npm run dev`).
4. Test Agent Town in the browser.

For bridge-only changes:

```bash
node agent-server.cjs
```

Then check `http://127.0.0.1:47110/api/state`.

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
