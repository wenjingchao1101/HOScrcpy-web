@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo   HOScrcpy-Web Launcher
echo   =====================

:: Check Java
where java >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] java not found, please install JRE/JDK first
    pause
    exit /b 1
)

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] node not found, please install Node.js first
    pause
    exit /b 1
)

:: Check npm dependencies
if not exist "node_modules" (
    echo [INFO] Installing npm dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
)

:: Compile Java if needed
if not exist "out\StreamBridge.class" (
    echo [INFO] Compiling Java source...
    if not exist "out" mkdir out
    javac -cp "lib\hosScrcpy-1.0.15-beta.jar" -d out src\StreamBridge.java
    if %errorlevel% neq 0 (
        echo [ERROR] Java compilation failed
        pause
        exit /b 1
    )
    echo [INFO] Compiled successfully
)

:: Start server
echo.
call npm start
pause
