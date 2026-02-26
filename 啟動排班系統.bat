@echo off
setlocal enabledelayedexpansion

:: 設定標題
title 掃地排班管理系統 - 啟動器

echo ========================================
echo   掃地排班管理系統 V10.1 啟動中...
echo ========================================

:: 檢查 Node.js 是否安裝 (若要使用 npx)
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [警告] 偵測不到 Node.js。
    echo 本系統需要 Node.js 才能正確執行。
    echo 請安裝 Node.js (https://nodejs.org/^)
    pause
    exit /b
)

:: 啟動伺服器並自動打開瀏覽器
echo 正在啟動伺服器並開啟瀏覽器...
echo 伺服器網址: http://127.0.0.1:8080
echo.
echo (請勿關閉此視窗，關閉後系統將停止服務)

:: 使用 npx 啟動 http-server，並在成功後打開預設瀏覽器
start "" "http://127.0.0.1:8080"
npx -y http-server ./ -p 8080 -c-1

pause
