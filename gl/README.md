# `gl/` — the Girl Life launcher's fork of qspider

This repository is a fork of [QSPFoundation/qspider](https://github.com/QSPFoundation/qspider)
(MIT). Almost everything of ours lives in files upstream does not have; what
we changed *inside* upstream's own files is four small edits in four files,
and they are enumerated below rather than described.

It exists for two reasons.

**The engine.** The [Girl Life launcher](https://github.com/glife-launcher/GLreleases)
ships the qspider **standalone player**, and it ships it with a patched QSP
engine. That patch used to be applied to a downloaded upstream release zip by a
script in the launcher repo. Here the player is built and patched in one place,
and the launcher downloads the finished zip.

**The theme contract.** A qspider theme has no way to be told that the game
state changed, no way to read a game variable without rendering an element and
scraping it, no way to run engine code without clicking a button it drew
itself, and no way to know which dialog is open except by measuring the page.
`libs/gl-bridge/` publishes those as `window.qspiderGl` — see that library's
own README. Three things a library cannot publish are fixed in the player
itself: the game's palette custom properties now also land on `:root` (so a
theme's body-mounted widgets inherit them), `qsp-game-root` is a stacking
context (so a game's inline `z-index` cannot paint over the player's own
dialogs), and a theme's `<script-link>` actually executes. Nothing in it knows which game is running: no variable names, no
setting keys, no location ids. A theme detects it with one integer
(`window.qspiderGl.contract`, currently **1**) and must keep working on stock
qspider, where the global is simply absent.

Upstream is currently pinned at **v1.3.1**.

## Branches and remotes

| name | what |
|---|---|
| `gl-main` | our branch, and the only one we push. Cut from tag `v1.3.1`. |
| `upstream` remote | `QSPFoundation/qspider`. Read-only; we never push to it. |
| `origin` remote | `glife-launcher/qspider`, the fork. |

Upstream tags are merged **into** `gl-main` (`git fetch upstream && git merge v1.3.2`),
never the other way round. We do not maintain a branch that tracks
`upstream/main`; the fork's history is upstream's history plus our commits.

We do not edit upstream files unless a change requires it. In particular
`package.json` and `package-lock.json` are upstream's — the node version is
pinned in `.nvmrc` rather than in an `engines` field for exactly that reason —
and no dependency is added: everything we build uses React, xoid and Mousetrap,
which the tree already has.

## Cutting a player release

```sh
git tag gl-v1.3.1-1        # <upstream version>-<our build number>
git push origin gl-main --tags
```

The tag push runs `.github/workflows/gl-player.yml`, which builds the player,
swaps the engine in, zips it in upstream's layout (`index.html` and `assets/`
at the zip root) and publishes `qspider-player-standalone.zip` as a GitHub
release asset, with its sha256 in the release notes. The launcher's
`launcher/scripts/fetch-player.sh` points its `URL` and `QSPIDER_VERSION` at
that release and needs no other change.

`workflow_dispatch` runs the same build and uploads the zip as a workflow
artifact instead of publishing a release — that is the way to test a change
before tagging.

Upstream's own `demo.yml`, `main.yml` and `prerelease.yml` are kept in the tree
(deleting them would be a permanent merge conflict) and are **disabled** in this
fork's Actions settings.

## What differs from upstream, and how that is checked

**There is no byte-for-byte parity claim, and there deliberately is not one.**
Until the bridge landed, the fork was upstream plus an engine swap, and a local
build reproduced upstream's release zip apart from that one file. A fork whose
whole point is to expose capabilities upstream does not expose cannot keep that
property, and a claim kept past the day it stopped being true is worse than no
claim. What replaces it is three things that can each be re-run.

**1. The named list of files that differ from upstream `v1.3.1`.** Produce it,
do not trust this table:

```sh
git diff --stat v1.3.1..gl-main          # tracked changes, ours included
git diff --name-only v1.3.1..gl-main | grep -v '^gl/' | grep -v '^\.github/workflows/gl-player\.yml$'
```

Everything the second command prints is the whole of our footprint outside our
own directory:

| path | what | upstream commits on it since v1.3.1 |
|---|---|---|
| `.nvmrc` | new file: the node pin | — (upstream has no such file) |
| `libs/gl-bridge/` | new library: `window.qspiderGl`, the theme contract, plus `gl.css`. No upstream file inside it | — |
| `libs/renderer/src/game-runner.tsx` | an import, a lint exemption for it, and `<GlBridge />` in the JSX list — **3 lines** | 1 |
| `libs/renderer/src/theme-core/css-variables.tsx` | `:root, ` prefixed to the two generated selector strings, so a theme's body-mounted widgets inherit the game's colours — **2 tokens** | 0 |
| `libs/renderer/src/theme-core/script-links.tsx` | the component body: it now creates the `<script>` imperatively in an effect, because react-dom deliberately builds `<script>` elements that cannot execute. The tag's public shape is unchanged | 0 |
| `apps/player-standalone/src/main.tsx` | one `import '…/gl-bridge/src/gl.css'` and its lint exemption — **2 lines** | 0 |

No upstream file is reformatted, re-ordered or tidied, `package.json` and
`package-lock.json` are untouched, and nx is not bumped — so an upstream tag
still merges into `gl-main` with a conflict surface of one JSX list, one
component body and two one-line insertions.

**2. The engine export check.** `gl/tools/build-player.sh` swaps our patched
wasm over the stock one by filename glob and then runs
`gl/tools/check-engine-exports.mjs`, which parses the wasm export section and
the emscripten glue's export-binding chain and exits 1 if the glue reads a name
the wasm does not export. That is the gate on every qspider bump.

**3. The player is driven through a real game by the launcher's headless gate
battery** on a stand laid from the built zip, including a driver written
against this contract and, as its control, the same driver run against a stock
build — where it asserts the contract is **absent**. A theme written for the
contract must keep working on stock qspider, and that control is what keeps it
honest.

## The engine patch

`gl/engine-patch/` holds our build of `qsp-engine.wasm` plus the three libqsp
patches it is built from and a README with the citations. The short version:
the modern engine gives every location call a local scope for `RESULT`, so a
`gs`-called location's result is discarded on return, while the classic QSP
5.7.0 desktop player leaks it — and Girl Life's jobs framework relies on the
leak, so under a stock engine the "start work" action never appears for any job.
Two more patches restore classic boolean operators and unary plus.

The build swaps our wasm over the stock one **by filename glob**, because the
glue references the engine by its content-hashed name. Nothing about that
checks the two builds are still interchangeable, so `gl/tools/build-player.sh`
runs `gl/tools/check-engine-exports.mjs`, which parses the wasm export section
and the emscripten glue's export-binding chain and exits 1 if the glue reads a
name the wasm does not export. **On every qspider bump, that check is the gate**
— if it goes red, the engine must be rebuilt against the new `@qsp/wasm-engine`
before the player can ship.

Rebuilding the engine from source needs emscripten, which is not set up here.

## The node pin

Upstream pins nothing: no `engines`, no `packageManager`, no `.nvmrc`. An
unpinned toolchain makes a build unreproducible for no gain, so `.nvmrc`
carries the exact version our builds use (**24.2.0**) and the workflow reads it
through `setup-node`'s `node-version-file`. Change it only deliberately.
