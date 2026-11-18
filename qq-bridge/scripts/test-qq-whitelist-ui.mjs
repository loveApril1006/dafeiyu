import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import {validScope} from '../src/creative-store.js';
assert.equal(validScope('private:12345678'),'private:12345678');assert.equal(validScope('group:123456789'),'group:123456789');assert.throws(()=>validScope('private:9999999999999999'));assert.throws(()=>validScope('private:12'));
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.style={};this.dataset={};this.value='';this.textContent='';}
 append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[...items];}add(value){this.children.push(value);}
 querySelectorAll(tag){return this.children.flatMap(e=>e instanceof Element?[...(e.tag===tag?[e]:[]),...e.querySelectorAll(tag)]:[]);}
}
const nodes=new Map();const el=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
let calls=0,snapshot={ok:true,active:true,contacts:[{id:'800000000001',kind:'private',label:'本人',lastMessagePreview:'在不在'},{id:'800000000002',kind:'group',label:'官方群聊'}]};
const source=fs.readFileSync(new URL('../public/console/official-qq.js',import.meta.url),'utf8').split('let officialQQBusy')[0];
const context=vm.createContext({document:{getElementById:el,createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})},Option:class extends Element{constructor(label,value){super('option');this.textContent=label;this.value=value;}},api:async()=>{calls++;return snapshot;}});
vm.runInContext(source,context);
const acl={transport:'official',allow:{private:[],groups:[]},deny:{private:[],groups:[]},ownerQQ:null};
await context.renderQQWhitelist(acl);assert(el('wlNumberFields').hidden);assert.equal(el('wlOfficialControls').hidden,false);assert.equal(el('wlSave').disabled,false);
const inputs=el('wlOfficialRows').querySelectorAll('input');assert.equal(inputs.length,4);inputs[0].checked=true;inputs[0].onchange();assert.equal(el('wlPrivate').value,'800000000001');inputs[3].checked=true;inputs[3].onchange();assert.equal(el('dnGroups').value,'800000000002');
assert.equal(el('wlOfficialOwner').children.length,2,'group identity must never appear in private administrator options');el('wlOfficialOwner').value='800000000001';el('wlOfficialOwner').onchange();assert.equal(el('ownerQQ').value,'800000000001');assert.equal(inputs[0].checked,true);
el('wlOfficialOwner').value='';el('wlOfficialOwner').onchange();assert.equal(el('ownerQQ').value,'');
snapshot={ok:true,active:false,contacts:[]};await context.renderQQWhitelist(acl);assert(el('wlSave').disabled,'pending mode/app change must block an accidental ACL write');
const previousCalls=calls;await context.renderQQWhitelist({...acl,transport:'onebot'});assert.equal(el('wlNumberFields').hidden,false);assert(el('wlOfficialControls').hidden);assert.equal(el('wlSave').disabled,false);assert.equal(calls,previousCalls,'OneBot must not read official identities');
const html=fs.readFileSync(new URL('../public/console.html',import.meta.url),'utf8');for(const id of nodes.keys())assert(html.includes('id="'+id+'"'),'missing real HTML control '+id);
console.log('PASS official whitelist picker/check boxes/private-admin selection; OneBot number form remains independent; pending settings disable saves; no automatic identity linking, administrator grants or QQ sends');
