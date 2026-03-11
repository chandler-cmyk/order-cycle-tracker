@echo off
echo.
echo  ========================================
echo   Order Cycle Tracker - Starting Up...
echo  ========================================
echo.

:: Start the backend server in a new window
echo  Starting backend server (port 3001)...
start "Order Tracker - Backend" cmd /k "cd /d %~dp0 && node server.js"

:: Wait 2 seconds for server to start
timeout /t 2 /nobreak >nul

:: Start the React frontend
echo  Starting React frontend (port 3000)...
echo  Browser will open automatically...
echo.
start "Order Tracker - Frontend" cmd /k "cd /d %~dp0 && npm start"

echo  Both services are starting!
echo  The app will open in your browser shortly.
echo.
pause
