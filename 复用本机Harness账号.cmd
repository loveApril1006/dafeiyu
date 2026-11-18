@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Reuse-DeepSeekAccount.ps1" -Root "%~dp0."
pause
