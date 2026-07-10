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

## Deploy

With Firebase CLI authenticated:

```powershell
firebase use jo-license-manager-20260710
firebase deploy --only firestore
```

## Passwords

- Initial shared password: `36961500`
- Permanent fallback password: `Noah1234`
- Change the shared password in Settings after logging in.

## GitHub

The GitHub CLI token on this machine is currently invalid. Re-authenticate first:

```powershell
gh auth login -h github.com
```

Then create and push a repository from `firebase-web/`:

```powershell
git add .
git commit -m "Build Firebase web license manager"
gh repo create license-manager-firebase --private --source . --remote origin --push
```

The included GitHub Actions workflow publishes `public/` to GitHub Pages when `codex/firebase-web` is pushed.

## Import old SQLite data

Run the export script from this folder:

```powershell
python scripts/export_sqlite_to_json.py
```

It creates `licenses-export.json`. Importing that JSON to Firestore can be automated later with an Admin SDK script after Firebase credentials are available.
