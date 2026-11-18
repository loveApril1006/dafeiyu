// Shared ACL hardening for runtime, credential files and installer finalization.
// Never recurse with icacls /T: Python runtime junctions must stay untouched.
// Grant the current account SID before removing inherited access, then verify
// actual ACLs using language-independent SID identities, not console text.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import { spawnSync } from 'node:child_process';

// Authenticated Users=S-1-5-11, BUILTIN\Users=S-1-5-32-545, Everyone=S-1-1-0
const PERMISSIVE_SIDS = ['*S-1-5-11', '*S-1-5-32-545', '*S-1-1-0'];

/** icacls 的可执行封装（统一超时与隐藏窗口）。 */
export function icacls(args, timeout = 30000) {
  return spawnSync('icacls', args, { encoding: 'utf8', timeout, windowsHide: true, maxBuffer:64*1024*1024 });
}

/**
 * icacls 输出里是否还有**继承来的权限** ACE。
 *
 * 必须排除 Mandatory Label 行：那不是权限，而且 DSH 沙箱打过 Low 标签后它永远带 (I)。
 * 用全文 `/\(I\)/` 扫描会把「已收紧」判成「未收紧」，进而让调用方反复重跑破坏性命令。
 */
export function hasInheritedPermissionAce(icaclsOutput) {
  return String(icaclsOutput ?? '')
    .split(/\r?\n/)
    .filter((line) => !/Mandatory Label/i.test(line))
    .some((line) => /\(I\)/.test(line));
}

/** 是否还有本机任意用户可读的宽松主体授权。 */
export function hasPermissiveTrustee(icaclsOutput) {
  return /Authenticated Users|BUILTIN\\Users|\bEveryone\b/i.test(String(icaclsOutput ?? ''));
}

/**
 * 目标路径的权限是否已收紧：既没有继承来的权限 ACE，也没有宽松主体。
 * @param {string} target - 目录或文件路径。
 */
// Read ACL identities as SIDs rather than localized icacls display names.
function verifyWindows(targets) {
  const script=`$ErrorActionPreference='Stop'; try { foreach($p in (ConvertFrom-Json $env:QQ_ACL_PATHS)) { $a=if([System.IO.Directory]::Exists($p)){[System.IO.Directory]::GetAccessControl($p)}else{[System.IO.File]::GetAccessControl($p)}; if(!$a.AreAccessRulesProtected){exit 1}; foreach($r in $a.Access){$sid=$r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value; if($r.IsInherited -or ($r.AccessControlType -eq 'Allow' -and $sid -in @('S-1-5-11','S-1-5-32-545','S-1-1-0'))){exit 1}} }; exit 0 } catch { exit 2 }`;
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:64*1024*1024,env:{...process.env,QQ_ACL_PATHS:JSON.stringify(targets)}});
  return !r.error&&r.status===0;
}
export function isHardened(target) {
  try {if(fs.lstatSync(target).isSymbolicLink())return false;}catch{return false;}
  if(process.platform!=='win32'){try{return(fs.statSync(target).mode&0o077)===0;}catch{return false;}}
  return verifyWindows([target]);
}

export function collectAclTargets(dir) {
  const result=[];
  function visit(target){const stat=fs.lstatSync(target);if(stat.isSymbolicLink())return;result.push({target,directory:stat.isDirectory()});if(stat.isDirectory())for(const name of fs.readdirSync(target))visit(path.join(target,name));}
  visit(path.resolve(dir));return result;
}
function failed(res){return res.error||res.status!==0||/access is denied|拒绝访问|存取被拒|failed processing [1-9]|[1-9]\d*.*(?:处理失败|失败处理)/i.test(`${res.stdout||''}${res.stderr||''}`);}
function failure(res){return res.error?.message||`icacls exit=${res.status}: ${String(res.stderr||res.stdout||'').trim().slice(-800)}`;}
function protectWindows(target,directory,user){
  // Grant first: never remove the caller's inherited access before replacing it.
  const grant=directory?'(OI)(CI)F':'F';
  for(const args of [
    [target,'/grant:r',`${user}:${grant}`,'/grant:r',`*S-1-5-18:${grant}`,'/grant:r',`*S-1-5-32-544:${grant}`,'/Q'],
    [target,'/inheritance:r','/Q'],
    [target,'/remove:g',...PERMISSIVE_SIDS,'/Q']
  ]){const r=icacls(args);if(failed(r))return{ok:false,detail:`${target}: ${failure(r)}`};}
  return{ok:true,detail:'icacls'};
}
function currentUser(){const r=spawnSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true,timeout:10000});return !r.error&&r.status===0?r.stdout?.match(/S-1-(?:\d+-)+\d+/)?.[0]:null;}

