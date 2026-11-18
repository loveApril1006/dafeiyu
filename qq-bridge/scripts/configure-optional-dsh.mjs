// One-time conservative defaults. Preserve subsequent administrator edits.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profile = path.join(process.env.DSH_HOME || path.join(os.homedir(),'.dsh'),'profiles',process.env.DSH_PROFILE || 'desktop');
const file = path.join(profile,'cordis.patch.yml');
const marker = '# xiaoge-optional-dsh-defaults-v1';
const original = fs.existsSync(file) ? fs.readFileSync(file,'utf8') : '';
if (original.includes(marker)) {console.log('Optional defaults already configured; preserving administrator settings');process.exit(0);}
if (/^\s*-\s*id:\s*["']?(mnemon|vision-router|modsearch)["']?\s*$/m.test(original)) throw new Error('已有相关插件配置，请合并现有设置，不能覆盖');
const cliPath = path.join(root,'integrations/mnemon-runtime/node_modules/@mnemon-dev/mnemon-win32-x64/bin/mnemon.exe');
if (!fs.existsSync(cliPath)) throw new Error('请先安装 Mnemon CLI');
const configs = {
  mnemon:{
    storageScope:'workspace',runtimeUserScope:'storage',cliPath,timeoutMs:10000,defaultRecallLimit:3,
    runtimeMemory:{memoryLimitBytes:4096,userLimitBytes:1024,maintenanceMaxTokens:1024},
    routingGuidance:true,lifecycleEnabled:true,recallMode:'guided',writebackMode:'guided',idleReviewMs:30000,
    idleReview:{enabled:false,runtimeMemory:true,provider:'spawn',fallback:'skip',agentTeams:'pause',minIntervalMs:900000,maxPerSession:0,maxContextChars:6000,maxTokens:1024},
    tabEnabled:true,writeEnabled:true,remoteAccess:'read-only',syncEnabled:false,
    skills:{evolution:false,autoBacktest:false,hints:true,sidebar:false},
    embedding:{enabled:false,endpoint:'http://localhost:11434',model:'nomic-embed-text'},
    recallQuality:{policy:'strict-v1',lowScoreThreshold:0.25,highScoreThreshold:0.6,candidateMultiplier:2,maxMediumResults:2,maxUnknownResults:1}
  },
  'vision-router':{
    progressiveTools:false,routing:false,structuredVisionBootstrap:false,instantDescribe:false,
    visionDepth:'fast',visionDepthMaxCalls:2,visionTurnBudgetMs:60000,desktopScreenshot:false,
    cache:true,cacheTtlSeconds:3600,cacheMaxEntries:100,downscale:true,downscaleMaxPixels:2000000,
    timeoutMs:60000,visionTaskTimeoutMs:60000,onboardingSeen:true
  },
  modsearch:{searchProvider:true,xSearch:false,readPage:false,settingsCard:true}
};
const backup = path.join(root,'state/optional-plugin-backups','configuration-'+Date.now());
fs.mkdirSync(backup,{recursive:true});fs.writeFileSync(path.join(backup,'cordis.patch.yml'),original);
const addition = '\n'+marker+'\n'+Object.entries(configs).map(([id,config]) => '- id: '+id+'\n  config: '+JSON.stringify(config)+'\n').join('')+'# end-xiaoge-optional-dsh-defaults-v1\n';
// Append only these three rows; preserve providers, credentials references and other plugins.
fs.appendFileSync(file,addition,'utf8');
console.log('Configured scoped memory, background review off, bounded on-demand vision and search');
