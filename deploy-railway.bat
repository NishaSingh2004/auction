@echo off
REM ============================================================
REM Railway 1-Click Deployment Script
REM ============================================================

echo ============================================================
echo   AUCTION WEB APPLICATION - RAILWAY DEPLOYMENT
echo ============================================================
echo.

echo [Step 1/5] Checking Railway authentication...
call npx --yes @railway/cli whoami >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo Please log in to Railway in the browser window that opens...
    call npx --yes @railway/cli login
)

echo.
echo [Step 2/5] Initializing Railway Project...
call npx --yes @railway/cli init

echo.
echo [Step 3/5] Adding PostgreSQL Database...
call npx --yes @railway/cli add -d postgres

echo.
echo [Step 4/5] Deploying Application Container (WebSockets + Node.js)...
call npx --yes @railway/cli up --detach

echo.
echo [Step 5/5] Generating Public HTTPS Domain...
call npx --yes @railway/cli domain

echo.
echo ============================================================
echo  DEPLOYMENT INITIATED!
echo  Run "npx @railway/cli status" or visit https://railway.app
echo  to view your live link and dashboard!
echo ============================================================
echo.
echo To import all 147 players into your Railway PostgreSQL:
echo 1. Run: npx @railway/cli variables
echo 2. Copy the DATABASE_URL value
echo 3. Run: node restore_cloud_db.js "COPIED_DATABASE_URL"
echo ============================================================
pause
