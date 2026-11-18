const $=id=>document.getElementById(id),q=new URLSearchParams(location.search),key=q.get('view')||'',monitor=q.get('monitor')==='1',client=crypto.randomUUID(),auth='view='+encodeURIComponent(key),audio=$('audio');
let control=new URLSearchParams(location.hash.slice(1)).get('control')||'';
if(q.get('floating')==='1')try{if(control)sessionStorage.setItem('live-window-control',JSON.stringify({view:key,token:control}));else{const saved=JSON.parse(sessionStorage.getItem('live-window-control')||'null');if(saved?.view===key)control=saved.token;}}catch{}
let canControl=false,busy=false,sending=false,currentData=null,first=true,cursor='',lastSession=null,lastChat='',pending=null,muted=monitor,failures=0,emojiTarget=null,toastTimer;
history.replaceState({},'',location.pathname+'?'+auth+(monitor?'&monitor=1':'')+(q.get('floating')==='1'?'&floating=1':''));
const types={question:'弹幕',gift:'礼物',guard:'上舰',welcome:'入场',superchat:'醒目留言',manual:'主播分享',commentary:'视频点评',host:'主播'};
function node(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
function icon(id,cls='icon'){const n=document.createElementNS('http://www.w3.org/2000/svg','svg'),u=document.createElementNS(n.namespaceURI,'use');n.classList.add(cls);u.setAttribute('href','#'+id);n.append(u);return n;}
function notify(text,error=false){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').className='toast'+(error?' error':'');$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,error?9000:4500);}
function avatar(m){const ai=m.role==='assistant'&&m.kind!=='manual',host=m.role==='host'||m.kind==='manual',box=node('div',null,'avatar'+(ai?' ai-avatar':host?' host-avatar':'')),fallback=()=>box.replaceChildren(icon(ai?'a-fish':host?'a-host':'a-person','avatar-art'));fallback();if(!ai&&m.avatar){try{const u=new URL(m.avatar);if(u.protocol==='https:'&&/^i\d\.hdslb\.com$/.test(u.hostname)&&u.pathname.startsWith('/bfs/')){const image=node('img');image.alt='';image.referrerPolicy='no-referrer';image.src=u.href;image.onerror=fallback;box.replaceChildren(image);}}catch{}}return box;}
function drawChat(chat,name,hostName){
 if(chat.sessionId!==lastSession){lastSession=chat.sessionId;lastChat='';cursor='';first=true;}
 const signature=JSON.stringify([chat.messages,name,hostName]);if(signature===lastChat)return;lastChat=signature;
 const replied=new Set(chat.messages.filter(m=>m.role==='assistant'&&m.replyTo).map(m=>m.replyTo));
 for(const [id,right]of [['viewers',false],['answers',true]]){
  const box=$(id),nearEnd=box.scrollHeight-box.scrollTop-box.clientHeight<60,scroll=box.scrollTop;
  const rows=chat.messages.filter(m=>right?m.role==='assistant'||m.role==='host'&&m.side==='assistant'||m.role==='viewer'&&['question','superchat'].includes(m.kind)&&replied.has(m.id):m.role==='viewer'||m.role==='host'&&m.side!=='assistant');
  if(!rows.length){const e=node('div',null,'empty');e.append(icon(right?'i-robot':'i-people','empty-icon'),node('b',right?'等你来聊一会儿':'欢迎来到直播间'),node('span',right?'回答、图片和视频点评会在这里出现':'观众的弹幕与礼物会在这里出现'));box.replaceChildren(e);continue;}
  const existing=new Map([...box.querySelectorAll('article[data-id]')].map(n=>[n.dataset.id,n]));
  box.replaceChildren(...rows.map(m=>{
   const fingerprint=JSON.stringify([m,name,hostName]),previous=existing.get(m.id);if(previous?.dataset.render===fingerprint)return previous;
   const host=m.role==='host'||m.kind==='manual',ai=m.role==='assistant'&&!host,row=node('article',null,'message'+(ai?' from-ai':host?' from-host':right?' context':'')),body=node('div',null,'message-body'),meta=node('div',null,'meta'),person=node('span',host?hostName:ai?name:m.user,'user'),stamp=node('time',new Date(m.at).toLocaleTimeString('zh-CN',{hour12:false,hour:'2-digit',minute:'2-digit'}));
   if(host)meta.append(stamp,node('span','主播','event-tag host'),person);
   else{meta.append(person);if(!ai&&!right)meta.append(node('span',types[m.kind]||'互动','event-tag '+(m.kind==='gift'||m.kind==='guard'?'gift':m.kind==='question'?'question':'')));meta.append(stamp);}
   const bubble=node('div',null,'bubble');if(m.kind==='gift'&&m.role==='viewer')bubble.append(node('span','💗','gift-heart'));bubble.append(document.createTextNode(m.text));
   if(m.imageId){const image=node('img');image.className='picture';image.alt='分享的图片';image.src='/bili-live-view/images/'+encodeURIComponent(m.imageId)+'?'+auth;image.onload=()=>{if(nearEnd)box.scrollTop=box.scrollHeight;};image.onerror=()=>image.replaceWith(node('small','图片已移除'));bubble.append(image);}
   body.append(meta,bubble);if(m.video)body.append(node('div','▣ '+m.video.title,'source'));row.append(avatar(m),body);row.dataset.id=m.id;row.dataset.render=fingerprint;return row;
  }));box.scrollTop=nearEnd?box.scrollHeight:scroll;
 }
}
function drawTV(){$('tvLabel').textContent='打开小电视';}
function composeState(){
 const active=canControl&&currentData?.chat.live&&!currentData.chat.paused&&!sending;
 for(const id of ['liveInput','aiInput','liveSend','aiSend'])$(id).disabled=!active;$('sharePicture').disabled=!active;
 $('liveInput').placeholder=!canControl?'OBS 展示模式 · 输入已关闭':!currentData?.chat.live?'先在后台开始互动，再发弹幕…':'发个弹幕和大家一起聊吧…';
 $('aiInput').placeholder=!canControl?'OBS 展示模式 · 输入已关闭':!currentData?.chat.live?'先开始互动，再和大肥鱼聊聊…':'和'+(currentData?.studio.displayName||'大肥鱼')+'聊聊吧…';
}
async function action(kind,extra={}){
 if(!control||!canControl&&kind!=='hello')throw Error('请从后台重新打开可操作的独立浮窗');
 const r=await fetch('/bili-live-view/action?'+auth,{method:'POST',headers:{'content-type':'application/json','x-studio-control':control},body:JSON.stringify({action:kind,sessionId:currentData?.chat.sessionId,...extra})}),d=await r.json();
 if(!r.ok){if(r.status===403){canControl=false;composeState();}throw Error(d.error||'发送未完成');}return d;
}
async function submit(kind,input){
 if(sending)return;const text=$(input).value.trim();if(!text)return;if(kind==='danmaku'&&Array.from(text).length>20){notify('直播间文字弹幕最多20字；长问题可以发给右侧的大肥鱼。',true);return;}
 sending=true;composeState();try{const d=await action(kind,{text});$(input).value='';notify(kind==='ask'?'问题已收到，大肥鱼会按回复顺序回答。':d.demo?'演练弹幕已显示，未发送到B站。':'文字弹幕已发送。');await poll();}catch(e){notify(e.message,true);}finally{sending=false;composeState();}
}
$('liveForm').onsubmit=e=>{e.preventDefault();void submit('danmaku','liveInput');};$('aiForm').onsubmit=e=>{e.preventDefault();void submit('ask','aiInput');};
function closeMenus(){for(const id of ['emojiPanel','giftPanel','morePanel'])$(id).hidden=true;}
function menu(id,anchor){const shown=$(id).hidden;closeMenus();if(!shown)return;const rect=anchor.getBoundingClientRect(),stage=$('stage').getBoundingClientRect();$(id).style.left=Math.max(12,Math.min(rect.left-stage.left,$('stage').clientWidth-345))+'px';$(id).hidden=false;}
for(const char of ['😀','🥰','✨','🐟','💗','🎉','🌱','🚀','👍','👏','🤔','😂','🥺','💙','🙌','🌸','👀','☕']){const b=node('button',char);b.type='button';b.onclick=()=>{if(emojiTarget&&!$(emojiTarget).disabled){$(emojiTarget).value+=char;$(emojiTarget).focus();}closeMenus();};$('emojiGrid').append(b);}
document.querySelectorAll('[data-emoji]').forEach(b=>b.onclick=()=>{emojiTarget=b.dataset.emoji;menu('emojiPanel',b);});
$('gifts').onclick=()=>{const rows=(currentData?.chat.messages||[]).filter(m=>m.role==='viewer'&&['gift','guard'].includes(m.kind));$('giftList').replaceChildren(...rows.slice(-30).reverse().map(m=>{const e=node('div',m.user+' · '+m.text,'gift-record');e.append(node('small',new Date(m.at).toLocaleTimeString('zh-CN',{hour12:false})));return e;}));if(!rows.length)$('giftList').append(node('p','本场还没有礼物记录。','hint'));menu('giftPanel',$('gifts'));};
$('more').onclick=()=>menu('morePanel',$('more'));
$('fontSize').onclick=()=>{const big=$('stage').classList.toggle('text-big');$('fontSize').textContent=big?'恢复默认文字大小':'放大聊天文字';closeMenus();};
function toggleTV(){const url=new URL('/bili-live-view/television?'+auth,location.origin);url.searchParams.set('floating','1');const tv=window.open(url.href,'xiaoge-live-television','popup=yes,width=1120,height=760');if(tv)tv.opener=null;else notify('浏览器拦截了电视窗口，请允许弹出窗口后重试。',true);}
$('toggleTV').onclick=toggleTV;$('menuTV').onclick=()=>{closeMenus();toggleTV();};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.popover, [data-emoji], #gifts, #more'))closeMenus();});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenus();});
$('sharePicture').onclick=()=>{closeMenus();$('shareFile').click();};
async function pictureData(file){
 if(!file||!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw Error('请选择PNG、JPEG、WebP或GIF图片');if(file.size>20*1024*1024)throw Error('原图不能超过20MB');
 const data=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('图片读取失败'));r.readAsDataURL(blob);});if(file.size<=512*1024)return data(file);if(file.type==='image/gif')throw Error('GIF需小于512KB');
 const bitmap=await createImageBitmap(file);try{const canvas=document.createElement('canvas'),scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);for(const quality of [.9,.75,.55]){const blob=await new Promise(r=>canvas.toBlob(r,'image/webp',quality));if(blob?.size<=512*1024)return data(blob);}throw Error('图片缩小后仍过大，请选择更小的图片');}finally{bitmap.close();}
}
$('shareFile').onchange=async()=>{const file=$('shareFile').files[0];if(!file||sending)return;sending=true;composeState();try{const dataUrl=await pictureData(file);await action('picture',{dataUrl,label:'浮窗分享图片',text:$('aiInput').value.trim()});$('aiInput').value='';notify('图片已加入回复队列，仅在浮窗和OBS中展示。');}catch(e){notify(e.message,true);}finally{$('shareFile').value='';sending=false;composeState();}};
async function play(o){audio.pause();audio.src='/bili-live-view/audio/'+o.audioId+'.wav?'+auth;pending=o;try{await audio.play();pending=null;$('enableSound').hidden=true;}catch{$('enableSound').hidden=false;}}
$('enableSound').onclick=()=>{if(pending&&!muted)void play(pending);};
function soundLabel(){$('soundLabel').textContent=monitor?'静音预览':muted?'播报静音':'播报声音';$('soundIcon').setAttribute('href',muted?'#i-mute':'#i-volume');$('sound').disabled=monitor;}
$('sound').onclick=()=>{muted=!muted;if(muted){audio.pause();pending=null;$('enableSound').hidden=true;}soundLabel();};soundLabel();
async function poll(){
 if(busy)return;busy=true;
 try{
  const r=await fetch('/bili-live-view/state?'+auth+'&client='+client+(monitor||muted?'&monitor=1':''),{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error('展示地址无效，请从后台重新打开');currentData=d;failures=0;
  const name=d.studio.displayName||'大肥鱼';$('name').textContent=name;$('replyName').textContent=name;drawChat(d.chat,name,d.studio.hostName||'大肥鱼');drawTV(d.studio);
  const active=d.chat.live&&!d.chat.paused;$('status').textContent=d.chat.live?(d.chat.paused?'回复已暂停':d.chat.demo?'本地演练正常':'直播互动中'):'等待开始';for(const id of ['dot','fishDot','footDot'])$(id).classList.toggle('live',active);$('fishStatus').textContent=d.chat.paused?'已暂停':d.chat.live?'陪聊中':'等待开始';$('interactionCount').textContent='本场 '+d.chat.interactions+' 条互动';$('connectionFoot').textContent='本地连接正常';$('foot').textContent=d.chat.demo?'未发送真实弹幕':canControl?'公开聊天':'只读展示';$('modeFoot').textContent=d.chat.demo?'仅供演示':d.chat.live?'直播画面':'仅本机预览';composeState();
  const o=d.output;if(!d.active||!o){audio.pause();audio.removeAttribute('src');pending=null;cursor='';first=false;$('enableSound').hidden=true;return;}if(!d.playAudio||muted){audio.pause();pending=null;$('enableSound').hidden=true;}if(first){cursor=o.id;first=false;return;}if(o.id!==cursor){cursor=o.id;if(d.playAudio&&!muted&&o.audioId)await play(o);}
 }catch{failures++;$('status').textContent='后台连接已断开';$('connectionFoot').textContent='连接已断开';for(const id of ['dot','fishDot','footDot'])$(id).classList.remove('live');audio.pause();if(failures>=3){currentData=null;composeState();if(q.get('floating')==='1')window.top.close();}}
 finally{busy=false;}
}
if(control)action('hello').then(()=>{canControl=true;composeState();}).catch(e=>notify(e.message,true));setInterval(poll,700);poll();
