@echo off
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-pendencias.ps1 -OnlyBooking
echo.
echo Concluido. Pode fechar esta janela.
pause
