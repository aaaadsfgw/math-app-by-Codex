@echo off
setlocal
pushd "%~dp0" || exit /b 1

node -e "const [major,minor]=process.versions.node.split('.').map(Number); if(major<22 || (major===22 && minor<12)) process.exit(1)" >nul 2>&1
if errorlevel 1 (
    echo Install Node.js 22.12 or newer, then run setup again.
    goto failed
)

call npm.cmd ls --all --include=dev >nul 2>&1
if errorlevel 1 (
    call npm.cmd ci --include=dev --no-audit --no-fund
    if errorlevel 1 goto failed
)

node node_modules\electron\install.js
if errorlevel 1 goto failed

node desktop\pix2text\setup.mjs
if errorlevel 1 goto failed

"%SystemRoot%\System32\cscript.exe" //nologo //E:JScript "desktop\windows-shortcut.js" setup
if errorlevel 1 goto failed

echo Setup complete. Open Math Study Log on your desktop.
popd
pause
exit /b 0

:failed
echo Setup failed. See the message above.
popd
pause
exit /b 1
