@echo off
setlocal
echo Restarting DSH NEXT to load dsh-status-dashboard...
taskkill /IM "DSH NEXT.exe" /F >nul 2>&1
timeout /t 3 /nobreak >nul
start "" "%LOCALAPPDATA%\Programs\DSH NEXT\DSH NEXT.exe"
echo Restarted. The status button should appear at the top-right of the title bar.
timeout /t 3 /nobreak >nul
