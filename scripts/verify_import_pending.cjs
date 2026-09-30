const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
function section(startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start);
    return source.slice(start, end);
}
const availability = section('function setSyncAvailability(', 'function isConfigured(');
const changes = section('jsonImport.addEventListener("change"', 'jsonImportLabel.addEventListener(');
const submit = section('importJsonSubmit.addEventListener("click"', '\nif (!isConfigured())');
const logout = section('$("logout").addEventListener("click"', 'retrySyncButton.addEventListener(');
function control() { return { disabled: false, attributes: {}, classList: { toggle() {} }, setAttribute(key, value) { this.attributes[key] = value; } }; }

async function check(outcome) {
    let handler, changeHandler, logoutHandler, resolve, reject, calls = 0, summary = '';
    const file = {};
    const jsonImport = { ...control(), value: 'backup.json', addEventListener: (_, fn) => changeHandler = fn };
    const importJsonSubmit = { ...control(), addEventListener: (_, fn) => handler = fn };
    const label = control();
    const context = vm.createContext({
        syncReady: true, licenseSavePending: false, jsonImportPending: false,
        pendingJsonFile: file, pendingImportCount: 3, importRequestId: 0,
        jsonImport, importJsonSubmit, jsonImportLabel: label,
        saveLicenseButton: control(), syncBoundControls: [jsonImport], licenseMessage: {},
        state: { unlocked: true },
        $: () => ({ addEventListener: (_, fn) => logoutHandler = fn }),
        confirmDiscardLicenseForm: () => true, resetLicenseForm() {},
        sessionStorage: { removeItem() {} }, setConnectionState() {}, showOnly() {},
        setMessage() {}, setImportSummary(message) { summary = message; },
        formatFirebaseError: error => error.message,
        previewJsonBackup() { throw new Error('File changes must be ignored while importing'); },
        importJsonBackup(actualFile) {
            calls++;
            assert.equal(actualFile, file);
            return new Promise((res, rej) => { resolve = res; reject = rej; });
        }
    });
    vm.runInContext(availability + changes + submit + logout, context);
    const pending = handler();
    assert.equal(context.jsonImportPending, true);
    assert.equal(jsonImport.disabled, true);
    assert.equal(importJsonSubmit.disabled, true);
    assert.equal(importJsonSubmit.attributes['aria-busy'], 'true');
    assert.equal(label.attributes.tabindex, '-1');
    assert.match(summary, /正在處理匯入/);
    context.setSyncAvailability(true);
    assert.equal(importJsonSubmit.disabled, true, 'Sync events must not reenable import');
    assert.equal(jsonImport.disabled, true);
    await handler();
    await changeHandler({ target: { files: [{}] } });
    assert.equal(calls, 1);
    assert.equal(context.pendingJsonFile, file);
    logoutHandler();
    assert.equal(context.state.unlocked, true, 'Pending imports cannot log out');
    assert.match(summary, /等待處理結束後再登出/);
    if (outcome === 'failure') reject(new Error('Test failure'));
    else resolve({ cancelled: outcome === 'cancel' });
    await pending;
    assert.equal(context.jsonImportPending, false);
    assert.equal(jsonImport.disabled, false);
    assert.equal(label.attributes.tabindex, '0');
    assert.equal(importJsonSubmit.disabled, true, 'No stale file is ready after completion');
    assert.equal(importJsonSubmit.attributes['aria-busy'], 'false');
    assert.equal(context.pendingJsonFile, null);
    assert.equal(jsonImport.value, '');
    assert.match(summary, outcome === 'failure' ? /匯入失敗/ : outcome === 'cancel' ? /已取消匯入/ : /匯入完成/);
    context.setSyncAvailability(false);
    assert.equal(jsonImport.disabled, true, 'Offline import remains disabled');
    logoutHandler();
    assert.equal(context.state.unlocked, false, 'Logout works again after import ends');
}
Promise.all(['success', 'failure', 'cancel'].map(check))
    .then(() => console.log('Online pending import checks passed (locks, sync events, duplicate submits, completion and failure).'))
    .catch(error => { console.error(error); process.exitCode = 1; });
