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
vm.runInContext(section('function sortValue(', 'function sortLicensesByExpiry(')
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
