// ── 人格管理：卡片启用与正文编辑分别操作 ──────────────────────────────────
let roleEditorState={mode:'new',name:''},roleCache=[],roleCurrent=null,roleInjectMax=6000;
let roleCategories=['我的人格','群友游戏流','性格调配流','家庭陪伴流','特色人格流'];
let roleCategory='全部',roleReadVersion=0,roleRefreshVersion=0,roleActivationVersion=0,rolePending='',roleActivationQueue=Promise.resolve(),roleBaseline=null;
const roleCategoryDescriptions={我的人格:'保留你原有的卡片，以及自己新建的人格。',群友游戏流:'短句、接梗、游戏话题与潜水节奏，像一个有分寸的群友。',性格调配流:'从软糯温柔到嘴硬心软，按你喜欢的性格配方选择。',家庭陪伴流:'妈妈、妹妹与女儿式的纯亲情陪伴，关系由后台确认。',特色人格流:'白饭梗、知性姐姐、方言、贵族与跨作品风格演绎。'};
function roleElement(tag,text){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;}
function setRoleMsg(text,ok){const el=document.getElementById('roleCreateMsg');el.textContent=text;el.className=ok===undefined?'meta':ok?'meta ok':'meta err';}
function roleFormMetadata(){return {category:document.getElementById('newRoleCategory').value,description:document.getElementById('newRoleDescription').value.trim(),tags:document.getElementById('newRoleTags').value.split(/[,，]/).map(t=>t.trim()).filter(Boolean)};}
function roleFormFingerprint(){return JSON.stringify([document.getElementById('newRoleName').value,document.getElementById('newRoleContent').value,document.getElementById('newRoleSelfName').value,roleFormMetadata()]);}
function markRoleBaseline(){roleBaseline=roleFormFingerprint();}
function roleFormDirty(){return roleBaseline!==null&&roleBaseline!==roleFormFingerprint();}
function renderRoleEditor(){const editing=roleEditorState.mode==='edit';document.getElementById('roleEditorMeta').textContent=editing?`正在编辑「${roleEditorState.name}」；当前生效「${roleCurrent||'未启用'}」。预览不改变启用状态。`:'新建卡片；点击列表中的人格可直接启用，编辑按钮只加载正文。';document.getElementById('roleCreate').textContent=editing?'保存修改':'新建人格';}
function roleEditorWarnings(text){const value=String(text??''),warns=[];if(value.length>roleInjectMax)warns.push(`正文${value.length}字符，超出${roleInjectMax}字符注入上限，部分内容将省略`);if(/\[SILENT\]|空格分隔|按空格|用空格|空格分句|空格代表|自动转发|回复会自动|输出\s*\[SILENT\]/i.test(value))warns.push('含旧版分条或潜水规则，可能与当前协议冲突');return warns;}
function updateRoleEditorWarnings(){document.getElementById('roleEditorWarnings').textContent=roleEditorWarnings(document.getElementById('newRoleContent').value).join('；');}
function fillRoleCategorySelect(value='我的人格'){const select=document.getElementById('newRoleCategory');select.replaceChildren(...[...new Set([...roleCategories,value])].map(name=>{const option=roleElement('option',name);option.value=name;return option;}));select.value=value;}
async function openRoleForEdit(name){
 if(roleFormDirty()&&!confirm('当前编辑内容尚未保存，放弃这些修改并打开另一张卡？'))return;
 const version=++roleReadVersion;setRoleMsg('正在读取「'+name+'」…');
 try{const res=await api('/api/roles/content?name='+encodeURIComponent(name));if(version!==roleReadVersion)return;if(!res.ok)throw Error(res.error||'读取失败');
  document.getElementById('newRoleName').value=res.name||name;document.getElementById('newRoleContent').value=res.content;document.getElementById('newRoleSelfName').value=res.selfName||'';
  fillRoleCategorySelect(res.metadata?.category||'我的人格');document.getElementById('newRoleDescription').value=res.metadata?.description||'';document.getElementById('newRoleTags').value=(res.metadata?.tags||[]).join('，');
  document.getElementById('roleActivateOnSave').checked=name===roleCurrent;
  const source=res.metadata?.source;document.getElementById('roleSourceInfo').textContent=source?'个人改写版；原卡：'+source.title+'；作者：'+source.author+'。来源记录保留于本地分类文件。':'自建或既有人格，未登记下载来源。';
  roleEditorState={mode:'edit',name};markRoleBaseline();renderRoleEditor();updateRoleEditorWarnings();setRoleMsg('已载入「'+name+'」，仅预览编辑，未切换人格。',true);document.getElementById('roleEditorPanel').open=true;document.getElementById('roleEditorPanel').scrollIntoView({block:'start'});
 }catch(error){if(version===roleReadVersion)setRoleMsg(error.message,false);}
}
function resetRoleForm(){if(roleFormDirty()&&!confirm('当前内容尚未保存，确定清空编辑器？'))return;++roleReadVersion;for(const id of ['newRoleName','newRoleContent','newRoleSelfName','newRoleDescription','newRoleTags'])document.getElementById(id).value='';fillRoleCategorySelect();document.getElementById('roleActivateOnSave').checked=true;document.getElementById('roleSourceInfo').textContent='';roleEditorState={mode:'new',name:''};markRoleBaseline();renderRoleEditor();updateRoleEditorWarnings();setRoleMsg('');}
function activateRole(name){
 const version=++roleActivationVersion;rolePending=name;renderRoleGallery();document.getElementById('roleSwitchStatus').textContent=name?'正在启用「'+name+'」…':'正在清除当前人格…';
 roleActivationQueue=roleActivationQueue.catch(()=>{}).then(async()=>{
  const response=await api('/api/role','POST',{role:name});if(!response.ok)throw Error(response.error||'切换失败');
  if(version!==roleActivationVersion)return;await refresh();await refreshRoles();document.getElementById('roleSwitchStatus').textContent=(name?'已切换为「'+name+'」':'已清除当前人格。');
 }).catch(error=>{if(version===roleActivationVersion)document.getElementById('roleSwitchStatus').textContent='切换失败：'+error.message;}).finally(()=>{if(version===roleActivationVersion){rolePending='';renderRoleGallery();}});
 return roleActivationQueue;
}
const roleCategoryIcons={'我的人格':'自','群友游戏流':'游','性格调配流':'心','家庭陪伴流':'家','特色人格流':'趣'};
let roleReaderVersion=0,roleReaderCard=null;
function appendRoleInline(parent,text){
 for(const part of String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g)){
  if(part.startsWith('**')&&part.endsWith('**'))parent.append(roleElement('strong',part.slice(2,-2)));
  else if(part.startsWith('`')&&part.endsWith('`'))parent.append(roleElement('code',part.slice(1,-1)));
  else parent.append(document.createTextNode(part));
 }
}
function renderRoleReading(content){
 const body=document.getElementById('roleReaderBody'),toc=document.getElementById('roleReaderToc');body.replaceChildren();toc.replaceChildren();let sections=0,list=null,table=null;
 for(const line of content.split(/\r?\n/)){
  if(!line.trim()){list=null;table=null;continue;}
  const markdown=/^(#{1,6})\s+(.+)$/.exec(line),plain=/^(?:[一二三四五六七八九十〇零]+[、．.]\s*.{1,40}|【[^】]{1,55}】)$/.test(line.trim());
  if(markdown||plain){list=null;table=null;const level=markdown?Math.min(markdown[1].length+1,4):3,title=markdown?markdown[2]:line.trim(),heading=roleElement('h'+level);appendRoleInline(heading,title);heading.id='role-reader-section-'+sections++;body.append(heading);const link=roleElement('button',heading.textContent);link.type='button';link.className='role-toc-link';link.onclick=()=>heading.scrollIntoView({behavior:'smooth',block:'start'});toc.append(link);continue;}
  if(/^\s*\|/.test(line)){list=null;if(!table){table=roleElement('pre');table.className='role-reader-table';body.append(table);}table.append(document.createTextNode(line+'\n'));continue;}
  table=null;const bullet=/^\s*(?:[-*·•]|\d+[.)、])\s*(.+)$/.exec(line);
  if(bullet){if(!list){list=roleElement('ul');body.append(list);}const item=roleElement('li');appendRoleInline(item,bullet[1]);list.append(item);continue;}
  list=null;const quote=/^>\s?(.*)$/.exec(line),paragraph=roleElement(quote?'blockquote':'p');appendRoleInline(paragraph,quote?quote[1]:line);body.append(paragraph);
 }
 if(!sections)toc.append(roleElement('p','本卡没有独立章节，可直接阅读全文。'));body.scrollTop=0;toc.scrollTop=0;
}
async function readRoleCard(name){
 const version=++roleReaderVersion,dialog=document.getElementById('roleReader');roleReaderCard=null;dialog.style.setProperty('--role-page-zoom',Number.parseFloat(getComputedStyle(document.documentElement).zoom)||1);
 document.getElementById('roleReaderTitle').textContent=name;document.getElementById('roleReaderBody').textContent='正在读取完整正文…';document.getElementById('roleReaderToc').replaceChildren();document.getElementById('roleReaderMeta').textContent='';document.getElementById('roleReaderStatus').textContent='';document.getElementById('roleReaderCategory').textContent='人格全文';
 for(const id of ['roleReaderCopy','roleReaderDownload','roleReaderEdit'])document.getElementById(id).disabled=true;if(!dialog.open)dialog.showModal();
 try{const res=await api('/api/roles/content?name='+encodeURIComponent(name));if(version!==roleReaderVersion||!dialog.open)return;if(!res.ok)throw Error(res.error||'读取失败');roleReaderCard=res;
  document.getElementById('roleReaderCategory').textContent=res.metadata?.category||'我的人格';document.getElementById('roleReaderMeta').textContent=Number(res.content.length).toLocaleString('zh-CN')+' 字符 · '+(res.selfName||'按正文自称')+(res.metadata?.source?' · 改编自「'+res.metadata.source.title+'」':'');renderRoleReading(res.content);
  document.getElementById('roleReaderStatus').textContent='阅读不切换当前人格。';for(const id of ['roleReaderCopy','roleReaderDownload','roleReaderEdit'])document.getElementById(id).disabled=false;
 }catch(error){if(version===roleReaderVersion)document.getElementById('roleReaderBody').textContent='读取失败：'+error.message;}
}
document.getElementById('roleReaderClose').onclick=()=>document.getElementById('roleReader').close();
document.getElementById('roleReader').addEventListener('close',()=>{++roleReaderVersion;roleReaderCard=null;});
document.getElementById('roleReaderCopy').onclick=async()=>{if(!roleReaderCard)return;try{await navigator.clipboard.writeText(roleReaderCard.content);document.getElementById('roleReaderStatus').textContent='已复制完整正文。';}catch{document.getElementById('roleReaderStatus').textContent='浏览器未允许复制，请下载 .txt 或在编辑器中复制。';}};
document.getElementById('roleReaderDownload').onclick=()=>{if(!roleReaderCard)return;const url=URL.createObjectURL(new Blob([roleReaderCard.content],{type:'text/plain;charset=utf-8'})),link=roleElement('a');link.href=url;link.download=roleReaderCard.name+'.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
document.getElementById('roleReaderEdit').onclick=()=>{if(!roleReaderCard)return;const name=roleReaderCard.name;document.getElementById('roleReader').close();void openRoleForEdit(name);};
function renderRoleGallery(){
 const categories=document.getElementById('roleCategories');categories.replaceChildren();for(const name of ['全部',...roleCategories]){const count=roleCache.filter(r=>name==='全部'||(r.category||'我的人格')===name).length;if(!count&&name!=='全部')continue;const b=roleElement('button',name+' '+count);b.type='button';b.className='role-category'+(name===roleCategory?' selected':'');b.setAttribute('aria-pressed',String(name===roleCategory));b.onclick=()=>{roleCategory=name;renderRoleGallery();};categories.append(b);}
 const tagSelect=document.getElementById('roleTag'),tag=tagSelect.value;tagSelect.replaceChildren(new Option('全部标签',''),...[...new Set(roleCache.flatMap(r=>r.tags||[]))].sort().map(t=>new Option(t,t)));tagSelect.value=tag;
 const query=document.getElementById('roleSearch').value.trim().toLowerCase(),onlyActive=document.getElementById('roleOnlyActive').checked;
 const visible=roleCache.filter(r=>(roleCategory==='全部'||(r.category||'我的人格')===roleCategory)&&(!onlyActive||r.name===roleCurrent)&&(!tag||(r.tags||[]).includes(tag))&&(!query||[r.name,r.description,r.selfName,...(r.tags||[])].join(' ').toLowerCase().includes(query)));
 const box=document.getElementById('roleList');box.replaceChildren();if(!visible.length){const empty=roleElement('p',roleCache.length?'没有匹配的人格，试试其他分类或关键词。':'还没有人格，点击“新建人格”开始。');empty.className='empty-state';box.append(empty);}
 for(const category of roleCategories){const rows=visible.filter(r=>(r.category||'我的人格')===category);if(!rows.length)continue;const group=roleElement('section');group.className='role-category-group';const heading=roleElement('h3',category+' · '+rows.length),description=roleElement('p',roleCategoryDescriptions[category]||'自定义人格分类');description.className='meta';const grid=roleElement('div');grid.className='persona-list';
  for(const role of rows){const card=roleElement('article');card.className='persona-item'+(role.name===roleCurrent?' active':'');card.dataset.roleName=role.name;
   const pick=roleElement('button');pick.type='button';pick.className='persona-pick';pick.setAttribute('aria-label','启用人格 '+role.name);pick.disabled=rolePending===role.name;
   card.dataset.category=role.category||'我的人格';
   const head=roleElement('span');head.className='persona-item-head';head.append(roleElement('strong',role.name.replace(/^大肥鱼-/,'')));if(role.name===roleCurrent){const badge=roleElement('span','使用中');badge.className='persona-badge';head.append(badge);}if(rolePending===role.name)head.append(roleElement('span','切换中…'));
   const summary=roleElement('span',role.description||role.excerpt||'自定义人格');summary.className='persona-description';
   const meta=roleElement('small',Number(role.chars||0).toLocaleString('zh-CN')+' 字符'+(role.truncated?' · 部分注入':''));if(role.truncated)meta.className='warn';pick.append(head,summary);pick.onclick=()=>void activateRole(role.name);
   const actions=roleElement('div');actions.className='persona-actions';const read=roleElement('button','详情');read.type='button';read.className='small';read.setAttribute('aria-label','阅读人格 '+role.name);read.onclick=()=>void readRoleCard(role.name);const edit=roleElement('button','编辑');edit.type='button';edit.className='small';edit.setAttribute('aria-label','编辑人格 '+role.name);edit.onclick=()=>void openRoleForEdit(role.name);const links=roleElement('span');links.className='persona-links';links.append(read,edit);actions.append(meta,links);card.append(pick,actions);grid.append(card);
  }group.append(heading,description,grid);box.append(group);
 }
 document.getElementById('roleListHint').textContent=visible.length===roleCache.length?roleCache.length+' 张人格 · 点击即可切换':visible.length+' / '+roleCache.length+' 张人格';document.getElementById('roleActiveName').textContent=(roleCurrent||'未启用').replace(/^大肥鱼-/,'');
}
async function refreshRoles(){
 const version=++roleRefreshVersion;try{const r=await api('/api/roles',undefined,undefined,new AbortController().signal);if(version!==roleRefreshVersion)return;if(r.ok===false)throw Error(r.error||'读取失败');roleInjectMax=Number(r.limits?.injectMaxChars)||roleInjectMax;const limit=document.getElementById('roleInjectMax');if(document.activeElement!==limit)limit.value=String(roleInjectMax);roleCurrent=r.current??null;document.getElementById('roleText').textContent=roleCurrent||'未启用';
  const names=Array.isArray(r.roles)?r.roles:[];roleCache=Array.isArray(r.summaries)&&r.summaries.length===names.length?r.summaries:names.map(name=>({name,chars:0,category:'我的人格'}));roleCategories=[...new Set([...(r.categories||roleCategories),...roleCache.map(r=>r.category||'我的人格')])];
  if(document.activeElement!==document.getElementById('roleInput'))document.getElementById('roleInput').value=roleCurrent||'';renderRoleGallery();renderRoleEditor();
 }catch(error){document.getElementById('roleSwitchStatus').textContent='读取人格失败：'+error.message;}
}
document.getElementById('roleSearch').oninput=renderRoleGallery;document.getElementById('roleTag').onchange=renderRoleGallery;document.getElementById('roleOnlyActive').onchange=renderRoleGallery;
document.getElementById('roleRefresh').onclick=()=>void refreshRoles();document.getElementById('roleNew').onclick=()=>{resetRoleForm();document.getElementById('roleEditorPanel').open=true;document.getElementById('roleEditorPanel').scrollIntoView({block:'start'});};markRoleBaseline();

// ── 仿真提示词（预设内置，需重启 DSH 生效）──────────────────────────────────
let simPromptOriginal = '';
let simPromptPreset = 'qq-chat-v2';

function setSimMsg(text, ok) {
  const el = document.getElementById('simPromptMsg');
  el.textContent = text;
  el.className = ok === undefined ? 'meta' : (ok ? 'meta ok' : 'meta err');
}

function setSimEditing(editing) {
  const area = document.getElementById('simPromptText');
  area.readOnly = !editing;
  area.classList.toggle('editing', editing);
  document.getElementById('simPromptEdit').disabled = editing;
  document.getElementById('simPromptSave').disabled = !editing;
  document.getElementById('simPromptCancel').disabled = !editing;
}

async function refreshSimPrompt() {
  simPromptPreset = document.getElementById('simPromptPreset').value || 'qq-chat-v2';
  setSimMsg('读取中…');
  try {
    const r = await api('/api/preset/sim-prompt?preset=' + encodeURIComponent(simPromptPreset));
    const area = document.getElementById('simPromptText');
    if (!r.ok) {
      area.value = '';
      setSimMsg(r.error || '读取失败', false);
      document.getElementById('simPromptStatus').textContent = '不可用';
      return;
    }
    simPromptOriginal = r.content;
    area.value = r.content;
    setSimEditing(false);
    setSimMsg('');
    const status = r.status || {};
    document.getElementById('simPromptStatus').textContent =
      `${status.label || simPromptPreset} · ${r.chars} 字符${status.installed ? ' · 已同步到 DSH' : ' · 尚未同步到 DSH'}`;
    document.getElementById('simPromptWarnings').textContent = (r.warnings || []).length
      ? '⚠️ ' + r.warnings.join('；') : '';
    document.getElementById('simPromptRestart').textContent =
      '改动写入该代预设的源文件并同步到 DSH 的 preset 目录；preset 由 DSH 在会话创建时装配，因此新会话会自动用新版，正在进行的 QQ 会话需重置该会话或重启 DSH。';
  } catch (error) {
    setSimMsg('读取失败：' + (error?.message ?? error), false);
  }
}

function openNativeDouyin(){const frame=document.getElementById('douyinNativeFrame');if(!frame.getAttribute('src')){const value=new URL(location.href).searchParams.get('token')||localStorage.getItem('consoleToken')||'';frame.src='/douyin/?token='+encodeURIComponent(value);}}

let pluginManagerData = null;
let pluginManagerBusy = false;
function pluginManagerMessage(message, failed = false) {
  const el = document.getElementById('pluginManagerMsg');
  el.textContent = message; el.className = failed ? 'meta err' : 'meta';
}
function renderDshPlugins() {
  if (!pluginManagerData) return;
  const query = document.getElementById('pluginSearch').value.trim().toLowerCase();
  for (const [kind, rows, id] of [['bundle',pluginManagerData.bundles,'pluginBundleList'],['plugin',pluginManagerData.plugins,'pluginEntryList']]) {
    const box = document.getElementById(id); box.replaceChildren();
    const filtered = rows.filter(row => [row.id,row.title,row.description,row.feature?.cost,row.feature?.scope].join(' ').toLowerCase().includes(query)).sort((a,b) => Number(!!b.feature)-Number(!!a.feature));
    if (!filtered.length) { const empty = document.createElement('p'); empty.className = 'meta'; empty.textContent = query ? '没有匹配的插件' : '暂无已安装插件'; box.append(empty); }
    for (const row of filtered) {
      const card = document.createElement('div'); card.className = 'plugin-card';
      const title = document.createElement('strong'); title.textContent = row.title;
      const info = document.createElement('p'); info.className = 'meta'; info.textContent = row.id + (row.version ? ' · ' + row.version : '');
      const description = document.createElement('p'); description.className = 'meta'; description.textContent = row.description;
      const controls = document.createElement('div'); controls.className = 'row';
      const state = document.createElement('span'); state.className = 'pill ' + (row.enabled ? 'g' : '');
      const phases = {active:'运行中',failed:'加载失败',pending:'等待中',disposed:'已停止'};
      state.textContent = (row.enabled ? '已启用' : '已关闭') + (row.phase ? ' · ' + (phases[row.phase] || row.phase) : '');
      const toggle = document.createElement('button'); toggle.textContent = row.enabled ? '关闭' : '启动';
      toggle.setAttribute('aria-label',(row.enabled ? '关闭 ' : '启动 ') + row.title);
      toggle.disabled = pluginManagerBusy || !!row.readOnlyReason || !!row.problem;
      toggle.addEventListener('click',() => toggleDshPlugin(kind,row.id,!row.enabled));
      controls.append(state,toggle);
      if (row.readOnlyReason || row.problem) { const reason = document.createElement('span'); reason.className = 'meta'; reason.textContent = row.problem ? '加载问题：' + row.problem : row.readOnlyReason === 'management-required' ? 'DSH 核心组件，受保护' : '由上层配置管理，无法单独启停'; controls.append(reason); }
      card.append(title,description);
      const details = document.createElement('details'); details.className = 'plugin-meta';
      const summary = document.createElement('summary'); summary.textContent = '插件信息'; details.append(summary,info);
      if (row.feature) {
        const cost = document.createElement('p'); cost.className = 'meta'; cost.textContent = '用量：' + row.feature.cost;
        const scope = document.createElement('p'); scope.className = 'meta'; scope.textContent = row.feature.scope;
        details.append(cost,scope);
      }
      card.append(controls,details); box.append(card);
    }
  }
}
async function refreshDshPlugins({keepMessage = false} = {}) {
  const refresh = document.getElementById('pluginRefresh'); refresh.disabled = true;
  if (!keepMessage) pluginManagerMessage('正在读取插件…');
  try {
    const data = await api('/api/dsh/plugins');
    if (!data.ok) throw new Error(data.error === 'not found' ? '插件管理接口尚未加载，请重启 QQ Bridge 后刷新' : data.error || '无法读取插件');
    pluginManagerData = data; renderDshPlugins();
    if (!keepMessage) pluginManagerMessage('已读取 ' + data.bundles.length + ' 个插件包、' + data.plugins.length + ' 个组件');
  } catch (error) {
    pluginManagerData = null;
    document.getElementById('pluginBundleList').replaceChildren(); document.getElementById('pluginEntryList').replaceChildren();
    pluginManagerMessage(error.message,true);
  } finally { refresh.disabled = pluginManagerBusy; }
}
async function toggleDshPlugin(kind,id,enabled) {
  if (pluginManagerBusy) return;
  pluginManagerBusy = true; renderDshPlugins(); document.getElementById('pluginRefresh').disabled = true;
  pluginManagerMessage(enabled ? '正在启动插件…' : '正在关闭插件…');
  try {
    const result = await api('/api/dsh/plugins/toggle','POST',{kind,id,enabled});
    pluginManagerMessage(result.message || result.error || '操作失败', !result.ok);
  } catch (error) { pluginManagerMessage(error.message,true); }
  finally {
    await refreshDshPlugins({keepMessage:true});
    pluginManagerBusy = false; document.getElementById('pluginRefresh').disabled = false; renderDshPlugins();
  }
}
document.getElementById('pluginSearch').addEventListener('input',renderDshPlugins);
document.getElementById('pluginRefresh').addEventListener('click',() => refreshDshPlugins());

let modelManagerData = null;
let modelImageSelections = new Set();
const modelEl = id => document.getElementById(id);
let discoveredProviderModels = [], discoveredModelSelection = new Set(), modelDiscoveryEpoch = 0, modelDiscoveryController = null, modelDiscoveryVisible = 250;
function modelConnectionInput() {
  return {id:modelEl('modelRouteId').value,editing:modelEl('modelRouteId').readOnly,displayName:modelEl('modelDisplayName').value,baseUrl:modelEl('modelBaseUrl').value,api:modelEl('modelApiProtocol').value,apiKey:modelEl('modelApiKey').value};
}
function resetModelDiscovery() {
  modelDiscoveryEpoch++; modelDiscoveryController?.abort(); modelDiscoveryController = null;
  discoveredProviderModels = []; discoveredModelSelection = new Set(); modelDiscoveryVisible = 250;
  modelEl('modelDiscoverPanel').hidden = true; modelEl('modelDiscoverList').replaceChildren();
  modelEl('modelDiscoverSearch').value = ''; modelEl('modelDiscoverFilter').value = 'all';
  modelEl('modelDiscoverOwner').replaceChildren(new Option('全部分组',''));
  modelEl('modelDiscover').disabled = modelManagerData?.canDiscoverModels !== true; modelEl('modelDiscover').textContent = '获取模型列表';
}
function filteredProviderModels() {
  const query = modelEl('modelDiscoverSearch').value.trim().toLowerCase(), owner = modelEl('modelDiscoverOwner').value, filter = modelEl('modelDiscoverFilter').value;
  return discoveredProviderModels.filter(model => (!owner || model.owner === owner) && (!query || [model.id,model.name,model.owner].join(' ').toLowerCase().includes(query)) && (filter === 'all' || filter === 'chat' && model.chat !== false || filter === 'image' && model.supportsImages === true || filter === 'unknown' && model.chat !== false && model.supportsImages == null || filter === 'other' && model.chat === false));
}
function renderDiscoveredProviderModels() {
  const filtered = filteredProviderModels();
  modelEl('modelDiscoverList').replaceChildren(...filtered.slice(0,modelDiscoveryVisible).map(model => {
    const label = document.createElement('label'); label.style.cssText = 'display:flex;align-items:flex-start;gap:10px;border-bottom:1px solid var(--border);padding:10px 2px';
    const check = document.createElement('input'); check.type = 'checkbox'; check.style.cssText = 'width:auto;flex:none;accent-color:var(--accent)'; check.setAttribute('aria-label','添加模型 '+model.id); check.disabled = model.chat === false; check.checked = discoveredModelSelection.has(model.id);
    check.addEventListener('change',() => {
      if (check.checked && discoveredModelSelection.size >= 1000) { check.checked = false; modelMessage('modelDiscoverMsg','每个服务最多添加 1000 个模型，请缩小勾选范围。',true); return; }
      if (check.checked) discoveredModelSelection.add(model.id); else discoveredModelSelection.delete(model.id); updateDiscoveredModelCount(filtered.length);
    });
    const content = document.createElement('span'); content.style.cssText = 'min-width:0;overflow-wrap:anywhere';
    const name = document.createElement('strong'); name.textContent = model.id;
    const info = document.createElement('div'); info.className = 'meta';
    info.textContent = [model.name !== model.id ? model.name : '',model.owner,model.chat === false ? '其他用途，不能作为聊天模型' : model.supportsImages === true ? (model.imageCapabilitySource === 'official-docs' ? '支持图片（官方文档）' : '支持图片') : model.supportsImages === false ? '接口声明不支持图片' : '图片能力未知（接口未声明）',model.visionNote || ''].filter(Boolean).join(' · ');
    content.append(name,info); label.append(check,content); return label;
  }));
  if (!filtered.length) { const empty = document.createElement('p'); empty.className = 'meta'; empty.textContent = '没有匹配的模型；图片能力未声明的模型可从“全部模型”添加后手动设置。'; modelEl('modelDiscoverList').append(empty); }
  modelEl('modelDiscoverMore').hidden = filtered.length <= modelDiscoveryVisible;
  updateDiscoveredModelCount(filtered.length);
}
function updateDiscoveredModelCount(count) {
  modelEl('modelDiscoverCount').textContent = '匹配 '+count+' / '+discoveredProviderModels.length+' 个 · 已勾选 '+discoveredModelSelection.size+' 个';
  modelEl('modelDiscoverApply').disabled = !discoveredModelSelection.size;
}
async function fetchProviderModels() {
  if (modelManagerData?.canDiscoverModels !== true) { modelMessage('modelDiscoverMsg','请先正常重启大肥鱼，加载自动获取模型列表接口。',true); return; }
  resetModelDiscovery(); const epoch = modelDiscoveryEpoch, controller = new AbortController(); modelDiscoveryController = controller;
  modelEl('modelDiscover').disabled = true; modelEl('modelDiscover').textContent = '正在获取…'; modelMessage('modelDiscoverMsg','正在读取该服务与密钥返回的模型目录…');
  try {
    const connection = modelConnectionInput();
    if (connection.apiKey && !/^[\x21-\x7e]{8,8192}$/.test(connection.apiKey.trim())) throw new Error('请只粘贴密钥本身，不要包含中文说明、空格或 Bearer 前缀。');
    let result;
    for (let attempt=0;attempt<2;attempt++) {
      if (epoch !== modelDiscoveryEpoch || controller.signal.aborted) return;
      result = await api('/api/dsh/providers/discover','POST',connection,controller.signal);
      // Older running servers report all network failures with this generic text.
      // Retrying this metadata-only request never saves keys or model settings.
      if (result.ok || attempt || !String(result.error || '').startsWith('无法获取模型列表，请检查网络')) break;
      modelMessage('modelDiscoverMsg','连接暂时失败，正在重新获取模型列表…');
      await new Promise(resolve=>setTimeout(resolve,350));
    }
    if (epoch !== modelDiscoveryEpoch) return;
    if (!result.ok) throw new Error(result.error || '模型列表获取失败');
    discoveredProviderModels = result.models || [];
    const existing = new Set(modelEl('modelIds').value.split(/[\s,，]+/).filter(Boolean));
    discoveredModelSelection = new Set(discoveredProviderModels.filter(model => model.chat !== false && existing.has(model.id)).map(model => model.id));
    modelEl('modelDiscoverOwner').replaceChildren(new Option('全部分组',''),...[...new Set(discoveredProviderModels.map(model => model.owner).filter(Boolean))].sort().map(owner => new Option(owner,owner)));
    modelEl('modelDiscoverPanel').hidden = false; renderDiscoveredProviderModels();
    modelMessage('modelDiscoverMsg',result.message+(result.truncated ? ' 列表已达到获取上限，可用手动填写补充。' : ''));
  } catch (error) { if (epoch === modelDiscoveryEpoch) modelMessage('modelDiscoverMsg',error.message || '获取失败，请检查网络或手动填写模型 ID。',true); }
  finally { if (epoch === modelDiscoveryEpoch) { modelDiscoveryController = null; modelEl('modelDiscover').disabled = false; modelEl('modelDiscover').textContent = '获取模型列表'; } }
}
modelEl('modelDiscover').addEventListener('click',fetchProviderModels);
for (const id of ['modelRouteId','modelBaseUrl','modelApiKey','modelApiProtocol']) modelEl(id).addEventListener(id === 'modelApiProtocol' ? 'change' : 'input',() => { resetModelDiscovery(); modelMessage('modelDiscoverMsg','连接设置已更改，请重新获取模型列表。'); });
for (const id of ['modelDiscoverSearch','modelDiscoverOwner','modelDiscoverFilter']) modelEl(id).addEventListener(id === 'modelDiscoverSearch' ? 'input' : 'change',() => { modelDiscoveryVisible = 250; renderDiscoveredProviderModels(); });
modelEl('modelDiscoverMore').addEventListener('click',() => { modelDiscoveryVisible += 250; renderDiscoveredProviderModels(); });
modelEl('modelDiscoverClear').addEventListener('click',() => { discoveredModelSelection.clear(); renderDiscoveredProviderModels(); });
modelEl('modelDiscoverSelectAll').addEventListener('click',() => { const selected = new Set(discoveredModelSelection); for (const model of filteredProviderModels()) if (model.chat !== false) selected.add(model.id); if (selected.size > 1000) { modelMessage('modelDiscoverMsg','筛选范围超过 1000 个模型，请先按分组或名称缩小范围。',true); return; } discoveredModelSelection = selected; renderDiscoveredProviderModels(); });
modelEl('modelDiscoverApply').addEventListener('click',() => {
  const ids = [...new Set([...modelEl('modelIds').value.split(/[\s,，]+/).filter(Boolean),...discoveredModelSelection])];
  if (ids.length > 1000) { modelMessage('modelDiscoverMsg','添加后超过 1000 个模型，请缩小勾选范围。',true); return; }
  for (const model of discoveredProviderModels) if (discoveredModelSelection.has(model.id) && model.supportsImages === true) modelImageSelections.add(model.id);
  modelEl('modelIds').value = ids.join('\n'); renderModelImageOptions(); modelMessage('modelDiscoverMsg','已添加勾选项到下方模型 ID，原有模型已保留。请点击“保存服务与模型”。');
});
function renderModelImageOptions() {
  const ids = [...new Set(modelEl('modelIds').value.split(/[\s,，]+/).filter(Boolean))].slice(0,1000);
  modelImageSelections = new Set([...modelImageSelections].filter(id => ids.includes(id)));
  modelEl('modelImageOptions').replaceChildren(...ids.map(id => {
    const label = document.createElement('label'); label.style.cssText = 'display:flex;align-items:center;gap:8px';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.style.cssText = 'width:auto;flex:none;accent-color:var(--accent)'; checkbox.checked = modelImageSelections.has(id); checkbox.disabled = modelManagerData?.canConfigureImages !== true; checkbox.setAttribute('aria-label','图片输入 '+id);
    checkbox.addEventListener('change',() => checkbox.checked ? modelImageSelections.add(id) : modelImageSelections.delete(id));
    const name = document.createElement('span'); name.textContent = id;
    label.append(checkbox,name); return label;
  }));
}
function modelMessage(id, message, failed = false) {
  modelEl(id).textContent = message;
  modelEl(id).className = failed ? 'meta err' : 'meta';
}
function fillModelOptions(selected) {
  const group = modelManagerData?.groups.find(row => row.id === modelEl('modelProviderSelect').value);
  const visionModels = modelManagerData?.providers.find(provider => provider.id === group?.id)?.visionModels || [];
  modelEl('modelSelect').replaceChildren(...(group?.models || []).map(model => new Option((model.name === model.id ? model.id : model.name + ' · ' + model.id)+(visionModels.includes(model.id) ? ' · 支持图片' : ''), model.id)));
  if (group?.models.some(model => model.id === selected)) modelEl('modelSelect').value = selected;
  modelEl('modelUse').disabled = !group?.models.length;
}
async function refreshModelManager() {
  modelMessage('modelManagerMsg', '正在读取模型…');
  try {
    const data = await api('/api/dsh/models');
    if (!data.ok) throw new Error(data.error || '模型目录读取失败');
    const provider = modelEl('modelProviderSelect').value || data.current.provider;
    const model = modelEl('modelSelect').value || data.current.model;
    modelManagerData = data;
    if (['modelRouteId','modelBaseUrl','modelApiKey','modelDisplayName','modelIds'].every(id => !modelEl(id).value)) newModelProvider();
    modelEl('modelCurrent').textContent = (data.current.provider || '未选择') + ' / ' + (data.current.model || '未选择');
    modelEl('modelProviderSelect').replaceChildren(...data.groups.map(group => new Option(group.name,group.id)));
    if (data.groups.some(group => group.id === provider)) modelEl('modelProviderSelect').value = provider;
    fillModelOptions(model);
    const editor = modelEl('modelEditProvider');
    const editing = editor.value;
    editor.replaceChildren(new Option('新增服务',''),...data.providers.filter(row => row.editable).map(row => new Option(row.displayName + (row.hasKey ? ' · 已配置密钥' : ' · 待配置密钥'), row.id)));
    if (data.providers.some(row => row.id === editing)) editor.value = editing;
    modelEl('modelProviderSave').disabled = !data.canAdd || data.canConfigureImages !== true || data.canDiscoverModels !== true;
    modelEl('modelDiscover').disabled = data.canDiscoverModels !== true;
    renderModelImageOptions();
    modelEl('modelCatalogList').replaceChildren(...data.groups.map(group => {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = group.name + ' · ' + group.models.length + ' 个模型';
      const list = document.createElement('p'); list.className = 'meta';
      list.textContent = group.models.map(model => model.id).join(' / ') || '暂无可选模型';
      details.append(summary,list); return details;
    }));
    modelMessage('modelManagerMsg', data.canConfigureImages !== true ? '后台仍在运行旧版本。请正常重启大肥鱼，再配置图片模型。' : data.canDiscoverModels !== true ? '模型列表接口尚未加载。请正常重启大肥鱼，启用服务商适配与自动获取。' : data.groups.length ? '已读取 ' + data.groups.reduce((n,g) => n+g.models.length,0) + ' 个可选模型。' : '暂无可选模型，请先添加 API 服务或登录账号。', data.canConfigureImages !== true || data.canDiscoverModels !== true);
  } catch (error) { modelMessage('modelManagerMsg',error.message,true); }
}
function newModelProvider({reuseExisting=false}={}) {
  resetModelDiscovery();
  const preset = modelEl('modelPreset').value;
  const presets={aliyun:['阿里云百炼','my-aliyun','https://dashscope.aliyuncs.com/compatible-mode/v1',''],gemini:['Google Gemini','my-gemini','https://generativelanguage.googleapis.com/v1beta/openai',''],openai:['OpenAI / GPT','my-openai','https://api.openai.com/v1',''],anthropic:['Anthropic / Claude','my-anthropic','https://api.anthropic.com','']};
  const values = presets[preset] || (preset === 'qwen-vision' ? ['通义千问视觉','my-qwen-vision','https://dashscope.aliyuncs.com/compatible-mode/v1','qwen3.8-flash\nqwen3.7-plus\nqwen3.8-max'] : preset === 'siliconflow' ? ['硅基流动','my-siliconflow','https://api.siliconflow.cn/v1',''] : preset === 'deepseek' ? ['DeepSeek API','my-deepseek','https://api.deepseek.com','deepseek-flash'] : ['自定义 API','my-api','','']);
  modelEl('modelApiProtocol').value = preset === 'openai' ? 'openai-responses' : preset === 'anthropic' ? 'anthropic-messages' : 'openai-completions';
  if (reuseExisting && preset !== 'custom' && preset !== 'qwen-vision') {
    const matches=(modelManagerData?.providers || []).filter(p=>p.editable && p.hasKey && p.baseUrl.replace(/\/+$/,'')===values[2] && p.api===modelEl('modelApiProtocol').value);
    const existing=matches.find(p=>p.id===values[1]) || (matches.length===1 ? matches[0] : null);
    if (existing) { loadModelProvider(existing); return; }
  }
  modelEl('modelEditProvider').value = '';
  ['modelDisplayName','modelRouteId','modelBaseUrl','modelIds'].forEach((id,index) => {modelEl(id).value = values[index];});
  modelImageSelections = new Set(preset === 'qwen-vision' || preset === 'deepseek' ? values[3].split('\n') : []); renderModelImageOptions();
  modelEl('modelVisionHint').textContent = preset === 'qwen-vision' ? '三个预设均支持图片输入。请填写阿里云百炼中国内地的 API Key；其他地区请同时修改 API 根地址。保存后可在抖音中逐个选择与测试。' : '勾选服务实际支持图片输入的模型；抖音使用前仍需测试视觉连接。';
  modelMessage('modelDiscoverMsg',preset==='siliconflow'?'硅基流动密钥在任一设置页保存一次即可复用，已有密钥可留空获取模型；模型选择各自独立。':preset === 'aliyun' || preset === 'qwen-vision' ? '默认是百炼中国内地地址，其他地区请使用对应工作空间地址与密钥，再获取模型列表。' : '填入此平台的 API Key，再点击“获取模型列表”。获取不会保存密钥或切换当前模型。');
  modelEl('modelRouteId').readOnly = false;
  modelEl('modelApiKey').value = '';
  modelEl('modelApiKey').placeholder = '粘贴对应平台的 API Key';
  modelMessage('modelSaveMsg','');
}
modelEl('modelProviderSelect').addEventListener('change',() => fillModelOptions());
modelEl('modelRefresh').addEventListener('click',refreshModelManager);
modelEl('modelProviderJump').addEventListener('click',() => {
  modelEl('section-model-provider').scrollIntoView({behavior:'instant',block:'start'});
  modelEl('modelPreset').focus({preventScroll:true});
});
modelEl('modelNew').addEventListener('click',() => newModelProvider());
modelEl('modelPreset').addEventListener('change',() => newModelProvider({reuseExisting:true}));
modelEl('modelIds').addEventListener('input',renderModelImageOptions);
modelEl('modelEditLoad').addEventListener('click',() => {
  const provider = modelManagerData?.providers.find(row => row.id === modelEl('modelEditProvider').value);
  if (!provider) { newModelProvider(); return; }
  loadModelProvider(provider);
});
function loadModelProvider(provider) {
  resetModelDiscovery();
  modelEl('modelEditProvider').value = provider.id;
  modelEl('modelApiProtocol').value = provider.api || 'openai-completions';
  modelEl('modelRouteId').value = provider.id; modelEl('modelRouteId').readOnly = true;
  modelEl('modelDisplayName').value = provider.displayName; modelEl('modelBaseUrl').value = provider.baseUrl;
  modelEl('modelIds').value = provider.models.join('\n'); modelEl('modelApiKey').value = '';
  modelImageSelections = new Set(provider.visionModels || []); renderModelImageOptions();
  modelEl('modelVisionHint').textContent = '勾选服务实际支持图片输入的模型；未勾选的模型仍可用于文字对话。';
  modelEl('modelApiKey').placeholder = provider.hasKey ? '已配置密钥，留空保留' : '粘贴对应平台的 API Key';
  modelMessage('modelDiscoverMsg',provider.hasKey ? '已载入已有服务。密钥留空可直接获取模型列表；输入新密钥时，本次获取会使用新密钥，保存后才会替换旧密钥。' : '请填入此服务的 API Key，再获取模型列表。');
  modelMessage('modelSaveMsg','正在编辑 ' + provider.displayName);
}
modelEl('modelProviderSave').addEventListener('click',async () => {
  const button = modelEl('modelProviderSave'); button.disabled = true; modelMessage('modelSaveMsg','正在保存…');
  try {
    if (modelManagerData?.canConfigureImages !== true) throw new Error('请先正常重启大肥鱼，加载图片模型设置功能。');
    if (modelManagerData?.canDiscoverModels !== true) throw new Error('请先正常重启大肥鱼，加载新的模型服务功能。');
    const result = await api('/api/dsh/providers','POST',{...modelConnectionInput(),models:modelEl('modelIds').value,visionModels:[...modelImageSelections]});
    if (!result.ok) throw new Error(result.error || '保存失败');
    modelEl('modelApiKey').value = '';
    modelMessage('modelSaveMsg',result.message);
    await refreshModelManager();
    if (modelManagerData?.groups.some(group => group.id === result.id)) { modelEl('modelProviderSelect').value = result.id; fillModelOptions(); }
  } catch (error) { modelMessage('modelSaveMsg',error.message,true); }
  finally { button.disabled = modelManagerData?.canAdd === false || modelManagerData?.canConfigureImages !== true || modelManagerData?.canDiscoverModels !== true; }
});
modelEl('modelUse').addEventListener('click',async () => {
  const button = modelEl('modelUse'); button.disabled = true;
  try {
    const result = await api('/api/dsh/model','POST',{provider:modelEl('modelProviderSelect').value,model:modelEl('modelSelect').value});
    if (!result.ok) throw new Error(result.error || '切换失败');
    modelEl('modelCurrent').textContent = result.provider + ' / ' + result.model;
    modelMessage('modelManagerMsg','模型已切换，下一次对话生效。'); refreshDshModel();
  } catch (error) { modelMessage('modelManagerMsg',error.message,true); }
  finally { button.disabled = !modelEl('modelSelect').value; }
});
modelEl('modelAccountOpen').addEventListener('click',async () => {
  const popup = window.open('about:blank','_blank');
  if (popup) popup.opener = null;
  modelMessage('modelAccountMsg','正在打开登录与设置…');
  try {
    const result = await api('/api/dsh/web-session','POST',{});
    if (!result.ok) throw new Error(result.error || '打开失败');
    if (popup) popup.location = result.url;
    else { const link = document.createElement('a'); link.href = result.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '点击打开账号登录'; modelEl('modelAccountMsg').replaceChildren(link); return; }
    modelMessage('modelAccountMsg',result.message);
  } catch (error) { if (popup) popup.close(); modelMessage('modelAccountMsg',error.message,true); }
});
newModelProvider();

// ── DSH 模型与思考强度 ──────────────────────────────────────────────────────
async function refreshDshModel() {
  try {
    const r = await api('/api/dsh/model');
    document.getElementById('dshModelText').textContent = r.model || '-';
    document.getElementById('dshProviderText').textContent = r.provider || '-';
    const select = document.getElementById('dshEffortSelect');
    const labels = r.labels || {};
    select.replaceChildren();
    for (const option of (r.options || [])) {
      const el = document.createElement('option');
      el.value = option;
      const info = labels[option] || {};
      const isDefault = option === (r.providerDefault || r.default);
      el.textContent = `${option}${isDefault ? '（默认）' : ''}`;
      if (info.description) el.title = info.description;
      select.appendChild(el);
    }
    select.value = r.reasoningEffort;
    const parts = [];
    if (r.providerDefault) parts.push(`DSH 出厂默认是 ${r.providerDefault}`);
    parts.push(r.catalogSource === 'dsh' ? '档位取自 DSH 实际公布的能力' : '未能读取 DSH 能力，档位为内置清单');
    document.getElementById('dshEffortNote').textContent = parts.join('；') + '。';
    document.getElementById('dshEffortSideEffect').textContent = r.globalSideEffect
      ? '注意：切换会同时写入 DSH 的全局默认（~/.dsh/settings.yaml 的 agent-default-model），也就是 Web GUI 里新建会话的默认强度也会跟着变。'
      : '';
    document.getElementById('dshEffortMsg').textContent = '';
  } catch (error) {
    document.getElementById('dshEffortMsg').textContent = '读取失败：' + (error?.message ?? error);
  }
}

async function refreshWhitelist() {
  try {
    const w = await api('/api/whitelist');
    document.getElementById('officialQQWhitelistHint').hidden=w.transport!=='official';
    document.getElementById('wlGroups').value = (w.allow.groups || []).join(', ');
    document.getElementById('wlPrivate').value = (w.allow.private || []).join(', ');
    document.getElementById('ownerQQ').value = w.ownerQQ != null ? String(w.ownerQQ) : '';
    document.getElementById('dnGroups').value = (w.deny.groups || []).join(', ');
    document.getElementById('dnPrivate').value = (w.deny.private || []).join(', ');
    await renderQQWhitelist(w);
  } catch {}
}

async function refreshSessions() {
  try {
    const s = await api('/api/sessions');
    const box = document.getElementById('sessionList');
    document.getElementById('metricSessions').textContent = s.sessions.length;
    if (!s.sessions.length) { box.innerHTML = '<div class="empty-state"><strong>还没有会话</strong><p>白名单中的群或好友发来消息后，会话会显示在这里。</p></div>'; return; }
    let html = '<table><tr><th>QQ 会话</th><th>DSH 会话 ID</th><th>类型</th><th></th></tr>';
    for (const x of s.sessions) {
      const isP = x.key.startsWith('private:');
      const type = isP ? '<span class="pill b">私聊</span>' : '<span class="pill g">群</span>';
      const ownerTag = x.owner ? ' <span class="pill r">管理员</span>' : '';
      html += `<tr><td>${esc(x.key)}${ownerTag}</td><td><code>${esc(x.sessionId)}</code></td><td>${type}</td><td><button class="small" data-reset-key="${esc(x.key)}">清除上下文</button></td></tr>`;
    }
    box.innerHTML = html + '</table>';
    box.querySelectorAll('[data-reset-key]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('确定清除该会话的上下文？下次消息将开新会话。')) return;
      const r = await api('/api/session/reset', 'POST', { key: btn.dataset.resetKey });
      alert(r.ok ? '✅ 已清除上下文' : ('❌ ' + (r.error || '失败')));
      refreshSessions();
    }));
  } catch {}
}

