@echo off
rem Abre AutoDJ: arranca el servidor local y el navegador.
cd /d "%~dp0"
start "" http://localhost:8080
py server.py 8080
pause
