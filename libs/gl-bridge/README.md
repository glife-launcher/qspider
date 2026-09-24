# gl-bridge

`window.qspiderGl` — a generic, game-agnostic contract a qspider theme can use
instead of watching the DOM.

Nothing in this library knows which game is running: no variable names, no
setting keys, no image paths, no location ids. Every export is a player
capability any theme could ask for.

The whole library is mounted by a single component, `<GlBridge />`, which
`libs/renderer/src/game-runner.tsx` renders inside `<qsp-game-root>`. Two more
upstream files render THROUGH it for C15 (`theme-core/stats.tsx`,
`transformers/default-transformers.tsx`); `gl/README.md` lists every edit.

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
| `portals.tsx` | C15: `portals.set()` / `portals.clear()`, and the two components the player renders through — `GlStatsSections` (inside `<qsp-stats-content>`) and `GlListPortal` (around `<qsp-actions-list>` / `<qsp-objects-list>`) |
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

## C15 — per-section portals (contract 2)

```js
qspiderGl.portals.set({
  stats: {
    header: (info) => /* a non-empty key, or null */,
    targets: { '': 'top-box', Status: 'status-box' },  // section key → element id
    rest: 'other-box',                                   // optional
  },
  actions: 'actions-box',                              // optional
  objects: 'objects-box',                              // optional
});
qspiderGl.portals.clear();
```

The player renders what it always rendered — the game's own nodes, reconciled
by React — but through `ReactDOM.createPortal` into elements the theme owns.
The theme may move, size or hide those elements; React never touches the
container itself, only its children.

**Sections are runs.** The player walks the stats pane's top-level nodes in
order and calls `header(info)` on each. `info` is plain data:
`{ tag, text, attrs }` — `tag` is `'#text'` for a run of loose text, otherwise
the lowercase tag the game wrote (read from the markup, since the player turns
`table`, `font`, links and more into components of its own); `text` is the
node's flattened rendered text, untrimmed; `attrs` its attributes as written. A
non-empty string returned by `header` STARTS a section with that key; every
following node belongs to it until the next header. The run before the first
header is the section `''` (it exists only if it has nodes). A key seen twice
in one pane is suffixed: the second section is `key#2`, the third `key#3`. A
`header` that throws is treated as returning `null` (warned once).

**Where each section goes.** A key named in `targets` renders into
`document.getElementById(targets[key])`; a key not named there renders into
`rest`. The element is looked up at render time; if it is not in the document
— or the key is unmapped and there is no `rest` — the section renders **in
place**, in order, inside `<qsp-stats-content>`. Sections sharing an element
share one portal, so they keep the game's order there even when one of them
appears later. Create the containers first, then call `set()`; calling `set()`
again (with the same spec) re-reads every container.

**Lists.** `actions` / `objects` name the element the whole
`<qsp-actions-list>` / `<qsp-objects-list>` element (with its items) renders
into; in place when absent. Selection, hover and clicks work unchanged — React
events bubble through a portal along the React tree.

**What stays as it was.** With no spec, or after `clear()`, the pane renders
exactly as upstream (`GlStatsSections` returns upstream's own `<Markup>`).
React keys inside the pane are section keys, and the nodes inside a section are
keyed from 0, so a section that appears or vanishes re-keys nothing else. The
portals are children of `<qsp-stats-content>` in the React tree, so
`isStatsVisible$` (the game's `showstat 0`) still removes every section, and the
pane's `hasBrowserTranslation$` re-key still remounts them. Dialogs,
`#portal-container`, the pause screen and the C4/C10 attributes are unaffected.
Theme CSS that reaches the game's nodes through `qsp-stats-content …` or
`qsp-actions …` descendant selectors no longer matches a portaled node; style
the containers instead. The spec does not survive a page reload.
