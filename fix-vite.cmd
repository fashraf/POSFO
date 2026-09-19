@echo off
REM Repairs "Error: The service was stopped" from esbuild.
REM
REM esbuild runs as a child process. That message means the process died or was
REM never able to start — almost always a half-written install, a Node upgrade
REM leaving a binary built for the old version, or antivirus quarantining
REM esbuild.exe. Reinstalling from clean fixes the first two.

cd /d "%~dp0"

echo.
echo Node and npm versions:
node --version
npm --version
echo.

echo Removing node_modules and the lockfile...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del /q package-lock.json

echo Clearing the npm cache...
call npm cache clean --force

echo.
echo Reinstalling...
call npm install
if errorlevel 1 goto failed

echo.
echo Rebuilding esbuild specifically...
call npm rebuild esbuild
if errorlevel 1 goto failed

echo.
echo Checking esbuild can actually run...
call node -e "require('esbuild').transformSync('const a=1');console.log('esbuild works')"
if errorlevel 1 goto esbuild_broken

echo.
echo === Repaired. Run: npm run dev ===
echo.
pause
exit /b 0

:esbuild_broken
echo.
echo === esbuild installed but will not run ===
echo.
echo This is almost always antivirus. Windows Defender and several corporate
echo scanners quarantine node_modules\esbuild\esbuild.exe because it is an
echo unsigned binary that spawns a local process.
echo.
echo Add an exclusion for:
echo   %CD%\node_modules
echo.
echo Then run this script again.
echo.
echo If that is not it, use the fallback config instead:
echo   rename vite.config.ts vite.config.ts.bak
echo   rename vite.config.mjs vite.config.js
echo   npm run dev
echo.
pause
exit /b 1

:failed
echo.
echo === Install failed. The error is above. ===
echo.
pause
exit /b 1
