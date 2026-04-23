@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "BACKEND_PYTHON=%BACKEND_DIR%\.venv\Scripts\python.exe"
set "ROOT_PYTHON=%ROOT%.venv\Scripts\python.exe"

cd /d "%BACKEND_DIR%"

if exist "%BACKEND_PYTHON%" (
  "%BACKEND_PYTHON%" -c "import uvicorn" >nul 2>&1
  if errorlevel 1 (
    echo Backend dependencies are not installed in:
    echo   %BACKEND_PYTHON%
    echo.
    echo Run these commands once:
    echo   cd /d "%BACKEND_DIR%"
    echo   .\.venv\Scripts\python.exe -m ensurepip --upgrade
    echo   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
    exit /b 1
  )

  "%BACKEND_PYTHON%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
  exit /b %ERRORLEVEL%
)

if exist "%ROOT_PYTHON%" (
  "%ROOT_PYTHON%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
  exit /b %ERRORLEVEL%
)

echo Backend Python environment not found.
echo Expected one of:
echo   %BACKEND_PYTHON%
echo   %ROOT_PYTHON%
exit /b 1
