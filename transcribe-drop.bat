@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "CONFIG_PATH=%~f0.yml"
set "LAUNCHER_SCRIPT=%ROOT_DIR%scripts\drop-transcribe.js"

if "%~1"=="" (
  echo Drop a video/audio file or folder onto this BAT file.
  echo Config file: "%CONFIG_PATH%"
  echo.
  pause
  exit /b 1
)

if not exist "%LAUNCHER_SCRIPT%" (
  echo Launcher script not found: "%LAUNCHER_SCRIPT%"
  echo.
  pause
  exit /b 1
)

if not exist "%CONFIG_PATH%" (
  echo Config file not found: "%CONFIG_PATH%"
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  echo.
  pause
  exit /b 1
)

node "%LAUNCHER_SCRIPT%" --config "%CONFIG_PATH%" %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
pause
exit /b %EXIT_CODE%
