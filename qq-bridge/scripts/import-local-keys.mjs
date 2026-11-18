import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = path.join(root, '..', '需要填写的密钥.txt');
const text = fs.readFileSync(input, 'utf8');
const refs = {};
for (const [name, ref] of Object.entries({ siliconflow: 'SILICONFLOW_API_KEY', gemini: 'GEMINI_API_KEY', baomiao: 'BAOMIAO_API_KEY' })) {
  const match = text.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, 'mi'));
  const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
  if (value && !/你的|可选|必需|placeholder|填写|^<|^#/.test(value)) refs[ref] = value;
}
if (!Object.keys(refs).length) {
  console.log('尚未填写密钥。请编辑项目根目录的“需要填写的密钥.txt”后重新运行。');
  process.exit(0);
}
const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
fs.mkdirSync(home, { recursive: true });
const file = path.join(home, '.credentials.yaml');
const doc = fs.existsSync(file) ? yaml.load(fs.readFileSync(file, 'utf8')) : { version: 1, records: {}, refs: {} };
if (!doc || typeof doc !== 'object') throw new Error('Existing credential file is invalid; unchanged.');
doc.refs = { ...doc.refs, ...refs };
doc.records ??= {};
fs.writeFileSync(file, yaml.dump(doc, { lineWidth: -1, noRefs: true }), { mode: 0o600 });
if (refs.SILICONFLOW_API_KEY) {
  const petFile = path.join(root, 'pet', 'pet-config.json');
  const pet = JSON.parse(fs.readFileSync(petFile, 'utf8').replace(/^\uFEFF/, ''));
  pet.apiKey = refs.SILICONFLOW_API_KEY;
  fs.writeFileSync(petFile, JSON.stringify(pet, null, 2) + '\n');
}
console.log('已导入密钥类型：' + Object.keys(refs).join(', ') + '。桌宠配置已同步；重启桌宠后生效。');
