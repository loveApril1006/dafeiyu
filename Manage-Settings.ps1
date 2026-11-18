param([ValidateSet('read','save','test')][string]$Action='read',[string]$Root=$PSScriptRoot,[string]$SettingsFile='')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Runtime-Common.ps1')
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Console]::OutputEncoding
try{
  $Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
  if(-not(Test-SuiteInstallation $Root)){throw '请先安装大肥鱼，再打开设置。'}
  $node=Get-SuiteNode $Root
  $arguments=@((Join-Path $Root 'model-settings.mjs'),$Action,$Root)
  if($Action -ne 'read'){$arguments+=$SettingsFile}
  $output=& $node @arguments 2>&1
  if($LASTEXITCODE -ne 0){throw (($output|ForEach-Object {[string]$_}) -join "`n")}
  if($Action -eq 'save'){
    Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1')
    $file=Join-Path $Root 'engine-home\.credentials.yaml'
    $security=New-Object Security.AccessControl.FileSecurity
    $security.SetAccessRuleProtection($true,$false)
    $security.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','Allow')))
    [IO.File]::SetAccessControl($file,$security)
    # Only change a running bridge that belongs to this installation.
    $connection=Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue
    if($connection){
      $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+@($connection)[0].OwningProcess)
      if(Test-SuiteNodePath $Root $process.ExecutablePath){
        $cfg=Get-Content -LiteralPath (Join-Path $Root 'qq-bridge\config.json') -Raw -Encoding UTF8|ConvertFrom-Json
        $token=[IO.File]::ReadAllText((Join-Path $Root 'qq-bridge\state\console-token')).Trim()
        $body=@{provider=$cfg.dsh.provider;model=$cfg.dsh.model;reasoningEffort='off'}|ConvertTo-Json
        for($i=0;$i -lt 8;$i++){try{Invoke-RestMethod 'http://127.0.0.1:3100/api/dsh/model' -Method Post -Headers @{'X-Console-Token'=$token} -ContentType 'application/json' -Body $body -TimeoutSec 2|Out-Null;break}catch{Start-Sleep -Milliseconds 700}}
      }
    }
  }
  $output|ForEach-Object {Write-Output ([string]$_)}
}catch{Write-Output ('ERROR|'+$_.Exception.Message);exit 1}
finally{if($SettingsFile -and (Test-Path -LiteralPath $SettingsFile)){Remove-Item -LiteralPath $SettingsFile -Force -ErrorAction SilentlyContinue}}
