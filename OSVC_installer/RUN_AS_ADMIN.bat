@echo off
goto check_Permissions

:check_Permissions
    net session > nul 2>&1
    if %errorLevel% == 0 (
        START /w powershell winget install ffmpeg;
        START /w msiexec.exe /i "%~dp0\OpenSpace_Video_Creator.msi" /passive

        echo COMPLETE
        echo NOTE: If you got any errors, try runnning the script again
        echo Press any key to exit...
    ) else (
        echo Failure: Run the file as ADMIN
    )

    pause > nul