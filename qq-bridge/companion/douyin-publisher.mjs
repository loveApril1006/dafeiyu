import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {uploadVideo} from '../integrations/douyin-publish-upstream/lib/pipeline.js';
import {validateInput,VIDEO_EXTENSIONS,AUDIO_EXTENSIONS} from '../integrations/douyin-publish-upstream/lib/plan.js';
import {listBgm} from '../integrations/douyin-publish-upstream/lib/bgm-library.js';

export function publisherBrowser(controller) {
  let page;
  const locator=target=>target.by==='css'?page.locator(target.value).first():page.getByText(target.value,{exact:true}).first();
  return {
    async open(){await controller.openBrowser({signal:AbortSignal.timeout(75000)});await controller.connectExistingBrowser();const context=controller.browser?.contexts()[0];if(!context)throw Error('请先打开并登录专用抖音浏览器');page=await context.newPage();return 'robot-douyin-publish';},
    async openUrl(_s,{url}){if(!['https://creator.douyin.com','https://member.bilibili.com'].includes(new URL(url).origin))throw Error('发布只允许已支持的创作者中心');await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});return{ok:true};},
    async execute(_s,{script}){if(!['https://creator.douyin.com','https://member.bilibili.com'].includes(new URL(page.url()).origin))throw Error('投稿页面已离开创作者中心');return {ok:true,value:await page.evaluate(script=>new Function(script)(),script)};},
    async click(_s,{target}){await locator(target).click();return{ok:true};},
    async setValue(_s,{target,value}){await locator(target).fill(value);return{ok:true};},
    async clearField(_s,{target}){await locator(target).fill('');return{ok:true};},
    async type(_s,{target,text}){if(target)await locator(target).pressSequentially(text);else await page.keyboard.type(text);return{ok:true};},
    async key(_s,{key}){await page.keyboard.press(key);return{ok:true};}
  };
}
export function makeDouyinPublisher({home,controller,stopWatch,upload=uploadVideo}) {
  const file=path.join(home,'publishing.json');let busy=false;
  const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const ffmpeg=path.join(project,'bin/ffmpeg.exe'),ffprobe=path.join(project,'integrations/douyin-standalone/node_modules/@ffprobe-installer/win32-x64/ffprobe.exe');
  const dependencies=()=>({browser:publisherBrowser(controller),...(fs.existsSync(ffmpeg)?{ffmpeg}:{}),...(fs.existsSync(ffprobe)?{ffprobe}:{}),tmpDir:path.join(home,'publish-media')});
  const read=()=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw Error('发布记录损坏，请先检查原文件');}};
  const write=rows=>{fs.writeFileSync(file+'.tmp',JSON.stringify(rows,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);};
  const hashFile=async file=>{const hash=createHash('sha256');for await(const part of fs.createReadStream(file))hash.update(part);return hash.digest('hex');};
  function inputs(input) {
    const videoPath=String(input.videoPath||'').trim(),title=String(input.title||'').trim(),description=String(input.description||'').trim();
    if(!path.isAbsolute(videoPath)||!fs.existsSync(videoPath)||!fs.statSync(videoPath).isFile()||!VIDEO_EXTENSIONS.includes(path.extname(videoPath).toLowerCase()))throw Error('请选择存在的本地视频文件绝对路径');
    if(!title||title.length>30||description.length>1000)throw Error('标题1～30字，文案最多1000字');
    if(!['public','friends','private'].includes(input.visibility))throw Error('请选择作品可见范围');
    const options={videoPath:fs.realpathSync(videoPath),title,description,visibility:input.visibility,platform:input.platform||'douyin',topics:String(input.topics||'').split(/[,，\n]/).map(s=>s.trim()).filter(Boolean).slice(0,10).join(',')};
    for(const name of ['coverTime','bgmVolume','timeoutSec','maxInjectBytes'])if(input[name]!==undefined)options[name]=input[name];
    if(input.bgmPath){const bgm=String(input.bgmPath).trim();if(!path.isAbsolute(bgm)||!fs.existsSync(bgm)||!fs.statSync(bgm).isFile()||!AUDIO_EXTENSIONS.includes(path.extname(bgm).toLowerCase()))throw Error('配乐必须是存在的本地音频文件');options.bgmPath=fs.realpathSync(bgm);}
    options.pickMusic=input.pickMusic===true;options.musicSearch=String(input.musicSearch||'').trim().slice(0,120);
    const errors=validateInput(options);if(errors.length)throw Error(errors.join('；'));
    if(options.timeoutSec>240)throw Error('上传等待时间最多240秒');
    if(options.platform==='bilibili'&&options.visibility==='friends')throw Error('B站不支持好友可见，请选择公开或仅自己可见');
    return options;
  }
  return {history:()=>read().slice(-30).reverse(), async request(action,input={}) {
    if(busy)throw Error('上一条发布操作尚未结束');
    busy=true;
    try{
      if(action==='publish-library'){const dir=path.join(home,'bgm');fs.mkdirSync(dir,{recursive:true});return{ok:true,dir,tracks:listBgm({bgmDir:dir})};}
      if(action==='publish-prepare') {
        const options=inputs(input);const check=await upload({...options,dryRun:true},dependencies());
        if(!check.ok)throw Error(check.error||'视频预检失败');
        const row={id:randomUUID(),options,fileSize:fs.statSync(options.videoPath).size,fileHash:await hashFile(options.videoPath),...(options.bgmPath?{bgmHash:await hashFile(options.bgmPath)}:{}),check,at:new Date().toISOString(),state:'prepared'};
        write([...read(),row].slice(-100));return {ok:true,draft:row,check};
      }
      if(!['publish-upload','publish-submit'].includes(action))throw Error('未知投稿操作');
      const rows=read(),row=rows.find(r=>r.id===input.id);if(!row||!['prepared','uploaded'].includes(row.state))throw Error('该发布任务不存在或结果需核对，未重复发送');
      if(Date.now()-Date.parse(row.at)>3600000)throw Error('预检超过一小时，请重新准备');
      if(await hashFile(row.options.videoPath)!==row.fileHash)throw Error('视频文件发生变化，请重新预检');
      if(row.options.bgmPath&&await hashFile(row.options.bgmPath)!==row.bgmHash)throw Error('配乐文件发生变化，请重新预检');
      if(row.options.bgmPath){if(!fs.existsSync(ffmpeg)||!fs.existsSync(ffprobe))throw Error('本地混音组件未安装完整，请修复抖音发布依赖');fs.mkdirSync(path.join(home,'publish-media'),{recursive:true});}
      if(action==='publish-submit'&&input.confirm!==true)throw Error('请明确确认发布这条作品');
      await stopWatch();
      row.state='sending';write(rows);
      try {
        const result=await upload({...row.options,mode:action==='publish-submit'?'publish':'draft'},dependencies());
        row.result=result;row.state=result.ok?(action==='publish-submit'?'submitted':'uploaded'):'uncertain';write(rows);
        return {ok:result.ok,draft:row,message:result.ok?(row.state==='submitted'?'已点击发布，请在抖音作品管理核对最终结果；不会自动重发':'视频已上传并填写，停在发布前'): '投稿未确认成功，请在浏览器核对，未自动重试',result};
      } catch(error){row.state='uncertain';row.error='投稿中断，请在抖音创作者中心检查实际结果';write(rows);throw Error(row.error);}
    } finally {busy=false;}
  }};
}
