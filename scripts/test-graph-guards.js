const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, '..', 'harmony-dep-viewer.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const endMarker = '/* SCAN-CORE-END */';
const start = html.lastIndexOf('/*', html.indexOf('SCAN-CORE-BEGIN'));
const end = html.indexOf(endMarker, start);

const context = { console };
vm.createContext(context);
assert(start >= 0 && end >= 0, 'Could not find SCAN-CORE section in harmony-dep-viewer.html');
vm.runInContext(html.slice(start, end + endMarker.length), context, { filename: 'scan-core.js' });

const entry = (path, text) => ({ path, size: Buffer.byteLength(text), text: async () => text });
const json5 = (value) => JSON.stringify(value, null, 2);

async function main() {
assert.strictEqual(typeof context.sanitizeGraphData, 'function', 'sanitizeGraphData should be available');

const raw = {
  projectName: 'fixture',
  scannedAt: '2026-06-12T00:00:00.000Z',
  modules: [
    { id: 'entry', type: 'hap' },
    { id: 'har_utils', type: 'har' },
  ],
  deps: [
    ['entry', 'har_utils'],
    ['entry', 'missing_target'],
    ['missing_source', 'har_utils'],
    ['missing_source', 'missing_target'],
    ['entry'],
    ['entry', 'missing_target', 'dynamic'],
    ['missing_source', 'har_utils', 'dynamic'],
    ['entry', 'har_utils', 'dynamic'],
    [],
  ],
  warnings: [],
};

const clean = context.sanitizeGraphData(raw);
const cleanDeps = JSON.parse(JSON.stringify(clean.deps));

assert.deepStrictEqual(cleanDeps, [
  ['entry', 'har_utils'],
  ['entry', 'har_utils', 'dynamic'],
]);
assert.deepStrictEqual(raw.deps, [
  ['entry', 'har_utils'],
  ['entry', 'missing_target'],
  ['missing_source', 'har_utils'],
  ['missing_source', 'missing_target'],
  ['entry'],
  ['entry', 'missing_target', 'dynamic'],
  ['missing_source', 'har_utils', 'dynamic'],
  ['entry', 'har_utils', 'dynamic'],
  [],
]);

console.log('graph guard tests passed');

assert.strictEqual(typeof context.visibleGraphData, 'function', 'visibleGraphData should be available');
const hiddenSource = {
  projectName: 'hidden fixture',
  scannedAt: '2026-06-12T00:00:00.000Z',
  modules: [
    { id: 'entry', type: 'hap' },
    { id: 'feature_video', type: 'hap' },
    { id: 'har_utils', type: 'har' },
  ],
  deps: [
    ['entry', 'feature_video', 'dynamic'],
    ['entry', 'har_utils'],
    ['feature_video', 'har_utils'],
  ],
  hiddenIds: ['feature_video'],
  warnings: [],
};
const visible = context.visibleGraphData(hiddenSource);
assert.deepStrictEqual(JSON.parse(JSON.stringify(visible.modules.map((m) => m.id))), ['entry', 'har_utils']);
assert.deepStrictEqual(JSON.parse(JSON.stringify(visible.deps)), [['entry', 'har_utils']]);
assert.deepStrictEqual(hiddenSource.modules.map((m) => m.id), ['entry', 'feature_video', 'har_utils']);
assert.deepStrictEqual(hiddenSource.deps, [
  ['entry', 'feature_video', 'dynamic'],
  ['entry', 'har_utils'],
  ['feature_video', 'har_utils'],
]);

console.log('hidden node filter tests passed');

assert.strictEqual(typeof context.findOrphans, 'function', 'findOrphans should be available');

const orphans = (fixture, seeds) => JSON.parse(JSON.stringify(context.findOrphans(fixture.modules, fixture.deps, seeds))).sort();

// Basic cascade: hiding entry orphans an external lib it solely consumed.
const orphanFixture1 = {
  modules: [
    { id: 'entry', type: 'hap' },
    { id: 'har_utils', type: 'har' },
    { id: '@ohos/lottie', type: 'har' },
  ],
  deps: [
    ['entry', 'har_utils'],
    ['entry', '@ohos/lottie'],
  ],
};
assert.deepStrictEqual(orphans(orphanFixture1, ['entry']), ['@ohos/lottie', 'har_utils']);

// Multi-fix-point cascade: hiding entry should sweep the whole chain.
const orphanFixture2 = {
  modules: [
    { id: 'entry', type: 'hap' },
    { id: 'hsp_player', type: 'hsp' },
    { id: 'har_network', type: 'har' },
    { id: 'har_utils', type: 'har' },
  ],
  deps: [
    ['entry', 'hsp_player'],
    ['hsp_player', 'har_network'],
    ['har_network', 'har_utils'],
  ],
};
assert.deepStrictEqual(orphans(orphanFixture2, ['entry']), ['har_network', 'har_utils', 'hsp_player']);

// HAPs are never auto-hidden even with in-degree 0.
const orphanFixture3 = {
  modules: [
    { id: 'entry', type: 'hap' },
    { id: 'feature_video', type: 'hap' },
    { id: 'har_utils', type: 'har' },
  ],
  deps: [
    ['entry', 'feature_video', 'dynamic'],
    ['feature_video', 'har_utils'],
  ],
};
assert.deepStrictEqual(orphans(orphanFixture3, ['entry']), []);

// A HAR consumed by two HAPs is not orphaned when only one is hidden.
const orphanFixture4 = {
  modules: [
    { id: 'entry', type: 'hap' },
    { id: 'feature_live', type: 'hap' },
    { id: 'har_analytics', type: 'har' },
  ],
  deps: [
    ['entry', 'har_analytics'],
    ['feature_live', 'har_analytics'],
  ],
};
assert.deepStrictEqual(orphans(orphanFixture4, ['entry']), []);

// Seed IDs are excluded from the returned cascade list.
const orphanFixture5 = {
  modules: [
    { id: 'entry', type: 'hap' },
    { id: 'har_utils', type: 'har' },
  ],
  deps: [['entry', 'har_utils']],
};
const cascade5 = orphans(orphanFixture5, ['entry']);
assert(!cascade5.includes('entry'), 'seeds must not appear in returned cascade');
assert.deepStrictEqual(cascade5, ['har_utils']);

console.log('findOrphans cascade tests passed');

const scan = await context.scanCore([
  entry('build-profile.json5', json5({
    modules: [
      { name: 'entry', srcPath: 'entry' },
      { name: 'feature_video', srcPath: 'feature_video' },
      { name: 'har_utils', srcPath: 'commons/har_utils' },
    ],
  })),
  entry('entry/src/main/module.json5', json5({ module: { type: 'entry' } })),
  entry('entry/oh-package.json5', json5({
    name: 'entry',
    dependencies: {
      har_utils: 'file:../commons/har_utils',
    },
    dynamicDependencies: {
      feature_video: 'file:../feature_video',
    },
  })),
  entry('feature_video/src/main/module.json5', json5({ module: { type: 'feature' } })),
  entry('feature_video/oh-package.json5', json5({ name: 'feature_video' })),
  entry('commons/har_utils/src/main/module.json5', json5({ module: { type: 'har' } })),
  entry('commons/har_utils/oh-package.json5', json5({ name: 'har_utils' })),
], 'dynamic fixture');

assert.deepStrictEqual(JSON.parse(JSON.stringify(scan.deps)), [
  ['entry', 'har_utils'],
  ['entry', 'feature_video', 'dynamic'],
]);

console.log('dynamic dependency scan tests passed');

const renderStart = html.indexOf('const NW=');
const renderEnd = html.indexOf('function computeLayoutFor', renderStart);
assert(renderStart >= 0 && renderEnd >= 0, 'Could not find render geometry section');
vm.runInContext(html.slice(renderStart, renderEnd), context, { filename: 'render-geometry.js' });

assert.strictEqual(typeof context.edgeConnectionPoints, 'function', 'edgeConnectionPoints should be available');

const node = (x, y) => ({ x, y });
const points = (a, b) => JSON.parse(JSON.stringify(context.edgeConnectionPoints(a, b)));
assert.deepStrictEqual(points(node(0, 0), node(240, 0)), {
  x1: 132,
  y1: 23,
  x2: 240,
  y2: 23,
  axis: 'x',
  dir: 1,
});
assert.deepStrictEqual(points(node(240, 0), node(0, 0)), {
  x1: 240,
  y1: 23,
  x2: 132,
  y2: 23,
  axis: 'x',
  dir: -1,
});
assert.deepStrictEqual(points(node(0, 0), node(0, 160)), {
  x1: 66,
  y1: 46,
  x2: 66,
  y2: 160,
  axis: 'y',
  dir: 1,
});
assert.deepStrictEqual(points(node(0, 160), node(0, 0)), {
  x1: 66,
  y1: 160,
  x2: 66,
  y2: 46,
  axis: 'y',
  dir: -1,
});

console.log('edge routing tests passed');

const analysisStart = html.indexOf('function buildAnalysis');
const analysisEnd = html.indexOf('/* ================= 渲染 ================= */', analysisStart);
assert(analysisStart >= 0 && analysisEnd >= 0, 'Could not find buildAnalysis section');
vm.runInContext(html.slice(analysisStart, analysisEnd), context, { filename: 'analysis.js' });

const analysis = context.buildAnalysis({
  modules: [
    { id: 'entry', type: 'hap', size: 1 },
    { id: 'har_static', type: 'har', size: 10 },
    { id: 'har_dynamic', type: 'har', size: 20 },
  ],
  deps: [
    ['entry', 'har_static'],
    ['entry', 'har_dynamic', 'dynamic'],
  ],
});
const entryBundle = analysis.bundles.find((b) => b.root === 'entry');
assert.deepStrictEqual([...entryBundle.bundled], ['har_static']);
assert.deepStrictEqual([...entryBundle.boundaries], ['har_dynamic']);
assert.strictEqual(entryBundle.kb, 10);

console.log('dynamic analysis tests passed');

const focusStart = html.indexOf('function applyFocus');
const focusEnd = html.indexOf('function selectFilter', focusStart);
assert(focusStart >= 0 && focusEnd >= 0, 'Could not find applyFocus section');
const applyFocusSource = html.slice(focusStart, focusEnd);
assert(!applyFocusSource.includes("classList.add('cutEdge')"), 'boundary edges should not use cutEdge styling');
assert(!applyFocusSource.includes('classList.remove(\'hidden\')'), 'boundary edges should not show cut marks');

console.log('focus boundary edge style tests passed');

assert(html.includes('id="restoreHiddenBtn"'), 'restore hidden button should be present');
assert(html.includes('function hideNode(id)'), 'explicit hideNode action should be present');
assert(html.includes('function restoreHiddenNodes()'), 'restoreHiddenNodes action should be present');
assert(html.includes('data-hide-id='), 'detail hide button should carry the displayed node id');
assert(html.includes("ev.target.closest('[data-hide-id]')"), 'detail hide button should be wired via event delegation on #detail');
assert(!html.includes('onclick="hideNode('), 'detail hide button should not use fragile inline quoted JavaScript');
assert(html.includes('不会修改工程文件'), 'hide confirmation should clarify files are not modified');

console.log('hidden node UI tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
