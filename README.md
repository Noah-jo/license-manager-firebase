# License Manager Firebase Web

This is the cloud web version of the local Flask/SQLite License Manager.

## What it uses

- Firebase Hosting for the static web app
- Cloud Firestore for license data and settings
- Google account sign-in before the app UI opens

## Access control

- The authorized administrator email is configured in `public/firebase-config.js`.
- Firebase Authentication must have the Google provider enabled.
- The GitHub Pages domain must be added to Firebase Authentication's authorized domains.
- Firestore rules only allow the verified authorized email to read or write data.

## Security note

The static site uses Firebase Authentication for identity and Firestore rules for the actual data boundary. The email address in the frontend is not a secret; the enforcement happens in Firestore rules.
