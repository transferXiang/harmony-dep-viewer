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
    [],
  ],
  warnings: [],
};

const clean = context.sanitizeGraphData(raw);
const cleanDeps = JSON.parse(JSON.stringify(clean.deps));

assert.deepStrictEqual(cleanDeps, [['entry', 'har_utils']]);
assert.deepStrictEqual(raw.deps, [
  ['entry', 'har_utils'],
  ['entry', 'missing_target'],
  ['missing_source', 'har_utils'],
  ['missing_source', 'missing_target'],
  ['entry'],
  [],
]);

console.log('graph guard tests passed');

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
