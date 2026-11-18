param([ValidateSet('read','save','probe','status','bridge-status')][string]$Action='read',[string]$Root=$PSScriptRoot,[string]$SettingsFile='')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'Runtime-Common.ps1')
try{
 $arguments=@((Join-Path $Root 'qq-gateway.mjs'),$Action,$Root);if($SettingsFile){$arguments+=$SettingsFile}
 & (Get-SuiteNode $Root) @arguments
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
}catch{Write-Output ('ERROR|'+$_.Exception.Message);exit 1}
