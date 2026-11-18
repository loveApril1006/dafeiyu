param([ValidateSet('start','stop')][string]$Action='start',[string]$Root=$PSScriptRoot)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
try{
  $script=Join-Path $Root 'desktop-pet\Start-Pet.ps1'
  if(-not(Test-Path -LiteralPath $script)){throw '桌宠启动文件不存在，请修复安装。'}
  if($Action -eq 'start'){
    & (Join-Path $Root 'Start-Engine.ps1') -Root $Root|Out-Null
    & $script -NoBackends|Out-Null
    if($LASTEXITCODE -ne 0){throw '桌宠未能开启，请查看 logs/pet-start.log。'}
    Write-Output '桌宠已开启。'
  }else{
    & $script -Hide -NoBackends|Out-Null
    if($LASTEXITCODE -ne 0){throw '桌宠未能退出，请查看 logs/pet-start.log。'}
    Write-Output '桌宠已退出，其他后台继续运行。'
  }
}catch{Write-Output ('ERROR|'+$_.Exception.Message);exit 1}
