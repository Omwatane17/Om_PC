@echo off
title PradnyaChakshu — Launcher
color 0B

echo.
echo  ==========================================
echo   PradnyaChakshu AI Bias Detection Platform
echo   H2S Hackathon - Unbiased AI Decision Track
echo  ==========================================
echo.
echo  Starting services...
echo.

:: ── Start Backend ─────────────────────────────────────────────────────────────
echo  [1/2] Launching Backend  ^>  http://localhost:8000
start "PradnyaChakshu Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --reload --port 8000"

:: Wait for backend to boot
timeout /t 5 /nobreak >nul

:: ── Start Frontend ────────────────────────────────────────────────────────────
echo  [2/2] Launching Frontend ^>  http://localhost:5173
start "PradnyaChakshu Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

:: Wait for Vite to boot
timeout /t 5 /nobreak >nul

:: ── Open Browser ──────────────────────────────────────────────────────────────
start "" http://localhost:5173

echo.
echo  ==========================================
echo   All services running!
echo.
echo   Frontend  : http://localhost:5173
echo   Backend   : http://localhost:8000
echo   API Docs  : http://localhost:8000/api/docs
echo   WebSocket : ws://localhost:8000/ws/audits/^{id^}
echo.
echo   Demo login:
echo     Email    : demo@pradnyachakshu.io
echo     Password : demo1234
echo  ==========================================
echo.
echo  Close this window anytime. Servers run independently.
pause >nul
