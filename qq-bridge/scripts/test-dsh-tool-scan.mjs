// A tool inventory must never open large media/model assets as text.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectDshToolNames } from './dsh-tool-names.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-scan-assets-'));
const packageDir = path.join(root, 'dsh-fixture');
fs.mkdirSync(packageDir);
fs.writeFileSync(path.join(packageDir, 'tools.mjs'), 'register(defineTool({name:"fixture_tool"}));');
const media = path.join(packageDir, 'large-model.bin');
fs.writeFileSync(media, 'not source code');
const read = fs.readFileSync;
let assetReads = 0;
try {
  fs.readFileSync = function(file, ...args) {
    if (path.resolve(String(file)) === media) { assetReads++; throw Error('Media must not be opened by tool discovery'); }
    return read.call(this, file, ...args);
  };
  const result = collectDshToolNames({ packagesDir: root, pluginDirs: [] });
  assert(result.names.has('fixture_tool'));
  assert.equal(assetReads, 0);
  console.log('PASS tool discovery reads source files and never opens media/model assets');
} finally {
  fs.readFileSync = read;
  assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
  fs.rmSync(root, { recursive: true, force: true });
}
