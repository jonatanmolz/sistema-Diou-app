@echo off
REM Vai até a pasta do sistema
cd /d "C:\Sistema Financeiro"

REM Inicia o servidor Python na porta 5500
start cmd /k py -m http.server 5500

REM Aguarda 2 segundos e abre o navegador na página de login
timeout /t 2 >nul
start http://localhost:5500/login.html
