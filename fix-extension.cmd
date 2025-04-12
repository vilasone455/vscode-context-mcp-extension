@echo off
echo ===== Project Session Manager Repair Tool =====
echo.
echo This script will fix and rebuild the extension.
echo.

echo Step 1: Building the webview frontend...
cd webview
call npx webpack --mode production
if %ERRORLEVEL% NEQ 0 (
  echo Failed to build the webview frontend!
  echo Please check the error messages above.
  pause
  exit /b %ERRORLEVEL%
)
cd ..

echo.
echo Build completed successfully!
echo.
echo To test the extension:
echo 1. Open VS Code
echo 2. Press Ctrl+Shift+P to open the command palette
echo 3. Type 'Developer: Restart Extension Host' and press Enter
echo.
echo If you still see issues:
echo - Check the Developer Tools console (Help -^> Toggle Developer Tools)
echo - Look for any error messages in the Output panel (View -^> Output)
echo   and select "Extension Development Host" from the dropdown.
echo.
echo If problems persist, you can try packaging the extension manually:
echo npx vsce package
echo.
pause
