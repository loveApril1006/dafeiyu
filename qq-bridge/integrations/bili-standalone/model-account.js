import * as React from 'react';
const h=React.createElement;
let currentAccount={account:'checking'},accountFlight=null;
const accountListeners=new Set();
async function refreshAccount(){
  if(accountFlight)return accountFlight;
  accountFlight=(async()=>{try{const r=await fetch('/api/bili-pond/model-account-state',{cache:'no-store'});const data=await r.json();if(!r.ok||!data.ok)throw Error();currentAccount=data;}catch{currentAccount={account:'unknown'};}finally{for(const notify of accountListeners)notify(currentAccount);}})();
  try{await accountFlight;}finally{accountFlight=null;}
}
function useModelAccount(){
  const [state,setState]=React.useState(currentAccount);
  React.useEffect(()=>{
    let active=true;const notify=value=>{if(active)setState(value);};accountListeners.add(notify);
    const refresh=()=>{if(!document.hidden)void refreshAccount();};refresh();
    const timer=setInterval(refresh,15000);let host=window;try{if(parent!==window)host=parent;}catch{}
    host.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{active=false;accountListeners.delete(notify);clearInterval(timer);host.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  return state;
}

export function requiresAccountLogin(error,lines=[]){
  return /ACCOUNT_SIGN_IN_REQUIRED|Sign in to DeepSeek to use the account provider/i.test([error?.hint||'',...lines].join('\n'));
}

export function ModelAccountPanel({provider,model,error,lines,openSession,onModelsChanged}){
  const [busy,setBusy]=React.useState(false),[message,setMessage]=React.useState(''),[loginUrl,setLoginUrl]=React.useState('');
  const [editor,setEditor]=React.useState(false);
  const account=useModelAccount();
  const required=requiresAccountLogin(error,lines);
  async function login(){
    const popup=window.open('about:blank','_blank');
    if(popup)popup.opener=null;
    setBusy(true);setMessage('正在打开当前引擎的账号登录…');setLoginUrl('');
    try{
      const result=await openSession();
      if(!result.ok)throw new Error(result.error||'无法打开模型账号登录');
      const url=new URL(result.url,location.origin);
      if(!['http:','https:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password)throw new Error('登录地址不是本机引擎地址');
      if(popup)popup.location=url.href;else setLoginUrl(url.href);
      setMessage('请在引擎左下角账号菜单中登录 DeepSeek；完成后回到鱼塘，重新运行一轮。若仍提示目标地址不允许账号认证，请改用已配置密钥的 API 线路。');
    }catch(e){if(popup)popup.close();setMessage(e.message);}
    finally{setBusy(false);}
  }
  return h('section',{'data-bd-card':'','data-xiaoge-model-panel':'',style:{marginBottom:12}},
    h('div',{'data-bd-card-head':''},h('span',{'data-bd-card-title':''},'模型账号与登录')),
    h('div',{'data-bd-card-body':''},
      h('p',{'data-bd-row-desc':''},'鱼塘运行线路：'+(provider||'跟随 headless 默认')+(model?' / '+model:'')),
      h('p',{'data-bd-row-desc':''},'鱼塘模型与运行设置独立保存；DeepSeek 登录和硅基流动统一密钥共用，其他服务密钥独立。'),
      h('p',{'data-bd-msg':'',...(account.account==='signed-in'?{'data-good':''}:{}),role:'status','aria-live':'polite'},account.account==='signed-in'?(provider==='deepseek-account'?'✓ DeepSeek 模型账号已登录，可以运行鱼塘。':'✓ DeepSeek 账号已登录；当前 API 线路请使用对应密钥。'):account.account==='signed-out'?'DeepSeek 模型账号尚未登录。':account.account==='checking'?'正在检查模型账号登录状态…':'暂时无法确认登录状态，请点击“刷新登录状态”。'),
      required&&account.account==='signed-out'?h('p',{'data-bd-msg':'','data-warn':'',role:'alert'},'DeepSeek 模型账号需要登录或重新认证。这与 B站扫码登录是两个独立账号。'):null,
      h('p',{'data-bd-row-desc':''},'鱼塘运行线路在下方“高级设置”中选择。其他页面的模型选择不影响这里；更新硅基流动统一密钥会供各功能复用。'),
      h('div',{'data-bd-btns':''},
        h('button',{'data-bd-btn':'','data-primary':'',disabled:busy,onClick:login},busy?'正在打开…':account.account==='signed-in'?'查看 DeepSeek 账号 ↗':'登录 DeepSeek 模型账号 ↗'),
        h('button',{'data-bd-btn':'',onClick:()=>void refreshAccount()},'刷新登录状态'),
        h('button',{'data-bd-btn':'',onClick:()=>setEditor(!editor)},editor?'收起鱼塘专用模型设置':'鱼塘专用模型与密钥设置')),
      editor?h(PondProviderEditor,{onSaved:onModelsChanged}):null,
      message?h('p',{'data-bd-row-desc':'',role:'status','aria-live':'polite'},message):null,
      loginUrl?h('a',{href:loginUrl,target:'_blank',rel:'noopener noreferrer','data-bd-btn':''},'点击打开模型账号登录 ↗'):null));
}

function PondProviderEditor({onSaved}){
  const empty={id:'',displayName:'',baseUrl:'',api:'openai-completions',models:'',apiKey:'',editing:false};
  const [providers,setProviders]=React.useState([]),[form,setForm]=React.useState(empty),[message,setMessage]=React.useState(''),[busy,setBusy]=React.useState(false);
  async function load(){const r=await fetch('/api/bili-pond/model-status',{cache:'no-store'});const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'读取鱼塘模型设置失败');setProviders(data.providers||[]);}
  React.useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);
  const field=(label,key,type='text')=>h('label',{style:{display:'grid',gap:4}},label,h('input',{'data-bd-input':'',type,value:form[key],autoComplete:type==='password'?'new-password':'off',disabled:key==='id'&&form.editing,onChange:e=>setForm({...form,[key]:e.target.value})}));
  async function save(e){e.preventDefault();setBusy(true);setMessage('正在保存鱼塘专用模型设置…');try{const r=await fetch('/api/bili-pond/model-provider',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});const result=await r.json();if(!r.ok||!result.ok)throw Error(result.error||'保存失败');setForm({...form,apiKey:'',editing:true});await load();await onSaved?.();setMessage(result.message);}catch(error){setMessage(error.message);}finally{setBusy(false);}}
  return h('form',{onSubmit:save,style:{display:'grid',gap:10,padding:12,border:'1px solid var(--bd-line)',borderRadius:8}},
    h('label',null,'鱼塘已有 API 服务 ',h('select',{'data-bd-select':'',value:form.editing?form.id:'',onChange:e=>{const p=providers.find(p=>p.id===e.target.value);setForm(p?{...p,models:p.models.join('\n'),apiKey:'',editing:true}:empty);setMessage('');}},h('option',{value:''},'添加鱼塘专用服务'),...providers.map(p=>h('option',{key:p.id,value:p.id},p.displayName)))),
    field('服务标识（小写字母开头）','id'),field('服务名称','displayName'),field('API 根地址','baseUrl'),
    h('label',null,'接口协议 ',h('select',{'data-bd-select':'',value:form.api,onChange:e=>setForm({...form,api:e.target.value})},...['openai-completions','openai-responses','anthropic-messages'].map(v=>h('option',{key:v,value:v},v)))),
    h('label',{style:{display:'grid',gap:4}},'模型 ID（每行一个）',h('textarea',{'data-bd-textarea':'',value:form.models,onChange:e=>setForm({...form,models:e.target.value})})),
    field('API 密钥（硅基流动已设置可留空，填写则更新统一密钥）','apiKey','password'),
    h('button',{'data-bd-btn':'',type:'submit',disabled:busy},busy?'正在保存…':'保存鱼塘专用服务'),
    h('p',{'data-bd-row-desc':'',role:'status'},message||'模型仅保存到鱼塘；硅基流动官方接口统一复用密钥。'));
}

export function ModelRunFailure({provider,error,lines}){
  const account=useModelAccount(),auth=requiresAccountLogin(error,lines);
  if(auth&&account.account==='signed-in')return h('div',{'data-bd-msg':'','data-good':''},'✓ 当前 DeepSeek 账号已登录，可以重新运行。上一轮的认证错误是历史记录；若再次出现“目标地址不允许账号认证”，请改用鱼塘 API 线路。');
  return h('div',{'data-bd-msg':'','data-warn':''},'⚠️ 上一轮没成功：'+(auth?'DeepSeek 模型账号需要登录或重新认证，请使用上方账号入口。':error?.hint||'请展开运行输出查看详情'));
}
