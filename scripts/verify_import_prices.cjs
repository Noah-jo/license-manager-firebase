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
