// Preserve argv and pipe semantics when the independent backend invokes Electron's CLI.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {initializePondModelHome,syncPondWorkerProfile} from './model-home.mjs';
import {preparePondCliHome} from '../../companion/pond-model-settings.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
let configured='';try{configured=JSON.parse(fs.readFileSync(path.join(root,'engine.json'),'utf8')).executable||'';}catch{}
const candidates=[process.env.XIAOGE_DSH_EXE,configured,path.resolve(root,'../../../engine/DeepSeek Harness.exe'),path.join(process.env.LOCALAPPDATA||'','Programs/DeepSeek Harness/DeepSeek Harness.exe')].filter(Boolean);
const executable=candidates.find(fs.existsSync);
if(!executable){console.error('机器人未找到已安装的模型引擎，请检查 engine.json');process.exit(1);}
const cli=path.join(path.dirname(executable),'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js');
const home=initializePondModelHome(path.resolve(root,'../../companion/bili-native-data/model-engine'));
syncPondWorkerProfile(home);
preparePondCliHome({home:path.dirname(home),engineHome:process.env.DSH_HOME||path.resolve(root,'../../../engine-home')});
const child=spawn(executable,['--expose-internals',cli,...process.argv.slice(2)],{stdio:'inherit',windowsHide:true,shell:false,env:{...process.env,DSH_HOME:home,DSH_PROFILE_DIR:path.join(home,'profiles/headless'),ELECTRON_RUN_AS_NODE:'1'}});
child.on('error',()=>{console.error('模型引擎无法启动');process.exit(1);});
child.on('exit',code=>process.exit(code??1));
