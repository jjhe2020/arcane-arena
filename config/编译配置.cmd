@echo off
chcp 65001 >nul
cd /d "%~dp0.."
call npm run config:compile
if errorlevel 1 pause
