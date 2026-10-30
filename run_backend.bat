@echo off
title WhatsApp Chatbot - Backend Service
cd /d "%~dp0backend"

echo ======================================================================
echo                WhatsApp Chatbot - Backend Service
echo ======================================================================
echo.

:: 1. Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your Windows PATH!
    echo.
    echo Please install Python 3.10, 3.11, or 3.12 from:
    echo   https://www.python.org/downloads/
    echo.
    echo CRITICAL: Ensure you check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

echo [1/4] Python detected:
python --version
echo.

:: 2. Check and setup virtual environment
if not exist "venv\Scripts\activate.bat" (
    echo [2/4] Creating new Python virtual environment in 'backend\venv'...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo Virtual environment created successfully.
) else (
    echo [2/4] Virtual environment exists.
)
echo.

:: 3. Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

:: 4. Install/Verify dependencies
echo [3/4] Installing / updating required dependencies from requirements.txt...
python -m pip install --upgrade pip
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [WARNING] Some dependencies had installation issues. Retrying or continuing...
)
echo.

:: 5. Check .env file
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] No .env found. Copying .env.example to .env ...
        copy .env.example .env
        echo [INFO] Please review backend\.env and add your API keys if needed.
    )
)

:: Ensure uploads directory exists
if not exist "uploads\" (
    mkdir uploads
)

:: 6. Run FastAPI backend with Uvicorn
echo [4/4] Starting FastAPI backend on http://127.0.0.1:8040 ...
echo (Press Ctrl+C to stop the backend)
echo.
uvicorn app.main:app --reload --port 8040
pause
