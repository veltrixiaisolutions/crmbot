@echo off
title WhatsApp Chatbot - Frontend Dashboard
cd /d "%~dp0frontend"

echo ======================================================================
echo                WhatsApp Chatbot - Frontend Dashboard
echo ======================================================================
echo.

:: 1. Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in your Windows PATH!
    echo.
    echo Please install Node.js (v18, v20, or newer) from:
    echo   https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [1/3] Node.js detected:
node --version
echo.

:: 2. Check if node_modules exists, install dependencies if missing
if not exist "node_modules\" (
    echo [2/3] First-time setup: Installing frontend dependencies (npm install)...
    echo This may take 1-2 minutes depending on your internet connection...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install encountered an error.
        pause
        exit /b 1
    )
    echo Frontend dependencies installed successfully.
) else (
    echo [2/3] node_modules detected.
)
echo.

:: 3. Ensure .env.local exists
if not exist ".env.local" (
    if exist ".env.local.example" (
        copy .env.local.example .env.local
    ) else (
        echo NEXT_PUBLIC_API_URL=> .env.local
        echo INTERNAL_BACKEND_URL=http://127.0.0.1:8040>> .env.local
    )
)

:: 4. Start Next.js development server
echo [3/3] Starting Next.js frontend development server...
echo Access the dashboard in your browser at:
echo   http://localhost:3000
echo.
echo (Press Ctrl+C to stop the frontend)
echo.
call npm run dev
pause
