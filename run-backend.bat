@echo off
cd /d %~dp0backend
uv run uvicorn app.main:app --reload --port 8000
pause
