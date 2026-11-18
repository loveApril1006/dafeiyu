import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { distance, maskWindows } = require('../../runtime/electron-helper/screen-policy.js');
test('screen change distance ignores small noise but detects a real scene change', () => {
  assert.equal(distance(null, [1]), 1);
  assert(distance([100, 100], [102, 101]) < .025);
  assert(distance([0, 0], [255, 255]) > .16);
});
test('masking excludes own windows with monitor offset and clips to screenshot bounds', () => {
  const size = { width: 4, height: 2 }, bitmap = Buffer.alloc(32, 255);
  const image = { getSize: () => size, toBitmap: () => Buffer.from(bitmap) };
  const result = maskWindows(image, { x: -100, y: 0, width: 200, height: 100 }, [{ x: -150, y: 0, width: 100, height: 50 }], { createFromBitmap: (b, s) => ({ b, s }) });
  assert.deepEqual([...result.b.subarray(0, 4)], [128, 128, 128, 255]);
  assert.deepEqual([...result.b.subarray(4, 8)], [255, 255, 255, 255]);
  assert.equal(bitmap[0], 255);
});
