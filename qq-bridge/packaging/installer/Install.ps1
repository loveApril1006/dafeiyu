param([string]$SourceRoot,[string]$TargetRoot,[string]$SettingsFile,[switch]$NoLaunch,[switch]$NoShortcut,[string]$CancelFile,[switch]$NoRegister)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1')
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Console]::OutputEncoding
function Assert-InstallActive {
  if($CancelFile -and (Test-Path -LiteralPath $CancelFile)){throw [OperationCanceledException]::new('安装已停止，未完成目录保留，可重新安装。')}
}
function Progress($percent,$message){Assert-InstallActive;Write-Output ('STATUS|'+$percent+'|'+$message)}
function Get-InstallProbeFailure {
  param([string]$Detail)
  if($Detail -match 'WinError\s*1455|页面文件太小|paging file is too small'){
    return ('语音合成环境检查失败：Windows 可用提交内存不足（WinError 1455）。请关闭占用内存较多的程序，在 sysdm.cpl → 高级 → 性能设置 → 高级 → 虚拟内存中启用系统管理的分页文件，并确认磁盘有可用空间。保存工作，按系统提示重启后重试。原始错误：'+$Detail)
  }
  return ('语音合成环境检查失败。'+$Detail)
}
function Invoke-InstallChild {
  param([string]$File,[string[]]$Arguments,[switch]$AbortSafe,[switch]$Quiet,[switch]$IgnoreCancellation)
  if(-not$IgnoreCancellation){Assert-InstallActive}
  $script:InstallResult=$null;$script:InstallError='安装步骤未完成，请查看日志。'
  $info=New-Object Diagnostics.ProcessStartInfo;$info.FileName=$File;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $quoted=@(foreach($argument in $Arguments){if($argument.IndexOfAny([char[]]@('"',"`r","`n")) -ge 0){throw '安装参数格式无效。'};'"'+$argument+'"'})
  $info.Arguments=$quoted -join ' ';$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false);$info.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
  $child=New-Object Diagnostics.Process;$child.StartInfo=$info
  try{
    $child.Start()|Out-Null;$lineTask=$child.StandardOutput.ReadLineAsync();$err=$child.StandardError.ReadToEndAsync();$ended=$false
    while(-not$ended -or -not$child.HasExited){
      if(-not$ended -and $lineTask.IsCompleted){
        $line=$lineTask.Result
        if($null -eq $line){$ended=$true}else{
          if($line.StartsWith('RESULT|')){$script:InstallResult=$line.Substring(7)|ConvertFrom-Json}
          if($line.StartsWith('ERROR|')){$script:InstallError=$line.Substring(6)}
          if(-not$Quiet){Write-Output $line}
          $lineTask=$child.StandardOutput.ReadLineAsync()
        }
      }else{Start-Sleep -Milliseconds 65}
      if($AbortSafe -and -not$IgnoreCancellation -and $CancelFile -and (Test-Path -LiteralPath $CancelFile)){
        if(-not$child.HasExited){$child.Kill();$child.WaitForExit()};Assert-InstallActive
      }
    }
    $child.WaitForExit();$script:InstallExitCode=$child.ExitCode
    # Quiet suppresses successful probes, never the traceback needed to diagnose failure.
    if($err.Result -and (-not$Quiet -or $script:InstallExitCode -ne 0)){Write-Output $err.Result.TrimEnd()}
    if($script:InstallExitCode -ne 0){$script:InstallError='子进程退出码 '+$script:InstallExitCode+'：'+$File;if($err.Result){$script:InstallError+='；'+$err.Result.Trim().Substring(0,[Math]::Min(4000,$err.Result.Trim().Length))}}
  }finally{$child.Dispose()}
  if(-not$IgnoreCancellation -and $script:InstallExitCode -eq 0){Assert-InstallActive}
}

