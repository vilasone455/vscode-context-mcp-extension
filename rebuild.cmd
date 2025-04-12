@echo off
echo Rebuilding Project Session Manager extension...

echo.
echo Step 1: Building the webview frontend...
cd webview
npm run build

echo.
echo Step 2: Packaging the extension...
cd ..
npx vsce package

echo.
echo Done! Extension has been rebuilt.
echo You can now install the new .vsix file by running:
echo code --install-extension project-session-manager-0.1.0.vsix
echo.
echo Please restart VS Code completely after installation.
pause
