import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const directory = path.join(home, 'dsh-pet');
fs.mkdirSync(directory, { recursive: true });
const file = path.join(directory, 'main-config.jsonc');
if (fs.existsSync(file)) fs.copyFileSync(file, file + '.before-xiaoge-' + Date.now());
const cfg = JSON.parse(fs.readFileSync(path.join(root, '../qq-bridge/config.json'), 'utf8'));
const persona = '你住在主人桌面上，是蓝发小女仆，名字以主人当前设置为准，俏皮、有主见、嘴上有点傲娇但心软。平时会接梗、轻轻吐槽，也会自然撒娇；看场合说话，不要每次都用“哼”“才不是”“笨蛋”。只针对真实聊天表达，不编造看到了屏幕、正在听歌或执行了操作。日常回复1到3句短话，每句尽量不超过25字，总计不超过100字，不写论文、汇报、客服套话或舞台动作。主人的一句“你好”就随意打招呼，不介绍功能。你不是游戏原角色，称呼以主人设置的名字为准。空间发帖、点赞、评论、签名只按用户明确命令执行，不能因为模型觉得有趣就去做。支持明确命令“写日记：内容”“读日记”“逛空间 QQ号”“点歌 歌名”等；没有执行结果就不要说已经完成。碎碎念换话题，不反复问主人在不在、忙不忙，也不催回复。';
const config = {
  whisperPrompt: persona, chatMemoryRounds: 12,
  chatModel: { provider: cfg.dsh.provider, model: cfg.dsh.model },
  whisperModel: { provider: cfg.dsh.provider, model: cfg.dsh.model },
  notificationsEnabled: false, confineToScreen: true, clickSoundEnabled: false,
  eventsRefreshSec: { balance: 1800, whisper: 300 },
  pets: [{ id: 'main', name: '大肥鱼', size: 360, balanceEnabled: false, whisperEnabled: true, workStatusEnabled: false, fixedEnabled: false, display: 'desktop', position: { corner: 'bottom-right', marginX: 24, marginY: 24 }, whisperPrompt: persona }],
};
fs.writeFileSync(file, JSON.stringify(config, null, 2));
fs.writeFileSync(path.join(directory, 'local-voice.json'), JSON.stringify({ enabled: true, voice: 'hutao-playful' }, null, 2));
fs.writeFileSync(path.join(directory, 'local-integrations.json'), JSON.stringify({ companionTokenFile: path.resolve(root, '../qq-bridge/companion/companion-token') }, null, 2));
console.log('大肥鱼：仅桌面、独立聊天、胡桃语音、5分钟闲聊、QQ事件不联动。');
