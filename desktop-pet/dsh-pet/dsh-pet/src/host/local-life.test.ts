import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLifeCommand, localLife, localEmotion, closeLocalEmotion, localWork } from './local-life.ts';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

test('desktop uses the existing suite state engine and records only actual user input', async () => {
  const temp=mkdtempSync(join(tmpdir(),'pet-emotion-'));
  let shared: { close(): void } | undefined;
  try {
    const bridge=join(temp,'bridge'),pet=join(temp,'pet');
    mkdirSync(join(bridge,'src'),{recursive:true});mkdirSync(join(bridge,'state'));mkdirSync(pet);
    writeFileSync(join(temp,'package.json'),'{"type":"module"}');
    writeFileSync(join(bridge,'src/emotional-companion.js'),readFileSync(new URL('../../../../../qq-bridge/src/emotional-companion.js',import.meta.url)));
    writeFileSync(join(bridge,'state/current-role.json'),'{"role":"测试角色"}');
    writeFileSync(join(bridge,'config.json'),'{"ownerQQ":10001}');
    writeFileSync(join(pet,'local-integrations.json'),JSON.stringify({companionTokenFile:join(bridge,'companion/companion-token')}));
    const first=await localEmotion(pet,'main','我喜欢茉莉花茶');
    assert(first?.context.includes('我喜欢茉莉花茶'));
    const again=await localEmotion(pet,'main');assert(again?.context.includes('我喜欢茉莉花茶'));
    const other=await localEmotion(pet,'other');assert(!other?.context.includes('我喜欢茉莉花茶'));
    const module=await import(pathToFileURL(join(bridge,'src/emotional-companion.js')).href);
    const engine=module.createEmotionalCompanion({file:join(bridge,'state/emotional-companion.sqlite'),role:()=> '测试角色',ownerQQ:()=>10001});shared=engine;
    engine.workAction('start');await localEmotion(pet,'main','我正在修复界面问题');
    assert(engine.workState().tasks.some((t: { text: string })=>t.text==='修复界面问题'));
    engine.incoming('private:10001',{text:'我已经完成了整理教程',id:'qq'});
    assert((await localEmotion(pet,'main'))?.context.includes('整理教程'));
  } finally {closeLocalEmotion();shared?.close();assert(temp.startsWith(join(tmpdir(),'pet-emotion-')));rmSync(temp,{recursive:true,force:true});}
});
test('only explicit raw user commands enter the life service', async () => {
  assert(isLifeCommand('开启工作模式'));assert(isLifeCommand('工作任务：整理教程'));
  assert(!isLifeCommand('工作日报是什么'));assert(!isLifeCommand('你能开启工作模式吗'));
  assert(isLifeCommand('写日记：今天天气好'));
  assert(isLifeCommand('给第1条点赞'));
  assert(isLifeCommand('逛空间 12345678'));
  assert(isLifeCommand('发说说：今天很开心'));
  assert(!isLifeCommand('你可以帮我写日记吗'));
  assert(!isLifeCommand('我刚才说了“发说说：你好”'));
  assert(!isLifeCommand('把 QQ 回复读出来'));
  let calls = 0;
  assert.equal(await localLife('unused', '你好', async () => { calls++; return new Response(); }), undefined);
  assert.equal(calls, 0);
});

test('desktop work controls forward to the existing authenticated owner backend without a model', async () => {
  const temp=mkdtempSync(join(tmpdir(),'pet-work-link-'));
  try{
    const bridge=join(temp,'bridge'),pet=join(temp,'pet');mkdirSync(join(bridge,'companion'),{recursive:true});mkdirSync(pet);
    writeFileSync(join(pet,'local-integrations.json'),JSON.stringify({companionTokenFile:join(bridge,'companion/companion-token')}));
    writeFileSync(join(bridge,'config.json'),JSON.stringify({consolePort:3100,consoleToken:'work-fixture-token'}));
    let calls=0;
    const request: typeof fetch=async(url,options)=>{
      calls++;assert.equal(url,'http://127.0.0.1:3100/api/work-companion');assert.equal(new Headers(options?.headers).get('X-Console-Token'),'work-fixture-token');
      if(options?.body){const body=JSON.parse(String(options.body));assert.equal(body.source,'desktop');assert.equal(body.action,'command');assert.equal(body.input.text,'开启工作模式');}
      return new Response(JSON.stringify({ok:true,text:'工作模式已开启',work:{active:true}}));
    };
    const result=await localLife(pet,'开启工作模式',request);assert.equal(result?.text,'工作模式已开启');
    await localWork(pet,undefined,request);assert.equal(calls,2);
  }finally{assert(temp.startsWith(join(tmpdir(),'pet-work-link-')));rmSync(temp,{recursive:true,force:true});}
});

test('creative commands go directly to the local robot with original text and private credentials', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'pet-creative-life-'));
  try {
    const bridge = join(temp, 'bridge'), pet = join(temp, 'pet');
    mkdirSync(join(bridge, 'companion'), { recursive: true }); mkdirSync(pet);
    writeFileSync(join(pet, 'local-integrations.json'), JSON.stringify({ companionTokenFile: join(bridge, 'companion/companion-token') }));
    writeFileSync(join(bridge, 'config.json'), JSON.stringify({ consolePort: 3100, consoleToken: 'fixture-only-token' }));
    assert(isLifeCommand('画图 一只猫')); assert(isLifeCommand('#跑团 开场')); assert(!isLifeCommand('你会画图吗'));
    const result = await localLife(pet, '画图 一只猫', async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:3100/api/creative/desktop-request');
      assert.equal(new Headers(options?.headers).get('X-Console-Token'), 'fixture-only-token');
      assert.deepEqual(JSON.parse(String(options?.body)), { text: '画图 一只猫' });
      return new Response(JSON.stringify({ ok: true, text: '画好了。', image: 'http://127.0.0.1:3100/creative-media/test/image' }));
    });
    assert.equal(result?.text, '画好了。'); assert(result?.image);
  } finally { assert(temp.startsWith(join(tmpdir(), 'pet-creative-life-'))); rmSync(temp, { recursive: true, force: true }); }
});
