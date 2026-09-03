# Classic-compat qsp engine build

`qsp-engine-classic.wasm` is a rebuild of the qspider player's QSP engine with
three behavioral patches matching the classic 5.8 player:

1. `classic-result-leak.patch` (v2): **ARGS is always call-local; RESULT is
   call-local only when the call expects a return value (FUNC / DYNEVAL). For
   GS and plain DYNAMIC, RESULT leaks to the caller.** (v1 of this patch
   removed RESULT isolation entirely; that broke the game's nested `$result`
   HTML builders — menus and stats rendered duplicated. FUNC must isolate;
   GS must leak.)
2. `classic-unary-plus.patch` (v3, 2026-08-19): **unary plus is an identity
   no-op when a value is expected** (one branch in mathops.c's expression
   compiler, next to unary minus). Modern libqsp has no unary plus at all
   (`+` registered binary-only) and raises error 27 QSP_ERR_SYNTAX; classic
   5.8 accepts it (owner-verified on the desktop player). Girl Life 0.9.9.1
   `food_menu.qsrc` line 740 has a standalone `+$_str` statement (the shared
   dine-in menu of ~20 eateries), so on a stock engine "order from the menu"
   errors out and the location's buttons die until re-entry. Upstream master
   identical as of 2026-08-19 — the game targets classic semantics, so this
   is engine divergence #2, not a game bug to report.
3. `classic-boolean-ops.patch` (v4, 2026-08-20): **classic boolean algebra —
   true is `-1` and `AND`/`OR` are bitwise with both operands always
   evaluated.** See the v4 section below.

## v4 — SHIPPED 2026-08-20 (owner approved)

