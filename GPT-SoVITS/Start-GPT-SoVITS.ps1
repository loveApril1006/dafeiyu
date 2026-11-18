$ErrorActionPreference='Stop'
function Assert-SuiteStarting {if($env:XIAOGE_STACK_CANCEL_FILE -and (Test-Path -LiteralPath $env:XIAOGE_STACK_CANCEL_FILE)){throw '已请求关闭全部，停止继续启动。'}}
Assert-SuiteStarting
$root=$PSScriptRoot
. (Join-Path $root 'Voice-Service-Common.ps1')
$voiceLock=Enter-VoiceServiceLock $root
try {
try {
  $health=Invoke-RestMethod 'http://127.0.0.1:17866/health' -TimeoutSec 2
  if($health.engine -eq 'gpt-sovits'){return}
} catch {}
if(Get-NetTCPConnection -LocalPort 17866 -State Listen -ErrorAction SilentlyContinue){throw 'Port 17866 is used by another service'}
$python=Join-Path $root '.venv\Scripts\python.exe'
if(Test-Path -LiteralPath (Join-Path $root 'runtime\python.exe')){$python=Join-Path $root 'runtime\python.exe'}
$service=Join-Path $root 'pet_server.py'
$env:PYTHONIOENCODING='utf-8'
$env:PYTHONUTF8='1'
$tokenFile=Join-Path $root 'service-token'
if(-not(Test-Path -LiteralPath $tokenFile)){[IO.File]::WriteAllText($tokenFile,([Guid]::NewGuid().ToString('N')+[Guid]::NewGuid().ToString('N')))}
$tokenAcl=New-Object Security.AccessControl.FileSecurity;$tokenAcl.SetAccessRuleProtection($true,$false)
$tokenAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','Allow')))
[IO.File]::SetAccessControl($tokenFile,$tokenAcl)
Save-VoiceServiceLogs $root
$process=Start-Process -FilePath $python -ArgumentList @('-u',('"'+$service+'"')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'pet-service.log') -RedirectStandardError (Join-Path $root 'pet-service-error.log') -PassThru
$voiceUntil=[DateTime]::UtcNow.AddSeconds(180)
while([DateTime]::UtcNow -lt $voiceUntil){
  Assert-SuiteStarting
  Start-Sleep -Seconds 1
  if($process.HasExited){throw ('GPT-SoVITS exited: '+((Get-Content (Join-Path $root 'pet-service-error.log') -Tail 3) -join ' '))}
    Assert-SuiteStarting
  try{$health=Invoke-RestMethod 'http://127.0.0.1:17866/health' -TimeoutSec 2;if($health.ok){Write-Host ('GPT-SoVITS ready: '+$health.device);return}}catch{}
}
throw 'GPT-SoVITS did not start; see pet-service-error.log'

} finally { Exit-VoiceServiceLock $voiceLock }
