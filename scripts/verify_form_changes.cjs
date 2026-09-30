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
  licenseForm: { reset() { Object.values(fields).forEach((field) => { field.value = ''; }); }, setAttribute() {} },
  saveLicenseButton: {}, syncReady: true,
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
vm.runInContext('let licenseSavePending = false; const emptyLicenseFormSnapshot = snapshotLicenseForm(); let licenseFormBaseline = emptyLicenseFormSnapshot;', context);
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
context.setLicenseSavePending(true);
assert.ok(Object.values(fields).every((field) => field.readOnly));
assert.equal(context.saveLicenseButton.disabled, true);
assert.equal(context.confirmDiscardLicenseForm(), false, 'An active save cannot switch forms');
context.editLicense('b');
assert.equal(fields.name.value, '', 'An active save cannot replace the current form');
context.setLicenseSavePending(false);
assert.ok(Object.values(fields).every((field) => !field.readOnly));
assert.equal(context.saveLicenseButton.disabled, false);
console.log('Online unsaved form checks passed (switching, copying, leave and reset).');

async function verifyPendingWrites() {
  let submitHandler;
  let resolveWrite;
  let rejectWrite;
  let writes = 0;
  context.licenseForm.addEventListener = (_, handler) => { submitHandler = handler; };
  context.licenseForm.querySelector = () => context.saveLicenseButton;
  context.readLicenseForm = () => ({ name: fields.name.value, seats: '1', expiry: '2030-01-15' });
  context.hasDuplicateLicense = () => false;
  context.isValidDateText = () => true;
  context.serverTimestamp = () => null;
  context.formatFirebaseError = (error) => error.message;
  context.db = {};
  context.collection = () => ({});
  context.addDoc = () => {
    writes++;
    return new Promise((resolve, reject) => { resolveWrite = resolve; rejectWrite = reject; });
  };
  const submitStart = source.indexOf('licenseForm.addEventListener("submit"');
  const submitEnd = source.indexOf('cancelEdit.addEventListener(', submitStart);
  assert.ok(submitStart >= 0 && submitEnd > submitStart);
  vm.runInContext(source.slice(submitStart, submitEnd), context);
  fields.name.value = 'Pending record';
  const failed = submitHandler({ preventDefault() {} });
  assert.equal(writes, 1);
  await submitHandler({ preventDefault() {} });
  assert.equal(writes, 1, 'A second submit cannot start another Firebase write');
  assert.equal(fields.name.readOnly, true);
  rejectWrite(new Error('Simulated write failure'));
  await failed;
  assert.equal(fields.name.value, 'Pending record', 'Failure retains every input');
  assert.equal(fields.name.readOnly, false);
  assert.equal(context.hasUnsavedLicenseForm(), true);
  const succeeded = submitHandler({ preventDefault() {} });
  assert.equal(writes, 2);
  resolveWrite();
  await succeeded;
  assert.equal(fields.name.value, '');
  assert.equal(context.hasUnsavedLicenseForm(), false);
  assert.equal(context.saveLicenseButton.disabled, false);
  console.log('Online pending-save checks passed (duplicate submit, failure and success).');
}
verifyPendingWrites().catch((error) => { console.error(error); process.exitCode = 1; });
