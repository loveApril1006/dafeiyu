param([string]$Root=$PSScriptRoot,[string]$SourceHome='')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try {
  $Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
  if(-not(Test-Path -LiteralPath (Join-Path $Root 'xiaoge-install.json'))){throw '请在已安装的大肥鱼目录使用账号复用工具。'}
  if(-not $SourceHome){$SourceHome=Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dsh'}
  $config=Get-Content -LiteralPath (Join-Path $Root 'qq-bridge\config.json') -Raw -Encoding UTF8|ConvertFrom-Json
  if($config.dsh.provider -ne 'deepseek-account'){Write-Output '账号复用：当前使用API服务，保留现有设置。';return}
  # Protect the directory before the official atomic writer creates its replacement file.
  $accountHome=Join-Path $Root 'engine-home'
  if((Test-Path -LiteralPath $accountHome) -and ((Get-Item -LiteralPath $accountHome -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw '账号目录必须是本安装的独立文件夹。'}
  [IO.Directory]::CreateDirectory($accountHome)|Out-Null
  $acl=New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true,$false)
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
  [IO.Directory]::SetAccessControl($accountHome,$acl)
  function Quote-AccountArg([string]$Value){if($Value.IndexOfAny([char[]]@('"',"`r","`n")) -ge 0){throw '路径格式无效。'};'"'+$Value.TrimEnd('\')+'"'}
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=Join-Path $Root 'engine\DeepSeek Harness.exe'
  $info.Arguments='--expose-internals '+(Quote-AccountArg (Join-Path $Root 'reuse-deepseek-account.mjs'))+' '+(Quote-AccountArg $Root)+' '+(Quote-AccountArg $SourceHome)
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
  $info.EnvironmentVariables['ELECTRON_RUN_AS_NODE']='1'
  $process=New-Object Diagnostics.Process;$process.StartInfo=$info
  try{
    $process.Start()|Out-Null
    $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
    if(-not $process.WaitForExit(20000)){$process.Kill();throw '账号复用检查超时。'}
    if($process.ExitCode -ne 0){throw '账号复用检查未完成；可在大肥鱼DSH网页登录，现有配置已保留。'}
    $result=$output.Result.Trim()|ConvertFrom-Json
    if(-not $result.ok){throw '账号复用检查未完成。'}
    $messages=@{'api-mode'='当前使用API服务，保留现有设置';'same-home'='已使用相同账号目录';'source-not-signed-in'='未找到本机Harness的有效登录记录，请先在Harness登录';'target-kept'='保留大肥鱼已有账号';'already-linked'='已经复用本机Harness账号';'source-login-required'='原授权已被移除，请在Harness重新登录后再试';'imported'='已自动复用本机Harness账号，无需再次登录';'refreshed'='已同步本机Harness更新后的授权'}
    Write-Output ('账号复用：'+$messages[[string]$result.status]+'。')
  }finally{$process.Dispose()}
}catch{Write-Output ('账号复用：'+$_.Exception.Message);throw '本机账号复用未完成。'}