async function refreshPending() {
  try {
    const p = await api('/api/pending');
    const box = document.getElementById('pendingList');
    document.getElementById('metricPending').textContent = p.pending.length;
    document.getElementById('pendingCount').textContent = p.pending.length;
    if (!p.pending.length) { box.innerHTML = '<div class="empty-state"><strong>暂时没有待处理请求</strong><p>AI 的提问或工具审批会出现在这里，请前往对应 QQ 会话回复。</p></div>'; return; }
    let html = '<table><tr><th>会话</th><th>类型</th><th>详情</th></tr>';
    for (const x of p.pending) {
      const kind = x.kind === 'approval' ? '<span class="pill r">审批</span>' : '<span class="pill b">提问</span>';
      let detail = '';
      if (x.kind === 'approval') detail = `${esc(x.toolName)}${x.reason ? '：' + esc(x.reason) : ''}`;
      else if (x.questions) detail = x.questions.map(q => esc(q.question)).join(' / ');
      html += `<tr><td>${esc(x.key)}</td><td>${kind}</td><td>${detail}</td></tr>`;
    }
    box.innerHTML = html + '</table>';
  } catch {}
}

document.querySelectorAll('#modeRow button').forEach(b => b.addEventListener('click', async () => {
  if (b.disabled) return;
  await saveMode(b.dataset.mode);
}));
document.getElementById('closedPreset').addEventListener('change', async () => {
  // 切换预设立即保存（若当前是 closed-agent 则即时生效，否则供下次切换使用）
  const active = document.querySelector('#modeRow button.active');
  const mode = active ? active.dataset.mode : 'chat';
  await saveMode(mode);
});
document.getElementById('contextHealthRefresh').addEventListener('click',async()=>{
  const box=document.getElementById('contextHealthView');box.textContent='读取中…';
  try{const r=await api('/api/context-health');if(!r.ok)throw Error(r.error||'读取失败');box.textContent=r.memory?.unavailable?'历史记忆暂不可用，请查看桥接日志':'已索引 '+r.memory.messages+' 条历史 / '+r.memory.channels+' 个独立会话；自动恢复 '+r.recoveries.length+' 个会话；每次聊天输出预算 '+r.outputBudgetTokens+' token。';}catch(error){box.textContent=error.message;}
});
document.getElementById('roleSet').addEventListener('click',()=>void activateRole(document.getElementById('roleInput').value.trim()));
document.getElementById('roleClear').addEventListener('click',()=>void activateRole(null));
document.getElementById('roleCreate').addEventListener('click', async () => {
  const name = document.getElementById('newRoleName').value.trim();
  const content = document.getElementById('newRoleContent').value.trim();
  if (!name) { setRoleMsg('请先填人格名', false); return; }
  const editing = roleEditorState.mode === 'edit';
  const exists = roleCache.some((role) => role.name === name);
  // 编辑模式下改了名字 → 先重命名文件，再保存内容
  if (editing && roleEditorState.name !== name) {
    const renamed = await api('/api/roles/rename', 'POST', { from: roleEditorState.name, to: name });
    if (!renamed.ok) { setRoleMsg('❌ ' + (renamed.error || '重命名失败'), false); return; }
  }
  const endpoint = editing || exists ? '/api/roles/update' : '/api/roles/create';
  const r = await api(endpoint, 'POST', { name, content, selfName:document.getElementById('newRoleSelfName').value.trim(), ...roleFormMetadata(), activate:document.getElementById('roleActivateOnSave').checked });
  setRoleMsg(r.ok ? `✅ 已保存「${name}」` : ('❌ ' + (r.error || '失败')), r.ok);
  if (r.ok) {
    roleEditorState = { mode: 'edit', name };markRoleBaseline();
    document.getElementById('roleEditorWarnings').textContent = (r.warnings || []).length ? '⚠️ ' + r.warnings.join('；') : '';
    await refreshRoles();
    setRoleMsg(roleCurrent === name ? `✅ 已保存「${name}」；当前已启用，下一次唤醒或读取消息应用新设定。` : `✅ 已保存「${name}」；这张卡尚未启用，请在下方「切换当前启用的人格」中设置。`, true);
  }
});
document.getElementById('roleDuplicate').addEventListener('click', async () => {
  const source = document.getElementById('newRoleName').value.trim();
  const content = document.getElementById('newRoleContent').value.trim();
  const target = (prompt('把当前内容另存为新的人格，名称：', source ? source + '-副本' : '') || '').trim();
  if (!target) return;
  const r = await api('/api/roles/create', 'POST', { name: target, content, selfName:document.getElementById('newRoleSelfName').value.trim(), ...roleFormMetadata() });
  if (!r.ok) { setRoleMsg('❌ ' + (r.error || '另存失败'), false); return; }
  document.getElementById('newRoleName').value = target;
  roleEditorState = { mode: 'edit', name: target };markRoleBaseline();
  renderRoleEditor();
  setRoleMsg(`✅ 已另存为「${target}」`, true);
  refreshRoles();
});
document.getElementById('roleDelete').addEventListener('click', async () => {
  const name = document.getElementById('newRoleName').value.trim();
  if (!name) { setRoleMsg('请先选择或填写要删除的人格名', false); return; }
  if (!confirm(`确定删除人格「${name}」？该操作不可撤销（roles/${name}.md）。`)) return;
  const r = await api('/api/roles/delete', 'POST', { name });
  if (!r.ok) { setRoleMsg('❌ ' + (r.error || '删除失败'), false); return; }
  resetRoleForm();
  setRoleMsg(r.clearedCurrent ? `已删除「${name}」，并清除了当前启用的人格` : `已删除「${name}」`, true);
  refreshRoles();
  refresh();
});
document.getElementById('roleFormReset').addEventListener('click', () => resetRoleForm());
document.getElementById('newRoleContent').addEventListener('input', updateRoleEditorWarnings);

