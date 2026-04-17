@echo off
setlocal

set "ROOT=%~dp0"

echo Cleaning old backend/frontend processes...
call "%ROOT%stop-all.bat" >nul 2>nul

echo Starting backend and frontend in separate windows...
start "BoardMate Backend" cmd /k "cd /d %ROOT% & call run-backend.bat"
start "BoardMate Frontend" cmd /k "cd /d %ROOT% & call run-frontend.bat"

echo.
echo BoardMate starting...
echo Backend:  http://127.0.0.1:8000
echo Frontend: http://localhost:5173

endlocal
