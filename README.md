# License Manager Firebase Web

This is the cloud web version of the local Flask/SQLite License Manager.

## What it uses

- GitHub Pages for the static web app
- Cloud Firestore for license data and settings
- Shared-password gate before the app UI opens
- JSON backup import for moving data from the local version
- Sortable license table with one-click filter reset
- Duplicate-safe JSON import: exact records are skipped and reported
- Two-step JSON import preview: review new and duplicate counts before writing

## Access control

- The initial shared password is `36961500`.
- The password can optionally be changed from the online app's settings panel.
- The shared password `36961500` remains permanently valid, even after a custom password is added.

## Security note

The online version intentionally keeps the simple shared-password workflow requested for this tool. Because GitHub Pages is a static site, this is a convenience gate rather than server-side identity security; Firestore rules currently allow the app's signed-out browser to read and write data. Do not reuse the shared password for sensitive systems.

## Backup flow

- Local version: use `備份 JSON` to export, then `選擇 JSON` to preview the differences before importing into SQLite.
- Online version: use `備份 JSON` to export Firestore records, then choose a JSON file and press `開始匯入` after reviewing the difference summary.
- Both import flows validate required fields, prices, and subscription URLs before writing. Non-empty dates must be valid; a blank date is preserved only for legacy records that already had no expiry date.
