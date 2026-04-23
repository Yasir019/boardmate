@echo off
setlocal

echo Stopping BoardMate backend/frontend processes...

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":8000 .*LISTENING"') do (
  taskkill /PID %%P /F >nul 2>&1
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":5173 .*LISTENING"') do (
  taskkill /PID %%P /F >nul 2>&1
)

echo Done.
endlocal
