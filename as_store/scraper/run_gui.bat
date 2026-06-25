@echo off
REM Double-click this file to open the scraper window.
cd /d "%~dp0"
python gui.py
if errorlevel 1 (
    echo.
    echo The app failed to start. Make sure dependencies are installed:
    echo     pip install -r requirements.txt
    pause
)
