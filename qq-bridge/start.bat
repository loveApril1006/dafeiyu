@echo off
setlocal
cd /d "%~dp0"
set "bridge_node=node"
if exist "..\SnowLuma\node.exe" set "bridge_node=%~dp0..\SnowLuma\node.exe"
"%bridge_node%" scripts\harden-state-acl.mjs
if exist "..\runtime\node.exe" if exist "..\Start-Bridge.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\Start-Bridge.ps1" -Root "%~dp0.."
  exit /b
)
"%bridge_node%" start-qq-bridge.mjs
