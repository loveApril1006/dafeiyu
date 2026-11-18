import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {voiceNetworkError} from './voice-network-error.js';

const endpoint = 'http://127.0.0.1:17866';
async function voiceFetch(fetchImpl, route, options) {
  try { return await fetchImpl(endpoint + route, options); }
  catch (error) { throw voiceNetworkError(error, route === '/synthesize' ? '连接本地语音合成服务（17866）' : '连接本地语音服务（17866）'); }
}
export async function getLocalVoicePerformance({ fetchImpl = fetch } = {}) {
  const response = await voiceFetch(fetchImpl, '/performance', { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('请先启动或更新本地语音服务');
  const value = await response.json();
  if (![0, 60, 300, 600, 1800].includes(value.idleUnloadSeconds)) throw new Error('语音资源设置无效');
  return { idleUnloadSeconds: value.idleUnloadSeconds, modelState: String(value.modelState || 'unloaded'), modelLoaded: value.modelLoaded === true, compute: String(value.compute || 'pending') };
}
export async function setLocalVoicePerformance(idleUnloadSeconds, { fetchImpl = fetch } = {}) {
  if (![0, 60, 300, 600, 1800].includes(idleUnloadSeconds)) throw new Error('请选择有效的语音空闲时间');
  const response = await voiceFetch(fetchImpl, '/performance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idleUnloadSeconds }), signal: AbortSignal.timeout(5000) });
  if (!response.ok || (await response.json()).ok !== true) throw new Error('语音资源设置保存失败');
  return { idleUnloadSeconds };
}
export async function getLocalVoices({ fetchImpl = fetch } = {}) {
  const response = await voiceFetch(fetchImpl, '/voices', { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('本地语音服务未就绪，请先启动语音服务');
  const data = await response.json();
  const voices = Object.entries(data.voices || {}).filter(([id, name]) => /^[a-z0-9_-]{1,80}$/.test(id) && typeof name === 'string' && name.length <= 80).map(([id, name]) => ({ id, name }));
  if (!voices.length || !voices.some(v => v.id === data.selected)) throw new Error('音色列表无效，请检查本地语音配置');
  return { selected: data.selected, voices };
}
export async function selectLocalVoice(voice, { fetchImpl = fetch } = {}) {
  const data = await getLocalVoices({ fetchImpl });
  if (!data.voices.some(v => v.id === voice)) throw new Error('请选择列表中的音色');
  const response = await voiceFetch(fetchImpl, '/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voice }), signal: AbortSignal.timeout(120000) });
  if (!response.ok || (await response.json()).ok !== true) throw new Error('音色保存失败，请稍后重试');
  return { ...data, selected: voice };
}
export async function synthesizeGptSovitsAudio(text, { voice, fetchImpl = fetch, timeoutMs = 120000 } = {}) {
  const content = String(text ?? '').trim();
  if (!content || content.length > 500) throw new Error('语音文字需为 1～500 个字符');
  if (voice !== undefined && !/^[a-z0-9_-]{1,80}$/.test(voice)) throw new Error('音色无效');
  const response = await voiceFetch(fetchImpl, '/synthesize', {
    method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ text: content, ...(voice ? { voice } : {}) }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`语音合成失败（HTTP ${response.status}），请检查本地 GPT-SoVITS 服务`);
  if (Number(response.headers.get('content-length')) > 20 * 1024 * 1024) throw new Error('合成音频超过 20MB');
  const chunks = [];
  let total = 0;
  try { for await (const chunk of response.body) {
    total += chunk.length;
    if (total > 20 * 1024 * 1024) throw new Error('合成音频超过 20MB');
    chunks.push(chunk);
  } } catch (error) {
    if (total > 20 * 1024 * 1024) throw error;
    throw voiceNetworkError(error, '接收本地合成音频（17866）');
  }
  const audio = Buffer.concat(chunks);
  if (audio.length <= 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('语音服务没有返回有效 WAV 音频');
  }
  return audio;
}
export async function synthesizeGptSovits(text, { dir, ...options } = {}) {
  const audio = await synthesizeGptSovitsAudio(text, options);
  await fs.mkdir(dir, { recursive: true });
  const name = `tts-local-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.wav`;
  await fs.writeFile(path.join(dir, name), audio, { flag: 'wx' });
  return name;
}
