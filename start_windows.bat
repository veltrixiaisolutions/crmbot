@echo off
title WhatsApp AI Chatbot Launcher (Windows)
color 0A

echo ======================================================================
echo          WhatsApp AI Chatbot Platform - Windows Launcher
echo ======================================================================
echo.
echo Launching Backend (FastAPI on Port 8040) and Frontend (Next.js on Port 3000)...
echo.

:: Launch Backend
start "WhatsApp Chatbot - Backend (Port 8040)" cmd /k "%~dp0run_backend.bat"

:: Small delay to let backend start initializing
timeout /t 3 /nobreak >nul

:: Launch Frontend
start "WhatsApp Chatbot - Frontend (Port 3000)" cmd /k "%~dp0run_frontend.bat"

echo.
echo ======================================================================
echo Both services have been launched in separate windows!
echo.
echo - Web Dashboard:       http://localhost:3000
echo - Backend API Docs:    http://localhost:8040/docs
echo - Webhook Endpoint:    http://localhost:8040/webhook
echo.
echo Keep both terminal windows open while using the application.
echo ======================================================================
echo.
pause