// ── 仿真提示词 ──────────────────────────────────────────────────────────────
document.getElementById('simPromptEdit').addEventListener('click', () => {
  setSimEditing(true);
  setSimMsg('编辑中：改完点「保存并同步到 DSH」。保存会先备份，并做 YAML 与安全不变量校验。');
});
document.getElementById('simPromptCancel').addEventListener('click', () => {
  document.getElementById('simPromptText').value = simPromptOriginal;
  setSimEditing(false);
  setSimMsg('已放弃修改');
});
document.getElementById('simPromptPreset').addEventListener('change', () => { refreshSimPrompt(); });
document.getElementById('simPromptSave').addEventListener('click', async () => {
  const content = document.getElementById('simPromptText').value;
  if (!confirm('保存会改写该代预设的源文件并同步到 DSH 的 preset 目录（新会话生效，进行中的会话需重置或重启 DSH）。确定继续？')) return;
  setSimMsg('保存中…');
  const r = await api('/api/preset/sim-prompt', 'POST', { preset: simPromptPreset, content });
  if (!r.ok) { setSimMsg('❌ ' + (r.error || '保存失败'), false); return; }
  if (r.unchanged) {
    simPromptOriginal = content;
    setSimEditing(false);
    setSimMsg('内容没有变化，未写入文件（避免无谓地重排预设格式）', true);
    return;
  }
  simPromptOriginal = content;
  setSimEditing(false);
  setSimMsg(`✅ 已保存${r.synced ? '并同步到 DSH' : ''}；重启 DSH 后生效`, true);
  document.getElementById('simPromptWarnings').textContent = (r.warnings || []).length ? '⚠️ ' + r.warnings.join('；') : '';
  document.getElementById('simPromptStatus').textContent = `${r.status?.label || simPromptPreset} · ${content.length} 字符 · 已保存，待重启 DSH`;
});
document.getElementById('simPromptRestore').addEventListener('click', async () => {
  if (!confirm('还原到该代预设上一次保存前的备份？当前改动会丢失（原文件会先自动备份）。')) return;
  const r = await api('/api/preset/sim-prompt/restore', 'POST', { preset: simPromptPreset });
  if (!r.ok) { setSimMsg('❌ ' + (r.error || '还原失败'), false); return; }
  setSimMsg(`✅ 已还原（${r.restoredFrom}）；重启 DSH 后生效`, true);
  refreshSimPrompt();
});

