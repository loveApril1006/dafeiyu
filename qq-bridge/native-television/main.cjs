const {app,BrowserWindow,ipcMain,screen,Menu}=require('electron');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{timingSafeEqual}=require('node:crypto');
let boot;try{boot=JSON.parse(process.env.XIAOGE_TELEVISION_BOOT||'');}catch{app.exit(1);}
delete process.env.XIAOGE_TELEVISION_BOOT;
function validURL(value){try{const u=new URL(value);return u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.pathname==='/bili-live-view/television'&&/^[a-f0-9]{64}$/.test(u.searchParams.get('view')||'')&&u.searchParams.get('native')==='1';}catch{return false;}}
if(!boot||!validURL(boot.url)||!path.isAbsolute(boot.home)||!Number.isInteger(boot.ownerPid)||boot.ownerPid<1){app.exit(1);return;}
fs.mkdirSync(boot.home,{recursive:true});app.setPath('userData',boot.home);app.setName('大肥鱼的小电视');
let win,regions=[],busy=false,resizeBase=null,ignore=false,quitting=false,controlServer;
const owned=event=>win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&validURL(event.senderFrame.url)&&new URL(event.senderFrame.url).origin===new URL(boot.url).origin;
const fit=(width,height)=>{const area=screen.getDisplayMatching(win.getBounds()).workArea;return {width:Math.round(Math.max(420,Math.min(area.width,width))),height:Math.round(Math.max(280,Math.min(area.height,height)))};};
function resizeTo(width,height){const size=fit(width,height);win.setMinimumSize(1,1);win.setMaximumSize(0,0);win.setSize(size.width,size.height);}
function command(action){if(action==='close'){quitting=true;if(win&&!win.isDestroyed())win.close();else app.quit();return;}if(!win||win.isDestroyed())return;if(action==='focus'){win.show();win.focus();}else if(action==='pin')win.setAlwaysOnTop(!win.isAlwaysOnTop());else if(action==='larger'||action==='smaller'){const b=win.getBounds(),f=action==='larger'?1.15:1/1.15;resizeTo(b.width*f,b.height*f);}}
// Windows Electron does not receive piped stdin. Use a private named pipe,
// matching the suite's existing backend-control pattern.
if(boot.controlPipe){
 if(!/^\\\\\.\\pipe\\xiaoge-tv-[a-f0-9]{32}$/.test(boot.controlPipe)||!/^[a-f0-9]{64}$/.test(boot.controlToken||'')){app.exit(1);return;}
 controlServer=net.createServer(socket=>{let input='';socket.setTimeout(2000,()=>socket.destroy());socket.on('error',()=>{});socket.on('data',data=>{input+=data.toString();if(input.length>2048){socket.destroy();return;}if(!input.includes('\n'))return;socket.pause();try{const m=JSON.parse(input.split('\n')[0]),token=Buffer.from(String(m.token||'')),expected=Buffer.from(boot.controlToken);if(token.length!==expected.length||!timingSafeEqual(token,expected)||!['close','focus','pin'].includes(m.action)){socket.destroy();return;}socket.end();command(m.action);}catch{socket.destroy();}});});
 controlServer.on('error',()=>app.quit());controlServer.listen(boot.controlPipe);
}
app.whenReady().then(async()=>{
 if(quitting)return;
 const area=screen.getPrimaryDisplay().workArea;let saved={};try{saved=JSON.parse(fs.readFileSync(path.join(boot.home,'bounds.json'),'utf8'));}catch{}
 const width=Math.max(420,Math.min(area.width-30,Number(saved.width)||820)),height=Math.max(280,Math.min(area.height-30,Number(saved.height)||550));
 const x=Number.isFinite(saved.x)?Math.max(area.x,Math.min(area.x+area.width-width,saved.x)):area.x+area.width-width-25;
 const y=Number.isFinite(saved.y)?Math.max(area.y,Math.min(area.y+area.height-height,saved.y)):area.y+area.height-height-25;
 win=new BrowserWindow({width,height,x:Math.round(x),y:Math.round(y),title:'大肥鱼的小电视',show:false,transparent:true,backgroundColor:'#00000000',frame:false,hasShadow:false,resizable:false,maximizable:false,alwaysOnTop:true,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,backgroundThrottling:false}});
 Menu.setApplicationMenu(null);win.setMenu(null);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,url)=>{if(!validURL(url)||new URL(url).origin!==new URL(boot.url).origin)event.preventDefault();});
 win.webContents.on('will-attach-webview',event=>event.preventDefault());
 win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 win.webContents.session.setPermissionCheckHandler(()=>false);
 win.on('close',()=>{try{fs.writeFileSync(path.join(boot.home,'bounds.json'),JSON.stringify(win.getBounds()));}catch{}});
 win.on('closed',()=>{win=null;app.quit();});
 win.webContents.on('render-process-gone',()=>app.quit());
 try{await win.loadURL(boot.url);win.showInactive();win.setAlwaysOnTop(true,'floating');process.stdout.write('XIAOGE_TV_READY\n');}catch{app.quit();}
});
ipcMain.on('xiaoge-tv-window',(event,action,value)=>{
 if(!owned(event))return;
 if(action==='regions'&&Array.isArray(value)){regions=value.slice(0,12).filter(r=>[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0&&r.width<6000&&r.height<4000);return;}
 if(action==='resize-start'){busy=true;resizeBase=win.getBounds();return;}
 if(action==='resize-end'){busy=false;resizeBase=null;return;}
 if(['close','pin','smaller','larger'].includes(action))command(action);
});
ipcMain.on('xiaoge-tv-resize',(event,dx,dy)=>{if(!owned(event)||!resizeBase||!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)>4000||Math.abs(dy)>3000)return;const ratio=resizeBase.height/resizeBase.width,delta=Math.abs(dx)>=Math.abs(dy/ratio)?dx:dy/ratio;resizeTo(resizeBase.width+delta,resizeBase.height+delta*ratio);});
const pointerTimer=setInterval(()=>{if(!win||win.isDestroyed()||!win.isVisible()||!regions.length)return;const cursor=screen.getCursorScreenPoint(),bounds=win.getContentBounds(),x=cursor.x-bounds.x,y=cursor.y-bounds.y;const outside=!busy&&!regions.some(r=>x>=r.x&&y>=r.y&&x<=r.x+r.width&&y<=r.y+r.height);if(outside!==ignore){ignore=outside;win.setIgnoreMouseEvents(ignore,{forward:true});}},80);
const ownerTimer=setInterval(()=>{try{process.kill(boot.ownerPid,0);}catch{app.quit();}},1500);
app.on('before-quit',()=>{clearInterval(pointerTimer);clearInterval(ownerTimer);controlServer?.close();});app.on('window-all-closed',()=>app.quit());
