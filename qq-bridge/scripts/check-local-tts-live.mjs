// Production dry-run: synthesize and validate, without sending a QQ message.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const state = JSON.parse(fs.readFileSync(path.join(root, 'state/social-v2.json'), 'utf8'));
const key = `private:${config.ownerQQ}`;
const token = state.conversations[key]?.agentToken;
if (!token) throw new Error('Owner session token is unavailable');
const headers = {
  'content-type': 'application/json',
  'x-console-token': fs.readFileSync(path.join(root, 'state/console-token'), 'utf8').trim(),
  'x-agent-call': '1', 'x-agent-token': token
};
const response = await fetch('http://127.0.0.1:3100/api/socialV2/send-voice', {
  method: 'POST', headers,
  body: JSON.stringify({ key, token, voice: 'tts:哼，胡桃的声音已经接好啦。', dryRun: true }),
  signal: AbortSignal.timeout(120000)
});
const body = await response.json();
if (!response.ok || body.dryRun !== true) throw new Error(body.error || 'Dry-run failed');
execFileSync(path.join(root, 'bin/ffmpeg.exe'), ['-v','error','-i',body.file,'-f','null','-'], { windowsHide:true,timeout:15000,stdio:'pipe' });
console.log('PASS: production AI voice route, session authorization, Hu Tao synthesis, FFmpeg decoding and send preflight. No QQ message sent.');
