@echo off
set ROOT=%~dp0
set PYTHON_EXE=%ROOT%.venv\Scripts\python.exe

if not exist "%PYTHON_EXE%" (
	echo Virtual environment not found at %PYTHON_EXE%
	echo Create it once with: py -m venv .venv
	pause
	exit /b 1
)

cd /d "%ROOT%backend"

"%PYTHON_EXE%" -c "import fastapi,uvicorn" >nul 2>&1
if errorlevel 1 (
	echo Installing backend dependencies one time...
	"%PYTHON_EXE%" -m pip install -r requirements.txt
	if errorlevel 1 (
		echo Dependency install failed.
		pause
		exit /b 1
	)
)

"%PYTHON_EXE%" -m uvicorn app.main:app --reload --port 8000
pause
