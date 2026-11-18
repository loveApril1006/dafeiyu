// Only the authenticated local console can launch this fixed, scoped TV page.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {randomBytes} from 'node:crypto';

export function createNativeTelevision({root,spawnImpl=spawn}){
  let child=null,opening=null,closed=false,control=null;
  const state=()=>({available:fs.existsSync(path.resolve(root,'../engine-home/electron/electron.exe'))&&fs.existsSync(path.join(root,'native-television/main.cjs')),running:!!child&&!child.killed});
  function send(action){if(!child||!control)return;const socket=net.createConnection(control.pipe);socket.setTimeout(1500,()=>socket.destroy());socket.on('error',()=>socket.destroy());socket.once('connect',()=>socket.end(JSON.stringify({action,token:control.token})+'\n'));}
  async function open(url){
    if(closed)throw Error('小电视服务正在关闭');
    if(opening){await opening;send('focus');return state();}
    if(child){send('focus');return state();}
    const exe=path.resolve(root,'../engine-home/electron/electron.exe'),entry=path.join(root,'native-television/main.cjs');
    if(!fs.existsSync(exe)||!fs.existsSync(entry))throw Error('小电视桌面运行环境未安装，请安装含桌宠的版本');
    const parsed=new URL(url);if(parsed.protocol!=='http:'||parsed.hostname!=='127.0.0.1'||parsed.pathname!=='/bili-live-view/television'||!/^[a-f0-9]{64}$/.test(parsed.searchParams.get('view')||''))throw Error('小电视地址无效');
    parsed.searchParams.set('native','1');parsed.searchParams.set('floating','1');
    control={pipe:'\\\\.\\pipe\\xiaoge-tv-'+randomBytes(16).toString('hex'),token:randomBytes(32).toString('hex')};
    const env={...process.env,XIAOGE_TELEVISION_BOOT:JSON.stringify({url:parsed.href,home:path.join(root,'companion/bilibili-live-data/native-window'),ownerPid:process.pid,controlPipe:control.pipe,controlToken:control.token})};
    for(const key of ['ELECTRON_RUN_AS_NODE','NODE_OPTIONS','NODE_PATH','XIAOGE_BACKEND_ROOT','XIAOGE_BACKEND_SERVICE'])delete env[key];
    const launched=spawnImpl(exe,[entry],{cwd:path.dirname(entry),env,windowsHide:true,stdio:['ignore','pipe','pipe']});child=launched;
    launched.stderr.resume();
    opening=new Promise((resolve,reject)=>{
      let output='',done=false;
      const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);if(error){send('close');if(child===launched)child=null;reject(error);}else resolve(state());};
      const timer=setTimeout(()=>{send('close');finish(Error('小电视窗口启动超时，请重新打开'));},15000);
      launched.stdout.on('data',chunk=>{output=(output+chunk.toString()).slice(-4096);if(output.includes('XIAOGE_TV_READY'))finish();});
      launched.once('error',()=>finish(Error('小电视桌面窗口无法启动')));
      launched.once('exit',()=>{if(child===launched)child=null;finish(Error('小电视窗口启动未完成'));});
    }).finally(()=>{opening=null;});
    return opening;
  }
  function close(){send('close');return {running:false};}
  return {state,open,close,pin(){send('pin');return state();},dispose(){closed=true;send('close');}};
}
