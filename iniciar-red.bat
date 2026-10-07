@echo off
rem Abre AutoDJ tambien para el celular: mismo servidor, visible en tu Wi-Fi.
cd /d "%~dp0"
py server.py 8080 --red
pause