/**
 * 收紧一个**目录**及其整棵子树的权限。
 * @param {string} dir - 目标目录。
 * @returns {{ok: boolean, detail: string}}
 */
export function hardenDir(dir) {
  try{
    if(fs.lstatSync(dir).isSymbolicLink())return{ok:false,detail:'拒绝修改重解析点目标'};
    if(process.platform!=='win32'){fs.chmodSync(dir,0o700);return{ok:true,detail:'chmod 700'};}
    const sid=currentUser();if(!sid)return{ok:false,detail:'无法确定当前账号 SID'};
    const targets=collectAclTargets(dir);
    for(const item of targets){if(fs.lstatSync(item.target).isSymbolicLink())return{ok:false,detail:'处理期间目录变成重解析点'};const r=protectWindows(item.target,item.directory,'*'+sid);if(!r.ok)return r;}
    // Batch verification avoids one PowerShell startup per file.
    for(let i=0;i<targets.length;i+=100)if(!verifyWindows(targets.slice(i,i+100).map(x=>x.target)))return{ok:false,detail:'ACL 回读复核未通过，权限尚未收紧'};
    fs.readdirSync(dir);return{ok:true,detail:'icacls，已回读复核（跳过 junction/symlink）'};
  }catch(error){return{ok:false,detail:error.message};}
}

/**
 * 收紧一个**文件**的权限（凭据文件用；文件不能带 (OI)(CI)）。
 * @param {string} file - 目标文件。
 * @returns {{ok: boolean, detail: string}}
 */
export function hardenFile(file) {
  try{
    if(fs.lstatSync(file).isSymbolicLink())return{ok:false,detail:'拒绝修改重解析点目标'};
    if(process.platform!=='win32'){fs.chmodSync(file,0o600);return{ok:true,detail:'chmod 600'};}
    const sid=currentUser();if(!sid)return{ok:false,detail:'无法确定当前账号 SID'};
    const r=protectWindows(file,false,'*'+sid);if(!r.ok)return r;
    return isHardened(file)?r:{ok:false,detail:'文件 ACL 回读复核未通过'};
  }catch(error){return{ok:false,detail:error.message};}
}

/**
 * 给人看的手动收紧命令（失败降级时打印）。
 *
 * 必须是**安全**的那一版：把 (OI)(CI) 授权和 /T 混在同一句里会把子文件 DACL 清空。
 */
export function manualDirCommand(dir) {
  if(process.platform!=='win32')return `chmod go-rwx "${dir}"`;
  const helper=fileURLToPath(new URL('../scripts/harden-state-acl.mjs',import.meta.url));
  return `node "${helper}" --directory "${dir}" --elevated`;
}

// Called after configuration, while the installer still has WRITE_DAC.
// Explicit grants to the account SID also work with its filtered UAC token.
export function hardenInstalledData(bridgeRoot) {
  if(process.platform!=='win32')return [];
  const results=[];
  for(const relative of ['state','companion/bili-native-data','companion/douyin-data','companion/bilibili-live-data','companion/creative-data']){
    const directory=path.join(bridgeRoot,relative);
    try{fs.mkdirSync(directory,{recursive:true});const result=hardenDir(directory);results.push({directory,...result});}
    catch(error){results.push({directory,ok:false,detail:error.message});}
  }
  for(const result of results)if(!result.ok)console.error(`[安装权限警告] ${result.directory}: ${result.detail}。权限未收紧，请在访问与安全中修复。`);
  return results;
}
