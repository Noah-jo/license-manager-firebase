const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
function section(from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}
const remarks = '=SUM(1,2)\n<contact>\r\nNext\rLast';
let output;
const context = vm.createContext({
  syncReady: true,
  sortState: { key: 'expiry', direction: 'asc' },
  isValidDateText: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
  getFilters: () => ({ expiringDays: 30 }),
  getFilteredLicenses: () => [{ name: 'Sample', seats: '1', expiry: '2030-01-15', price: 12.5, remarks }],
  getStatus: () => ({ label: 'Active', daysLeft: 10 }),
  downloadFile: (filename, content, type) => { output = { filename, content, type }; }
});
vm.runInContext(section('function storedPrice(', 'function sortLicensesByExpiry(')
  + section('function escapeHtml(', 'function safeHttpUrl(')
  + section('function csvEscape(', 'function importTextValue(')
  + section('function excelCellText(', 'function exportJsonBackup('), context);
context.exportRows('excel');
assert.equal(output.type, 'application/vnd.ms-excel;charset=utf-8');
assert.ok(output.content.includes("'=SUM(1,2)") || output.content.includes('&#039;=SUM(1,2)'));
assert.ok(output.content.includes('&lt;contact&gt;'));
assert.equal((output.content.match(/mso-data-placement:same-cell/g) || []).length, 3);
assert.ok(!output.content.includes('<contact>'));
context.exportRows('csv');
assert.ok(output.content.includes('"\'=SUM(1,2)\n<contact>\r\nNext\rLast"'));
context.getFilteredLicenses = () => [
  { name: 'High price', seats: '1', expiry: '2030-01-15', price: 100 },
  { name: 'Low price', seats: '1', expiry: '2031-01-15', price: 9 }
];
context.sortState.key = 'price';
for (const direction of ['asc', 'desc']) {
  context.sortState.direction = direction;
  for (const format of ['csv', 'excel']) {
    context.exportRows(format);
    const first = direction === 'asc' ? 'Low price' : 'High price';
    const second = direction === 'asc' ? 'High price' : 'Low price';
    assert.ok(output.content.indexOf(first) < output.content.indexOf(second), `${format} must follow displayed ${direction} price order`);
  }
}
console.log('Export checks passed (multiline Excel cells, CSV and escaped text).');

context.licenseMessage = {};
context.setMessage = () => {};
context.state = { licenses: [] };
vm.runInContext(section('function exportJsonBackup(', 'function startLicenseListener('), context);
for (const subLink of ['https://[bad', 'javascript:alert(1)', '  https://example.com/path  ', '', null, undefined]) {
  context.state.licenses = [{ name: 'Legacy backup', seats: '1', subLink, remarks }];
  context.exportJsonBackup();
  assert.equal(output.type, 'application/json;charset=utf-8');
  const records = JSON.parse(output.content);
  assert.equal(records.length, 1);
  assert.equal(records[0].subLink, subLink ?? '', 'Backup must not discard or normalize stored link text');
  assert.equal(records[0].remarks, remarks);
}
context.syncReady = false;
output = null;
context.exportJsonBackup();
assert.equal(output, null, 'Unsynchronized data must not be downloaded as a complete backup');
console.log('JSON backup checks passed (raw legacy links retained, multiline text and sync gate).');

