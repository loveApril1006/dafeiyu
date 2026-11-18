param([string]$Root=$PSScriptRoot,[string]$OutputFile='')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Runtime-Common.ps1')
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'QQ-ClientCommon.ps1')
$lines=New-Object 'System.Collections.Generic.List[string]'
$lines.Add('QQ重启后进程检测（不包含账号、密码、令牌或完整进程命令行）')
$lines.Add('检查时间：'+(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
try{
  $snapshot=Get-QQProcessSnapshot
  $lines.Add('Windows QQ主进程PID：'+($snapshot.mainPids -join ','))
  $lines.Add('Windows 无法读取启动信息的QQ PID：'+($snapshot.unknownPids -join ','))
  $lines.Add('QQ辅助进程数：'+$snapshot.auxiliaryPids.Count)
  $isAdmin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  $lines.Add('本次诊断是否管理员运行：'+$isAdmin)
  foreach($number in $snapshot.mainPids){try{$qq=Get-CimInstance Win32_Process -Filter ('ProcessId='+$number);$version=[Diagnostics.FileVersionInfo]::GetVersionInfo($qq.ExecutablePath).FileVersion;$lines.Add('QQ '+$number+' 文件版本：'+$version)}catch{$lines.Add('QQ文件版本：无法读取')}}
  $node=Get-SuiteNode $Root
  $info=& $node (Join-Path $Root 'diagnose-qq-native.cjs') $Root 2>$null|ConvertFrom-Json
  $lines.Add('SnowLuma版本：'+$info.snowluma+'；Node：'+$info.node+'；架构：'+$info.arch)
  $lines.Add('原生枚举组件可加载：'+$info.nativeLoaded)
  $lines.Add('原生检测到的QQ主进程PID：'+($info.nativeMainPids -join ','))
  if(-not $snapshot.count){$lines.Add('结论：当前没有运行QQ.exe，请先打开电脑版QQ。')}
  elseif($snapshot.unknownPids.Count){$lines.Add('结论：部分QQ进程信息不可读，请检查QQ与大肥鱼的用户/管理员权限是否一致。')}
  elseif(-not $snapshot.mainPids.Count){$lines.Add('结论：只剩QQ辅助进程，没有正常QQ主进程；请退出残留QQ后重新打开。')}
  elseif(-not $info.nativeLoaded -or -not $info.nativeMainPids.Count){$lines.Add('结论：Windows能看到QQ，原生枚举未识别，请检查权限、QQ版本及原生组件是否被拦截。')}
  else{$lines.Add('结论：系统与原生枚举均能看到QQ。请在5099刷新进程，多个主进程时手动选择；若仍为空，重启本安装的QQ后台。')}
  $lines.Add('建议：QQ和大肥鱼都以当前Windows用户正常启动，避免一个管理员、另一个普通权限。重启电脑后进程PID会变化，不要沿用旧PID。')
}catch{$lines.Add('诊断未完成，请检查安装文件是否完整。')}
if(-not $OutputFile){$OutputFile=Join-Path $Root 'QQ进程诊断结果.txt'}
[IO.File]::WriteAllLines($OutputFile,$lines,[Text.UTF8Encoding]::new($true))
$lines|ForEach-Object {Write-Output $_}
Write-Output ('已保存：'+$OutputFile)
