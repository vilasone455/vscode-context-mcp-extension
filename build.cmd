@echo off
echo Building Project Session Manager...

REM Make sure the required directories exist
if not exist "dist" mkdir dist
if not exist "webview\dist" mkdir webview\dist

echo Installing dependencies...
call npm install

echo Building extension...
call npm run build

echo Done!
echo.
echo Please restart VS Code completely or press F5 to test the extension.
echo.
echo If still seeing issues, check the VS Code "Output" panel (View -> Output)
echo and select "Extension Development Host" from the dropdown.
pause
