// Preloaded into the service itself. The private local pipe requests the
// application's existing SIGTERM handler; it never force-kills a process.
if(!require('node:worker_threads').isMainThread)return;
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const root=process.env.XIAOGE_BACKEND_ROOT,service=process.env.XIAOGE_BACKEND_SERVICE;
if(!root||!['bridge','qq','engine'].includes(service))throw Error('Backend control requires an installation root and service name');
if(service==='engine'&&!process.argv.some(a=>/dsh-desktop-host[\\/]lib[\\/]cli\.js$/.test(a)))return;
const directory=path.join(root,'runtime-control'),file=path.join(directory,service+'.json');
const token=crypto.randomBytes(32).toString('hex');
const pipeName='xiaoge-'+crypto.createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0,16)+'-'+service+'-'+token.slice(0,16);
const pipe='\\\\.\\pipe\\'+pipeName;
fs.mkdirSync(directory,{recursive:true,mode:0o700});
let closing=false;
const server=net.createServer(socket=>{
  socket.setTimeout(3000,()=>socket.destroy());let input='';
  socket.on('error',()=>{});
  socket.on('data',chunk=>{
    input+=chunk.toString('utf8');if(input.length>4096){socket.destroy();return;}
    if(!input.includes('\n'))return;
    socket.pause();let request;try{request=JSON.parse(input.split('\n')[0]);}catch{socket.end('{"ok":false,"error":"请求格式错误"}\n');return;}
    const supplied=Buffer.from(String(request.token||'')),expected=Buffer.from(token);
    if(supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected)){socket.end('{"ok":false,"error":"控制凭据无效"}\n');return;}
    if(request.action==='status'){socket.end(JSON.stringify({ok:true,pid:process.pid,service})+'\n');return;}
    if(request.action!=='stop'){socket.end('{"ok":false,"error":"未知操作"}\n');return;}
    if(!process.listenerCount('SIGTERM')){socket.end('{"ok":false,"error":"后台仍在启动，请稍后再关闭"}\n');return;}
    if(closing){socket.end('{"ok":true}\n');return;}
    closing=true;
    socket.end(JSON.stringify({ok:true,pid:process.pid,service})+'\n',()=>{
      fs.writeFileSync(path.join(directory,service+'.stopped'),new Date().toISOString());
      setImmediate(()=>process.emit('SIGTERM'));
    });
  });
});
server.on('error',error=>{console.error('[backend-control] '+error.code);process.exitCode=1;});
server.listen(pipe,()=>{
  fs.writeFileSync(file,JSON.stringify({version:1,pid:process.pid,service,pipeName,token,createdAt:new Date().toISOString()}),{mode:0o600});
  server.unref();
});
process.on('exit',()=>{try{if(JSON.parse(fs.readFileSync(file,'utf8')).pid===process.pid)fs.unlinkSync(file);}catch{}});
