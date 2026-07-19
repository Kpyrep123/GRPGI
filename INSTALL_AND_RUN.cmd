@echo off
setlocal
cd /d "%~dp0"

echo [1/3] Clean dependency installation...
if exist node_modules rmdir /s /q node_modules
call npm ci
if errorlevel 1 goto :error

echo [2/3] Downloading/verifying Electron...
call npm run electron:check
if errorlevel 1 goto :electron_error

echo [3/3] Starting application...
call npm start
exit /b %errorlevel%

:electron_error
echo.
echo Electron download failed. Check access to GitHub, VPN/proxy and antivirus.
echo Then run: npm run electron:repair
exit /b 1

:error
echo.
echo npm dependency installation failed.
exit /b 1
