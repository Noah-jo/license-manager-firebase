"""Check the static web app's non-negotiable UI and access-flow contract."""

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "public" / "index.html").read_text(encoding="utf-8")
JS = (ROOT / "public" / "app.js").read_text(encoding="utf-8")

required_html = {
    'id="auth-form"': "password login form",
    'id="gate-password"': "shared password field",
    'id="export-json"': "JSON backup button",
    'id="json-import"': "JSON import field",
    'id="settings-form"': "password settings form",
    'id="connection-dot"': "connection status indicator",
    'id="clear-filters"': "clear filters button",
    'data-sort-key="expiry"': "sortable license table",
}
required_js = {
    "unlockWithPassword": "shared password flow",
    "exportJsonBackup": "JSON backup flow",
    "importJsonBackup": "JSON import flow",
    "safeHttpUrl": "safe link validation",
    "licenseRecordKey": "duplicate import protection",
    "sortLicenses": "table sorting flow",
}
forbidden_auth = {
    "firebase-auth.js": "Firebase Auth module",
    "GoogleAuthProvider": "Google provider",
    "signInWithPopup": "Google popup sign-in",
    "onAuthStateChanged": "Firebase Auth state listener",
    "allowedAdminEmail": "email allow-list",
}

errors = []
for marker, label in required_html.items():
    if marker not in HTML:
        errors.append(f"missing HTML {label}: {marker}")
for marker, label in required_js.items():
    if marker not in JS:
        errors.append(f"missing JavaScript {label}: {marker}")
for marker, label in forbidden_auth.items():
    if marker in HTML or marker in JS:
        errors.append(f"forbidden {label}: {marker}")

if errors:
    print("Static app verification failed:")
    print("\n".join(f"- {error}" for error in errors))
    sys.exit(1)

print("Static app verification passed.")
