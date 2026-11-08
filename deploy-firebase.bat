@echo off
REM ============================================================
REM Firebase & Cloud Run 1-Click Deployment Script
REM ============================================================

echo ============================================================
echo   AUCTION WEB APPLICATION - FIREBASE DEPLOYMENT
echo ============================================================

set /p PROJECT_ID="Enter your Firebase Project ID: "
if "%PROJECT_ID%"=="" (
    echo [ERROR] Project ID cannot be empty!
    pause
    exit /b 1
)

set /p DB_URL="Enter your Cloud PostgreSQL DATABASE_URL: "
if "%DB_URL%"=="" (
    echo [ERROR] DATABASE_URL cannot be empty!
    pause
    exit /b 1
)

echo.
echo [1/4] Migrating database to Cloud PostgreSQL...
call node restore_cloud_db.js "%DB_URL%"

echo.
echo [2/4] Configuring Google Cloud project and building container...
call gcloud config set project %PROJECT_ID%
call gcloud services enable run.googleapis.com cloudbuild.googleapis.com
call gcloud builds submit --tag gcr.io/%PROJECT_ID%/auction-app

echo.
echo [3/4] Deploying to Cloud Run with WebSockets enabled...
call gcloud run deploy auction-app --image gcr.io/%PROJECT_ID%/auction-app --platform managed --region us-central1 --allow-unauthenticated --timeout=3600 --set-env-vars DATABASE_URL="%DB_URL%",NODE_ENV="production"

echo.
echo [4/4] Deploying Firebase Hosting rewrites...
call firebase use %PROJECT_ID%
call firebase deploy --only hosting

echo.
echo ============================================================
echo  DEPLOYMENT COMPLETE!
echo  Visit: https://%PROJECT_ID%.web.app
echo ============================================================
pause
