# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Two things sit at the root and they serve different roles:

- **`harmony-dep-viewer.html`** — the actual product. A single-file, zero-build browser tool that scans a HarmonyOS project on disk and renders an interactive SVG dependency graph of its HAP / HSP / HAR modules. All HTML, CSS, JS, and SVG generation live in this one file.
- **`MockHarmonyProject/`** — fixture data for the viewer, **not** a buildable app. Every module's `src/main/ets/Index.ets` is just `let x = 0; // padding` repeated thousands of times to simulate code size; do not treat the `.ets` files as real source.

There is no package manager, no test runner, no toolchain. "Building" the viewer means saving the file; "running" it means opening it.

## How to run / iterate

Open `harmony-dep-viewer.html` directly in a Chromium-based browser (Chrome/Edge), click **扫描工程目录**, and pick `MockHarmonyProject/` as the project root. Notes:

- The viewer prefers `window.showDirectoryPicker` (Chromium only). Safari/Firefox fall back to a hidden `<input webkitdirectory>`.
- Scan results are cached in `localStorage` under the key `STORE_KEY`. Use **清除缓存数据** in the header, or `localStorage.clear()` in DevTools, when iterating on the parser or the fixture.
- A valid project root **must** contain `build-profile.json5` at its top level — that file's `modules[]` array drives the entire scan. Each entry's `srcPath` is resolved to find `<srcPath>/oh-package.json5` (dependencies) and `<srcPath>/src/main/module.json5` (module type).

## Architecture of the viewer (`harmony-dep-viewer.html`)

The pipeline is linear and lives inside the one file. When changing parsing or rendering, follow the data flow:

1. **Scan** (`scanProject` → directory handle / FileList) collects every file under the chosen root into a `Map<relativePath, fileEntry>` keyed by path relative to root.
2. **Parse** reads `build-profile.json5` from that map, then for each declared module reads `<src>/oh-package.json5` and `<src>/src/main/module.json5`. JSON5 is parsed by a local `parseJSON5` (no library); be careful adding fields that need trailing-comma or comment handling beyond what it already supports.
3. **Model** produces `DATA = { nodes, edges, warnings }`. Node `kind` is `hap | hsp | har` derived from `module.json5`'s `module.type` (`entry`/`feature` → HAP, `shared` → HSP, `har` → HAR). Edges come from `oh-package.json5`'s `dependencies` and `dynamicDependencies`; `file:` deps become internal edges, anything else (e.g. `@ohos/lottie`) becomes an `ext` node. Dynamic edges are stored as `[source, target, "dynamic"]`; legacy/static edges may remain `[source, target]`.
4. **Cache** via `saveData(DATA)` / `loadData()` → `localStorage`. On reload the graph rebuilds from cache without re-scanning.
5. **Render** (`autoLayout` + SVG node/edge generation) draws the graph into `<svg id="svg">`. Focus mode uses the `fLv` (forward / 它依赖谁) and `rLv` (reverse / 谁依赖它) selects plus the "遇 HSP/HAP 截断" checkbox to colour/cut the BFS traversal. Edge style: solid = `dependencies`, dashed = `dynamicDependencies`.

Styling conventions are baked into CSS variables at the top of `<style>` (`--hap`, `--hsp`, `--har`, plus `-bg` variants). Reuse those rather than hardcoding colours.

## Architecture of the fixture (`MockHarmonyProject/`)

The fixture exists to exercise the four module taxonomy levels and the cross-tier dependency rules HarmonyOS enforces. Keep the shape intact when editing:

- `AppScope/app.json5` — bundle metadata.
- `build-profile.json5` — workspace-level module registry; the viewer **requires** this file at the project root.
- `entry/` — HAP, the app's UIAbility entry. Depends statically on HSPs/HARs and dynamically on the feature HAPs.
- `feature_video/`, `feature_live/` — feature HAPs (按需安装), each depending on `hsp_player_core` plus their own HARs.
- `shared/hsp_*` — HSPs (动态共享包). `hsp_player_core` depends on `hsp_common_ui`, demonstrating HSP→HSP edges.
- `commons/har_*` — HARs (静态库) forming a layered DAG: leaf `har_utils`/`har_crypto` → mid `har_logger`/`har_network`/`har_storage`/`har_ui_widgets` → upper `har_analytics`/`har_danmaku`/`har_image_loader`.
- External `ohpm` packages (`@ohos/lottie`, `@ohos/gpu_transform`) appear in two `oh-package.json5` files to verify external-node rendering.

Per-module file layout the viewer depends on: `oh-package.json5` at the module root, and `src/main/module.json5` declaring `module.type`. The `.ets` padding files are size ballast and can be regenerated/resized freely without breaking the graph.

## When changing things

- Editing the parser or graph: bump or clear `localStorage` cache between reloads, otherwise stale `DATA` masks your changes.
- Adding a new fixture module: register it in `build-profile.json5` `modules[]` **and** create `oh-package.json5` + `src/main/module.json5` — the scanner skips modules missing either file (and emits a warning surfaced in the side panel).
- Changing colours or module-type semantics: update both the CSS variables and the `kind` derivation in the parse step; they're decoupled.
