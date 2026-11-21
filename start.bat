@echo off
title CardioVisionAI - Launcher
cd /d "%~dp0"

if not exist "backend\.venv\Scripts\python.exe" (
  echo Please run setup.bat first.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Please run setup.bat first.
  pause
  exit /b 1
)

echo Starting the AI backend...
start "CardioVisionAI - backend (keep open)" /d "%~dp0backend" cmd /k .venv\Scripts\python.exe -m uvicorn main:app --port 8000

echo Starting the website...
start "CardioVisionAI - website (keep open)" /d "%~dp0" cmd /k npm run dev

echo Opening the browser in a few seconds...
timeout /t 10 /nobreak >nul
start "" http://localhost:5173

echo.
echo CardioVisionAI is running at http://localhost:5173
echo Keep the two black windows open. Close them to stop the app.
timeout /t 8 >nul
