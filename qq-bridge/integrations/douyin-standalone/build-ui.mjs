import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {compactJSXHelp} from '../compact-workbench-copy.mjs';
import {writeDependencyNotices} from '../douyin-agent-upstream/desktop/ui-api/scripts/licenses.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),source=path.resolve(root,'../douyin-agent-upstream/desktop/ui-api');
const require=createRequire(path.resolve(root,'../bili-standalone/package.json')),local=createRequire(path.join(source,'package.json'));
const {build}=require('esbuild'),upstream=path.resolve(source,'../.cache/upstream/fb2c4b9e698e30edb738bca4cf0618587db7d203'),packages=path.join(upstream,'packages/client');
const consoleHtml=fs.readFileSync(path.resolve(root,'../../public/console.html'),'utf8');
const consoleCss=consoleHtml.includes('/console-assets/')?fs.readFileSync(path.resolve(root,'../../public/console/console.css'),'utf8'):consoleHtml;
const light=consoleCss.match(/:root\s*\{([\s\S]*?)\}/)?.[1],dark=consoleCss.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\}/)?.[1];
if(!light||!dark)throw Error('Console palette missing');
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
function replaceOnce(text,before,after){if(!text.includes(before))throw Error('Upstream UI changed: '+before.slice(0,70));return text.replace(before,after);}
const result=await build({entryPoints:[path.join(root,'browser-entry.jsx')],outfile:path.join(root,'dist/app.js'),bundle:true,format:'esm',platform:'browser',target:'chrome120',jsx:'automatic',tsconfigRaw:{compilerOptions:{jsx:'react-jsx'}},
  alias:{'@dsh/primitives':path.join(packages,'ui-primitives/src/index.ts'),'@dsh/frame':path.join(packages,'ui-layout/src/client/AppFrame.module.css'),'@dsh/theme':path.join(packages,'ui-theme/src/styles'),...Object.fromEntries(['react','react/jsx-runtime','react/jsx-dev-runtime','react-dom','react-dom/client'].map(name=>[name,local.resolve(name)]))},nodePaths:[path.join(source,'node_modules')],loader:{'.png':'dataurl','.svg':'dataurl','.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl'},define:{'process.env.NODE_ENV':'"production"',__APP_VERSION__:'"1.4.5 · QQ Bridge"'},minify:true,legalComments:'inline',metafile:true,
  plugins:[{name:'robot-adapter',setup(builder){
    builder.onLoad({filter:/ui-api[\\/]src[\\/]main\.jsx$/},({path:file})=>{
      let text=fs.readFileSync(file,'utf8');
      text=replaceOnce(text,"import brandIcon from '../../../assets/brand.png';","const brandIcon='/console-assets/assistant-avatar.webp';");
      text=replaceOnce(text,'<div className="assistant-avatar">鱼</div>','<div className="assistant-avatar"><img src={brandIcon} alt="" /></div>');
      text=replaceOnce(text,'<div className="welcome-symbol">◉</div>','<div className="welcome-symbol"><img src={brandIcon} alt="" /></div>');
      text="import { RobotModelSettings, PublishPanel } from "+JSON.stringify(path.join(root,'robot-controls.jsx'))+";\n"+text;
      const start=text.indexOf('function ApiSettings('),end=text.indexOf('\nfunction VideoPanel(',start);
      if(start<0||end<0)throw Error('Upstream settings changed');
      text=text.slice(0,start)+'const ApiSettings = RobotModelSettings;\n'+text.slice(end);
      text=replaceOnce(text,"useState(() => publicSettings())","useState(() => publicSettings({configured:true,model:'机器人当前模型'}))");
      text=replaceOnce(text,"const allowed = boot?.videoTime?.enabled !== true || video?.allowed === true;","const allowed = boot?.videoTime?.enabled !== true || video?.allowed === true || video?.policy?.enabled === false;");
      text=replaceOnce(text,"独立软件使用自己的 API Key，设置控件与插件采用同一套 DSH 组件。","使用独立视觉模型。密钥可共用，修改后请测试连接。");
      text=text.replaceAll('配置模型与 API Key','选择模型与测试连接').replaceAll('已配置 Key','已连接机器人').replaceAll('尚未配置 Key','尚未连接机器人').replaceAll('本机服务已连接','机器人服务已连接');
      text=replaceOnce(text,'>选择模型与测试连接</Button></Panel>','>选择模型与测试连接</Button><Button size="sm" variant="outline" disabled={operationActive || !watchReady || busy.has(\'personaSync\')} onClick={() => { void run(\'personaSync\', async () => { const result = await window.robotDouyinAction(\'persona-sync\'); setPersona(result.data); }); }}>重新同步机器人人格</Button></Panel>');
      text=text.replaceAll('选择模型与测试连接','固定模型与 API');
      text=replaceOnce(text,"view === 'settings' ? settingsPage : view === 'health'", "view === 'publish' ? <PublishPanel /> : view === 'settings' ? settingsPage : view === 'health'");
      text=replaceOnce(text,'<nav aria-label="主导航">','<nav aria-label="主导航"><button className={view === \'publish\' ? \'nav-link active\' : \'nav-link\'} onClick={() => setView(\'publish\')}>↗ 作品发布</button>');
      text=text.replaceAll('大肥鱼','小鸽子').replaceAll('独立 API 版','机器人集成版').replaceAll('独立软件和抖音插件共用同一个本地记忆文件夹。','抖音的人格、兴趣与观看记忆保存在本机。').replaceAll('共享记忆与人格','记忆与人格');
      return{contents:compactJSXHelp(text),loader:'jsx'};
    });
    builder.onLoad({filter:/ui-api[\\/]src[\\/]style\.css$/},({path:file})=>{
      // Preserve the original layout while replacing its fixed dark-blue colors.
      const text=fs.readFileSync(file,'utf8').replace(/([\w-]+)\s*:\s*([^;{}]+)/g,(all,property,value)=>{
        if(!/#[0-9a-f]{3,8}\b/i.test(value))return all;
        const token=/border|outline/.test(property)?'--border':/shadow/.test(property)?'--overlay':/background/.test(property)?'--surface-subtle':/color/.test(property)?'--text-secondary':'--text';
        return property+':'+value.replace(/#[0-9a-f]{3,8}\b/gi,`var(${token})`);
      });return{contents:text,loader:'css'};
    });
    builder.onLoad({filter:/ui-api[\\/]src[\\/].*\.jsx$/},({path:file})=>({contents:fs.readFileSync(file,'utf8').replaceAll('软件与插件共用的人格文件夹','抖音人格文件夹').replaceAll('插件与软件共用','本机抖音模块使用').replaceAll('共享音频 Key','本机音频 Key').replaceAll('大肥鱼','小鸽子'),loader:'jsx'}));
  }}]
});
const forbidden=Object.keys(result.metafile.inputs).filter(file=>/(?:cordis|ui-renderer|dsh-app-boot|dsh-client-connection)[/\\]/.test(file));if(forbidden.length)throw Error('DSH runtime bundled');
const css=`:root{${light}}:root[data-theme="dark"]{${dark}}\n`+fs.readFileSync(path.join(root,'dist/app.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'robot-theme.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'../../public/console/design-system.css'),'utf8');
const script=fs.readFileSync(path.join(root,'dist/app.js'),'utf8').replace(/<\/script/gi,'<\\/script');
fs.writeFileSync(path.join(root,'dist/index.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>抖音助手 · 小鸽子</title><style>${css}</style></head><body><div id="root">正在加载抖音助手…</div><script type="module">${script}</script></body></html>`);
// Use the upstream license collector against the exact bundle dependency graph.
fs.cpSync(path.join(source,'notices'),path.join(root,'notices'),{recursive:true});
const licenseMeta=structuredClone(result.metafile);
for(const output of Object.values(licenseMeta.outputs))for(const input of Object.keys(output.inputs)){const absolute=path.resolve(input);if(absolute.startsWith(path.join(source,'src')+path.sep))delete output.inputs[input];}
const licenses=await writeDependencyNotices({metafile:licenseMeta,projectRoot:root,upstreamRoot:upstream,workingDirectory:process.cwd()});
fs.copyFileSync(path.resolve(source,'../../LICENSE'),path.join(root,'dist/UPSTREAM-LICENSE'));
fs.mkdirSync(path.join(root,'dist/licenses/katex-fonts'),{recursive:true});
for(const name of ['OFL-1.1.txt','katex-fonts-0.16.47.json'])fs.copyFileSync(path.join(source,'notices',name),path.join(root,'dist/licenses/katex-fonts',name));
fs.appendFileSync(path.join(root,'dist/THIRD_PARTY_NOTICES.md'),'\n原版抖音界面来自 LockyBee/dsh-douyin-agent，MIT 原文见 UPSTREAM-LICENSE。KaTeX 字体以内联 data URI 分发，原始内嵌版权与 OFL 信息见 licenses/katex-fonts/katex-fonts-0.16.47.json 和 OFL-1.1.txt。\n');
fs.writeFileSync(path.join(root,'dist/build-info.json'),JSON.stringify({version:'1.4.5',upstreamCommit:'fb2c4b9e698e30edb738bca4cf0618587db7d203',robotAdapter:true,originalReactUI:true,cordisRuntime:false,licenses},null,2));
console.log('Original Douyin React UI built with robot transport, publishing and live console palette.');
