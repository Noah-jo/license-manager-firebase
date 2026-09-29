"""Check the static web app's non-negotiable UI and access-flow contract."""

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "public" / "index.html").read_text(encoding="utf-8")
JS = (ROOT / "public" / "app.js").read_text(encoding="utf-8")

required_html = {
    'id="auth-form"': "password login form",
    'id="gate-password"': "shared password field",
    'id="toggle-password"': "password visibility toggle",
    'id="export-json"': "JSON backup button",
    'id="json-import"': "JSON import field",
    'id="json-import-label"': "JSON import control state",
    'id="settings-form"': "password settings form",
    'id="connection-dot"': "connection status indicator",
    'id="clear-filters"': "clear filters button",
    'data-sort-key="expiry"': "sortable license table",
    'data-stat-filter="expired"': "quick status filter cards",
    'id="import-json-submit"': "JSON import submit button",
    'id="add-license"': "empty-state destination",
    'id="expiry-required-mark"': "legacy expiry hint",
}
required_js = {
    "unlockWithPassword": "shared password flow",
    "togglePassword": "password visibility flow",
    "exportJsonBackup": "JSON backup flow",
    "importJsonBackup": "JSON import flow",
    "safeHttpUrl": "safe link validation",
    "isValidDateText": "calendar date validation",
    "licenseRecordKey": "duplicate import protection",
    "sortLicenses": "table sorting flow",
    "sortLicensesByExpiry": "complete license snapshot sorting",
    "updateStatFilterStates": "quick status filter state",
    'sessionStorage.getItem("licenseManagerUnlocked")': "session restore flow",
    "hasDuplicateLicense": "manual duplicate protection",
    "正在同步授權資料": "initial sync loading state",
    "previewJsonBackup": "JSON import preview flow",
    "inputHash === DEFAULT_PASSWORD_HASH": "permanent shared password fallback",
    "setSyncAvailability": "write safety while Firebase sync is pending",
    "snapshot.metadata.fromCache": "cache-only sync safety",
    "empty-action": "empty-state add action",
    "data-empty-clear": "empty-state filter reset action",
    "pendingImportCount": "deferred JSON import readiness",
    "新密碼至少需要 6 個字元": "password length validation",
    "unknownDateCount": "legacy backup date warning",
    "isValidDateText(item.expiry)": "unknown expiry sort placement",
    "expiryRequiredMark": "legacy edit expiry hint",
    "allowBlankExpiry": "legacy edit compatibility",
    "settingsSaveButton": "sync-gated password settings",
    "deleteDisabled": "sync-gated delete control",
    "正在同步授權資料，請稍候再刪除": "delete write safety",
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
