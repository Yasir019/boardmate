@echo off
setlocal

echo Stopping BoardMate backend/frontend processes...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"Get-CimInstance Win32_Process ^
| Where-Object { $_.CommandLine -and $_.CommandLine -match 'uvicorn app.main:app --reload --port 8000' -and $_.CommandLine -match 'boardmate' } ^
| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"Get-CimInstance Win32_Process ^
| Where-Object { $_.CommandLine -and $_.CommandLine -match 'vite(\\.js)?' -and $_.CommandLine -match 'boardmate\\frontend' } ^
| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo Done.

endlocal
