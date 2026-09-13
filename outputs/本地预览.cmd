@echo off
setlocal
set "PORT=8123"
cd /d "%~dp0site"

rem The 3D lanyard widget loads its model with fetch(), which browsers block
rem on file:// URLs. Serving the folder over http avoids that, so we reuse an
rem already-running preview server when possible and start one otherwise.
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:%PORT%/' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1

if not "%errorlevel%"=="0" (
  echo Starting local preview server on port %PORT% ...
  start "site-preview" /min cmd /c "python -m http.server %PORT% --bind 127.0.0.1"
  timeout /t 3 /nobreak >nul
)

start "" "http://127.0.0.1:%PORT%/index.html"