Shipped with explicit owner approval on 2026-08-20, on **automated
verification only** (no hand-test — owner's call). `qsp-engine-classic.wasm`
**is** the v4 build; the test stand, `launcher/player/` and `fetch-player.sh`
all serve it.

- sha256 (shipped v4): `821fd97d820a2a1151c7690de963430f0a764febb7dc8ef40df87596a30f22d6`
  (707 038 bytes). Identical bytes in all three places:
  `launcher/engine-patch/qsp-engine-classic.wasm`,
  `tools/qspider-standalone/assets/qsp-engine-*.wasm`,
  `launcher/player/assets/qsp-engine-*.wasm`.
- **Players must hard-reload** after this swap (`Empty Cache and Hard Reload`,
  or an incognito window to prove it): the wasm keeps its hashed filename, so a
  browser holding the v3 bytes will silently keep running the old engine. This
  is the same stale-cache trap as the 2026-08-19 session.

v4 = v3 + `classic-boolean-ops.patch` (two hunks):

1. `qsp/mathops.h` — `QSP_TOBOOL(x)` back to `(-((x) != 0))`: **boolean true is
   -1**, as in classic 5.7/5.8 and as the shipped QSP documentation recommends.
2. `qsp/mathops.c` — `qspOpAnd` / `qspOpOr` back to C `&` / `|` with **both
   operands always evaluated** (no short-circuit), as in classic.

The two are a matched pair; applying either alone is worse than applying
neither (see `docs/reports/WP-1-engine-followups.md` §"why both"). What it
fixes, each verified in-game A/B on the stand:

| game site | v3 (old) | v4 (shipped) |
|---|---|---|
| `$menu_settings` colour customiser (`extract_color_component`, `theme_customize_increment`) | every channel reads 1/0/blank for every colour; any +/- collapses the colour | correct R/G/B, correct compose |
| `pav_park_meet_kol_event` winter check (`= -1`) | never winter (`gop/skver_znacom_3.jpg`) | winter (`skver_znacom_1.jpg`) |
| `camera.qsrc:195` `camera_requirement = -1` | the "Ask to take a photo" act **never appears for anyone** | act appears |

- Export/import surface byte-identical to the v3 wasm (51 exports, 6 imports,
  compared with `WebAssembly.Module.exports/imports`), so the same-filename
  swap stays valid.
- Conformance (`tools/theme-test/engine-conformance.mjs`, 13 -> 31 cases):
  **31/31** against the wasm the stand actually serves. The `h.` group (17
  cases) and the `EXPECT_V4` gate that guarded it while v4 was unshipped are
  gone — every case is binding now, and any pre-v4 engine fails the `h.` group
  outright. All 13 v1-v3 cases still pass on v4.
- Reproducibility: rebuilding **v3** with the recipe below produced a wasm
  byte-identical to `ec549f8f…`, so the v4 hash is trustworthy.
- Regression surface, quantified across 1425 location files
  (`node tools/engine-audit/scan-boolean-ops.mjs`): 3 sites go from dead to
  live (the fixes above) and 4 `= 1` sites go from live to dead
  (`arousal_stats.qsrc:176`, `blackmailer.qsrc:1616`/`:1634`,
  `pav_park.qsrc:675`) — all four are dead on the classic desktop player too,
  so v4 does not invent a regression. No save migration needed: the three
  `= -1` readers recompute the value in the same location before testing.
  Full analysis in `docs/reports/WP-1-engine-followups.md` §4.

## Why

Modern libqsp treats RESULT as call-local: a `result` assigned inside a
`gs`-called location (or `dynamic` code) is discarded on return. The classic
desktop QSP 5.8 player — the engine Girl Life is written and community-tested
against — leaks it to the caller. Girl Life 0.9.9's jobs framework returns
values through that leak (`jobs.qsrc`: `is_arrival_time`/`is_work_time`
delegate via `gs '_is_time_check'`), so on a stock qsp-wasm engine **no job of
the new system can ever be started** (hotel maid, salon, clinics, factory,
office, …). A source scan found 12 func-branches and ~dozens of inline sites
relying on the classic behavior. Full evidence: `docs/upstream-result-bug.md`.

Patching the engine fixes the whole class at once and keeps the game
untouched (project rule: we never modify game content).

## Provenance / how to rebuild

- qspider v1.3.1 pins `@qsp/wasm-engine` **v1.5.1**; the vendored
  `qsp-engine-*.wasm` is byte-identical to that npm release.
- Base: QSPFoundation/qsp-wasm-engine tag `v1.5.1`, libqsp commit
  `9f4f29f9cfd0b9d7bce37668d5998fa5e3d3bf0b`, emsdk 3.1.67.
- Exact steps (re-verified 2026-08-19, reproduces v3 byte-for-byte):
  1. `git clone https://github.com/QSPFoundation/qsp-wasm-engine && git checkout v1.5.1`
  2. in `src/qsplib/CMakeLists-qsp.txt.in` change `GIT_TAG master` to the
     libqsp commit above — upstream tracks master, so an unpinned build is
     NOT reproducible;
  3. `git clone https://github.com/emscripten-core/emsdk && ./emsdk install 3.1.67
     && ./emsdk activate 3.1.67 && source ./emsdk_env.sh`;
  4. `cd src/qsplib/build && emcmake cmake ..` (this downloads libqsp +
     oniguruma into `build/qsp-src`, `build/oniguruma-src`);
  5. `git -C build/qsp-src apply <each .patch in this folder>` — the patches
     are CRLF-clean and apply in filename order;
  6. `emmake make qsp-engine` → `src/qsplib/public/qsp-engine.wasm`.
- Apply `classic-result-leak.patch` to libqsp (three hunks: locations.c and
  statements.c pass `res ? varRes : 0` into the allocate helper;
  `qsp/variables.h` `qspAllocateSavedVarsGroupWithArgs` saves ARGS always and
  RESULT only when varRes is non-NULL), `classic-unary-plus.patch` (one hunk
  in `qsp/mathops.c`) and `classic-boolean-ops.patch` (one hunk in
  `qsp/mathops.h`, one in `qsp/mathops.c`), build per the repo's scripts, take
  `src/qsplib/public/qsp-engine.wasm`.
- sha256 of this build (v4, current): `821fd97d820a2a11…`; v3 (through
  unary-plus): `ec549f8fa59de52c…`; v2 (result-leak only):
  `9b5d58a3e2a8519c…`; stock v1.5.1: `e2b4a6e1c3a9a357…`.

`fetch-player.sh` overwrites the freshly downloaded player's
`assets/qsp-engine-*.wasm` with this file (filename kept — the minified JS
glue references it by hashed name).

## Caveats

- The swap relies on emscripten's minified export names matching the vendored
  JS glue. Verified symbol-by-symbol for v1.5.1 (49 exports). **When bumping
  qspider/engine versions, re-verify the export mapping and rebuild the patch.**
- **The game refuses to boot on `QSPVER > '5.9.2'`** (`start.qsrc:12`: full-screen
  RUNTIME VERSION MISMATCH, `showacts 0`, `exit`). Our `QSP_VER` is `5.9.0` —
  confirmed in-game via the cheat console 2026-08-19. (Mechanism corrected
  2026-08-23: qspider DOES register a `QSP_CALL_VERSION` handler, but for the
  bare `$QSPVER` it returns `api.version()` = the engine's `QSP_VER`; only
  `$QSPVER('player')`/`('platform')` are answered by the host, with `qSpider`
  / `browser`. So the engine constant is still what the game sees.) **Two patch versions of headroom.** Before any libqsp bump,
  check the target's `QSP_VER` and re-read `start.qsrc:12` in case the bound
  moved. `mod_system.qsrc` additionally selects `addqst`/`killqst` below 5.8.0
  and `inclib`/`freelib` at or above.
- Re-run the conformance suite (`npm --prefix tools/theme-test run conformance`)
  on every engine or qspider bump. Case `i.` guards a *non*-divergence: the
  wasm build's numbers wrap at 32 bits exactly like classic (`1664525 *
  1000000 == -1922310848`), because `QSP_BIGINT` is 4 bytes on wasm32. If that
  case ever fails, the engine's numeric base type changed and the game's seeded
  PRNG (`random.qsrc`) silently diverges from the desktop player.
- Plain `dynamic` leaks RESULT (classic does); `dyneval` isolates it. The
  dyneval expression path may not route through qspExecStringAsCodeWithArgs —
  add a conformance case if game code surfaces a dyneval+RESULT pattern.
- Verified 2026-08-19 (v2): conformance suite 9/9
  (tools/theme-test/engine-conformance.mjs) + in-game on the 0.9.9 stand:
  hotel maid act appears when due and hides after working same day; settings
  Status Window tab renders each row ONCE (v1 rendered x8); stats panel has
  one Purse and one Sleep bar; creation, stats, saves regress clean.
- Verified 2026-08-19 (v3): conformance suite 13/13 (four new unary-plus
  cases; the old wasm fails exactly those four, reproducing the in-game
  error 27 at `+$_STR`) + in-game on the 0.9.9.1 stand, natural navigation:
  pav_park → Del Parco → Enter the cafe → "Order from the menu" renders the
  menu with no error, ordering an item works end-to-end ("You enjoy some
  vegetarian Piroshki…"), and the v2 case re-verified (hotel maid act
  appears). Export set byte-identical to v2's (checked via
  WebAssembly.Module.exports against the shipped v2 wasm).
- Verified 2026-08-20 (v4), **automated only — no hand-test, owner's explicit
  call**: conformance suite **31/31** against the wasm the stand serves (the
  `EXPECT_V4` gate deleted, so the `h.` group is binding) + in-game on the
  0.9.9.1 stand via the cheat console: colour customiser returns real channels
  (`extract_color_component` red/green → 255, `theme_customize_increment` →
  65290), `pav_park_meet_kol_event` emits the winter image, camera "Ask to take
  a photo" act appears, and both older fixes re-verified (hotel-maid act
  present at `pav_hotel`; `cafe_parco` → "Order from the menu" renders the
  full menu table with no error 27). Save/load `.sav` roundtrip gate re-run
  clean. Zero non-benign console errors (only the pre-existing `sound/*.mp3`
  404s and the known Radix `DialogTitle` a11y warning).
- Headless-driver caveat: dispatching a synthetic `el.click()` on an act
  executes it TWICE through React bubbling (the second execution hits the
  re-rendered act list — e.g. food_menu's single 'Return' act, bouncing you
  straight back out). Real user clicks are unaffected. Drivers must use
  Playwright's coordinate click for acts whose handler replaces the act list.
