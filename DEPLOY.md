# Deploy Notes

## Current local app

The web app is in this folder:

```text
firebase-web/
```

It is separate from the original Flask/SQLite desktop version in the parent folder.

## Firebase setup

Current Firebase project:

```text
jo-license-manager-20260710
```

Enable these Firebase products:

- Firestore Database
- GitHub Pages for hosting

The Firebase Web App config has already been written to:

```text
public/firebase-config.js
```

Firebase Authentication is not required for this version. The web app keeps the shared-password flow, with the initial password `36961500`.

## Deploy

With Firebase CLI authenticated:

```powershell
firebase use jo-license-manager-20260710
firebase deploy --only firestore
```

## Access control

The online version uses the shared-password gate. The Firestore rules intentionally remain open so the static GitHub Pages app can read and write after the browser-side gate. This is suitable for operational convenience, not sensitive data protection.

## Local-first release flow

The recommended deployment script now runs the local tests, static web-app contract check, and EXE build first, deploys the current Firestore rules, then pushes the existing commit. The push automatically triggers GitHub Pages once:

```powershell
.\deploy_github_pages.bat
```

If the local checks or Firebase rules deployment fails, the script stops before pushing. Commit changes under `firebase-web/` before running it; it never creates a commit for you.

## GitHub

Push the verified online changes from `firebase-web/`:

```powershell
git add .
git commit -m "Update Firebase web license manager"
git push origin codex/firebase-web
```

The included GitHub Actions workflow publishes `public/` to GitHub Pages when `codex/firebase-web` is pushed.

## Import and restore JSON data

Run the export script from this folder:

```powershell
python scripts/export_sqlite_to_json.py
```

It creates `licenses-export.json`.

- In the local version, use `選擇 JSON`, review the read-only difference preview, then press `匯入 JSON` to restore records into SQLite.
- In the online version, enter the shared password, use `備份 JSON` to export Firestore records, then review the new/duplicate counts before pressing `開始匯入`.
- Both imports are additive and never delete existing records.
