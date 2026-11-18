import assert from 'node:assert/strict';
import { getLocalVoicePerformance, setLocalVoicePerformance } from '../src/local-tts.js';
let writes = 0;
const fetchImpl = async (url, options) => {
  assert.equal(url, 'http://127.0.0.1:17866/performance');
  if (options.method === 'POST') {
    writes++;
    assert.deepEqual(JSON.parse(options.body), { idleUnloadSeconds: 0 });
    return Response.json({ ok: true });
  }
  return Response.json({ idleUnloadSeconds: 300, modelState: 'unloaded', modelLoaded: false,
    compute: 'pending', workerPid: null, secret: 'never-expose-unexpected-fields' });
};
assert.deepEqual(await getLocalVoicePerformance({ fetchImpl }), {
  idleUnloadSeconds: 300, modelState: 'unloaded', modelLoaded: false, compute: 'pending',
});
assert.deepEqual(await setLocalVoicePerformance(0, { fetchImpl }), { idleUnloadSeconds: 0 });
for (const invalid of [-1, 1, 59, 300.1, '300', true, null, { idleUnloadSeconds: 0 }])
  await assert.rejects(setLocalVoicePerformance(invalid, { fetchImpl }));
assert.equal(writes, 1);
await assert.rejects(getLocalVoicePerformance({ fetchImpl: async () => Response.json({ idleUnloadSeconds: '300' }) }));
await assert.rejects(setLocalVoicePerformance(300, { fetchImpl: async () => Response.json({ ok: false }) }));
console.log('PASS voice performance: fixed loopback transport, bounded choices, no config/model/account exposure or synthesis');
