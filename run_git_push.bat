@echo off
chcp 65001 >nul
title Git Push TMS_ePOD

echo =======================================
echo  Starting Git Commit and Push...
echo =======================================
echo.

echo [1/3] Adding files to Git...
git add src/lib/actions/fuel-actions.ts src/app/api/cron/sync-fuel/route.ts src/scripts/test-bangchak-api.js

echo.
echo [2/3] Committing changes...
git commit -m "feat: update daily fuel price sync with new Bangchak API and cron route"

echo.
echo [3/3] Pushing to remote...
git push

echo.
echo =======================================
echo  Git Push Completed!
echo =======================================
pause
