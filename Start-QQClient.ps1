param([switch]$Inspect,[switch]$InspectDetails)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'QQ-ClientCommon.ps1')
$snapshot=Get-QQProcessSnapshot
if($Inspect -or $InspectDetails){
  if($InspectDetails){$snapshot|ConvertTo-Json -Depth 4 -Compress}
  else{Write-Output (ConvertTo-Json -InputObject @($snapshot.mainPids) -Compress)}
  return
}
if($snapshot.mainPids.Count){return}
if($snapshot.unknownPids.Count){throw '检测到QQ进程，但无法读取其启动信息。请让QQ和大肥鱼使用同一个Windows用户及相同管理员权限，再重试。'}
$candidates=New-Object 'System.Collections.Generic.List[string]'
foreach($key in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\QQ.exe','HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\QQ.exe','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\QQ.exe')){
  $entry=Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
  if($entry -and $entry.'(default)'){$candidates.Add(([string]$entry.'(default)').Trim('"'))}
}
foreach($entry in @(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -match '^(腾讯QQ|QQ|QQNT)(?:\s|$)'})){
  if($entry.InstallLocation){$candidates.Add((Join-Path $entry.InstallLocation 'QQ.exe'))}
  if($entry.DisplayIcon){$candidates.Add((([string]$entry.DisplayIcon) -replace ',\s*\d+$','').Trim('"'))}
}
foreach($key in @('HKCU:\Software\Tencent\QQNT','HKLM:\Software\Tencent\QQNT','HKLM:\Software\WOW6432Node\Tencent\QQNT','HKCU:\Software\Tencent\QQ','HKLM:\Software\Tencent\QQ')){
  $entry=Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
  foreach($property in @('InstallPath','InstallLocation','Install')){if($entry -and $entry.$property){$candidates.Add((Join-Path ([string]$entry.$property).Trim('"') 'QQ.exe'))}}
}
foreach($base in @($env:ProgramFiles,${env:ProgramFiles(x86)},$env:LOCALAPPDATA)){
  if($base){foreach($relative in @('Tencent\QQNT\QQ.exe','Tencent\QQ\QQ.exe','Programs\Tencent\QQ\QQ.exe')){$candidates.Add((Join-Path $base $relative))}}
}
$client=$candidates|Where-Object {[IO.Path]::GetFileName($_) -ieq 'QQ.exe' -and (Test-Path -LiteralPath $_ -PathType Leaf)}|Select-Object -First 1
if(-not$client){throw '未找到已安装的电脑版QQ。请安装QQ后再点启动，或手动打开QQ。'}
# This is the interactive QQ login window explicitly requested by the launch action.
Start-Process -FilePath $client
