# License Manager Firebase Web

This is the cloud web version of the local Flask/SQLite License Manager.

## What it uses

- Firebase Hosting for the static web app
- Cloud Firestore for license data and settings
- A shared password gate before the app UI opens

## Passwords

- Initial shared password: `36961500`
- Permanent fallback password: `Noah1234`
- The shared password can be changed in the Settings section after logging in.
- The fallback password is hardcoded as a SHA-256 hash in the frontend and is not changed by Settings.

## Security note

This is a convenient shared-password gate for a small private tool. Because it is a static frontend app, it is not the same as server-side password verification. The Firestore rules are public so the GitHub Pages app can work without a backend login service. If stricter access control is needed later, add Cloud Functions or switch back to Firebase Auth user accounts.
