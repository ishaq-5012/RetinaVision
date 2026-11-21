@echo off
title CardioVisionAI - Setup
cd /d "%~dp0"
echo.
echo ==========================================
echo   CardioVisionAI - one-time setup
echo ==========================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [X] Python was not found.
  echo     Install Python 3.11 from https://www.python.org/downloads/
  echo     and TICK "Add Python to PATH" during installation.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js was not found.
  echo     Install Node.js 20 LTS from https://nodejs.org/
  pause
  exit /b 1
)

echo [1/3] Creating Python environment...
if exist "backend\.venv" rmdir /s /q "backend\.venv"
python -m venv "backend\.venv"
if errorlevel 1 (
  echo [X] Could not create the Python environment.
  pause
  exit /b 1
)

echo [2/3] Installing backend packages (a few minutes)...
"backend\.venv\Scripts\python.exe" -m pip install --upgrade pip
"backend\.venv\Scripts\python.exe" -m pip install -r "backend\requirements.txt"
if errorlevel 1 (
  echo [X] Backend packages failed to install. Check your internet connection and try again.
  pause
  exit /b 1
)

echo [3/3] Installing website packages (a few minutes)...
call npm install
if errorlevel 1 (
  echo [X] Website packages failed to install. Check your internet connection and try again.
  pause
  exit /b 1
)

echo.
echo ==========================================
echo   Setup complete!  Now double-click start.bat
echo ==========================================
pause
