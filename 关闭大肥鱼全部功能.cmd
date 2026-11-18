@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Stop-All.ps1" -Root "%~dp0."
if errorlevel 1 pause
