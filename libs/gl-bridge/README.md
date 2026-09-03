# gl-bridge

`window.qspiderGl` — a generic, game-agnostic contract a qspider theme can use
instead of watching the DOM.

Nothing in this library knows which game is running: no variable names, no
setting keys, no image paths, no location ids. Every export is a player
capability any theme could ask for.

The whole library is mounted by a single component, `<GlBridge />`, which
`libs/renderer/src/game-runner.tsx` renders inside `<qsp-game-root>`. That one
line is the only upstream file this library touches.

## Why a component and not just module code

State-change events must reach a listener *after* React has committed the DOM
that carries the change. An xoid `subscribe()` callback runs *before* the
re-render it triggers, so a listener driven straight off an atom measures the
previous frame. `<GlBridge />` therefore reads every watched atom with
`useAtom` — which makes it re-render in the same batch as the panels — and
drains a queue of pending events from a `useEffect` with no dependency array,
which runs after that commit.

## Files

| file | contract points |
|---|---|
| `types.ts` | the `QspiderGl` surface and the `Window` augmentation |
| `events.ts` | the event queue, `on`/`off`, the `qspider:changed` dispatch |
| `vars.ts` | `readVar` / `readVarAt` / `watchVar` / `exec` / `execLoc` |
| `overlay.ts` | `data-qsp-overlay` and the panel-visibility attributes |
| `content.ts` | `content()` / `generation()` |
| `actions.ts` | `actions()` / `execAction()` / `selectAction()` |
| `keys.ts` | `bindKey()` / `unbindKey()` over qspider's own Mousetrap |
| `saves.ts` | save/load/slots events and `refreshSlots()` |
| `install.ts` | builds the global; runs at module init |
| `gl-bridge.tsx` | the mounted component and the after-commit drain |
