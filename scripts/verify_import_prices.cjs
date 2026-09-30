const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const start = source.indexOf('function importTextValue(');
const end = source.indexOf('function getImportedRecords(', start);
assert.ok(start >= 0 && end > start);
// Only price validation is under test; external timestamp and link/date helpers
// are supplied without touching Firebase or any user's records.
const context = vm.createContext({
    safeHttpUrl: (value) => value,
    isValidDateText: () => true,
    serverTimestamp: () => null
});
vm.runInContext(source.slice(start, end), context);
const record = { name: 'Test price', seats: '1', expiry: '2030-01-15' };
for (const price of [true, false, {}, [], -0.001, Infinity, NaN, 'not a number']) {
    assert.throws(() => context.normalizeImportedLicense({ ...record, price }, 0), /價格無效/);
}
for (const [price, expected] of [[12.5, 12.5], ['12.50', 12.5], [0, 0], ['', 0], [null, 0], [undefined, 0]]) {
    assert.equal(context.normalizeImportedLicense({ ...record, price }, 0).price, expected);
}
console.log('Online import price checks passed (invalid types and legacy values).');

async function verifyBackupReader() {
    const readerStart = source.indexOf('async function readJsonBackup(');
    const readerEnd = source.indexOf('async function previewJsonBackup(', readerStart);
    assert.ok(readerStart >= 0 && readerEnd > readerStart);
    vm.runInContext(source.slice(readerStart, readerEnd), context);
    for (const prefix of ['', '\uFEFF']) {
        const result = await context.readJsonBackup({ text: async () => prefix + '[{"name":"正常備份"}]' });
        assert.equal(result[0].name, '正常備份');
    }
    await assert.rejects(context.readJsonBackup({ text: async () => '{broken json' }), /JSON 格式不正確/);
    await assert.rejects(context.readJsonBackup({ text: async () => { throw new Error('Unreadable file'); } }), /無法讀取備份檔案/);
    let changeHandler;
    let summary;
    const file = { text: async () => '{broken json' };
    context.jsonImport = { value: 'same-backup.json', files: [file], addEventListener: (_, handler) => { changeHandler = handler; } };
    context.importJsonSubmit = { disabled: false };
    context.importRequestId = 0;
    context.jsonImportPending = false;
    context.syncReady = true;
    context.licenseMessage = {};
    context.setMessage = () => {};
    context.formatFirebaseError = (error) => error.message;
    context.setImportSummary = (message) => { summary = message; };
    context.previewJsonBackup = async (backup) => {
        await context.readJsonBackup(backup);
        return { total: 1, unique: [{}], skipped: 0, unknownDateCount: 0 };
    };
    const changeStart = source.indexOf('jsonImport.addEventListener("change"');
    const changeEnd = source.indexOf('jsonImportLabel.addEventListener(', changeStart);
    assert.ok(changeStart >= 0 && changeEnd > changeStart);
    vm.runInContext(source.slice(changeStart, changeEnd), context);
    await changeHandler({ target: context.jsonImport });
    assert.equal(context.jsonImport.value, '', 'Failed preview clears the file input for reselection');
    assert.equal(context.importJsonSubmit.disabled, true);
    assert.ok(summary.includes('JSON 格式不正確'));
    file.text = async () => '[]';
    context.jsonImport.value = 'same-backup.json';
    await changeHandler({ target: context.jsonImport });
    assert.equal(context.importJsonSubmit.disabled, false, 'A corrected file can be previewed again');
    console.log('Backup reader checks passed (UTF-8 BOM, malformed JSON and read failures).');
}
verifyBackupReader().catch((error) => { console.error(error); process.exitCode = 1; });
