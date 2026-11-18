function Enter-VoiceServiceLock([string]$VoiceRoot) {
  $bytes=[Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($VoiceRoot).ToLowerInvariant())
  $sha=[Security.Cryptography.SHA256]::Create()
  try{$key=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').Substring(0,24)}finally{$sha.Dispose()}
  $mutex=New-Object Threading.Mutex($false,('Local\XiaogeVoice-'+$key))
  try{try{$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
    if(-not$held){throw '语音服务正在启动或重启，请稍后刷新。'}
    return $mutex
  }catch{$mutex.Dispose();throw}
}
function Exit-VoiceServiceLock($Mutex){if($Mutex){$Mutex.ReleaseMutex();$Mutex.Dispose()}}
function Get-VoiceHostProcesses([string]$VoiceRoot) {
  $service=[IO.Path]::GetFullPath((Join-Path $VoiceRoot 'pet_server.py'))
  $executables=@((Join-Path $VoiceRoot 'runtime\python.exe'),(Join-Path $VoiceRoot '.venv\Scripts\python.exe'))
  $pattern='(?i)(?:^|\s)(?:"'+[regex]::Escape($service)+'"|'+[regex]::Escape($service)+')(?=\s|$)'
  @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object {
    $_.ExecutablePath -and $executables -contains $_.ExecutablePath -and $_.CommandLine -match $pattern
  })
}
function Save-VoiceServiceLogs([string]$VoiceRoot) {
  $files=@('pet-service.log','pet-service-error.log')|ForEach-Object{Join-Path $VoiceRoot $_}|Where-Object{(Test-Path -LiteralPath $_) -and (Get-Item -LiteralPath $_).Length -gt 0}
  if(-not$files){return}
  $target=[IO.Path]::GetFullPath((Join-Path $VoiceRoot ('logs\history\'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))))
  $prefix=[IO.Path]::GetFullPath($VoiceRoot).TrimEnd('\')+'\'
  if(-not$target.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw '语音日志备份路径无效。'}
  [IO.Directory]::CreateDirectory($target)|Out-Null
  foreach($file in $files){Copy-Item -LiteralPath $file -Destination (Join-Path $target ([IO.Path]::GetFileName($file))) -ErrorAction Stop}
}
