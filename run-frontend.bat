@echo off
setlocal

set "ROOT=%~dp0"
set "FRONTEND_DIR=%ROOT%frontend"

if not exist "%FRONTEND_DIR%\package.json" (
  echo Frontend package.json not found at %FRONTEND_DIR%
  pause
  exit /b 1
)

if not exist "%ROOT%.env" (
  if exist "%ROOT%.env.example" (
    copy /Y "%ROOT%.env.example" "%ROOT%.env" >nul
    echo Created root .env from .env.example
  )
)

cd /d "%FRONTEND_DIR%"

if not exist "node_modules" (
  echo Installing frontend dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if not exist ".env" (
  if exist ".env.example" (
    copy /Y ".env.example" ".env" >nul
    echo Created frontend .env from .env.example
  )
)

echo Starting frontend at http://localhost:5173 ...
call npm run dev -- --host=localhost --port=5173

pause
endlocal
