import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {inspectVideo} from '../integrations/douyin-publish-upstream/lib/video.js';
import {mixBgm} from '../integrations/douyin-publish-upstream/lib/bgm.js';
import {uploadVideo} from '../integrations/douyin-publish-upstream/lib/pipeline.js';
const base=path.resolve('state/douyin-ui-check');fs.mkdirSync(base,{recursive:true});const temp=fs.mkdtempSync(path.join(base,'media-'));
const ffmpeg=path.resolve('bin/ffmpeg.exe'),ffprobe=path.resolve('integrations/douyin-standalone/node_modules/@ffprobe-installer/win32-x64/ffprobe.exe');
try{
  const video=path.join(temp,'synthetic.mp4'),bgm=path.join(temp,'synthetic.wav');
  execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=15:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',video],{windowsHide:true});
  execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=660:duration=1',bgm],{windowsHide:true});
  const info=await inspectVideo(video,{ffprobe});assert.equal(info.width,160);assert.equal(info.height,90);assert(info.durationSec>=0.9);
  const mix=await mixBgm({videoPath:video,bgmPath:bgm,ffmpeg,ffprobe,volume:0.2,tmpDir:temp});assert(mix.ok);assert(mix.videoHadAudio);assert(fs.existsSync(mix.outputPath));
  const check=await uploadVideo({videoPath:video,bgmPath:bgm,bgmVolume:0.2,coverTime:0.5,topics:'测试,配乐',visibility:'private',dryRun:true},{ffprobe,browser:{open(){throw Error('Dry run must never open the browser');}}});
  assert(check.ok);assert.equal(check.plan.willPublish,false);assert.equal(check.plan.coverTime,0.5);assert.deepEqual(check.plan.topics,['测试','配乐']);
  console.log('PASS actual FFprobe video metadata, FFmpeg mixing with existing audio retained, original publisher dry run with cover/music/topics; synthetic local media only, no uploads.');
}finally{assert(path.resolve(temp).startsWith(base+path.sep));fs.rmSync(temp,{recursive:true,force:true});}
