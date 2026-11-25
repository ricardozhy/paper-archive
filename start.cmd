@echo off
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0scripts\start-local.ps1"
if errorlevel 1 pause
