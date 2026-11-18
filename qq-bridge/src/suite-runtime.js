import fs from 'node:fs';
import path from 'node:path';
export function suiteNode(root){for(const rel of ['runtime/node.exe','SnowLuma/node.exe']){const file=path.join(root,rel);if(fs.existsSync(file))return file;}throw Error('缺少独立Node运行环境，请修复安装');}