function Get-InstallFileHash([string]$Path){
  $stream=[IO.File]::OpenRead($Path);$algorithm=[Security.Cryptography.SHA256]::Create()
  try{return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$algorithm.Dispose()}
}
function Assert-InstallFiles([string]$Directory,$Manifest,[switch]$Complete){
  if($Complete){
    [long]$count=0;[long]$bytes=0
    foreach($name in [IO.Directory]::EnumerateFiles($Directory,'*',[IO.SearchOption]::AllDirectories)){if([IO.Path]::GetFileName($name) -eq 'bundle-manifest.json'){continue};if(($count % 128) -eq 0){Assert-InstallActive};$count++;$bytes+=([IO.FileInfo]::new($name)).Length}
    if($count -ne [int]$Manifest.fileCount){throw '数据包文件不完整：请完整解压ZIP安装包，缺失组件时不能继续安装。'}
    if($bytes -ne [long]$Manifest.totalBytes){throw '数据包大小不正确：可能未解压完成或文件已被截断，请重新完整解压ZIP安装包。'}
  }
  if(-not $Manifest.sha256 -or @($Manifest.sha256.PSObject.Properties).Count -eq 0){throw '数据包校验清单缺失，请重新完整解压ZIP安装包。'}
  foreach($entry in $Manifest.sha256.PSObject.Properties){
    Assert-InstallActive
    if([IO.Path]::IsPathRooted($entry.Name) -or $entry.Name.Contains(':') -or @($entry.Name -split '[\\/]').Contains('..')){throw '数据包校验清单包含无效路径。'}
    $file=Join-Path $Directory $entry.Name
    if(-not(Test-Path -LiteralPath $file -PathType Leaf) -or (Get-InstallFileHash $file) -ne $entry.Value){throw ('文件校验失败：'+$entry.Name+'，请重新完整解压或复制安装包。')}
  }
}

# XIAOGE-TARGET-WRITE-STEPS-V1
function Invoke-InstallFileStep([string]$Name,[scriptblock]$Action){
  Write-Output ('STEP|'+$Name)
  try{& $Action}catch{
    $failure=$_.Exception
    while($failure.InnerException){$failure=$failure.InnerException}
    throw ('安装步骤【'+$Name+'】失败：'+$failure.GetType().FullName+' / 0x'+$failure.HResult.ToString('X8')+' / '+$failure.Message)
  }
}
function Ensure-InstallDirectory([string]$Directory){
  if([IO.File]::Exists($Directory)){throw '目标路径是文件，不能作为安装目录。'}
  if(-not[IO.Directory]::Exists($Directory)){[void][IO.Directory]::CreateDirectory($Directory)}
}

