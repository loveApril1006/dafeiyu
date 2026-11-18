param([string]$Root=$PSScriptRoot,[ValidateSet('models','whitelist','access','overview','qq-official')][string]$View='models')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Runtime-Common.ps1')
try{
  $root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
  . (Join-Path $root 'Port-Common.ps1')
  $consolePort=(Get-XiaogePorts $root).bridge
  $node=Get-SuiteNode $root
  $connections=@(Get-NetTCPConnection -LocalPort $consolePort -State Listen -ErrorAction SilentlyContinue)
  if(-not$connections.Count){throw '3100控制台尚未启动，请先点击“启动全部”，等待启动完成后再打开后台。'}
  foreach($connection in $connections){
    $owner=Get-CimInstance Win32_Process -Filter ('ProcessId='+$connection.OwningProcess)
    if(-not(Test-SuiteNodePath $root $owner.ExecutablePath) -or -not$owner.CommandLine -or $owner.CommandLine.IndexOf((Join-Path $root 'qq-bridge'),[StringComparison]::OrdinalIgnoreCase) -lt 0){throw '3100端口由另一套程序占用。请使用对应安装的后台入口，或先退出另一套大肥鱼。'}
  }
  $cfg=Get-Content -LiteralPath (Join-Path $root 'qq-bridge\config.json') -Raw -Encoding UTF8|ConvertFrom-Json
  $token=[string]$cfg.consoleToken
  if(-not$token){$token=[IO.File]::ReadAllText((Join-Path $root 'qq-bridge\state\console-token')).Trim()}
  if(-not$token){throw '尚未生成控制台令牌，请检查安装是否完成。'}
  Start-Process ('http://127.0.0.1:'+$consolePort+'/?token='+[Uri]::EscapeDataString($token)+'#'+$View)
}catch{
  Add-Type -AssemblyName System.Windows.Forms
  [Windows.Forms.MessageBox]::Show($_.Exception.Message,'控制台尚未就绪','OK','Information')|Out-Null
  exit 1
}
