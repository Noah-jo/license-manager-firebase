const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const fields = Object.fromEntries(['name', 'seats', 'expiry', 'payment-method', 'price', 'pic', 'user', 'sub-link', 'remarks'].map((id) => [id, { value: '' }]));
let accept = false;
let prompts = 0;
let beforeUnload;
const context = vm.createContext({
  $: (id) => fields[id],
  state: { unlocked: true, licenses: [{ id: 'a', name: 'Original', seats: '1', expiry: '2030-01-15' }, { id: 'b', name: 'Other', seats: '2', expiry: '2031-01-15' }] },
  licenseId: { value: '' }, expiryField: fields.expiry, expiryRequiredMark: {}, formTitle: {}, licenseMessage: {},
  cancelEdit: { classList: { add() {}, remove() {} } },
  licenseForm: { reset() { Object.values(fields).forEach((field) => { field.value = ''; }); } },
  document: { querySelector: () => ({ scrollIntoView() {} }) },
  window: { confirm() { prompts++; return accept; }, addEventListener(type, handler) { assert.equal(type, 'beforeunload'); beforeUnload = handler; } },
  setMessage() {}
});
const helpersStart = source.indexOf('function snapshotLicenseForm()');
const helpersEnd = source.indexOf('function hasDuplicateLicense(', helpersStart);
const actionsStart = source.indexOf('function editLicense(');
const actionsEnd = source.indexOf('function csvEscape(', actionsStart);
assert.ok(helpersStart >= 0 && helpersEnd > helpersStart && actionsStart >= 0 && actionsEnd > actionsStart);
vm.runInContext(source.slice(helpersStart, helpersEnd) + source.slice(actionsStart, actionsEnd), context);
vm.runInContext('const emptyLicenseFormSnapshot = snapshotLicenseForm(); let licenseFormBaseline = emptyLicenseFormSnapshot;', context);
context.editLicense('a');
assert.equal(prompts, 0);
assert.equal(context.hasUnsavedLicenseForm(), false, 'Loading an existing record is clean');
fields.name.value = 'My unfinished change';
context.editLicense('b');
assert.equal(fields.name.value, 'My unfinished change', 'Cancel switching preserves input');
context.duplicateLicense('b');
assert.equal(fields.name.value, 'My unfinished change', 'Cancel duplication preserves input');
let prevented = false;
beforeUnload({ preventDefault() { prevented = true; } });
assert.equal(prevented, true);
accept = true;
context.editLicense('b');
assert.equal(fields.name.value, 'Other');
assert.equal(context.hasUnsavedLicenseForm(), false);
context.duplicateLicense('a');
assert.equal(context.licenseId.value, '');
assert.equal(context.hasUnsavedLicenseForm(), true, 'A copied record is an unsaved new draft');
let cancelHandler;
context.cancelEdit.addEventListener = (_, handler) => { cancelHandler = handler; };
const cancelStart = source.indexOf('cancelEdit.addEventListener("click"');
const cancelEnd = source.indexOf('licensesBody.addEventListener(', cancelStart);
assert.ok(cancelStart >= 0 && cancelEnd > cancelStart);
vm.runInContext(source.slice(cancelStart, cancelEnd), context);
accept = false;
cancelHandler();
assert.equal(fields.name.value, 'Original', 'Cancel the discard prompt retains the copy');
accept = true;
cancelHandler();
assert.equal(context.hasUnsavedLicenseForm(), false, 'Successful saving/reset clears the warning');
console.log('Online unsaved form checks passed (switching, copying, leave and reset).');