function Test-InstallPassword([string]$password){
  if([string]::IsNullOrEmpty($password) -or $password.Length -gt 256){return $false}
  $salt=[Convert]::FromBase64String('yjqb2mYvtqHMpv4SuvVtmQ==')
  $expected=[Convert]::FromBase64String('jpSi1tbOkAMoTQfpfVOjQfRQ578Br8gxjW6MaBxY0pQ=')
  $derive=[Security.Cryptography.Rfc2898DeriveBytes]::new($password,$salt,120000)
  try{$actual=$derive.GetBytes($expected.Length)}finally{$derive.Dispose()}
  $difference=0
  for($i=0;$i -lt $expected.Length;$i++){$difference=$difference -bor ($expected[$i] -bxor $actual[$i])}
  [Array]::Clear($actual,0,$actual.Length)
  return $difference -eq 0
}
function Stop-InstalledQQ([string]$target,[int]$Port=5099){
  $node=Join-Path $target 'SnowLuma\node.exe'
  $owned=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'"|Where-Object {$_.ExecutablePath -eq $node -and $_.CommandLine -match '(?:\s|["\\/])index\.mjs(?:["\s]|$)'})
  if(-not $owned.Count){return}
  $manager=Join-Path $target 'Manage-Backends.ps1'
  if(-not(Test-Path -LiteralPath $manager)){throw '这套安装的SnowLuma仍在运行。请先从后台管理关闭SnowLuma，再重试安装。'}
  $output=@(& $manager -Root $target -Action stop -Service qq -QQPort $Port)
  $line=$output|Where-Object {([string]$_).StartsWith('{')}|Select-Object -Last 1
  $reply=$null;if($line){$reply=$line|ConvertFrom-Json}
  if(-not $reply -or -not $reply.ok){throw ('SnowLuma尚未关闭，未覆盖运行文件。请先关闭后重试安装。'+$(if($reply){' '+$reply.error}else{''}))}
}
function Stop-InstalledStack($target){
  if(Test-Path -LiteralPath (Join-Path $target 'xiaoge-install.json')){
    $stopper=Join-Path $SourceRoot 'payload\Stop-All.ps1'
    if(Test-Path -LiteralPath $stopper){
      Invoke-InstallChild -File (Join-Path $PSHOME 'powershell.exe') -Arguments @('-NoProfile','-ExecutionPolicy','Bypass','-File',$stopper,'-Root',$target,'-KeepExternalQQ')
      if($script:InstallExitCode -ne 0){throw '本安装还有进程未关闭，请按上方提示退出后重试。'}
      return
    }
  }
  Stop-InstalledQQ $target
  $native=Join-Path $target 'qq-bridge\pet\XiaogePet.exe'
  if(Get-Process -Name XiaogePet -ErrorAction SilentlyContinue|Where-Object {$_.Path -eq $native}){
    [IO.File]::WriteAllText((Join-Path $target 'qq-bridge\pet\pet-close.request'),'installer repair')
    for($i=0;$i -lt 40;$i++){if(-not(Get-Process -Name XiaogePet -ErrorAction SilentlyContinue|Where-Object {$_.Path -eq $native})){break};Start-Sleep -Milliseconds 200}
    if(Get-Process -Name XiaogePet -ErrorAction SilentlyContinue|Where-Object {$_.Path -eq $native}){throw '请先从右键菜单退出这套桌宠，再重试安装。'}
  }
  $connection=Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue
  if($connection){$process=Get-CimInstance Win32_Process -Filter ('ProcessId='+@($connection)[0].OwningProcess);if($process.CommandLine -and $process.CommandLine.IndexOf($target,[StringComparison]::OrdinalIgnoreCase) -ge 0){$token=[IO.File]::ReadAllText((Join-Path $target 'qq-bridge\state\console-token')).Trim();Invoke-RestMethod http://127.0.0.1:3100/api/restart -Method Post -Headers @{'X-Console-Token'=$token} -ContentType application/json -Body '{}'|Out-Null}}
  foreach($port in @(17860,17866,17867,17868)){
    $connection=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if($connection){$process=Get-CimInstance Win32_Process -Filter ('ProcessId='+@($connection)[0].OwningProcess);if($process.ExecutablePath -and $process.ExecutablePath.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase) -and $process.Name -in @('node.exe','python.exe','DeepSeek Harness.exe')){Stop-Process -Id $process.ProcessId}}
  }
}

# Appended to Install.ps1 after its password/path/process helpers.
$transaction='';$target='';$node='';$update=$false;$installMutex=$null;$mutexOwned=$false
try{
  Assert-InstallActive
  if(-not $SettingsFile -or -not(Test-Path -LiteralPath $SettingsFile -PathType Leaf)){throw '请完整解压后运行“大肥鱼完整版安装.exe”。'}
  try{$settings=Get-Content -LiteralPath $SettingsFile -Raw -Encoding UTF8|ConvertFrom-Json}catch{throw '安装配置无法读取，请重新打开安装器。'}
  if(-not(Test-InstallPassword ([string]$settings.installPassword))){throw '安装授权密码不正确，请重新输入。'}
  $settings.PSObject.Properties.Remove('installPassword')
  [IO.File]::WriteAllText($SettingsFile,($settings|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
  $source=[IO.Path]::GetFullPath($SourceRoot).TrimEnd('\');$target=[IO.Path]::GetFullPath($TargetRoot).TrimEnd('\')
  if($target.StartsWith('\\') -or $target -eq [IO.Path]::GetPathRoot($target).TrimEnd('\')){throw '请选择本机磁盘上的独立文件夹，不能使用磁盘根目录或网络路径。'}
  if($source -ieq $target -or $target.StartsWith($source+'\',[StringComparison]::OrdinalIgnoreCase)){throw '安装目录不能放在安装包里面。'}
  for($ancestor=[IO.DirectoryInfo]::new($target);$ancestor;$ancestor=$ancestor.Parent){if($ancestor.Exists -and ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw '安装目录不能经过链接，请选择实际安装文件夹。'}}
  if(-not[Environment]::Is64BitOperatingSystem){throw '此安装包需要64位Windows。'}
  $hash=[Security.Cryptography.SHA256]::Create();try{$mutexKey=([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($target.ToLowerInvariant())))).Replace('-','').Substring(0,24)}finally{$hash.Dispose()}
  $installMutex=New-Object Threading.Mutex($false,('Local\XiaogeInstall-'+$mutexKey));$mutexOwned=$installMutex.WaitOne(0)
  if(-not$mutexOwned){throw '此目录已有安装或更新正在进行，请等待完成。'}
  Progress 2 '正在检查完整版数据包与安装方式'
  $manifest=Get-Content -LiteralPath (Join-Path $source 'payload\bundle-manifest.json') -Raw -Encoding UTF8|ConvertFrom-Json
  $node=Join-Path $source 'payload\runtime\node.exe';$engine=Join-Path $source '工具\install-engine.mjs'
  if((Get-InstallFileHash $node) -ne [string]$manifest.sha256.'runtime/node.exe'){throw 'Node运行环境校验失败，请完整解压安装包。'}
  if((Get-InstallFileHash $engine) -ne [string]$manifest.installerEngineSha256){throw '安装更新引擎校验失败。'}
  if((Get-InstallFileHash (Join-Path $source '工具\payload-index.json')) -ne [string]$manifest.fileIndexSha256){throw '安装文件索引校验失败。'}
  foreach($entry in $manifest.installToolsSha256.PSObject.Properties){
    $toolName=[string]$entry.Name
    if([IO.Path]::IsPathRooted($toolName) -or $toolName.Contains(':') -or @($toolName -split '[\\/]'|Where-Object {$_ -in @('','.','..')}).Count){throw '安装工具清单路径无效。'}
    $toolsDirectory=[IO.Path]::GetFullPath((Join-Path $source '工具')).TrimEnd('\')+'\'
    $toolFile=[IO.Path]::GetFullPath((Join-Path $toolsDirectory $toolName))
    if(-not$toolFile.StartsWith($toolsDirectory,[StringComparison]::OrdinalIgnoreCase)){throw '安装工具路径越界。'}
    if((Get-InstallFileHash $toolFile) -ne [string]$entry.Value){throw ('安装工具校验失败：'+$toolName)}
  }
  Invoke-InstallChild -File $node -Arguments @($engine,'verify',$source,$target,[string]$CancelFile)
  if($script:InstallExitCode -eq 2){throw [OperationCanceledException]::new('安装校验已停止。')}
  if($script:InstallExitCode -ne 0){throw $script:InstallError}
  Invoke-InstallChild -File $node -Arguments @($engine,'detect',$source,$target) -Quiet
  if($script:InstallExitCode -ne 0){throw $script:InstallError}
  $update=$script:InstallResult.mode -eq 'update'
  Write-Output ('MODE|'+$(if($update){'update'}else{'new'})+'|'+$target)
  if(-not$update){
    if($settings.apiKey -and $settings.apiKey.Length -lt 8){throw '模型密钥太短；也可先留空，安装后设置。'}
    Invoke-InstallFileStep '创建或确认目标目录' { Ensure-InstallDirectory $target }
    Invoke-InstallFileStep '写入首次安装标记' { [IO.File]::WriteAllText((Join-Path $target '.xiaoge-installing'),'v31') }
  }
  Invoke-InstallFileStep '目标目录文件写入验证' { $probe=Join-Path $target ('.xiaoge-write-probe-'+[Guid]::NewGuid().ToString('N'));[IO.File]::WriteAllText($probe,'');[IO.File]::Delete($probe) }
  if($update){
    Progress 4 '检测到已有安装：保留账号、模型配置、记忆及记录'
    # Request only this installation's manager to close normally before replacing its executable.
    $managers=@((Join-Path $target '小鸽子.exe'),(Join-Path $target '小鸽子完整版.exe'),(Join-Path $target '小鸽子完整版后台管理.exe'),(Join-Path $target '大肥鱼.exe'),(Join-Path $target '大肥鱼完整版.exe'),(Join-Path $target '大肥鱼完整版后台管理.exe'))
    foreach($candidate in $managers){foreach($process in @(Get-CimInstance Win32_Process|Where-Object {$_.ExecutablePath -and $_.ExecutablePath -ieq $candidate})){
      $app=Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue
      if($app){$null=$app.CloseMainWindow();for($i=0;$i -lt 600 -and -not$app.HasExited;$i++){Start-Sleep -Milliseconds 100;Assert-InstallActive};if(-not$app.HasExited){throw '原管理窗口尚未退出，请关闭该安装的管理窗口后重试；未强制结束进程。'}}
    }}
    Stop-InstalledStack $target
    if(Test-Path -LiteralPath (Join-Path $target '.xiaoge-updating')){
      Write-Output 'STATUS|5|检测到中断更新，正在先恢复原程序'
      Invoke-InstallChild -File $node -Arguments @($engine,'recover',$source,$target,'','')
      if($script:InstallExitCode -ne 0){throw '上次更新尚未恢复，备份仍保留；请查看上方恢复提示。'}
    }
  }
  Assert-InstallActive
  $backupRoot=Join-Path $target 'maintenance\install-backups'
  for($ancestor=[IO.DirectoryInfo]::new($backupRoot);$ancestor;$ancestor=$ancestor.Parent){if($ancestor.Exists -and ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw '更新备份路径不能经过目录链接。'}}
  Invoke-InstallFileStep '创建或确认安装备份目录' { Ensure-InstallDirectory $backupRoot }
  Invoke-InstallFileStep '设置安装备份私有权限' { $acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false);$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','ContainerInherit,ObjectInherit','None','Allow')));[IO.Directory]::SetAccessControl($backupRoot,$acl) }
  $transaction=Join-Path $backupRoot ('v31-'+[Guid]::NewGuid().ToString())
  Progress 6 $(if($update){'正在比较程序文件，仅更新变化部分'}else{'正在准备首次安装'})
  Invoke-InstallChild -File $node -Arguments @($engine,'apply',$source,$target,[string]$CancelFile,$transaction)
  if($script:InstallExitCode -eq 2){throw [OperationCanceledException]::new('已停止；更新会恢复已替换程序，首次安装可继续。')}
  if($script:InstallExitCode -ne 0){throw $script:InstallError}
  Write-Output ('BACKUP|'+$transaction)
  . (Join-Path $source '工具\Runtime-Prerequisite.ps1');Install-XiaogeVCRuntime (Join-Path $source '工具')
  Assert-InstallActive
  if($update){
    Progress 55 '正在补齐新版功能注册，保留原模型、QQ登录、人格和聊天记录'
    Invoke-InstallChild -File $node -Arguments @((Join-Path $source '工具\configure-update.mjs'),$target)
  }else{
    Progress 55 '正在生成这台电脑的首次安装配置'
    Invoke-InstallChild -File $node -Arguments @((Join-Path $source '工具\configure-target.mjs'),$target,$SettingsFile)
  }
  if($script:InstallExitCode -ne 0){throw '配置或兼容性迁移未完成，正在恢复原程序。'}
  Invoke-InstallChild -File $node -Arguments @((Join-Path $source '工具\relocate-runtimes.mjs'),$target)
  if($script:InstallExitCode -ne 0){throw '新增Python运行环境路径配置失败。'}
  $installedNode=Join-Path $target 'runtime\node.exe'
  if(-not $update){
    $env:DSH_HOME=Join-Path $target 'engine-home';$env:QQ_BRIDGE_SKIP_DSH_INSTALL='1'
    Invoke-InstallChild -File $installedNode -Arguments @((Join-Path $target 'qq-bridge\scripts\setup-dsh.mjs'),'web') -Quiet
    if($script:InstallExitCode -ne 0){throw '聊天角色安装未完成。'}
  }
  Invoke-InstallChild -File $installedNode -Arguments @('--experimental-vm-modules',(Join-Path $target 'qq-bridge\scripts\audit-runtime-bundle.mjs'),$target) -Quiet
  if($script:InstallExitCode -ne 0){throw '运行依赖或默认参考图不完整，安装器将回滚；请使用完整发行包。'}
  Progress 65 '正在验证桌宠与运行环境'
  . (Join-Path $target 'Backend-Common.ps1')
  if(Test-XiaogePetPreference $target){
    Invoke-InstallChild -File $installedNode -Arguments @((Join-Path $target 'desktop-pet\pet-registration.mjs'),$target,'--verify')
    if($script:InstallExitCode -ne 0){throw '桌宠注册检查失败，请查看上方具体原因；安装器将恢复本次更新。'}
  }else{Write-Output 'INFO|桌宠保持用户关闭状态；组件完整性已由运行依赖检查验证。'}
  Invoke-InstallChild -File (Join-Path $target 'local-tts\runtime\python.exe') -Arguments @('-c','import numpy,sherpa_onnx,sounddevice') -AbortSafe -Quiet
  if($script:InstallExitCode -ne 0){throw '语音识别环境检查失败。'}
  Invoke-InstallChild -File (Join-Path $target 'GPT-SoVITS\runtime\python.exe') -Arguments @('-c','import torch,soundfile') -AbortSafe -Quiet
  if($script:InstallExitCode -ne 0){throw (Get-InstallProbeFailure $script:InstallError)}
  Assert-InstallActive
  if(-not $NoShortcut){& (Join-Path $target 'Set-DafeiyuShortcut.ps1') -Root $target}
  foreach($relative in @('安装信息.json','后台登录信息.txt','qq-bridge\state\console-token')){
    $file=Join-Path $target $relative;if(Test-Path -LiteralPath $file){$security=New-Object Security.AccessControl.FileSecurity;$security.SetAccessRuleProtection($true,$false);$security.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','Allow')));[IO.File]::SetAccessControl($file,$security)}
  }
  Assert-InstallActive
  Invoke-InstallChild -File $node -Arguments @($engine,'commit',$source,$target,'',$transaction) -Quiet -IgnoreCancellation
  if($script:InstallExitCode -ne 0){throw '安装提交未完成，请查看备份记录。'}
  if(-not$NoRegister){try{$key='HKCU:\Software\Xiaoge\Installations\'+$mutexKey;New-Item -Path $key -Force|Out-Null;New-ItemProperty -Path $key -Name Root -Value $target -PropertyType String -Force|Out-Null;New-ItemProperty -Path $key -Name Edition -Value full -PropertyType String -Force|Out-Null;New-ItemProperty -Path $key -Name Version -Value 31 -PropertyType DWord -Force|Out-Null}catch{Write-Output 'INFO|安装位置登记未完成，之后可手动选择原目录更新。'}}
  Write-Output ('STATUS|100|'+$(if($update){'保留数据更新完成。账号、人格、记忆、聊天和用户媒体已保留，可从管理窗口启动。'}else{'首次安装完成。请打开管理窗口启动，再扫码和设置账号。'}))
  exit 0
}catch{
  $cancelled=$_.Exception -is [OperationCanceledException];$message=$_.Exception.Message
  if($update -and $transaction -and (Test-Path -LiteralPath (Join-Path $transaction 'transaction.json'))){
    try{$record=Get-Content -LiteralPath (Join-Path $transaction 'transaction.json') -Raw -Encoding UTF8|ConvertFrom-Json;if($record.status -notin @('committed','rolled-back')){Write-Output 'STATUS|90|正在恢复本次替换的程序和迁移配置';Invoke-InstallChild -File $node -Arguments @((Join-Path $SourceRoot '工具\install-engine.mjs'),'rollback',$SourceRoot,$target,'',$transaction) -IgnoreCancellation;if($script:InstallExitCode -ne 0){$message+='；自动恢复未完成，备份保留在：'+$transaction}}}catch{$message+='；恢复需要重试，备份保留在：'+$transaction}
  }
  if($cancelled){Write-Output ('CANCELLED|'+$message);exit 2}
  Write-Output ('ERROR|'+$message);exit 1
}finally{
  if($SettingsFile -and (Test-Path -LiteralPath $SettingsFile)){Remove-Item -LiteralPath $SettingsFile -Force -ErrorAction SilentlyContinue}
  if($mutexOwned){$installMutex.ReleaseMutex()};if($installMutex){$installMutex.Dispose()}
}
