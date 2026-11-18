import os from 'node:os';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const suite=fileURLToPath(new URL('../../',import.meta.url)),work=os.tmpdir(),root=fs.mkdtempSync(path.join(work,'fresh-fixture-'));
const put=(name,value)=>{const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof value==='string'?value:JSON.stringify(value));};
try{
 for(const name of ['model-settings.mjs','qq-bridge/release-profile.mjs','qq-bridge/src/portable-settings.js','qq-bridge/src/portable-settings-upgrade.js','qq-bridge/src/state-acl.mjs','qq-bridge/packaging/default-settings.json','Start-Stack.ps1','Backend-Common.ps1','Port-Common.ps1','Runtime-Common.ps1']){put(name,fs.readFileSync(path.join(suite,name),'utf8'));}
 put('qq-bridge/package.json',{type:'module'});fs.symlinkSync(path.join(suite,'qq-bridge/node_modules'),path.join(root,'qq-bridge/node_modules'),'junction');
 put('qq-bridge/config.json',{dsh:{},snowluma:{},ownerQQ:null,allow:{private:[],groups:[]}});put('GPT-SoVITS/pet-voice.json',{voices:{}});put('input.json',{kind:'account',qqEnabled:true,owner:''});
 const tool=path.join(suite,'qq-bridge/packaging/installer/configure-target.mjs');const result=spawnSync(process.execPath,[tool,root,path.join(root,'input.json')],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);
 const read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));assert.equal(read('xiaoge-install.json').version,31);assert.equal(read('external-qq-gateway.json').mode,'external');assert.equal(read('qq-bridge/config.json').snowluma.external,true);assert.equal(read('qq-bridge/config.json').snowluma.homeDir,'');assert.equal(read('安装信息.json').qqWebPassword,'');assert(!fs.existsSync(path.join(root,'SnowLuma')));
 for(const name of ['runtime/node.exe','engine/DeepSeek Harness.exe','GPT-SoVITS/runtime/python.exe','local-tts/runtime/python.exe'])put(name,'fixture only');
 const check=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'Start-Stack.ps1'),'-CheckOnly'],{encoding:'utf8',windowsHide:true});assert.equal(check.status,0,check.stdout+check.stderr);assert(!fs.existsSync(path.join(root,'SnowLuma')));
 console.log('PASS fresh v31 configuration and startup preflight without any QQ framework or SnowLuma folder');
}finally{assert(root.startsWith(work+path.sep));fs.rmSync(root,{recursive:true,force:true});}
