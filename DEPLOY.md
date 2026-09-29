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

Run the local tests and build from the repository root before pushing the online version:

```powershell
python -m unittest discover -s tests -v
python -m py_compile app.py tests\test_app.py
.\build_exe.bat
```

Only after those checks pass should changes under `firebase-web/` be committed and pushed. GitHub Actions then publishes `public/` to GitHub Pages.

## GitHub

Push the verified online changes from `firebase-web/`:

```powershell
git add .
git commit -m "Update Firebase web license manager"
git push origin codex/firebase-web
```

The included GitHub Actions workflow publishes `public/` to GitHub Pages when `codex/firebase-web` is pushed.

## Import old SQLite data

Run the export script from this folder:

```powershell
python scripts/export_sqlite_to_json.py
```

It creates `licenses-export.json`. Importing that JSON to Firestore can be automated later with an Admin SDK script after Firebase credentials are available.

The current web UI can import this JSON directly after entering the shared password. Import is additive: it creates new records and never deletes existing Firestore documents.
