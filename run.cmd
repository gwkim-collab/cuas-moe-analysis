@echo off
REM ── AIRLOCK C2 원클릭 실행 ──────────────────────────────────
REM 이 파일을 더블클릭하면 dev 서버가 뜨고 브라우저가 자동으로 열립니다.
REM (터미널에서 실행할 때는  pnpm start  와 동일)
cd /d "%~dp0"
call pnpm start
