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
  getFilters: () => ({ expiringDays: 30 }),
  getFilteredLicenses: () => [{ name: 'Sample', seats: '1', expiry: '2030-01-15', price: 12.5, remarks }],
  getStatus: () => ({ label: 'Active', daysLeft: 10 }),
  downloadFile: (filename, content, type) => { output = { filename, content, type }; }
});
vm.runInContext(section('function escapeHtml(', 'function safeHttpUrl(')
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
console.log('Export checks passed (multiline Excel cells, CSV and escaped text).');
