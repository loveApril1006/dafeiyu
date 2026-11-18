param([Parameter(Mandatory=$true)][string]$Root,[string]$DesktopPath='')
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'Set-DafeiyuShortcut.ps1') -Root $Root -DesktopPath $DesktopPath
