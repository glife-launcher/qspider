# `gl/` — the Girl Life launcher's fork of qspider

This repository is a fork of [QSPFoundation/qspider](https://github.com/QSPFoundation/qspider)
(MIT). Everything upstream is unchanged; everything of ours lives under `gl/`
plus two files outside it — `.nvmrc` and `.github/workflows/gl-player.yml`.
No upstream file was edited, so upstream tags merge cleanly.

It exists for one reason: the
[Girl Life launcher](https://github.com/glife-launcher/GLreleases) ships the
qspider **standalone player**, and it ships it with a patched QSP engine. Until
now that patch was applied to a downloaded upstream release zip by a script in
the launcher repo. Here the player is built and patched in one place, and the
launcher downloads the finished zip.

Upstream is currently pinned at **v1.3.1**. A local build of that tag reproduces
upstream's release zip byte-for-byte apart from the engine we deliberately
replace, which is what makes the hashed asset filenames usable as parity
evidence.

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
pinned in `.nvmrc` rather than in an `engines` field for exactly that reason,
and regenerating the lock file invalidates the byte-parity evidence above.

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

Upstream pins nothing: no `engines`, no `packageManager`, no `.nvmrc`. Our
parity evidence is content-hashed filenames, and an unpinned toolchain is the
one thing that can silently invalidate it, so `.nvmrc` carries the exact version
the parity build used (**24.2.0**) and the workflow reads it through
`setup-node`'s `node-version-file`. Change it only deliberately, and re-run the
parity diff afterwards:

```sh
bash gl/tools/build-player.sh
unzip -q dist/qspider-player-standalone.zip -d /tmp/player-check
diff -rq /tmp/player-check <path to a known-good launcher/player>
```
