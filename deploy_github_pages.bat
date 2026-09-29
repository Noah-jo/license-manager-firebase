@echo off
setlocal

set "REPO_DIR=%~dp0"
set "ROOT_DIR=%~dp0.."
set "PYTHON_EXE=C:\Users\Jo\AppData\Local\Microsoft\WindowsApps\python.exe"

cd /d "%ROOT_DIR%"

echo Running local tests...
"%PYTHON_EXE%" -m unittest discover -s tests -v || goto :local_error
"%PYTHON_EXE%" -m py_compile app.py tests\test_app.py || goto :local_error
"%PYTHON_EXE%" "%REPO_DIR%scripts\verify_static_app.py" || goto :local_error
node --check "%REPO_DIR%public\app.js" || goto :local_error
call "%ROOT_DIR%\build_exe.bat" || goto :local_error

cd /d "%REPO_DIR%"

for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT_BRANCH=%%B"
if not "%CURRENT_BRANCH%"=="codex/firebase-web" goto :branch_error
set "WORKTREE_STATUS="
for /f "delims=" %%S in ('git status --porcelain --untracked-files=all') do set "WORKTREE_STATUS=%%S"
if defined WORKTREE_STATUS goto :dirty_error

echo Checking GitHub CLI login...
gh auth status || goto :auth_error

echo.
echo Checking repository...
git remote get-url origin >nul 2>nul || git remote add origin https://github.com/Noah-jo/license-manager-firebase.git

echo.
echo Deploying Firebase Firestore rules...
call npx --yes firebase-tools deploy --only firestore:rules --project jo-license-manager-20260710 --non-interactive || goto :firebase_error

echo.
echo Pushing branch codex/firebase-web...
gh auth setup-git || goto :auth_error
set "GIT_TERMINAL_PROMPT=0"
git push --progress -u origin codex/firebase-web || goto :push_error

echo.
echo GitHub Actions will deploy the pushed commit once:
echo https://noah-jo.github.io/license-manager-firebase/
echo.
goto :finish

:local_error
echo.
echo Local verification failed. Nothing was pushed.
goto :finish

:firebase_error
echo.
echo Firebase rules deployment failed. Nothing was pushed.
goto :finish

:auth_error
echo.
echo GitHub CLI is not logged in in this terminal.
echo Run: gh auth login -h github.com --web --git-protocol https
goto :finish

:branch_error
echo.
echo This script only deploys the codex/firebase-web branch.
goto :finish

:dirty_error
echo.
echo Working tree is not clean. Commit or discard changes before deploying.
goto :finish

:push_error
echo.
echo Push failed. Check the error above.
goto :finish

:finish
endlocal
