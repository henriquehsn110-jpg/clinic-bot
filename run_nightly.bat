@echo off
title ClinicaBot SaaS Pro — Nightly Test Suite (Staging)
color 0A
echo ================================================================
echo 🌙 CLINICABOT SAAS PRO — NIGHTLY TEST SUITE
echo ================================================================
echo.

set DOTENV_CONFIG_PATH=.env.staging
cmd.exe /c "set \"DOTENV_CONFIG_PATH=.env.staging\" && node -r dotenv/config tests/run_night_suite.js"

echo.
echo ================================================================
echo Execucao concluida! Verifique o log salvo na pasta logs/
echo ================================================================
pause
