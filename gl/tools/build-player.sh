#!/usr/bin/env bash
# Build the Girl Life launcher's qspider standalone player and zip it in the
# same shape as upstream's `qspider-player-standalone.zip` release asset.
#
# Dependencies are NOT installed here: CI runs `npm ci` before calling this,
# and a developer runs it once by hand. Run from anywhere; paths are derived.
#
# Output: dist/qspider-player-standalone.zip
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

OUT_DIR="dist/apps/player-standalone"
ZIP="dist/qspider-player-standalone.zip"

# nx's cloud client and its background daemon are pointless in a one-shot build
# and the daemon leaves a process behind on CI runners.
export NX_NO_CLOUD=true
export NX_DAEMON=false

# vite warns that build.outDir is outside the project root and will not be
# emptied, so empty it ourselves: a stale hashed asset would otherwise ride
# along into the zip.
echo "==> clean"
rm -rf dist

echo "==> npm run build:standalone"
npm run build:standalone

[ -f "${OUT_DIR}/index.html" ] || { echo "build produced no ${OUT_DIR}/index.html" >&2; exit 1; }

# Swap in our classic-compat engine. The stock qsp-wasm gives every location
# call a local RESULT, which silently disables Girl Life's jobs framework;
# gl/engine-patch/README.md has the citations. Same hashed filename, patched
# bytes -- the glue references the engine by name.
echo "==> engine swap"
ENGINE_WASM="$(ls "${OUT_DIR}"/assets/qsp-engine-*.wasm)"
[ "$(printf '%s\n' "${ENGINE_WASM}" | wc -l)" -eq 1 ] || { echo "expected exactly one qsp-engine-*.wasm" >&2; exit 1; }
cp gl/engine-patch/qsp-engine-classic.wasm "${ENGINE_WASM}"
echo "    $(basename "${ENGINE_WASM}") -> classic-RESULT patched build"

# The swap is by filename, so nothing checks that the patched build still has
# the exports the glue reads. This does.
echo "==> export check"
GLUE_JS="$(ls "${OUT_DIR}"/assets/index-*.js)"
node gl/tools/check-engine-exports.mjs "${GLUE_JS}" "${ENGINE_WASM}"

# The build emits an empty game/.gitkeep. The launcher serves the player's
# game folder from the user's own game directory, and a bundled game/ shadows
# that mount, so it never ships.
echo "==> drop the empty game/ placeholder"
rm -rf "${OUT_DIR}/game"

# Zip layout must match upstream's release asset: index.html and assets/ at the
# ZIP ROOT, no leading directory. Upstream gets that from zip-release with
# `directory: dist/apps/player-standalone, path: .`; this is the same shape.
# launcher/scripts/fetch-player.sh unzips straight into launcher/player/ and
# depends on it.
echo "==> zip"
rm -f "${ZIP}"
( cd "${OUT_DIR}" && zip -q -r -X "${REPO_ROOT}/${ZIP}" . )

echo "==> done: ${ZIP}"
ls -l "${ZIP}"
( command -v sha256sum >/dev/null && sha256sum "${ZIP}" ) || shasum -a 256 "${ZIP}"
