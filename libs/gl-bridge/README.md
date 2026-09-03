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
| `gl-bridge.tsx` | the mounted component, the after-commit drain, and the game-open re-attach |
| `gl.css` | C5a: `qsp-game-root { isolation: isolate }`. Not JavaScript and not part of the global, but it is a player capability a theme cannot give itself; imported once from `apps/player-standalone/src/main.tsx` |

## The two things that are NOT here

C13 (the game's palette custom properties also land on `:root`) and C1
(`<script-link>` executes) are behaviour changes inside upstream's own
components, `theme-core/css-variables.tsx` and `theme-core/script-links.tsx`.
They are listed in `gl/README.md` with the rest of our footprint.

## A watch outlives `qspApi$` but not a game

`watchVar` attaches through `qspApi$.watch`, which covers "the engine does not
exist yet". It does not cover "a game was opened": the engine outlives a game
and builds a fresh variable table for each one, dropping every watcher
registered against the previous table, while `qspApi$` itself never changes.
So `<GlBridge />` — which is mounted by the game opening — calls
`reattachVars()` in its first effect. Without it a watch registered by a
theme's boot code delivered one value and then went silent for the session,
with nothing to see anywhere.
