@echo off
REM ============================================================
REM  AIRLOCK C2 - one-click launcher
REM  Double-click this file to:
REM    1) install dependencies if missing, then
REM    2) start the dev server and open the browser automatically.
REM  (Terminal equivalent:  pnpm start )
REM  NOTE: ASCII-only on purpose - a .cmd with non-ASCII text is
REM        mis-decoded by cmd.exe (cp949) and breaks. Do not add
REM        Korean here.
REM ============================================================
cd /d "%~dp0"

where pnpm >nul 2>nul
if errorlevel 1 goto use_npm

if not exist "node_modules" (
  echo [*] Installing dependencies with pnpm ...
  call pnpm install
)
echo [*] Starting dev server + opening browser ...
call pnpm start
goto done

:use_npm
echo [!] pnpm not found - using npm instead.
if not exist "node_modules" (
  echo [*] Installing dependencies with npm ...
  call npm install
)
echo [*] Starting dev server + opening browser ...
call npm run start

:done
echo.
echo [Server stopped. You can close this window.]
pause