// ── 人格注入上限 ────────────────────────────────────────────────────────────
document.getElementById('roleInjectMaxSave').addEventListener('click', async () => {
  const msg = document.getElementById('roleInjectMaxMsg');
  const value = Number(document.getElementById('roleInjectMax').value);
  if (!Number.isFinite(value) || value < 1000 || value > 20000) { msg.textContent = '请输入 1000~20000 之间的整数'; msg.className = 'meta err'; return; }
  const r = await api('/api/roles/limit', 'POST', { maxInjectChars: value });
  msg.textContent = r.ok ? `✅ 已设为 ${r.maxInjectChars} 字符，下一条消息生效` : ('❌ ' + (r.error || '保存失败'));
  msg.className = r.ok ? 'meta ok' : 'meta err';
  if (r.ok) refreshRoles();
});

// ── DSH 思考强度 ────────────────────────────────────────────────────────────
document.getElementById('dshEffortSave').addEventListener('click', async () => {
  const effort = document.getElementById('dshEffortSelect').value;
  const msg = document.getElementById('dshEffortMsg');
  msg.textContent = '保存中…';
  msg.className = 'meta';
  const r = await api('/api/dsh/effort', 'POST', { reasoningEffort: effort });
  msg.textContent = r.ok ? `✅ 已设为 ${r.reasoningEffort}，下一条消息生效` : ('❌ ' + (r.error || '保存失败'));
  msg.className = r.ok ? 'meta ok' : 'meta err';
  if (r.ok) refreshDshModel();
});
document.getElementById('silentOn').addEventListener('click', async () => { await api('/api/role-mode', 'POST', { mode: 'silent' }); refresh(); });
document.getElementById('silentOff').addEventListener('click', async () => { await api('/api/role-mode', 'POST', { mode: 'active' }); refresh(); });
document.getElementById('wlSave').addEventListener('click', async () => {
  const parse = (s) => s.split(/[,，\s]+/).map(x => x.trim()).filter(Boolean).map(Number).filter(Number.isFinite);
  const r = await api('/api/whitelist', 'POST', {
    allow: { private: parse(document.getElementById('wlPrivate').value), groups: parse(document.getElementById('wlGroups').value) },
    deny: { private: parse(document.getElementById('dnPrivate').value), groups: parse(document.getElementById('dnGroups').value) },
    ownerQQ: document.getElementById('ownerQQ').value.trim()
  });
  if (r.ok) { refreshWhitelist(); refresh(); alert('白名单已保存并生效'); }
  else alert(r.error || '保存失败');
});
document.getElementById('tsSend').addEventListener('click', async () => {
  const r = await api('/api/test-send', 'POST', {
    kind: document.getElementById('tsKind').value,
    id: document.getElementById('tsId').value.trim(),
    message: document.getElementById('tsMsg').value
  });
  document.getElementById('tsMsg2').textContent = r.ok ? ('✅ 已发送 message_id=' + r.message_id) : ('❌ ' + (r.error || '失败'));
  document.getElementById('tsMsg2').className = r.ok ? 'meta ok' : 'meta err';
});
document.getElementById('restartBtn').addEventListener('click', async () => {
  if (!confirm('确定重启桥接？')) return;
  const r = await api('/api/restart', 'POST', {});
  document.getElementById('restartMsg').textContent = r.message || '正在重启…';
});
document.getElementById('clearWsBtn').addEventListener('click', async () => {
  if (!confirm('确定清空整个「QQ 聊天」工作区？\n将归档全部 QQ 会话、清除所有上下文映射、清空活动日志。\n此操作不可撤销。')) return;
  const r = await api('/api/workspace/reset', 'POST', {});
  document.getElementById('clearWsMsg').textContent = r.ok ? (`✅ 已归档 ${r.archivedCount} 个会话，工作区已清空`) : ('❌ ' + (r.error || '失败'));
  document.getElementById('clearWsMsg').className = r.ok ? 'meta ok' : 'meta err';
  refreshSessions(); refresh();
});
document.getElementById('aiNotifySend').addEventListener('click', async () => {
  const kind = document.getElementById('aiNotifyKind').value;
  const id = document.getElementById('aiNotifyId').value.trim();
  const message = document.getElementById('aiNotifyMessage').value.trim();
  if (!id || !message) { alert('请填写群号/QQ 号和提醒内容'); return; }
  const r = await api('/api/console/notify-ai', 'POST', { key: kind + ':' + id, message });
  const msg = document.getElementById('aiNotifyMsg');
  msg.textContent = r.ok ? ('✅ 已投递到 DSH：' + r.sessionId) : ('❌ ' + (r.error || '失败'));
  msg.className = r.ok ? 'meta ok' : 'meta err';
});

