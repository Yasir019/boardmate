@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_URL=http://127.0.0.1:8000"
set "FRONTEND_URL=http://localhost:5173"

echo Cleaning old backend/frontend processes...
call "%ROOT%stop-all.bat" >nul 2>nul

echo Starting backend and frontend in separate windows...
start "BoardMate Backend" cmd /k "cd /d %ROOT% & call run-backend.bat"
start "BoardMate Frontend" cmd /k "cd /d %ROOT% & call run-frontend.bat"

echo.
echo Checking service status...
call :wait_for_port 8000 10
set "BACKEND_STATUS=%ERRORLEVEL%"

call :wait_for_port 5173 10
set "FRONTEND_STATUS=%ERRORLEVEL%"

echo.
echo BoardMate startup summary:
if "%BACKEND_STATUS%"=="0" (
  echo Backend:  RUNNING at %BACKEND_URL%
) else (
  echo Backend:  FAILED to start on %BACKEND_URL%
  echo           Check the "BoardMate Backend" window for the real error.
)

if "%FRONTEND_STATUS%"=="0" (
  echo Frontend: RUNNING at %FRONTEND_URL%
) else (
  echo Frontend: FAILED to start on %FRONTEND_URL%
  echo           Check the "BoardMate Frontend" window for the real error.
)

endlocal
exit /b 0

:wait_for_port
setlocal
set "PORT=%~1"
set "MAX_TRIES=%~2"
set /a COUNT=0

:wait_loop
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  endlocal
  exit /b 0
)

set /a COUNT+=1
if %COUNT% GEQ %MAX_TRIES% (
  endlocal
  exit /b 1
)

timeout /t 1 /nobreak >nul
goto :wait_loop
