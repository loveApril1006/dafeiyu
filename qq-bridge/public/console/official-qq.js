function qqWhitelistViewModel(w,contacts){
  return contacts.map(contact=>({...contact,allowed:(w.allow?.[contact.kind==='group'?'groups':'private']||[]).map(String).includes(String(contact.id)),denied:(w.deny?.[contact.kind==='group'?'groups':'private']||[]).map(String).includes(String(contact.id))}));
}
async function renderQQWhitelist(w){
  const official=w.transport==='official',el=id=>document.getElementById(id),state=el('wlChannelState');
  el('wlNumberFields').hidden=official;el('wlOfficialControls').hidden=!official;el('wlSave').disabled=false;
  state.textContent=official?'当前接入：腾讯官方QQ机器人。选择会话管理权限；若改用SnowLuma / OneBot，请到“QQ接入方式”关闭官方模式、保存并应用。':'当前接入：SnowLuma / OneBot，使用个人QQ号和群号。官方机器人的身份与权限另外保存。';
  el('wlStorageHint').textContent=official?'保存到官方机器人权限；不会修改原QQ号白名单':'保存到OneBot配置；不会修改官方机器人权限';
  if(!official)return;
  const box=el('wlOfficialRows'),owner=el('wlOfficialOwner');box.replaceChildren();owner.replaceChildren(new Option('不设置管理员',''));owner.onchange=()=>{el('ownerQQ').value=owner.value;if(owner.value){const values=new Set(el('wlPrivate').value.split(/[,，\s]+/).filter(Boolean));values.add(owner.value);el('wlPrivate').value=[...values].join(', ');for(const input of box.querySelectorAll('input'))if(input.dataset.kind==='private'&&input.dataset.mode==='allow'&&input.dataset.id===owner.value)input.checked=true;}};
  try{
    const snapshot=await api('/api/qq-official');if(!snapshot.ok)throw Error(snapshot.error||'官方会话读取失败');
    if(!snapshot.active){el('wlSave').disabled=true;box.textContent='接入配置有变更，请先到官方QQ机器人页面应用并重新连接，再编辑权限。';return;}
    const rows=qqWhitelistViewModel(w,snapshot.contacts||[]);
    for(const contact of rows){
      const row=document.createElement('div');row.className='row';row.style.margin='12px 0';
      const label=document.createElement('span');label.textContent=(contact.kind==='group'?'群聊':'私聊')+' · '+contact.label+(contact.lastMessagePreview?' · 最近收到：'+contact.lastMessagePreview:'');row.append(label);
      for(const [mode,checked,title]of [['allow',contact.allowed,'允许回复'],['deny',contact.denied,'黑名单']]){
        const wrapper=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=checked;input.dataset.kind=contact.kind;input.dataset.id=String(contact.id);input.dataset.mode=mode;
        input.onchange=()=>{const name=contact.kind==='group'?'Groups':'Private',target=el((mode==='allow'?'wl':'dn')+name),values=new Set(target.value.split(/[,，\s]+/).filter(Boolean));input.checked?values.add(String(contact.id)):values.delete(String(contact.id));target.value=[...values].join(', ');};
        wrapper.append(input,document.createTextNode(' '+title));row.append(wrapper);
      }
      if(contact.kind==='private')owner.add(new Option(contact.label+(contact.lastMessagePreview?' · '+contact.lastMessagePreview:''),String(contact.id)));
      box.append(row);
    }
    owner.value=w.ownerQQ==null?'':String(w.ownerQQ);
    if(!rows.length)box.textContent='尚未收到官方消息，请先给官方机器人发一条验证消息，再重新打开此页。';
  }catch(error){box.textContent=error.message;el('wlSave').disabled=true;}
}
let officialQQBusy=false,officialQQDraft=false,officialQQReconnectTimer=null;
const officialEl=id=>document.getElementById('officialQQ'+id);
for(const name of ['Enabled','AppId','Secret','Port','Proactive'])officialEl(name).addEventListener('input',()=>{officialQQDraft=true;});
async function loadOfficialQQ({force=false}={}){
  try{const data=await api('/api/qq-official');if(!data.ok)throw Error(data.error||'读取官方QQ设置失败');
    if(!officialQQDraft||force){officialEl('Enabled').checked=data.enabled;officialEl('AppId').value=data.appId||'';officialEl('Secret').value='';officialEl('Port').value=data.localPort;officialEl('Proactive').checked=data.allowProactive;officialQQDraft=false;}
    officialEl('SecretHint').textContent=data.hasSecret?'已保存AppSecret，留空保存将保留；修改AppID时请同时填写新密钥。':'尚未保存AppSecret。';
    officialEl('Status').textContent=(data.enabled?(data.active?(data.health?.connected?'官方QQ已连接；可以在平台允许范围内接收消息。':'官方QQ未连接：'+(data.health?.hint||'请检查网关权限、网络及桥接日志')):'配置待应用：点击“应用并重新连接QQ桥接”。'):'官方QQ已关闭，使用原OneBot配置。')+(data.health?.lastPacketAgoMs!=null?' 最近官方消息：'+Math.floor(data.health.lastPacketAgoMs/1000)+'秒前。':'');
    const box=officialEl('Contacts');box.replaceChildren();
    for(const contact of data.contacts||[]){const row=document.createElement('div');row.className='row';row.style.margin='10px 0';const label=document.createElement('span');label.textContent=(contact.kind==='group'?'群聊':'私聊')+' · '+contact.label+' · '+contact.key+(contact.lastMessagePreview?' · 最近收到：'+contact.lastMessagePreview:'');row.append(label);
      for(const owner of [false,...(contact.kind==='private'?[true]:[])]){const button=document.createElement('button');button.textContent=owner?'设为管理员并允许回复':'允许回复';button.disabled=!data.active;button.onclick=()=>officialQQAction(async()=>{const acl=await api('/api/whitelist');if(acl.transport!=='official')throw Error('官方模式尚未应用，未更改原OneBot权限');const allow={private:[...(acl.allow?.private||[])],groups:[...(acl.allow?.groups||[])]},list=contact.kind==='group'?allow.groups:allow.private;if(!list.map(String).includes(contact.id))list.push(Number(contact.id));const result=await api('/api/whitelist','POST',{allow,...(owner?{ownerQQ:contact.id}:{})});if(!result.ok)throw Error(result.error||'授权未完成');officialEl('Status').textContent=owner?'已设置此官方私聊身份为管理员，并允许回复。':'已允许此官方会话回复，下一条消息生效。';});row.append(button);}box.append(row);}
    if(!box.childNodes.length)box.textContent='尚未收到官方消息。连接后请在平台沙箱或已发布范围内给机器人发一条消息，再刷新此页。';
  }catch(error){officialEl('Status').textContent=error.message;}
}
async function officialQQAction(work){if(officialQQBusy)return;officialQQBusy=true;for(const name of ['Save','Probe','Restart','Refresh'])officialEl(name).disabled=true;try{await work();}catch(error){officialEl('Status').textContent=error.message;}finally{officialQQBusy=false;for(const name of ['Save','Probe','Restart','Refresh'])officialEl(name).disabled=false;}}
officialEl('Save').onclick=()=>officialQQAction(async()=>{const data=await api('/api/qq-official/config','POST',{enabled:officialEl('Enabled').checked,appId:officialEl('AppId').value.trim(),appSecret:officialEl('Secret').value.trim(),localPort:Number(officialEl('Port').value),allowProactive:officialEl('Proactive').checked});if(!data.ok)throw Error(data.error||'保存失败');officialQQDraft=false;await loadOfficialQQ({force:true});officialEl('Status').textContent='配置已保存。校验凭据后，点击“应用并重新连接QQ桥接”；当前QQ任务可能随桥接重启中断。';});
officialEl('Probe').onclick=()=>officialQQAction(async()=>{if(officialQQDraft)throw Error('请先保存页面中的修改，再校验凭据');officialEl('Status').textContent='正在校验已保存凭据，不发送QQ消息…';const data=await api('/api/qq-official/probe','POST',{});if(!data.ok)throw Error(data.error||'校验失败');officialEl('Status').textContent=data.message+(data.nickname?' 机器人：'+data.nickname:'');});
officialEl('Refresh').onclick=()=>officialQQAction(()=>loadOfficialQQ());
officialEl('Restart').onclick=()=>officialQQAction(async()=>{if(officialQQDraft)throw Error('请先保存页面中的修改');const data=await api('/api/qq-official/restart','POST',{});if(!data.ok)throw Error(data.error||'重载未开始');officialEl('Status').textContent=data.message+' 重启期间页面可能暂时断开。';clearTimeout(officialQQReconnectTimer);let attempts=0;const wait=async()=>{attempts++;try{const response=await api('/api/qq-official');if(response.ok&&(response.active&&response.health?.connected||!response.enabled)){await loadOfficialQQ();return;}}catch{}if(attempts<30)officialQQReconnectTimer=setTimeout(wait,2000);else officialEl('Status').textContent='尚未收到连接确认。请刷新状态，并查看qq-bridge/state/bridge.log；平台凭据通过并不代表事件权限已开通。';};officialQQReconnectTimer=setTimeout(wait,2500);});
