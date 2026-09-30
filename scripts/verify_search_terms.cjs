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
context.state.licenses = [
    { name: 'Normal software', expiry: '2030-01-15' },
    { name: 'Missing date legacy', expiry: '' },
    { name: 'Invalid date legacy', expiry: 'bad-date' }
];
context.getStatus = item => ({ type: !item.expiry || item.expiry === 'bad-date' ? 'unknown' : 'active' });
query = ''; status = 'unknown';
assert.deepEqual(Array.from(context.getFilteredLicenses(), item => item.name), ['Missing date legacy', 'Invalid date legacy']);
query = 'Missing';
assert.equal(context.getFilteredLicenses().length, 1, 'Date and search filters combine');
status = 'active';
assert.equal(context.getFilteredLicenses().length, 0, 'Unknown records are not active');
console.log('Unknown-date filter checks passed (missing and invalid dates, combined search).');
const savedFields = { search: { value: '' }, 'status-filter': { value: 'all' }, 'expiring-days': { value: '30' } };
const restoreContext = vm.createContext({
    $: id => savedFields[id], VIEW_STATE_KEY: 'test', VIEW_SORT_KEYS: new Set(['expiry']), sortState: {},
    getViewStorages: () => [{ getItem: () => JSON.stringify({ status: 'unknown', search: 'Legacy', expiringDays: 30 }) }]
});
const restoreStart = source.indexOf('function restoreViewState(');
const restoreEnd = source.indexOf('function setMessage(', restoreStart);
assert.ok(restoreStart >= 0 && restoreEnd > restoreStart);
vm.runInContext(source.slice(restoreStart, restoreEnd), restoreContext);
restoreContext.restoreViewState();
assert.equal(savedFields['status-filter'].value, 'unknown');
const local = fs.readFileSync(path.join(__dirname, '..', '..', 'templates/index.html'), 'utf8');
const localStart = local.indexOf('    function restoreSavedFilters(');
const localEnd = local.indexOf('    function syncExportRowOrder(', localStart);
assert.ok(localStart >= 0 && localEnd > localStart);
let restoredUrl;
const localContext = vm.createContext({
    URL, URLSearchParams, LOCAL_INDEX_URL: '/',
    window: { location: { href: 'http://localhost/', replace: url => restoredUrl = url } },
    readLocalViewState: () => ({ filters: { status: 'unknown', q: 'Legacy', expiring_days: 30 } })
});
vm.runInContext(local.slice(localStart, localEnd), localContext);
assert.equal(localContext.restoreSavedFilters(), true);
assert.equal(new URL(restoredUrl, 'http://localhost').searchParams.get('status'), 'unknown');
console.log('Unknown-date view restoration checks passed (local and online saved filters).');
