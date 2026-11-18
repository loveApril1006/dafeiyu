param([Parameter(Mandatory=$true)][string]$Root,[string]$DesktopPath='')
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
if(-not $DesktopPath){$DesktopPath=[Environment]::GetFolderPath('Desktop')}
$DesktopPath=[IO.Path]::GetFullPath($DesktopPath).TrimEnd('\')
$executable=Join-Path $Root '大肥鱼.exe'
if(-not(Test-Path -LiteralPath $executable -PathType Leaf)){$executable=Join-Path $Root '小鸽子.exe'}
if(-not(Test-Path -LiteralPath $executable -PathType Leaf)){throw '大肥鱼程序不存在，请先完成安装或更新。'}
if(-not(Test-Path -LiteralPath $DesktopPath -PathType Container)){throw '桌面文件夹不存在。'}
$shell=New-Object -ComObject WScript.Shell
$path=Join-Path $DesktopPath '大肥鱼.lnk'
if(Test-Path -LiteralPath $path){
  $existing=$shell.CreateShortcut($path)
  if($existing.TargetPath -notin @($executable,(Join-Path $Root '小鸽子.exe'),(Join-Path $Root '小鸽子完整版.exe'))){throw '桌面“大肥鱼”已指向另一套程序，未覆盖。请先移开或改名该图标，再重试。'}
}
$link=$shell.CreateShortcut($path)
$link.TargetPath=$executable;$link.Arguments='--home';$link.WorkingDirectory=$Root
$link.Description='启动大肥鱼、修改设置、查看后台与密码';$link.WindowStyle=1
$link.IconLocation=$executable+',0';$link.Save()
$backup='';$moved=0
foreach($name in @('小鸽子.lnk','启动小鸽子.lnk','小鸽子设置.lnk','小鸽子后台与密码.lnk','小鸽子后台管理.lnk','大肥鱼完整版.lnk','启动大肥鱼.lnk')){
  $old=Join-Path $DesktopPath $name
  if(-not(Test-Path -LiteralPath $old -PathType Leaf)){continue}
  $target=$shell.CreateShortcut($old).TargetPath
  $legacyTargets=@($executable,(Join-Path $Root '小鸽子.exe'),(Join-Path $Root '小鸽子后台管理.exe'),(Join-Path $Root '小鸽子完整版.exe'),(Join-Path $Root '大肥鱼完整版.exe'))
  if($legacyTargets -notcontains $target){continue}
  if(-not $backup){$backup=Join-Path $Root ('shortcut-backups\'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))}
  $destination=[IO.Path]::GetFullPath((Join-Path $backup $name))
  if((Split-Path $old -Parent) -ne $DesktopPath -or -not $destination.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)){throw '快捷方式备份路径不正确，已停止整理。'}
  New-Item -ItemType Directory -Path $backup -Force|Out-Null
  Move-Item -LiteralPath $old -Destination $destination
  $moved++
}
Write-Output ('已创建桌面“大肥鱼”，已归档 '+$moved+' 个旧入口。')
