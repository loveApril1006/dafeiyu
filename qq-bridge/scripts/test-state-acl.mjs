import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {collectAclTargets,hardenDir,hardenFile,isHardened,icacls} from '../src/state-acl.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'qq-acl-'));
try{
  const data=path.join(temp,'data'),external=path.join(temp,'runtime');
  fs.mkdirSync(data);fs.mkdirSync(external);
  const config=path.join(data,'config.json');fs.writeFileSync(config,'original-private-config');
  fs.writeFileSync(path.join(external,'untouched'),'runtime');
  fs.symlinkSync(external,path.join(data,'.venv'),process.platform==='win32'?'junction':'dir');
  const before=process.platform==='win32'?icacls([external]).stdout:null;
  assert.equal(collectAclTargets(data).length,2,'must not enumerate junction or its runtime');
  const hardened=hardenDir(data);assert(hardened.ok,hardened.detail);assert(isHardened(data));
  assert.equal(fs.readFileSync(config,'utf8'),'original-private-config');
  if(process.platform==='win32'){
    assert(isHardened(config),'existing files must be protected too');
    assert.equal(icacls([external]).stdout,before,'junction target ACL must remain unchanged');
    assert.equal(icacls([config,'/grant','*S-1-1-0:R']).status,0);
    assert.equal(isHardened(config),false,'explicit broad read grant must be detected');
    assert(hardenFile(config).ok);assert(isHardened(config));
  }
  assert.equal(hardenDir(path.join(data,'.venv')).ok,false);
  console.log('PASS ACL: excludes junctions, preserves configuration, verifies actual permissions, detects/removes broad grants; runtime ACL unchanged');
}finally{
  assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));
  fs.rmSync(temp,{recursive:true,force:true});
}

