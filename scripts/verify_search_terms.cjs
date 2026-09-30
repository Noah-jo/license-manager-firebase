const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const start = source.indexOf('function getFilteredLicenses(');
const end = source.indexOf('function licenseRecordKey(', start);
assert.ok(start >= 0 && end > start);
let query = '', status = 'all';
const records = [
    { name: 'Adobe Creative Cloud', user: '香港-Mandy', pic: 'Jo', remarks: '續約聯絡' },
    { name: 'V-Ray', user: '深圳-Alex', pic: 'Jo', remarks: '其他資料' }
];
const context = vm.createContext({
    state: { licenses: records },
    getFilters: () => ({ search: query.trim().toLowerCase(), status, expiringDays: 30 }),
    getStatus: () => ({ type: 'active' })
});
vm.runInContext(source.slice(start, end), context);
for (const [value, expected] of [['Adobe Mandy', 1], ['mandy ADOBE', 1], ['  Adobe\t  香港  ', 1],
    ['Adobe　續約', 1], ['Adobe Alex', 0], [' Jo ', 2], ['\t　 ', 2]]) {
    query = value;
    assert.equal(context.getFilteredLicenses().length, expected, value);
}
query = 'Adobe Mandy'; status = 'expired';
assert.equal(context.getFilteredLicenses().length, 0, 'Status filters still apply to keyword matches');
console.log('Online multi-keyword search checks passed (cross-field, reordered, Chinese and whitespace terms).');
