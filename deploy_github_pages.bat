@echo off
setlocal

set "REPO_DIR=%~dp0"
set "ROOT_DIR=%~dp0.."
set "PYTHON_EXE=C:\Users\Jo\AppData\Local\Microsoft\WindowsApps\python.exe"

cd /d "%ROOT_DIR%"

echo Running local tests...
"%PYTHON_EXE%" -m unittest discover -s tests -v || goto :local_error
"%PYTHON_EXE%" -m py_compile app.py tests\test_app.py || goto :local_error
call "%ROOT_DIR%\build_exe.bat" || goto :local_error

cd /d "%REPO_DIR%"

echo Checking GitHub CLI login...
gh auth status || goto :auth_error

echo.
echo Checking repository...
git remote get-url origin >nul 2>nul || git remote add origin https://github.com/Noah-jo/license-manager-firebase.git

echo.
echo Deploying Firebase Firestore rules...
npx --yes firebase-tools deploy --only firestore:rules --project jo-license-manager-20260710 --non-interactive || goto :firebase_error

echo.
echo Pushing branch codex/firebase-web...
git push -u origin codex/firebase-web || goto :push_error

echo.
echo GitHub Actions will deploy the pushed commit once:
echo https://noah-jo.github.io/license-manager-firebase/
echo.
goto :done

:local_error
echo.
echo Local verification failed. Nothing was pushed.
goto :done

:firebase_error
echo.
echo Firebase rules deployment failed. Nothing was pushed.
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
endlocal
