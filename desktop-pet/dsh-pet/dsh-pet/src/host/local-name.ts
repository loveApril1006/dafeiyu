import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { findPetInstance, readAllConfig, readPetConfigEntry, readUserConfig, saveUserConfig, userConfigUnparsable, type ConfigPaths } from './config';
import { petName } from './local-companion';

/** Rename one instance in its owning layer; retain its id, other pets and fine-tuned settings. */
export async function renamePet(paths: ConfigPaths, id: string, value: unknown): Promise<string> {
  const name = petName(value);
  const hit = findPetInstance(readAllConfig(paths), id);
  if (!hit) throw new Error('没有找到这只桌宠');
  const file = hit.entry === 'main' ? undefined : readPetConfigEntry(paths, hit.entry);
  if (hit.entry === 'main' && userConfigUnparsable(paths)) throw new Error('原配置无法读取，请先修复配置文件');
  const existing = file?.raw ?? readUserConfig(paths);
  const target = file?.path ?? paths.userFile;
  if (hit.entry !== 'main' && !file) throw new Error('宠物配置文件不存在');
  const old = String(hit.pet.name ?? id);
  const prompt = typeof hit.pet.whisperPrompt === 'string' ? hit.pet.whisperPrompt : hit.conf.whisperPrompt;
  const prefix = '你是' + old;
  const renamedPrompt = typeof prompt === 'string' && prompt.startsWith(prefix) && /^[，。、\s]/.test(prompt.slice(prefix.length))
    ? '你是' + name + prompt.slice(prefix.length) : prompt;
  const pets = (hit.conf.pets as Record<string, unknown>[]).map(p => String(p.id) !== id ? p : {
    ...p, name,
    ...(typeof renamedPrompt === 'string' ? { whisperPrompt: renamedPrompt.replace('不要自称胡桃或声称是原角色。', '你不是游戏原角色，称呼以主人设置的名字为准。') } : {}),
  });
  const clean = saveUserConfig({ pets }, existing);
  if (!clean) throw new Error('名字未保存：宠物配置无效');
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(clean, null, 2), 'utf8');
  return name;
}
