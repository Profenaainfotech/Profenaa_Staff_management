@echo off
schtasks /End /TN "Profenaa Attendance Agent" >nul 2>nul
schtasks /Delete /F /TN "Profenaa Attendance Agent"
echo The agent will no longer start automatically.
echo Your registration and saved settings are kept in %%APPDATA%%\ProfenaaAttendance
pause
