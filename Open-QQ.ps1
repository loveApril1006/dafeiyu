param([string]$Root=$PSScriptRoot)
$ErrorActionPreference='Stop'
try{& (Join-Path $Root 'Start-QQ.ps1') -Root $Root -OpenBrowser -CopyPassword}
catch{Add-Type -AssemblyName System.Windows.Forms;[Windows.Forms.MessageBox]::Show($_.Exception.Message,'QQ登录服务未就绪','OK','Error')|Out-Null;exit 1}
