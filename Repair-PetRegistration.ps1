param([string]$Root=$PSScriptRoot,[switch]$NoShow)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Runtime-Common.ps1')
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
$node=Get-SuiteNode $Root
$registration=Join-Path $Root 'desktop-pet\pet-registration.mjs'
function Registration([string]$Mode){
  $output=@(& $node $registration $Root $Mode)
  if($LASTEXITCODE -ne 0){throw '桌宠注册检查/修复失败，请查看上面的具体错误。'}
  return (($output -join [Environment]::NewLine)|ConvertFrom-Json)
}
. (Join-Path $Root 'Backend-Common.ps1')
$plan=Registration '--check'
Initialize-BackendControl $Root
$lock=Enter-XiaogeServiceLock $Root 'pet-registration'
$restart=$false;$stopped=$false
try{
  $plan=Registration '--check'
  $config=Get-Content -LiteralPath (Join-Path $Root 'qq-bridge\config.json') -Raw -Encoding UTF8|ConvertFrom-Json
  $url=[Uri]$config.dsh.baseUrl
  if($url.Scheme -ne 'http' -or -not $url.IsLoopback -or $url.Query -or $url.UserInfo -or $url.Fragment){throw 'DSH地址必须是本机HTTP地址。'}
  $listeners=@(Get-NetTCPConnection -LocalPort $url.Port -State Listen -ErrorAction SilentlyContinue)
  $enginePid=0
  foreach($listener in $listeners){
    $owner=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener.OwningProcess)
    $cli=Join-Path $Root 'engine\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js'
    if($owner.ExecutablePath -ne (Join-Path $Root 'engine\DeepSeek Harness.exe') -or -not $owner.CommandLine -or $owner.CommandLine.IndexOf($cli,[StringComparison]::OrdinalIgnoreCase) -lt 0){throw 'DSH端口属于另一套安装或其他程序，未修改注册。'}
    $enginePid=[int]$owner.ProcessId
  }
  if(-not $enginePid){
    $starting=@(Get-CimInstance Win32_Process -Filter "Name='DeepSeek Harness.exe'" | Where-Object {$_.ExecutablePath -eq (Join-Path $Root 'engine\DeepSeek Harness.exe') -and $_.CommandLine -and $_.CommandLine -match 'dsh-desktop-host[\\/]lib[\\/]cli\.js'})
    if($starting.Count){throw '本安装DSH正在启动或退出，尚未释放进程，请稍后重试。'}
  }
  $restart=[bool]$plan.needsRepair
  if($enginePid -and -not $restart){$runtime=Registration '--runtime';$restart=-not $runtime.registered}
  if($restart -and $enginePid){
    Write-Output '正在正常重启本安装的DSH以加载桌宠；QQ、SnowLuma和语音进程保持运行。'
    Send-BackendControl $Root 'engine' $enginePid
    $stopped=$true
    for($attempt=0;$attempt -lt 120;$attempt++){if(-not(Get-CimInstance Win32_Process -Filter ('ProcessId='+$enginePid) -ErrorAction SilentlyContinue)){break};Start-Sleep -Milliseconds 250}
    if(Get-CimInstance Win32_Process -Filter ('ProcessId='+$enginePid) -ErrorAction SilentlyContinue){$stopped=$false;throw 'DSH仍在正常退出，未强制结束。请稍后重新运行修复。'}
  }
  $result=Registration '--repair'
  if($result.changed){Write-Output ('桌宠注册已补齐，原Profile备份：'+$result.backup)}else{Write-Output '桌宠注册完整。'}
  if($restart -or -not $enginePid){& (Join-Path $Root 'Start-Engine.ps1') -Root $Root;$stopped=$false}
  if(-not $NoShow){& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'desktop-pet\Start-Pet.ps1') -NoBackends;if($LASTEXITCODE -ne 0){throw '注册已补齐，但桌宠加载未完成，请查看logs/pet-start.log。'}}
}finally{
  if($stopped){try{& (Join-Path $Root 'Start-Engine.ps1') -Root $Root}catch{Write-Output 'DSH未能恢复，请从大肥鱼管理窗口启动。'}}
  $lock.ReleaseMutex();$lock.Dispose()
}