context.syncReady = true;
const priceFields = {};
context.$ = (id) => priceFields[id] ??= {};
context.getStatus = () => ({ type: 'active', label: 'Active', daysLeft: 10 });
vm.runInContext(section('function renderStats(', 'function renderLicenses('), context);
for (const invalid of ['broken', -1, Infinity, -Infinity, NaN, true, {}, []]) {
  assert.equal(context.storedPrice(invalid), null);
  context.renderStats([{ price: invalid }, { price: 12.5 }]);
  assert.equal(priceFields['stat-total-price'].textContent, '12.50');
  assert.match(priceFields['stat-price-note'].textContent, /未計入 1 筆異常價格/);
  context.state.licenses = [{ name: 'Invalid', seats: '1', price: invalid }];
  context.exportJsonBackup();
  const restored = JSON.parse(output.content)[0].price;
  assert.deepEqual(restored, typeof invalid === 'number' && !Number.isFinite(invalid) ? String(invalid) : invalid);
}
context.renderStats([{ price: 0 }, { price: '12.50' }, {}]);
assert.equal(priceFields['stat-total-price'].textContent, '12.50');
assert.equal(priceFields['stat-price-note'].textContent, '目前篩選結果');
context.getFilteredLicenses = () => [{ name: 'Invalid', seats: '1', price: '=SUM(1,2)' }, { name: 'Valid', seats: '1', price: 12.5 }];
context.exportRows('csv');
assert.ok(output.content.includes("'=SUM(1,2)"));
context.exportRows('excel');
assert.ok(output.content.includes('&#039;=SUM(1,2)'));
context.sortState = { key: 'price', direction: 'asc' };
const priceRecords = [{ name: 'Broken B', price: 'bad' }, { name: 'Valid', price: 12.5 }, { name: 'Broken A', price: -1 }];
assert.deepEqual(Array.from(context.sortVisibleLicenses(priceRecords), item => item.name), ['Valid', 'Broken A', 'Broken B']);
context.sortState.direction = 'desc';
assert.deepEqual(Array.from(context.sortVisibleLicenses(priceRecords), item => item.name), ['Broken A', 'Broken B', 'Valid']);
console.log('Legacy price checks passed (finite totals, explicit warnings, raw JSON, safe exports and deterministic sorting).');
context.licenseTable = { setAttribute() {} };
context.licensesBody = { innerHTML: '' };
context.updateStatFilterStates = () => {};
context.safeHttpUrl = () => '';
context.state = { licenseLoaded: true, licenses: [{ id: 'bad', name: 'Legacy', seats: '1', expiry: '', price: '<broken>"' }] };
context.getFilteredLicenses = () => context.state.licenses;
vm.runInContext(section('function renderLicenses(', 'function refreshLicenseTextValidity('), context);
context.renderLicenses();
assert.ok(context.licensesBody.innerHTML.includes('價格異常'));
assert.ok(context.licensesBody.innerHTML.includes('&lt;broken&gt;&quot;'));
assert.ok(!context.licensesBody.innerHTML.includes('<broken>'));
context.state.licenseLoaded = false;
context.renderLicenses();
assert.equal(priceFields['stat-price-note'].textContent, '等待同步');
console.log('Legacy price rendering checks passed (escaped original values and cleared stale totals).');

for (const value of ['=1+1', '+1+1', '-1+1', '@SUM(1,1)', '\t=1+1', '\r=1+1', '\ntext', '  =1+1', '　＠SUM(1,1)', '＝1+1', '＋1+1', '－1+1']) {
  assert.equal(context.spreadsheetSafeText(value), "'" + value);
}
for (const value of ['normal', 'two\rrows', 'two\nrows', 'quoted, "text"', '　normal', '']) {
  assert.equal(context.spreadsheetSafeText(value), value);
}
assert.equal(context.csvEscape('one\rtwo'), '"one\rtwo"', 'Lone CR must not break a CSV record');
assert.equal(context.csvEscape('one\r"two'), '"one\r""two"');
context.state.licenses = [{ name: 'Legacy export', seats: '1', expiry: '=1+1', price: 0, remarks: 'one\rtwo' }];
context.exportRows('csv');
assert.ok(output.content.includes("'=1+1"));
assert.ok(output.content.includes('"one\rtwo"'));
context.exportRows('excel');
assert.ok(output.content.includes('&#039;=1+1'));
context.exportJsonBackup();
assert.equal(JSON.parse(output.content)[0].expiry, '=1+1');
assert.equal(JSON.parse(output.content)[0].remarks, 'one\rtwo');
console.log('Spreadsheet boundary checks passed (control characters, Unicode prefixes, lone CR and raw backups).');
