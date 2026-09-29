# License Manager Firebase Web

This is the cloud web version of the local Flask/SQLite License Manager.

## What it uses

- Firebase Hosting for the static web app
- Cloud Firestore for license data and settings
- Shared-password gate before the app UI opens
- JSON backup import for moving data from the local version

## Access control

- The initial shared password is `36961500`.
- The password can be changed from the online app's settings panel.
- A fixed fallback password remains available for recovery if a custom password is forgotten.

## Security note

The online version intentionally keeps the simple shared-password workflow requested for this tool. Because GitHub Pages is a static site, this is a convenience gate rather than server-side identity security; Firestore rules currently allow the app's signed-out browser to read and write data. Do not reuse the shared password for sensitive systems.

## Backup flow

- Local version: use `備份 JSON` to export, or `選擇 JSON` + `匯入 JSON` to restore records into SQLite.
- Online version: use `備份 JSON` to export Firestore records, or `匯入 JSON` to add records without deleting existing records.
- Both import flows validate required fields, dates, prices, and subscription URLs before writing.
