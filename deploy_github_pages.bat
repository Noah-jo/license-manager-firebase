@echo off
setlocal

cd /d "%~dp0"

echo Checking GitHub CLI login...
gh auth status || goto :auth_error

echo.
echo Checking repository...
gh repo view Noah-jo/license-manager-firebase >nul 2>nul
if errorlevel 1 (
  echo Creating GitHub repository Noah-jo/license-manager-firebase...
  gh repo create Noah-jo/license-manager-firebase --public --source . --remote origin
) else (
  echo Repository already exists.
  git remote remove origin >nul 2>nul
  git remote add origin https://github.com/Noah-jo/license-manager-firebase.git
)

echo.
echo Pushing branch codex/firebase-web...
git push -u origin codex/firebase-web || goto :push_error

echo.
echo Triggering GitHub Pages workflow...
gh workflow run "Deploy GitHub Pages" --repo Noah-jo/license-manager-firebase --ref codex/firebase-web

echo.
echo Waiting for workflow to start...
timeout /t 8 /nobreak >nul
gh run list --repo Noah-jo/license-manager-firebase --workflow "Deploy GitHub Pages" --limit 5

echo.
echo GitHub Pages URL should be:
echo https://noah-jo.github.io/license-manager-firebase/
echo.
echo If the workflow is still running, wait 1-2 minutes and refresh the URL.
goto :done

:auth_error
echo.
echo GitHub CLI is not logged in in this terminal.
echo Run: gh auth login -h github.com --web --git-protocol https
goto :done

:push_error
echo.
echo Push failed. Check the error above.
goto :done

:done
echo.
pause
endlocal
