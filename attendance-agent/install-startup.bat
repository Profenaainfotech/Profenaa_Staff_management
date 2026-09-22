@echo off
setlocal
cd /d "%~dp0"
title Profenaa Attendance Agent - install

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install the LTS version from https://nodejs.org , then run this file again.
  pause
  exit /b 1
)

if not exist "%APPDATA%\ProfenaaAttendance\device.json" (
  echo This computer is not registered yet. Starting setup...
  echo.
  node index.js --setup
  if errorlevel 1 (
    echo.
    echo Setup did not finish. Fix the problem above and run this file again.
    pause
    exit /b 1
  )
)

if not exist "node_modules\node-notifier" (
  echo.
  echo Installing desktop notifications ^(optional^)...
  call npm install --omit=dev --no-audit --no-fund
)

schtasks /Create /F /SC ONLOGON /RL LIMITED /TN "Profenaa Attendance Agent" /TR "wscript.exe \"%~dp0start-hidden.vbs\""
if errorlevel 1 (
  echo Could not create the start-up task.
  pause
  exit /b 1
)

schtasks /Run /TN "Profenaa Attendance Agent" >nul 2>nul

echo.
echo Done. The agent starts automatically every time you sign in to Windows.
echo Check it any time with:  node index.js --status
echo.
echo IMPORTANT (Windows 11 24H2 or newer): turn ON
echo   Settings ^> Privacy ^& security ^> Location
echo otherwise Windows hides the Wi-Fi name and attendance cannot be recorded.
pause
