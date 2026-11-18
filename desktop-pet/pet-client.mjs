/** Local development API. Resolves the actual DSH port and authentication without exposing secrets. */
import { fileURLToPath } from 'node:url';
import { getDshConnection } from './dsh-connection.mjs';
export class PetClient {
  constructor({ pet = 'main' } = {}) { this.pet = pet; }
  async request(path, body, query = {}, method = body === undefined ? 'GET' : 'POST') {
    const { baseUrl, cookie } = await getDshConnection();
    const url = new URL('/dsh-pet-7340/' + path, baseUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const res = await fetch(url, { method, headers: { cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
    if (!res.ok) throw new Error(`桌宠接口 ${res.status}，请确认 DSH 已加载 dsh-pet`);
    if (res.status === 204) return {};
    const result = await res.json();
    if (result.ok === false) throw new Error(result.message || result.reason || '桌宠操作失败');
    return result;
  }
  state() { return this.request('state'); }
  chat(text) { return this.request('chat', { text }, { pet: this.pet, surface: 'desktop' }); }
  voice(enabled) { return this.request('local-voice', { enabled }); }
  rename(name) { return this.request('local-name', { id: this.pet, name }); }
  screenSettings() { return this.request('screen/settings'); }
  configureScreen(settings) { return this.request('screen/settings', settings); }
  lookAtScreen() { return this.request('screen/look', {}); }
  openCompanionSettings() { return this.request('screen/open-settings', {}); }
  async display(display) { await this.request('pet-display', { id: this.pet, display }); return { ok: true, pet: this.pet, display }; }
  async drive(path, body) {
    const query = { pet: this.pet, surface: 'desktop' };
    const lock = await this.request('lock', { ttl: 120_000 }, query);
    try { return await this.request(path, body, { ...query, lock: lock.lockId }); }
    finally { await this.request('lock/release', { lockId: lock.lockId }, { pet: this.pet }).catch(() => {}); }
  }
  say(text, { voice = true } = {}) { return this.drive('broadcast', { text, voice, duration: 12000 }); }
  animate(name) { return this.drive('anim', { name }); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pet = new PetClient(), [action = 'state', ...args] = process.argv.slice(2);
  try {
    let result;
    if (action === 'say') result = await pet.say(args.join(' '));
    else if (action === 'chat') result = await pet.chat(args.join(' '));
    else if (action === 'animate') result = await pet.animate(args.join(' '));
    else if (action === 'voice') result = await pet.voice(args[0] !== 'off');
    else if (action === 'show' || action === 'hide') result = await pet.display(action === 'show' ? 'desktop' : 'none');
    else if (action === 'state') result = await pet.state();
    else throw new Error('支持 state / chat / say / animate / voice on|off / show / hide');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
