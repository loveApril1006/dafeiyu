import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkWechatCommercial} from './check-wechat-commercial.mjs';

function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-release-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text);
  }
  return root;
}
test('case-insensitive SDK exclusion works inside an installer payload wrapper', t => {
  const root = fixture(t, {'Installer/payload/qq-bridge/integrations/WX4PY-UPSTREAM/LICENSE': 'AGPL'});
  assert.equal(checkWechatCommercial(root).status, 'BLOCKED');
});
test('removing the SDK folder alone does not clear a worker still importing it', t => {
  const root = fixture(t, {'qq-bridge/companion/worker.py': 'def load():\n  from pyweixin import Navigator\n'});
  assert.match(checkWechatCommercial(root).blockers[0].reason, /import/);
});
test('detect database SDK and literal dynamic imports', t => {
  const root = fixture(t, {'companion/db.py': 'from wechatauto.db import WeChatDB', 'companion/ui.py': 'sdk = import_module("wx4py")'});
  assert.equal(checkWechatCommercial(root).blockers.length, 2);
});
test('no known blockers is explicitly not commercial clearance', t => {
  const root = fixture(t, {'qq-bridge/src/chat.js': 'export const channel = "draft";'});
  const result = checkWechatCommercial(root);
  assert.equal(result.status, 'NO_KNOWN_WECHAT_BLOCKERS');
  assert.match(result.limitation, /legal\/commercial approval/);
});
test('CLI requires an explicit staging directory', () => {
  const script = fileURLToPath(new URL('./check-wechat-commercial.mjs', import.meta.url));
  assert.equal(spawnSync(process.execPath, [script], {encoding: 'utf8'}).status, 2);
});
