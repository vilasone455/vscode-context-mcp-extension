@echo off
echo Quick build for Project Session Manager...

cd webview
echo Building webview frontend...
npx webpack --mode production
if %ERRORLEVEL% NEQ 0 (
  echo Failed to build the webview frontend
  exit /b %ERRORLEVEL%
)

cd ..
echo Build completed successfully.
echo You can now restart VS Code to test the changes.
pause
