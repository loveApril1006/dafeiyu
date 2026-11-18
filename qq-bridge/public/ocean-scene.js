// Scoped memory presentation. Dust is decorative; links explicitly distinguish
// category membership from recorded relationships. No model or data writes.
// Neural tissue, instruments and meteors are independently implemented for QQ Bridge.
(()=>{
 const colors={experience:[111,204,187],module:[133,171,179],kinship:[224,194,143],subpersona:[179,155,220],persona:[220,239,229],person:[119,211,194],fact:[143,192,210],event:[171,164,214],topic:[157,203,177],thought:[220,184,144],impression:[143,194,193],emotion:[218,167,189],reflection:[222,200,164],selfTalk:[190,179,217],review:[159,205,180],cluster:[154,194,200]};
 const descriptions={person:'记下相识的人，也记下彼此怎样靠近。',fact:'那些被认真说过、值得再次记住的偏好。',event:'共同走过的片段，始终保留来处。',experience:'从空间、视频、创作与日常留下的经历。',module:'每段经历都能循着来源回去。',kinship:'由你确认的关系与称呼，安放在核心。',subpersona:'相处留下的侧面，慢慢长成自己的语气。',emotion:'当时的心情，不必冒充永远的事实。',reflection:'回望之后的想法，仍然标记为推测。',selfTalk:'偶尔对自己说的话，留在这一片海。',review:'重新遇见旧记忆，保留最初的证据。',topic:'还在延续的话题，等待下一次接续。',thought:'尚未说完的想法，以及待完成的约定。',impression:'相处中的印象，允许变化与修正。',persona:'名字、身份和基调，来自当前人格。'};
 const kinds={experience:'功能经历',module:'功能来源',kinship:'亲属关系',subpersona:'自生副人格',persona:'当前人格',person:'人物',fact:'事实与偏好',event:'经历',topic:'话题',thought:'想法与待办',impression:'人物印象',emotion:'情感',reflection:'反思',selfTalk:'自言自语',review:'复习',cluster:'记忆分类'};
 const relations={corrects:'修正','activity-source':'功能来源',activity:'实际经历','experience-reflection':'经历反思','activity-growth':'经历沉淀',subpersona:'副人格线',growth:'互动沉淀','reflection-source':'反思线索','kinship-person':'对应人物',category:'记忆分类',contains:'包含',participated:'参与',stated:'陈述',feeling:'感受',impression:'印象',related:'关联'};
 const stages={core:'永久核心',active:'时序动态',warm:'渐淡记忆',archive:'久远归档'};
 const hash=s=>{let n=2166136261;for(const c of String(s))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
 const ease=t=>1-Math.pow(1-t,3),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 class OceanScene{
  constructor(host,{onSelect=()=>{},onError=()=>{}}={}){
   Object.assign(this,{host,onSelect,onError,nodes:[],edges:[],projected:new Map(),labels:new Map(),sprites:new Map(),currentPositions:new Map(),state:{yaw:-.16,pitch:.2,zoom:1,x:0,y:0,z:0,mix:0,inset:0},layout:'galaxy',selected:'',hovered:'',frame:0,animation:0,active:true,intersecting:true,quality:1,labelLimit:24,width:0,height:0,backgroundKey:'',motion:!matchMedia('(prefers-reduced-motion: reduce)').matches,lastFrame:0});
   host.innerHTML='<canvas aria-label="三维记忆关系图：拖动旋转，点击带名称的星点展开"></canvas><div class="ocean-hud"><div class="ocean-hud-title"><small>THE MEMORY UNIVERSE</small><b>识海<span>记忆的形状</span></b><span>沿着星光，重新遇见每一次相识</span></div><div class="ocean-hud-data"><span data-hud="view">分类总览</span><b data-hud="counts"></b></div></div><div class="ocean-coordinate" aria-hidden="true"><span>●</span> LIVE MEMORY SPACE <small>拖动探索三维空间</small></div><div class="star-labels"></div><div class="ocean-tip" role="tooltip" hidden><b></b><span></span><small></small></div>';
   this.meteors=[];this.meteorQueue=[];this.lastEventSeq=0;this.lifecycleCount=0;
   const receipt=document.createElement('div');receipt.className='ocean-loss';receipt.setAttribute('role','status');receipt.setAttribute('aria-live','polite');host.append(receipt);
   const strata=document.createElement('div');strata.className='ocean-strata';strata.setAttribute('aria-label','当前视图的记忆层次');host.append(strata);
   const instruments=document.createElement('div');instruments.className='ocean-instruments';instruments.innerHTML='<div class="panorama-ledger" aria-label="同时展开的记忆分区"></div><div class="memory-colophon"><span>每一座记忆岛，都有它的来处。</span><small>光丝为氛围 · 记录与来源可追溯</small></div>';host.append(instruments);
   this.host.querySelector('.ocean-hud-title>small').textContent='THE OCEAN OF REMEMBERING';this.host.querySelector('.ocean-hud-title>b').firstChild.textContent='星图识海';this.host.querySelector('.ocean-hud-title>b span').textContent='记忆成岛，相处成海';
   this.canvas=host.querySelector('canvas');this.layer=host.querySelector('.star-labels');this.tip=host.querySelector('.ocean-tip');this.ctx=this.canvas.getContext('2d');this.cache=document.createElement('canvas');this.cacheContext=this.cache.getContext('2d');
   for(const surface of [this.canvas,this.cache]){surface.addEventListener('contextlost',e=>{e.preventDefault();this.backgroundKey='';});surface.addEventListener('contextrestored',()=>{const ratio=Math.min(devicePixelRatio||1,1.5);surface.getContext('2d')?.setTransform(ratio,0,0,ratio,0,0);this.backgroundKey='';this.request();});}
   if(!this.ctx){onError('星图绘制暂不可用，可通过分类卡片和记忆列表查看内容');return;}
   let seed=41739;const rand=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296),normal=()=>Math.sqrt(-2*Math.log(Math.max(.00001,rand())))*Math.cos(Math.PI*2*rand());
   this.dust=[];this.haze=[];this.background=[];
   for(let i=0;i<2400;i++){
    const a=rand()*Math.PI*2,v=Math.acos(rand()*2-1),r=170+Math.pow(rand(),.55)*330,side=i%2?1:-1,c=i%4===0?[177,147,255]:i%3===0?[98,225,232]:[106,154,235];
    this.dust.push({p:[Math.cos(a)*Math.sin(v)*r,Math.cos(v)*r*.55,Math.sin(a)*Math.sin(v)*r*.8],b:[side*105+normal()*80,normal()*120,normal()*85],c,fill:'rgb('+c+')',size:rand()<.035?1.6:.35+rand()*.65,alpha:.12+rand()*.5});
   }
   for(let i=0;i<26;i++){const a=rand()*Math.PI*2,r=150+rand()*260;this.haze.push({p:[Math.cos(a)*r,normal()*85,Math.sin(a)*r*.6],r:90+rand()*95,c:i%3?[61,79,188]:[45,143,175]});}
   for(let i=0;i<180;i++)this.background.push({x:rand(),y:rand(),r:rand()<.04?1.1:.45,a:.08+rand()*.45});
   this.neurons=Array.from({length:110},(_,i)=>{const y=1-2*(i+.5)/110,r=Math.sqrt(1-y*y),a=i*2.399963;return[Math.cos(a)*r,y,Math.sin(a)*r];});
   this.neuralLinks=[];for(let i=0;i<this.neurons.length;i++)for(let j=i+1;j<this.neurons.length;j++){const a=this.neurons[i],b=this.neurons[j];if(Math.hypot(...a.map((v,k)=>v-b[k]))<.41)this.neuralLinks.push([i,j]);}

   this.buildBrain();
   for(let i=0;i<this.dust.length;i++){const d=this.dust[i],side=i%2?1:-1,u=(hash('brain-u'+i)%10000)/10000*Math.PI*2,v=Math.asin((hash('brain-v'+i)%10000)/5000-1),surface=this.brainPoint(side,u,v),center=[side*94,-15,0],depth=.55+.45*Math.cbrt((hash('brain-r'+i)%10000)/10000);d.b=surface.map((v,k)=>center[k]+(v-center[k])*depth);}
   this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);
   this.intersectionObserver=new IntersectionObserver(entries=>{this.intersecting=entries[0].isIntersecting;this.setActive(this.intersecting&&!document.hidden);});this.intersectionObserver.observe(this.canvas);
   this.visibility=()=>this.setActive(this.intersecting&&!document.hidden);document.addEventListener('visibilitychange',this.visibility);
   this.bind();this.resize();
  }
  setActive(active){this.active=active;if(active)this.request();else{cancelAnimationFrame(this.frame);this.frame=0;this.animation++;if(this.pendingTarget){Object.assign(this.state,this.pendingTarget);this.pendingTarget=null;}this.hideTip();}}
  setMotion(enabled){this.motion=enabled&&!matchMedia('(prefers-reduced-motion: reduce)').matches;if(!this.motion){this.meteors=[];this.meteorQueue=[];this.host.dataset.activeMeteors='0';this.host.dataset.pendingMeteors='0';}this.request();}
  setLifecycle(events=[],{reset=false}={}){
   if(reset){this.meteors=[];this.meteorQueue=[];this.lastEventSeq=0;this.lifecycleCount=0;this.host.dataset.lifecycleCount='0';this.host.dataset.activeMeteors='0';this.host.dataset.pendingMeteors='0';this.host.querySelector('.ocean-loss').replaceChildren();}
   const fresh=events.filter(e=>Number.isSafeInteger(e.seq)&&e.seq>this.lastEventSeq&&['faded','archived','withdrawn'].includes(e.reason));
   if(!fresh.length){this.request();return;}
   this.lastEventSeq=Math.max(...fresh.map(e=>e.seq));this.lifecycleCount+=fresh.length;
   for(const e of fresh){if(this.motion){const angle=(hash(e.node)%6283)/1000,pos=this.currentPositions.get(e.node)||[Math.cos(angle)*275,-100+Math.sin(angle)*120,Math.sin(angle)*150];this.meteorQueue.push({...e,origin:[...pos]});}}
   const status=this.host.querySelector('.ocean-loss'),title=document.createElement('b'),copy=document.createElement('span'),last=fresh.at(-1);title.textContent='陨星回响 · '+this.lifecycleCount;copy.textContent=({faded:'记忆渐淡，落入久远归档',archived:'记忆已归档，仍可找回',withdrawn:'记忆已撤回，停止参与召回'})[last.reason];status.replaceChildren(title,copy);this.host.dataset.lifecycleCount=String(this.lifecycleCount);this.renderInstruments();this.request();
  }
  setRecallTrace(trace){
   clearTimeout(this.traceTimer);this.traceHits=new Map();this.traceEdges=new Set();this.traceUntil=0;
   if(trace){const ids=new Set(this.nodes.map(n=>n.id));for(const[rank,hit]of(trace.hits||[]).slice(0,40).entries())if(ids.has(hit.id))this.traceHits.set(hit.id,rank);const edgeKey=e=>[...[e.a,e.b].sort(),e.kind].join('|'),stored=new Set(this.edges.filter(e=>!['category','contains'].includes(e.kind)).map(edgeKey));for(const edge of(trace.edges||[]).slice(0,200))if(ids.has(edge.a)&&ids.has(edge.b)&&stored.has(edgeKey(edge)))this.traceEdges.add(edgeKey(edge));this.traceUntil=performance.now()+12000;this.traceTimer=setTimeout(()=>this.setRecallTrace(null),12000);}
   this.host.dataset.recallNodes=String(this.traceHits.size);this.host.dataset.recallEdges=String(this.traceEdges.size);for(const[id,label]of this.labels)label.classList.toggle('is-recalled',this.traceHits.has(id));this.request();
  }
  position(node,time=performance.now()){
   const target=node.p.map((v,i)=>v+(node.b[i]-v)*this.state.mix),phase=this.transitionDuration?clamp((time-this.transitionStart)/this.transitionDuration,0,1):1;
   return target.map((v,i)=>node.start[i]+(v-node.start[i])*ease(phase));
  }
  setData(data,{focusId='',anchor=null}={}){
   this.host.dataset.panoramaStatus='loading';this.overview=data.level==='clusters';this.panorama=this.overview&&this.layout!=='brain';this.previewGroups=new Map();this.host.dataset.panorama=String(this.panorama);
   this.setRecallTrace(null);const old=new Map(this.currentPositions),raw=(data.nodes||[]).slice(0,160);this.currentPositions.clear();this.projected.clear();this.hovered='';this.edges=(data.edges||[]).slice(0,200);this.selected=focusId||raw.find(n=>n.kind==='persona')?.id||'';
   const center=focusId||raw.find(n=>n.kind==='persona')?.id||anchor?.id,children=raw.filter(n=>n.id!==center),count=children.length;this.centerId=center;
   this.nodes=raw.map(n=>{
    const i=children.findIndex(v=>v.id===n.id),a=-.55+i/Math.max(1,count)*Math.PI*2,central=n.id===center;
    const band=n.kind==='cluster'?i%2:n.stage==='core'?0:n.stage==='archive'?2:n.stage==='warm'?1:i%2;
    const r=count<=12?230+band*30+(i%2)*28:170+band*55+(i%3)*15;
    const latitude=1-2*(i+.5)/Math.max(1,count),longitude=i*2.399963+.4,spread=central?0:this.panorama?147+band*12:105+band*15;
    const p=central?[0,0,0]:[Math.cos(longitude)*Math.sqrt(1-latitude*latitude)*spread,latitude*(this.panorama?161:132),Math.sin(longitude)*Math.sqrt(1-latitude*latitude)*spread*.8];
    const seats=[[-115,-72,70],[118,-75,55],[-133,40,60],[135,38,55],[-67,73,80],[70,78,65],[-155,-25,-35],[152,-20,-40],[-68,-105,30],[70,-105,25],[-130,65,-30],[130,65,-35]];
    let b=[0,0,0];if(!central){if(count<=12)b=seats[i];else{const side=i%2?1:-1,j=Math.floor(i/2),total=Math.ceil(count/2),v=Math.asin(1-2*(j+.5)/total),surface=this.brainPoint(side,j*2.399963,v),center=[side*94,-15,0],depth=.38+(hash(n.id+'depth')%100)/230;b=surface.map((v,k)=>center[k]+(v-center[k])*depth);}}

    const mist=Array.from({length:n.kind==='cluster'?64:0},(_,j)=>{const u=(hash(n.id+j+'u')%10000)/10000,v=(hash(n.id+j+'v')%10000)/10000,t=(hash(n.id+j+'t')%10000)/10000,az=u*Math.PI*2,el=Math.acos(2*v-1),rad=Math.pow(t,.5)*(42+Math.min(30,Math.log2((n.count||1)+1)*4));return{x:Math.cos(az)*Math.sin(el)*rad,y:Math.cos(el)*rad*.65,z:Math.sin(az)*Math.sin(el)*rad,a:.18+t*.5,r:j%17===0?1.6:.65};});

    return {...n,central,p,b,mist,start:old.get(n.id)||old.get(center)||[0,0,0]};
   });
   this.buildNeuralField();this.renderInstruments();this.resize();this.backgroundKey='';this.transitionStart=performance.now();this.transitionDuration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:650;
   this.layer.replaceChildren();this.labels.clear();this.hideTip();
   for(const n of this.nodes){
    const b=document.createElement('button');b.type='button';b.className='star-label';b.dataset.node=n.id;
    const dot=document.createElement('span'),title=document.createElement('strong'),caption=document.createElement('small');dot.className='star-key';dot.style.background=`rgb(${colors[n.category||n.kind]||colors.cluster})`;b.style.setProperty('--node-accent',`rgb(${colors[n.category||n.kind]||colors.cluster})`);title.textContent=n.title;caption.textContent=n.kind==='cluster'?(n.count??0)+' 条记忆':n.central&&n.kind==='persona'?'人格核心':kinds[n.kind]||'记忆';
    b.append(dot,title,caption);b.setAttribute('aria-label','查看'+n.title+(n.count?'，'+n.count+'条记忆':''));b.addEventListener('click',()=>this.onSelect(n));
    b.addEventListener('pointerenter',()=>this.hover(n.id));b.addEventListener('pointerleave',()=>this.hover(''));b.addEventListener('focus',()=>this.hover(n.id));b.addEventListener('blur',()=>this.hover(''));
    this.layer.append(b);this.labels.set(n.id,b);
   }
   this.host.dataset.edgeCount=String(this.edges.length);this.host.dataset.nodeCount=String(this.nodes.length);this.host.querySelector('[data-hud="counts"]').textContent=this.nodes.length+' 节点 / '+this.edges.length+' 连线';this.host.querySelector('[data-hud="view"]').textContent=data.level==='clusters'?'分类总览':data.level==='relations'?'关联记忆':'记忆星团';
   this.host.querySelector('.ocean-strata').replaceChildren(...Object.entries(stages).map(([stage,name])=>{const item=document.createElement('span'),dot=document.createElement('i');dot.style.background=({core:'#efcd8e',active:'#83dbdf',warm:'#baa5ef',archive:'#bd8b70'})[stage];item.append(dot,name+' '+this.nodes.filter(n=>n.kind!=='cluster'&&n.stage===stage).length);return item;}));this.move({x:0,y:0,z:0,zoom:this.layout==='brain'?1.05:1});this.request();
  }
  setPanoramaData(data){
   if(!this.overview)return;this.previewGroups=new Map((data?.groups||[]).map(g=>[g.kind,g]));this.host.dataset.panoramaStatus=data?'ready':'unavailable';this.renderInstruments();this.backgroundKey='';this.request();
  }
  renderInstruments(){
   const ledger=this.host.querySelector('.panorama-ledger');if(!ledger)return;const items=this.nodes.filter(n=>n.kind==='cluster');this.host.dataset.islandRows=items.length>12?'extended':'standard';
   ledger.replaceChildren(...items.map((n,i)=>{
    const article=document.createElement('article'),header=document.createElement('header'),title=document.createElement('h3'),count=document.createElement('span'),description=document.createElement('p'),examples=document.createElement('div'),open=document.createElement('button');
    article.className='memory-island';article.dataset.node=n.id;article.dataset.kind=n.category;article.style.setProperty('--island-color','rgb('+(colors[n.category]||colors.cluster)+')');
    const sideIndex=i-8,sideCount=Math.ceil(Math.max(0,items.length-8)/2),row=Math.floor(sideIndex/2);article.dataset.position=i<4?'north':i<8?'south':sideIndex%2===0?'west':'east';article.style.setProperty('--slot',String(i<4?i:i<8?i-4:row));article.style.setProperty('--side-y',(sideCount>2?28+row*16:35+row*20)+'%');
    title.textContent=n.title;count.textContent=(n.count||0)+' 条';header.append(title,count);description.className='island-description';description.textContent=descriptions[n.category]||'每段记忆都保留自己的来源。';examples.className='island-examples';
    const preview=this.previewGroups?.get(n.category);for(const memory of preview?.examples||[]){const line=document.createElement('button'),name=document.createElement('b'),copy=document.createElement('span');line.type='button';line.className='island-memory';name.textContent=memory.title;copy.textContent=memory.summary.slice(0,90);line.append(name,copy);line.title=memory.title+'：'+memory.summary;line.onclick=()=>this.onSelect(memory);examples.append(line);}
    if(!preview){const waiting=document.createElement('small');waiting.textContent=this.host.dataset.panoramaStatus==='unavailable'?'记忆概览暂不可用，仍可读取完整分类。':'正在展开真实记忆片段…';examples.append(waiting);}
    open.type='button';open.className='island-open';open.dataset.openCategory=n.category;open.textContent=preview&&preview.count>preview.examples.length?'已展示 '+preview.examples.length+' 条 · 读取其余 '+(preview.count-preview.examples.length)+' 条':'查看来源与完整记录';open.onclick=()=>this.onSelect(n);article.append(header,description,examples,open);return article;
   }));this.host.dataset.islandCount=String(items.length);this.host.dataset.openIslands=String(this.panorama?items.length:0);this.queueIslandLayout();
  }
  queueIslandLayout(){
   cancelAnimationFrame(this.ledgerFrame);this.ledgerFrame=requestAnimationFrame(()=>{this.ledgerFrame=0;const cards=[...this.host.querySelectorAll('.memory-island')];if(!this.panorama||this.host.clientWidth<=760){this.host.style.removeProperty('height');for(const card of cards)card.style.removeProperty('top');return;}
    const by=side=>cards.filter(c=>c.dataset.position===side),north=by('north'),south=by('south'),west=by('west'),east=by('east'),maxHeight=rows=>Math.max(0,...rows.map(c=>c.offsetHeight)),stack=rows=>rows.reduce((sum,c)=>sum+c.offsetHeight,0)+Math.max(0,rows.length-1)*20;
    const top=135+maxHeight(north)+24,bottom=maxHeight(south)+68+24,middle=Math.max(stack(west),stack(east),480),height=Math.ceil(Math.max(1040,top+middle+bottom));if(this.host.style.height!==height+'px')this.host.style.height=height+'px';
    for(const rows of [west,east]){let y=top+(height-top-bottom-stack(rows))/2;for(const card of rows){card.style.top=Math.round(y)+'px';y+=card.offsetHeight+20;}}
    this.request();
   });
  }
  buildNeuralField(){
   // Procedural visual tissue, independent of stored memory/relationship counts.
   // A spatial grid bounds neighbour searches; no quadratic all-history operation.
   let seed=hash(this.nodes.map(n=>n.id).join('|'));const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),normal=()=>Math.sqrt(-2*Math.log(Math.max(.00001,rand())))*Math.cos(Math.PI*2*rand());
   this.filaments=[];this.fieldPoints=[];this.fieldGroups=[];
   const addCloud=(origin,radius,count,color,alpha,volume=false)=>{const points=[],grid=new Map(),cellSize=volume?21:radius*.31,key=(x,y,z)=>x+','+y+','+z;
    for(let i=0;i<count;i++){let p;if(volume){const az=rand()*Math.PI*2,y=rand()*2-1,r=Math.cbrt(rand())*radius;p=[Math.cos(az)*Math.sqrt(1-y*y)*r,y*r,Math.sin(az)*Math.sqrt(1-y*y)*r];}else p=origin.map((v,k)=>v+normal()*radius*(k===2?.7:1));const extent=Math.hypot(...p);if(extent>(this.panorama?220:174))p=p.map(v=>v/extent*(this.panorama?220:174));const index=this.fieldPoints.length;this.fieldPoints.push({p,c:color,bright:i%17===0,alpha});points.push(index);const coords=p.map(v=>Math.floor(v/cellSize)),id=key(...coords);if(!grid.has(id))grid.set(id,[]);grid.get(id).push(index);}
    for(const index of points){const a=this.fieldPoints[index].p,cell=a.map(v=>Math.floor(v/cellSize));let linked=0;for(let x=-1;x<=1&&linked<5;x++)for(let y=-1;y<=1&&linked<5;y++)for(let z=-1;z<=1&&linked<5;z++)for(const j of grid.get(key(cell[0]+x,cell[1]+y,cell[2]+z))||[]){if(j<=index)continue;const b=this.fieldPoints[j].p,d=Math.hypot(...a.map((v,k)=>v-b[k]));if(d>cellSize*.16&&d<cellSize*1.25){this.filaments.push({a:index,b:j,c:color,alpha});if(++linked>=5)break;}}}
    if(!volume)for(let branch=0;branch<38;branch++){let p=origin.map(v=>v+normal()*radius*.35),direction=[normal(),normal(),normal()];for(let step=0;step<18;step++){direction=direction.map((v,k)=>v*.76+normal()*.42+(origin[k]-p[k])*.007);const length=Math.hypot(...direction)||1,next=p.map((v,k)=>v+direction[k]/length*2.8),extent=Math.hypot(...next);if(extent>(this.panorama?220:174))for(let k=0;k<3;k++)next[k]*=(this.panorama?220:174)/extent;const a=this.fieldPoints.length;this.fieldPoints.push({p,c:color,bright:false,alpha:alpha*.5},{p:next,c:color,bright:false,alpha:alpha*.5});this.filaments.push({a,b:a+1,c:color,alpha:Math.min(.75,alpha*1.8)});p=next;}}
    this.fieldGroups.push({origin,c:color,r:radius,points});
   };
   addCloud([0,0,0],166,this.panorama?500:1400,[91,135,163],this.panorama?.035:.07,true);
   for(const n of this.nodes.filter(n=>!n.central).slice(0,16)){const c=colors[n.category||n.kind]||colors.cluster;addCloud(n.p,this.panorama?23:19+(n.kind==='cluster'?12:6),320,c,.32);}
   for(const n of this.nodes.filter(n=>!n.central).slice(0,16))for(let strand=0;strand<7;strand++){const bend=[normal()*28,normal()*28,normal()*28],c=colors[n.category||n.kind]||colors.cluster;let prior;for(let step=0;step<=28;step++){const t=step/28,p=n.p.map((v,k)=>v*t+Math.sin(t*Math.PI)*bend[k]+Math.sin(t*24+strand+k)*Math.sin(t*Math.PI)*2.5),index=this.fieldPoints.length;this.fieldPoints.push({p,c,bright:false,alpha:.1});if(prior!==undefined)this.filaments.push({a:prior,b:index,c,alpha:.16});prior=index;}}
   addCloud([0,0,0],16,360,[208,241,255],.58);
   this.host.dataset.decorativeFilaments=String(this.filaments.length);
  }
  paintNeuralField(g,opacity){
   if(!this.fieldPoints)return;const projected=this.fieldPoints.map(v=>this.project(v.p));g.save();g.globalCompositeOperation='lighter';g.lineWidth=.55;
   for(const group of this.fieldGroups){const p=this.project(group.origin),r=group.r*p.scale*3;g.globalAlpha=opacity*(group.r>100?.045:.16);g.drawImage(this.sprite(group.c),p.x-r,p.y-r,r*2,r*2);}
   for(let i=0;i<this.filaments.length;i+=this.quality){const f=this.filaments[i],a=projected[f.a],b=projected[f.b];g.strokeStyle='rgb('+f.c+')';g.globalAlpha=opacity*f.alpha*clamp(1-(a.depth+b.depth)/500,.15,1);g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke();}
   for(let i=0;i<this.fieldPoints.length;i+=this.quality){const n=this.fieldPoints[i],p=projected[i];g.globalAlpha=opacity*n.alpha*(n.bright?1:.55)*clamp(1-p.depth/250,.15,1);g.fillStyle='rgb('+n.c+')';g.fillRect(p.x,p.y,n.bright?1.1:.55,n.bright?1.1:.55);}
   g.restore();
  }
  paintNeuralActivity(g,time){
   if(!this.motion||this.state.mix>.99||!this.filaments?.length)return;g.save();g.globalCompositeOperation='lighter';
   for(let i=0;i<(this.quality===1?34:16);i++){const f=this.filaments[(i*173+37)%this.filaments.length],a=this.fieldPoints[f.a].p,b=this.fieldPoints[f.b].p,t=(time/(1700+i*37)+i*.217)%1,p=this.project(a.map((v,k)=>v+(b[k]-v)*t));g.globalAlpha=(1-this.state.mix)*(.35+.45*Math.sin(t*Math.PI));g.fillStyle='rgb('+f.c+')';g.beginPath();g.arc(p.x,p.y,i%6===0?1.6:.75,0,Math.PI*2);g.fill();if(i%6===0){g.globalAlpha*=.3;g.drawImage(this.sprite(f.c),p.x-10,p.y-10,20,20);}}
   const r=(this.panorama?Math.min(this.width*(this.width<=760?.43:.21),this.viewHeight*(this.width<=760?.31:.25)):Math.min(this.width*(this.width<760?.44:.28),this.viewHeight*.36))*Math.sqrt(this.state.zoom),cx=this.width*.5,cy=this.viewHeight*.52;
   for(let i=0;i<3;i++)for(let j=0;j<12;j++){const angle=time*.00011+i*Math.PI*2/3-j*.012,rad=r-20,p=[cx+Math.cos(angle)*rad,cy+Math.sin(angle)*rad*.97];g.globalAlpha=(1-this.state.mix)*(1-j/12)*.5;g.fillStyle=i===0?'#e0f6f4':i===1?'#a3d7f2':'#d3bbf6';g.beginPath();g.arc(...p,j===0?1.4:.7,0,Math.PI*2);g.fill();}
   g.restore();
  }
  sprite(c){const key=c.join(',');if(this.sprites.has(key))return this.sprites.get(key);const s=document.createElement('canvas');s.width=s.height=64;const g=s.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,`rgba(${key},.95)`);r.addColorStop(.08,`rgba(${key},.7)`);r.addColorStop(.25,`rgba(${key},.22)`);r.addColorStop(1,`rgba(${key},0)`);g.fillStyle=r;g.fillRect(0,0,64,64);this.sprites.set(key,s);return s;}
  cameraPoint(p){let[x,y,z]=p;x-=this.state.x;y-=this.state.y;z-=this.state.z;const{cy,sy,cp,sp}=this.trig,rx=x*cy-z*sy,rz=x*sy+z*cy,ry=y*cp-rz*sp,depth=y*sp+rz*cp;return{x:rx,y:ry,depth,perspective:900/Math.max(120,900+depth)};}
  sceneScale(){return this.panorama?Math.min(this.width/(this.width<=760?520:1320),(this.viewHeight||this.height)/(this.width<=760?640:960)):Math.min(this.width/((this.width<760?430:940)*(1-this.state.mix)+560*this.state.mix),(this.viewHeight||this.height)/520);}
  fitView(){
   this.viewHeight=Math.max(210,this.height-this.state.inset);
   const base=this.sceneScale(),cx=this.width*.5,cy=this.viewHeight*.52,side=Math.min(110,this.width*.2);let fit=1;
   for(const n of this.nodes){const p=this.cameraPoint(n.p.map((v,i)=>v+(n.b[i]-v)*this.state.mix)),x=p.x*p.perspective*base,y=p.y*p.perspective*base;if(x)fit=Math.min(fit,(cx-side)/Math.abs(x));if(y)fit=Math.min(fit,(y<0?cy-114:this.viewHeight-cy-70)/Math.abs(y));}
   if(this.state.mix>.01)for(const point of this.brainBounds){const p=this.cameraPoint(point.map(v=>v*this.state.mix)),x=p.x*p.perspective*base,y=p.y*p.perspective*base;if(x)fit=Math.min(fit,(cx-Math.min(40,this.width*.08))/Math.abs(x));if(y)fit=Math.min(fit,(y<0?cy-110:this.viewHeight-cy-45)/Math.abs(y));}
   this.viewFit=clamp(fit,.15,1);
  }
  project(p){const v=this.cameraPoint(p),scale=v.perspective*this.sceneScale()*this.state.zoom*(this.viewFit||1);return{x:this.width*.5+v.x*scale,y:(this.viewHeight||this.height)*.52+v.y*scale,scale,depth:v.depth};}
  setInset(value){const inset=clamp(value,0,Math.max(0,this.height-230));if(Math.abs(inset-this.state.inset)>.5)this.move({inset});}

  paintBackground(){
   const g=this.cacheContext,w=this.width,h=this.height,s=this.state;g.globalAlpha=1;g.globalCompositeOperation='source-over';g.fillStyle='#050917';g.fillRect(0,0,w,h);
   const sky=g.createRadialGradient(w*.5,this.viewHeight*.52,10,w*.5,this.viewHeight*.52,w*.5);sky.addColorStop(0,'#0a1420');sky.addColorStop(.42,'#050b12');sky.addColorStop(1,'#03060b');g.fillStyle=sky;g.fillRect(0,0,w,h);
   for(const b of this.background){g.globalAlpha=b.a;g.fillStyle='#c7d6f4';g.fillRect(((b.x*w+s.yaw*8)%w+w)%w,((b.y*h+s.pitch*8)%h+h)%h,b.r,b.r);}
   g.globalCompositeOperation='lighter';for(const v of this.haze){const p=this.project(v.p),r=v.r*p.scale;g.globalAlpha=.012*s.mix;g.drawImage(this.sprite(v.c),p.x-r,p.y-r,r*2,r*2);}
   const dots=[];for(let i=0;i<this.dust.length;i+=this.quality){const d=this.dust[i],p=this.project(d.p.map((v,k)=>v+(d.b[k]-v)*s.mix));dots.push({d,p});}dots.sort((a,b)=>b.p.depth-a.p.depth);
   if(s.mix>.01)for(const{d,p}of dots){if(p.x<0||p.x>w||p.y<95||p.y>h)continue;const r=d.size*p.scale;g.globalAlpha=d.alpha*clamp(1-p.depth/700,.15,1)*.32*s.mix;g.fillStyle=d.fill;g.beginPath();g.arc(p.x,p.y,Math.max(.4,r),0,Math.PI*2);g.fill();}
   g.globalAlpha=1;g.globalCompositeOperation='source-over';
   if(s.mix>.01)this.paintBrainHull(g,s.mix);
   if(s.mix<.99){this.paintNeuralField(g,1-s.mix);this.paintAstrolabe(g,1-s.mix);}
  }
  paintAstrolabe(g,opacity){
   // Narrative cartography: open ink orbits carry descriptions, not energy cells.
   const tau=Math.PI*2,cx=this.width*.5,cy=this.viewHeight*.52,r=this.panorama?Math.min(this.width*(this.width<=760?.43:.21),this.viewHeight*(this.width<=760?.31:.25)):Math.min(this.width*(this.width<760?.44:.28),this.viewHeight*.36),radius=r*Math.sqrt(this.state.zoom),aspect=.91;
   g.save();g.globalCompositeOperation='lighter';g.lineWidth=.65;
   for(const[offset,start,end,color]of [[0,-.1,2.55,'#88b9b4'],[9,2.85,5.9,'#b7a2ca'],[20,.35,2.25,'#c8b58e'],[-12,3.25,5.9,'#8da9b4']]){g.globalAlpha=opacity*.25;g.strokeStyle=color;g.beginPath();g.ellipse(cx,cy,radius+offset,(radius+offset)*aspect,-.08,start,end);g.stroke();}
   const fragments=this.nodes.filter(n=>n.kind==='cluster').map(n=>{const item=this.previewGroups?.get(n.category)?.examples?.[0];return n.title+' · '+(item?.title||descriptions[n.category]||'记忆留有来处');});
   const writeArc=(content,start,end,offset,direction=1)=>{g.font=(this.width<760?'8':'10')+'px "Microsoft YaHei",system-ui';const rad=radius+offset;let angle=start;for(const glyph of content){const advance=(g.measureText(glyph).width+2.5)/rad;if(direction===1?angle+advance>end:angle-advance<end)break;const x=cx+Math.cos(angle)*rad,y=cy+Math.sin(angle)*rad*aspect;g.save();g.translate(x,y);let rotation=Math.atan2(Math.cos(angle)*aspect*direction,-Math.sin(angle)*direction);if(rotation>Math.PI/2||rotation<-Math.PI/2)rotation+=Math.PI;g.rotate(rotation);g.globalAlpha=opacity*.62;g.fillStyle='#a9c8c3';g.fillText(glyph,0,0);g.restore();angle+=advance*direction;}};
   writeArc(('星图识海 / '+fragments.join('  ·  ')).slice(0,280),Math.PI+.12,tau-.12,28);writeArc(('相处成海，记忆成岛。  '+fragments.slice().reverse().join('  ·  ')).slice(0,280),Math.PI-.12,.12,34,-1);
   for(let i=0;i<7;i++){const a=i/7*tau+.2,x=cx+Math.cos(a)*(radius+15),y=cy+Math.sin(a)*(radius+15)*aspect;g.globalAlpha=opacity*.45;g.strokeStyle=i%2?'#c6b08d':'#8fbfb6';g.beginPath();g.arc(x,y,2.2,0,tau);g.stroke();}g.restore();
  }
  paintMeteors(g,time){
   if(!this.motion)return;this.meteors=this.meteors.filter(m=>time-m.started<1900);
   if(this.meteorQueue.length&&this.meteors.length<(this.quality===1?5:2)&&time-(this.lastMeteorAt||0)>180){this.meteors.push({...this.meteorQueue.shift(),started:time});this.lastMeteorAt=time;}
   g.save();g.globalCompositeOperation='lighter';g.lineCap='round';
   for(const m of this.meteors){const t=clamp((time-m.started)/1900,0,1),side=hash(m.node)%2?1:-1,path=u=>this.project([m.origin[0]+side*(65*u+140*u*u),m.origin[1]+510*u*u,m.origin[2]+150*u]),head=path(t),tail=path(Math.max(0,t-.18)),color=m.reason==='withdrawn'?'245,169,124':'146,219,230',alpha=Math.sin(Math.PI*t);
    const trail=g.createLinearGradient(tail.x,tail.y,head.x+.01,head.y+.01);trail.addColorStop(0,'rgba('+color+',0)');trail.addColorStop(1,'rgba('+color+','+alpha+')');g.strokeStyle=trail;g.lineWidth=2;g.beginPath();for(let j=0;j<=16;j++){const p=path(Math.max(0,t-.18)+j/16*Math.min(.18,t));if(!j)g.moveTo(p.x,p.y);else g.lineTo(p.x,p.y);}g.stroke();g.globalAlpha=alpha;g.fillStyle='#fff3d8';g.beginPath();g.arc(head.x,head.y,2,0,Math.PI*2);g.fill();g.drawImage(this.sprite(m.reason==='withdrawn'?[245,169,124]:[146,219,230]),head.x-15,head.y-15,30,30);
    for(let i=0;i<3;i++){const p=path(Math.max(0,t-.035*(i+1)));g.globalAlpha=alpha*.5;g.fillRect(p.x+Math.sin(t*24+i)*4,p.y,1.2,1.2);}
   }g.restore();this.host.dataset.activeMeteors=String(this.meteors.length);this.host.dataset.pendingMeteors=String(this.meteorQueue.length);
  }
  brainPoint(side,u,v){
   const cv=Math.cos(v),fold=Math.sin(u*10+2*Math.sin(v*5))*Math.sin(v*9+1.5*Math.sin(u*3)),ridge=1+.055*fold;
   return[side*(5+(94+87*Math.cos(u))*Math.pow(Math.max(0,cv),.7)*ridge),-15+119*Math.sin(v)*(1+.018*fold),116*cv*Math.sin(u)*ridge];
  }
  buildBrain(){
   // Presentation geometry only. It never creates memory nodes or relations.
   const rows=18,cols=48;this.brainVertices=[];this.brainFaces=[];this.brainFolds=[];
   for(const side of [-1,1]){
    const offset=this.brainVertices.length;
    for(let row=0;row<=rows;row++)for(let col=0;col<cols;col++)this.brainVertices.push(this.brainPoint(side,col/cols*Math.PI*2,-Math.PI/2+row/rows*Math.PI));
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
     const a=offset+row*cols+col,b=offset+row*cols+(col+1)%cols,c=a+cols,d=b+cols;
     this.brainFaces.push({ids:[a,b,c],side},{ids:[b,d,c],side});
    }
    for(let row=1;row<14;row++){const points=[];for(let col=0;col<=96;col++){const u=col/96*Math.PI*2,v=-Math.PI/2+row/14*Math.PI+.065*Math.sin(u*5+row*.7)+.025*Math.sin(u*11+row);points.push(this.brainPoint(side,u,clamp(v,-1.53,1.53)));}this.brainFolds.push({points,side,major:row%3===0});}
    for(let col=0;col<16;col++){const points=[];for(let row=1;row<64;row++){const v=-Math.PI/2+row/64*Math.PI,u=col/16*Math.PI*2+.095*Math.sin(v*8+col)+.025*Math.sin(v*17);points.push(this.brainPoint(side,u,v));}this.brainFolds.push({points,side,major:col%4===0});}
   }
   this.brainBounds=[];for(let i=0;i<this.brainVertices.length;i+=11)this.brainBounds.push(this.brainVertices[i]);this.brainBounds.push([-15,181,50],[15,181,50]);
  }
  paintBrainHull(g,opacity){
   const points=this.brainVertices.map(p=>this.project(p)),faces=this.brainFaces.map(f=>({...f,depth:f.ids.reduce((a,i)=>a+points[i].depth,0)/3})).sort((a,b)=>b.depth-a.depth);
   g.save();g.globalCompositeOperation='source-over';
   for(let i=0;i<faces.length;i+=this.quality){const f=faces[i],p=f.ids.map(id=>points[id]),front=clamp(1-f.depth/240,.15,1);g.globalAlpha=opacity*(.07+.1*front);g.fillStyle=f.side<0?'#123748':'#202d51';g.beginPath();g.moveTo(p[0].x,p[0].y);g.lineTo(p[1].x,p[1].y);g.lineTo(p[2].x,p[2].y);g.closePath();g.fill();}
   // Broken, winding surface curves describe cortex folds rather than flat rings.
   g.globalCompositeOperation='lighter';g.lineCap='round';
   for(let i=0;i<this.brainFolds.length;i+=this.quality){const f=this.brainFolds[i],p=f.points.map(v=>this.project(v));g.strokeStyle=f.side<0?'#65c9d3':'#92a6e7';g.lineWidth=f.major?1.15:.65;
    for(let j=1;j<p.length;j++){const depth=(p[j-1].depth+p[j].depth)/2;g.globalAlpha=opacity*(f.major?.56:.32)*clamp(1-depth/140,.08,1);g.beginPath();g.moveTo(p[j-1].x,p[j-1].y);g.lineTo(p[j].x,p[j].y);g.stroke();}
   }
   for(let i=0;i<points.length;i+=this.quality*3){const p=points[i];g.globalAlpha=opacity*.52*clamp(1-p.depth/130,.08,1);g.fillStyle='#b3e6ef';g.beginPath();g.arc(p.x,p.y,Math.max(.4,p.scale*.65),0,Math.PI*2);g.fill();}
   // A narrow, tapered stem makes the front / oblique brain silhouette readable.
   for(const side of [-1,1]){g.globalAlpha=opacity*.38;g.strokeStyle='#8db9d2';g.lineWidth=.85;g.beginPath();for(let j=0;j<=36;j++){const t=j/36,p=this.project([side*(17-10*t)+Math.sin(t*4)*3,92+t*89,42+Math.sin(t*1.7)*22]);if(!j)g.moveTo(p.x,p.y);else g.lineTo(p.x,p.y);}g.stroke();}
   g.restore();
  }
  paintBrainActivity(g,time){
   if(!this.motion||this.state.mix<.01)return;g.save();g.globalCompositeOperation='lighter';
   for(let i=0;i<4;i++){const f=this.brainFolds[5+i*13],t=(time/10500+i*.23)%1,index=t*(f.points.length-1),a=f.points[Math.floor(index)],b=f.points[Math.min(f.points.length-1,Math.floor(index)+1)],p=this.project(a.map((v,k)=>v+(b[k]-v)*(index%1)));g.globalAlpha=this.state.mix*.58;g.fillStyle='#c1f8ff';g.beginPath();g.arc(p.x,p.y,1.3*p.scale,0,Math.PI*2);g.fill();g.globalAlpha=this.state.mix*.2;g.drawImage(this.sprite([125,222,239]),p.x-9,p.y-9,18,18);}
   g.restore();
  }

  paintClouds(g){
   g.save();g.globalCompositeOperation='lighter';
   for(const n of this.nodes){if(!n.mist.length)continue;const pos=this.currentPositions.get(n.id),c=colors[n.category||n.kind]||colors.cluster,p=this.projected.get(n.id),halo=80*p.scale;
    g.globalAlpha=.16*(1-.7*this.state.mix);g.drawImage(this.sprite(c),p.x-halo,p.y-halo,halo*2,halo*2);
    for(const d of n.mist){const v=this.project([pos[0]+d.x,pos[1]+d.y,pos[2]+d.z]);g.globalAlpha=d.a*clamp(1-v.depth/700,.2,1)*(1-.7*this.state.mix);g.fillStyle='rgb('+c+')';g.beginPath();g.arc(v.x,v.y,Math.max(.45,d.r*v.scale),0,Math.PI*2);g.fill();}
   }g.restore();
  }
  paintCompass(g){
   g.save();const x=this.width-43,y=this.height-34;g.lineWidth=.8;g.font='9px ui-monospace,monospace';
   for(const [point,color,label]of [[[22,0,0],'#73b7d6','X'],[[0,-22,0],'#a896d6','Y'],[[0,0,22],'#5faeb2','Z']]){const p=this.cameraPoint(point);g.strokeStyle=color;g.fillStyle=color;g.globalAlpha=.7;g.beginPath();g.moveTo(x,y);g.lineTo(x+p.x,y+p.y);g.stroke();g.fillText(label,x+p.x+3,y+p.y+2);}g.restore();
  }

  orbitPoint(t,r,tilt,offset=0){return[Math.cos(t)*r,Math.sin(t)*r*Math.sin(tilt)+offset,Math.sin(t)*r*Math.cos(tilt)];}
  orbSprite(c){const key='orb:'+c.join(',');if(this.sprites.has(key))return this.sprites.get(key);const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const g=canvas.getContext('2d'),gradient=g.createRadialGradient(22,20,1,32,32,29);gradient.addColorStop(0,'#efffff');gradient.addColorStop(.18,`rgb(${c})`);gradient.addColorStop(.6,`rgba(${c},.8)`);gradient.addColorStop(1,'#071c34');g.fillStyle=gradient;g.beginPath();g.arc(32,32,29,0,Math.PI*2);g.fill();g.strokeStyle=`rgb(${c})`;g.lineWidth=.7;g.stroke();this.sprites.set(key,canvas);return canvas;}
  paintCoreNetwork(g,node,time,r){
   const origin=this.currentPositions.get(node.id),spin=this.motion?time*.00006:0,c=Math.cos(spin),s=Math.sin(spin),points=this.neurons.map(v=>this.project([origin[0]+(v[0]*c-v[2]*s)*r,origin[1]+v[1]*r,origin[2]+(v[0]*s+v[2]*c)*r]));
   g.save();g.globalCompositeOperation='lighter';g.strokeStyle='#9de7f3';g.lineWidth=.55;
   for(const[a,b]of this.neuralLinks){g.globalAlpha=points[a].depth>this.projected.get(node.id).depth?.1:.36;g.beginPath();g.moveTo(points[a].x,points[a].y);g.lineTo(points[b].x,points[b].y);g.stroke();}
   for(const p of points){g.globalAlpha=p.depth>this.projected.get(node.id).depth?.2:.9;g.fillStyle='#b8f7ff';g.beginPath();g.arc(p.x,p.y,Math.max(.55,p.scale*.95),0,Math.PI*2);g.fill();}
   for(const [radius,tilt]of [[r*1.36,.65],[r*1.55,-.65]]){g.globalAlpha=.25;g.lineWidth=.6;g.beginPath();for(let i=0;i<=96;i++){const p=this.orbitPoint(i/96*Math.PI*2,radius,tilt),v=this.project(p.map((v,k)=>v+origin[k]));if(!i)g.moveTo(v.x,v.y);else g.lineTo(v.x,v.y);}g.stroke();}
   g.restore();
  }

  paintOrb(g,node,p,time){
   if(this.state.mix<.5){const c=colors[node.category||node.kind]||colors.cluster,core=node.central,r=core?4:2.2;g.save();g.globalCompositeOperation='lighter';g.globalAlpha=core?.9:.7;g.drawImage(this.sprite(core?[210,243,255]:c),p.x-(core?32:15),p.y-(core?32:15),core?64:30,core?64:30);g.fillStyle=core?'#edfcff':'rgb('+c+')';g.beginPath();g.arc(p.x,p.y,r*p.scale,0,Math.PI*2);g.fill();if(core){g.globalAlpha=.45;g.strokeStyle='#b8edff';g.lineWidth=.6;g.beginPath();g.moveTo(p.x-21,p.y);g.lineTo(p.x+21,p.y);g.moveTo(p.x,p.y-21);g.lineTo(p.x,p.y+21);g.stroke();}g.restore();return;}
   const c=colors[node.category||node.kind]||colors.fact,central=node.central,r=(central?32-12*this.state.mix:node.kind==='subpersona'?13:node.kind==='cluster'?10-4*this.state.mix:5.5)*p.scale,pulse=this.motion?1+.035*Math.sin(time/1400+hash(node.id)%10):1;
   g.save();g.globalCompositeOperation='lighter';g.globalAlpha=(central?.7:.65)*(central||node.kind==='cluster'?1:.35+.65*clamp(Number(node.activation)||0,.12,1));const glow=r*(central?4:4.5)*pulse;g.drawImage(this.sprite(c),p.x-glow,p.y-glow,glow*2,glow*2);
   g.globalCompositeOperation='source-over';g.globalAlpha=clamp(1-p.depth/800,.3,1)*(central||node.kind==='cluster'?1:.45+.55*clamp(Number(node.activation)||0,.12,1));
   if(!central){g.drawImage(this.orbSprite(c),p.x-r,p.y-r,r*2,r*2);if(node.kind==='cluster'&&this.state.mix<.5){g.strokeStyle='rgba('+c+',.5)';g.lineWidth=.6;g.beginPath();g.ellipse(p.x,p.y,r*1.7,r*.58,-.6,0,Math.PI*2);g.stroke();}g.restore();return;}
   const sphere=g.createRadialGradient(p.x-r*.3,p.y-r*.35,0,p.x,p.y,r);sphere.addColorStop(0,'#38758c');sphere.addColorStop(.65,'#13374f');sphere.addColorStop(1,'#07182a');g.fillStyle=sphere;g.beginPath();g.arc(p.x,p.y,r,0,Math.PI*2);g.fill();g.globalCompositeOperation='lighter';g.strokeStyle='#74d9eb';g.globalAlpha=.7;g.lineWidth=.8;g.stroke();g.restore();this.paintCoreNetwork(g,node,time,32-12*this.state.mix);
  }

  draw(time){
   if(!this.ctx||!this.active||!this.width)return;const start=performance.now(),g=this.ctx,w=this.width,h=this.height,s=this.state;
   this.trig={cy:Math.cos(s.yaw),sy:Math.sin(s.yaw),cp:Math.cos(s.pitch),sp:Math.sin(s.pitch)};
   this.fitView();
   const key=[w,h,...Object.values(s).map(v=>Math.round(v*10000)),Math.round(this.viewFit*10000),this.quality].join(':');if(key!==this.backgroundKey){this.paintBackground();this.backgroundKey=key;}
   g.globalAlpha=1;g.globalCompositeOperation='source-over';g.drawImage(this.cache,0,0,w,h);this.projected.clear();
   for(const n of this.nodes){const pos=this.position(n,time);this.currentPositions.set(n.id,pos);this.projected.set(n.id,this.project(pos));}
   this.paintBrainActivity(g,time);this.paintNeuralActivity(g,time);if(s.mix>.5)this.paintClouds(g);
   const focus=this.hovered||this.selected,traceActive=time<(this.traceUntil||0),traceEdgeKey=e=>[...[e.a,e.b].sort(),e.kind].join('|');
   for(let i=0;i<this.edges.length;i++){
    const e=this.edges[i],a=this.currentPositions.get(e.a),b=this.currentPositions.get(e.b);if(!a||!b)continue;
    const trace=traceActive&&this.traceEdges?.has(traceEdgeKey(e)),crowded=this.edges.length>30,highlighted=trace||(e.a===focus||e.b===focus)&&(!crowded||!!this.hovered),structural=e.kind==='category'||e.kind==='contains',bend=35+(i%3)*14,control=a.map((v,k)=>(v+b[k])/2+(k===1?-bend:k===2?bend:0)),curve=t=>this.project(a.map((v,k)=>(1-t)**2*v+2*(1-t)*t*control[k]+t*t*b[k]));
    g.globalAlpha=highlighted?.7:crowded?.12:structural?.4:.35;g.strokeStyle=trace?'#9df0d4':e.kind==='subpersona'?'#c6a1f3':e.kind.startsWith('kinship:')?'#d8bd86':highlighted?'#9adce9':'#6f91b8';g.lineWidth=trace?1.7:highlighted?1.05:.65;g.setLineDash(structural?[2,6]:e.kind==='corrects'?[7,4]:[]);g.beginPath();for(let j=0;j<=24;j++){const p=curve(j/24);if(!j)g.moveTo(p.x,p.y);else g.lineTo(p.x,p.y);}g.stroke();g.setLineDash([]);
    if(this.motion&&this.edges.length<=80){const p=curve((time/(trace?2600:4800)+i*.193)%1);g.globalCompositeOperation='lighter';g.globalAlpha=highlighted?.9:.55;const size=highlighted?2:1.2;g.fillStyle='#cefbff';g.beginPath();g.arc(p.x,p.y,size,0,Math.PI*2);g.fill();g.globalAlpha=.3;g.drawImage(this.sprite([115,223,244]),p.x-10,p.y-10,20,20);g.globalCompositeOperation='source-over';}
    if(highlighted&&!structural&&this.edges.length<20&&(s.mix>.5||this.hovered)){const p=curve(.5);g.globalAlpha=.65;g.font='11px system-ui';g.fillStyle='#a9c1d4';g.textAlign='center';g.fillText(relations[e.kind]||(e.kind.startsWith('kinship:')?e.kind.slice(8):'关联'),p.x,p.y-7);}
   }

   for(const n of this.nodes.slice().sort((a,b)=>this.projected.get(b.id).depth-this.projected.get(a.id).depth))this.paintOrb(g,n,this.projected.get(n.id),time);
   const boxes=[],ordered=this.nodes.slice().sort((a,b)=>Number(b.id===this.selected)-Number(a.id===this.selected)||(b.importance||0)-(a.importance||0));let shown=0;
   for(const n of ordered){
    const p=this.projected.get(n.id),selected=n.id===this.selected,hover=n.id===this.hovered;
    if(traceActive&&this.traceHits?.has(n.id)){const rank=this.traceHits.get(n.id),phase=this.motion?(time/1600-rank*.16)%1:0;g.globalCompositeOperation='lighter';g.globalAlpha=this.motion?.35+.35*Math.max(0,Math.sin(phase*Math.PI*2)):.65;g.strokeStyle='#adf1d9';g.lineWidth=1.2;g.beginPath();g.arc(p.x,p.y,(17+(this.motion?phase*8:0))*p.scale,0,Math.PI*2);g.stroke();}
    if(hover&&!n.central){g.globalAlpha=.65;g.strokeStyle='#a9eaff';g.lineWidth=.7;g.beginPath();g.arc(p.x,p.y,18*p.scale,0,Math.PI*2);g.stroke();}
    g.globalCompositeOperation='source-over';const button=this.labels.get(n.id),bw=Math.min(184,Math.max(132,n.title.length*12+28));let box=null;
    for(const shift of (n.central?[52,-94,82,-125,110,-155]:[20,-67,48,-96,78,-126,108,-156])){const candidate={x:clamp(p.x-bw/2,8,w-bw-8),y:p.y+shift,w:bw,h:45};if(candidate.y<95||candidate.y+candidate.h>this.viewHeight-28)continue;const coversNode=[...this.projected].some(([id,v])=>id!==n.id&&v.x>candidate.x-8&&v.x<candidate.x+candidate.w+8&&v.y>candidate.y-10&&v.y<candidate.y+candidate.h+10);if(!coversNode&&!boxes.some(v=>candidate.x<v.x+v.w+6&&candidate.x+candidate.w+6>v.x&&candidate.y<v.y+v.h+4&&candidate.y+candidate.h+4>v.y)){box=candidate;break;}}
    button.hidden=!box||shown>=this.labelLimit&&n.id!==focus||s.mix<.5&&!n.central&&!hover&&!selected;if(!button.hidden){boxes.push(box);shown++;button.style.left=box.x+'px';button.style.top=box.y+'px';button.style.width=bw+'px';button.style.opacity=String(p.depth>100?.78:1);button.setAttribute('aria-pressed',String(selected));button.classList.toggle('is-hovered',hover);g.strokeStyle='#70b9d4';g.globalAlpha=.28;g.lineWidth=.6;g.beginPath();const endY=box.y>p.y?box.y:box.y+box.h;g.moveTo(p.x,p.y+(endY>p.y?10:-10)*p.scale);g.lineTo(clamp(p.x,box.x+12,box.x+box.w-12),endY);g.stroke();}
   }
   this.paintMeteors(g,time);this.paintCompass(g);g.globalAlpha=1;g.setLineDash([]);this.host.dataset.visibleLabels=String(shown);this.updateTip();
   if(performance.now()-start>45&&this.quality===1){this.slow=(this.slow||0)+1;if(this.slow>3){this.quality=2;this.backgroundKey='';}}
  }
  request(){if(this.frame||!this.active)return;this.frame=requestAnimationFrame(time=>{this.frame=0;const transition=time<(this.transitionStart||0)+(this.transitionDuration||0);if(time-this.lastFrame>=40||!this.motion){this.draw(time);this.lastFrame=time;}if(this.motion||transition)this.request();});}
  move(target,animate=true){target={...this.pendingTarget,...target};this.pendingTarget=target;const id=++this.animation,from={...this.state},start=performance.now(),duration=animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches?600:0;const tick=t=>{if(id!==this.animation||!this.active)return;const f=duration?clamp((t-start)/duration,0,1):1;for(const k of Object.keys(target))this.state[k]=f===1?target[k]:from[k]+(target[k]-from[k])*ease(f);this.backgroundKey='';this.request();if(f<1)requestAnimationFrame(tick);else this.pendingTarget=null;};requestAnimationFrame(tick);}
  focus(id){if(!this.nodes.some(n=>n.id===id))return;this.selected=id;this.hovered='';this.hideTip();this.request();}
  mode(value){this.layout=value;this.panorama=this.overview&&value!=='brain';this.host.dataset.layout=value;this.host.dataset.panorama=String(this.panorama);this.renderInstruments();this.resize();this.move({mix:value==='brain'?1:0,pitch:value==='brain'?-.12:.2,yaw:value==='brain'?-.32:-.16,x:0,y:0,z:0,zoom:value==='brain'?1.05:1});}
  home(animate=true){this.move({x:0,y:0,z:0,yaw:this.layout==='brain'?-.32:-.16,pitch:this.layout==='brain'?-.12:.2,zoom:this.layout==='brain'?1.05:1,mix:this.layout==='brain'?1:0},animate);}
  zoom(factor){this.move({zoom:clamp(this.state.zoom*factor,.55,2.2)});}
  hover(id){if(id===this.hovered)return;this.hovered=id;if(!id)this.hideTip();else this.updateTip();this.request();}
  hideTip(){if(this.tip)this.tip.hidden=true;}
  updateTip(){const n=this.nodes.find(n=>n.id===this.hovered),p=n&&this.projected.get(n.id);if(!n||!p){this.hideTip();return;}this.tip.querySelector('b').textContent=n.title;this.tip.querySelector('span').textContent=n.kind==='cluster'?'包含 '+n.count+' 条记忆':(n.summary||'点击查看完整内容与关联').slice(0,76);this.tip.querySelector('small').textContent=n.kind==='cluster'?'点击展开这个分类':(kinds[n.kind]||'记忆')+(stages[n.stage]?' · '+stages[n.stage]:'')+' · 点击查看来源和关系';this.tip.hidden=false;this.tip.style.left=clamp(p.x+20,10,Math.max(10,this.width-240))+'px';this.tip.style.top=clamp(p.y-95,10,Math.max(10,this.height-125))+'px';}
  resize(){this.width=this.host.clientWidth;this.height=this.panorama&&this.width<=760?570:this.host.clientHeight;if(this.layoutWidth!==this.width){this.layoutWidth=this.width;this.queueIslandLayout();}const ratio=Math.min(devicePixelRatio||1,1.5);this.canvas.width=this.cache.width=Math.max(1,Math.round(this.width*ratio));this.canvas.height=this.cache.height=Math.max(1,Math.round(this.height*ratio));this.ctx?.setTransform(ratio,0,0,ratio,0,0);this.cacheContext?.setTransform(ratio,0,0,ratio,0,0);this.backgroundKey='';this.lastFrame=0;this.request();}
  bind(){
   const pointers=new Map();let start=null,pinch=null,moved=false;
   this.canvas.addEventListener('pointerdown',e=>{e.preventDefault();this.animation++;this.pendingTarget=null;this.hideTip();this.canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1){start={x:e.clientX,y:e.clientY,yaw:this.state.yaw,pitch:this.state.pitch};moved=false;}else if(pointers.size===2){const[a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:this.state.zoom};}});
   this.canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId)){const r=this.canvas.getBoundingClientRect();let id='',best=22;for(const[k,p]of this.projected){const d=Math.hypot(e.clientX-r.left-p.x,e.clientY-r.top-p.y);if(d<best){best=d;id=k;}}this.hover(id);this.canvas.style.cursor=id?'pointer':'grab';return;}
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pinch&&pointers.size===2){const[a,b]=[...pointers.values()];this.state.zoom=clamp(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.distance),.55,2.2);moved=true;}else if(start){const dx=e.clientX-start.x,dy=e.clientY-start.y;this.state.yaw=start.yaw+dx*.003;this.state.pitch=clamp(start.pitch+dy*.003,-1.05,1.05);moved||=Math.hypot(dx,dy)>4;}this.backgroundKey='';this.request();
   });
   this.canvas.addEventListener('pointerup',e=>{pointers.delete(e.pointerId);if(!moved){const r=this.canvas.getBoundingClientRect();let closest=null,best=28;for(const[id,p]of this.projected){const d=Math.hypot(e.clientX-r.left-p.x,e.clientY-r.top-p.y);if(d<best){best=d;closest=id;}}if(closest)this.onSelect(this.nodes.find(n=>n.id===closest));}start=null;pinch=null;});
   this.canvas.addEventListener('pointerleave',()=>{if(!pointers.size)this.hover('');});this.canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);start=null;pinch=null;});
   this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.animation++;this.pendingTarget=null;this.state.zoom=clamp(this.state.zoom*Math.exp(-e.deltaY*.001),.55,2.2);this.backgroundKey='';this.request();},{passive:false});
  }
  close(){clearTimeout(this.traceTimer);this.animation++;this.active=false;cancelAnimationFrame(this.frame);cancelAnimationFrame(this.ledgerFrame);this.resizeObserver?.disconnect();this.intersectionObserver?.disconnect();document.removeEventListener('visibilitychange',this.visibility);}
 }
 window.OceanScene=OceanScene;
})();

