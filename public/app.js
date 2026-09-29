import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const DEFAULT_PASSWORD_HASH = "e998fc0a412fb55901c4e193face07ff6c6c47a44462aa8c92bc792b7d35b8a2";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const state = {
  unlocked: sessionStorage.getItem("licenseManagerUnlocked") === "true",
  licenses: [],
  licenseUnsubscribe: null,
  licenseLoaded: false
};

const $ = (id) => document.getElementById(id);

const authScreen = $("auth-screen");
const appScreen = $("app-screen");
const authForm = $("auth-form");
const authMessage = $("auth-message");
const gatePassword = $("gate-password");
const togglePassword = $("toggle-password");
const licenseForm = $("license-form");
const licenseId = $("license-id");
const formTitle = $("form-title");
const cancelEdit = $("cancel-edit");
const licensesBody = $("licenses-body");
const licenseMessage = $("license-message");
const jsonImport = $("json-import");
const settingsForm = $("settings-form");
const settingsMessage = $("settings-message");
const connectionDot = $("connection-dot");
const currentUser = $("current-user");
const jsonImportSummary = $("json-import-summary");
const importJsonSubmit = $("import-json-submit");
const saveLicenseButton = licenseForm.querySelector(".save-button");
const syncBoundControls = [$("export-csv"), $("export-excel"), $("export-json"), jsonImport];
const jsonImportLabel = $("json-import-label");
const sortState = { key: "expiry", direction: "asc" };
let pendingJsonFile = null;
let importRequestId = 0;
let syncReady = false;

$("today-date").textContent = new Intl.DateTimeFormat("zh-HK", {
  year: "numeric",
  month: "long",
  day: "numeric"
}).format(new Date());

function showOnly(screen) {
  authScreen.classList.toggle("hidden", screen !== "auth");
  appScreen.classList.toggle("hidden", screen !== "app");
}

function setMessage(element, message = "", success = false) {
  element.textContent = message;
  element.classList.toggle("success", success && Boolean(message));
}

function setConnectionState(state, label, title = label) {
  connectionDot.dataset.state = state;
  connectionDot.title = title;
  currentUser.textContent = label;
}

function setSyncAvailability(ready) {
  syncReady = ready;
  saveLicenseButton.disabled = !ready;
  syncBoundControls.forEach((control) => {
    control.disabled = !ready;
  });
  jsonImportLabel.classList.toggle("disabled", !ready);
  jsonImportLabel.setAttribute("aria-disabled", String(!ready));
  if (!ready) {
    pendingJsonFile = null;
    importJsonSubmit.disabled = true;
  }
}

function isConfigured() {
  return !firebaseConfig.projectId.startsWith("REPLACE_WITH");
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getPasswordHash() {
  const snap = await getDoc(doc(db, "settings", "access"));
  if (!snap.exists()) return DEFAULT_PASSWORD_HASH;
  return snap.data().passwordHash || DEFAULT_PASSWORD_HASH;
}

async function ensurePasswordDoc() {
  const ref = doc(db, "settings", "access");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      passwordHash: DEFAULT_PASSWORD_HASH,
      updatedAt: serverTimestamp()
    });
  }
}

function formatFirebaseError(error) {
  const code = error?.code || "";
  if (code.includes("permission-denied")) return "Firebase 權限不足，請確認 Firestore Rules 已部署。";
  return error?.message || "操作失敗。";
}

function getDaysLeft(expiry) {
  if (!expiry) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDate = new Date(`${expiry}T00:00:00`);
  if (Number.isNaN(expiryDate.getTime())) return null;
  return Math.round((expiryDate - today) / 86400000);
}

function isValidDateText(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function getStatus(item, expiringDays = 30) {
  const daysLeft = getDaysLeft(item.expiry);
  if (daysLeft === null) return { type: "unknown", label: "日期未設定", daysLeft };
  if (daysLeft < 0) return { type: "expired", label: `已過期 ${Math.abs(daysLeft)} 日`, daysLeft };
  if (daysLeft <= expiringDays) return { type: "expiring", label: `剩餘 ${daysLeft} 日`, daysLeft };
  return { type: "active", label: `尚餘 ${daysLeft} 日`, daysLeft };
}

function getFilters() {
  const rawExpiringDays = Number($("expiring-days").value || 30);
  return {
    search: $("search").value.trim().toLowerCase(),
    status: $("status-filter").value,
    expiringDays: Number.isFinite(rawExpiringDays) ? Math.max(1, Math.floor(rawExpiringDays)) : 30
  };
}

function getFilteredLicenses() {
  const filters = getFilters();
  return state.licenses.filter((item) => {
    const status = getStatus(item, filters.expiringDays);
    const haystack = [
      item.name,
      item.seats,
      item.paymentMethod,
      item.pic,
      item.user,
      item.subLink,
      item.remarks
    ].join(" ").toLowerCase();

    if (filters.search && !haystack.includes(filters.search)) return false;
    if (filters.status === "expired" && status.type !== "expired") return false;
    if (filters.status === "expiring" && status.type !== "expiring") return false;
    if (filters.status === "active" && status.type !== "active") return false;
    return true;
  });
}

function licenseRecordKey(item) {
  return [
    String(item?.name ?? "").trim(),
    String(item?.seats ?? "").trim(),
    String(item?.expiry ?? "").trim(),
    String(item?.paymentMethod ?? item?.payment_method ?? "").trim(),
    Number(item?.price || 0).toFixed(2),
    String(item?.pic ?? "").trim(),
    String(item?.user ?? "").trim(),
    safeHttpUrl(item?.subLink ?? item?.sub_link ?? "") || "",
    String(item?.remarks ?? "").trim()
  ].join("\u001f");
}

function sortValue(item, key) {
  if (key === "status") return getStatus(item, getFilters().expiringDays).daysLeft ?? Number.POSITIVE_INFINITY;
  if (key === "price") return Number(item.price || 0);
  if (key === "expiry") return item.expiry || "9999-12-31";
  return String(item[key] ?? "").trim().toLocaleLowerCase("zh-Hant");
}

function sortVisibleLicenses(licenses) {
  const direction = sortState.direction === "asc" ? 1 : -1;
  return [...licenses].sort((left, right) => {
    const leftValue = sortValue(left, sortState.key);
    const rightValue = sortValue(right, sortState.key);
    let comparison;
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      comparison = leftValue - rightValue;
    } else {
      comparison = String(leftValue).localeCompare(String(rightValue), "zh-Hant", { numeric: true });
    }
    return comparison === 0
      ? String(left.name || "").localeCompare(String(right.name || ""), "zh-Hant")
      : comparison * direction;
  });
}

function sortLicensesByExpiry(licenses) {
  return [...licenses].sort((left, right) => {
    const leftExpiry = String(left.expiry || "9999-12-31");
    const rightExpiry = String(right.expiry || "9999-12-31");
    const expiryOrder = leftExpiry.localeCompare(rightExpiry);
    return expiryOrder || String(left.name || "").localeCompare(String(right.name || ""), "zh-Hant");
  });
}

function updateSortIndicators() {
  document.querySelectorAll(".sort-button").forEach((button) => {
    const active = button.dataset.sortKey === sortState.key;
    const header = button.closest("th");
    const indicator = button.querySelector(".sort-indicator");
    header?.setAttribute("aria-sort", active ? (sortState.direction === "asc" ? "ascending" : "descending") : "none");
    button.setAttribute("aria-label", `${button.textContent.replace(/[↕↑↓]/g, "").trim()}${active ? (sortState.direction === "asc" ? "，目前遞增排序" : "，目前遞減排序") : "，點擊排序"}`);
    if (indicator) indicator.textContent = active ? (sortState.direction === "asc" ? "↑" : "↓") : "↕";
  });
}

function sortLicenses(key) {
  if (sortState.key === key) {
    sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
  } else {
    sortState.key = key;
    sortState.direction = "asc";
  }
  updateSortIndicators();
  renderLicenses();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeHttpUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}

function renderStats(visible) {
  const filters = getFilters();
  const expired = visible.filter((item) => getStatus(item, filters.expiringDays).type === "expired").length;
  const expiring = visible.filter((item) => getStatus(item, filters.expiringDays).type === "expiring").length;
  const totalPrice = visible.reduce((sum, item) => sum + Number(item.price || 0), 0);

  $("stat-total").textContent = visible.length;
  $("stat-expired").textContent = expired;
  $("stat-expiring").textContent = expiring;
  $("stat-total-price").textContent = totalPrice.toFixed(2);
  $("visible-count").textContent = `${visible.length} 項結果`;
}

function renderLicenses() {
  if (!state.licenseLoaded) {
    $("stat-total").textContent = "—";
    $("stat-expired").textContent = "—";
    $("stat-expiring").textContent = "—";
    $("stat-total-price").textContent = "—";
    $("visible-count").textContent = "同步中";
    licensesBody.innerHTML = `
      <tr><td colspan="11" class="empty-row loading-row">
        <strong>正在同步授權資料</strong>
        <span class="muted">請稍候，正在連接 Firebase。</span>
      </td></tr>`;
    return;
  }

  const filters = getFilters();
  const filtered = getFilteredLicenses();
  const visible = sortVisibleLicenses(filtered);
  renderStats(visible);

  if (!visible.length) {
    const hasRecords = state.licenses.length > 0;
    licensesBody.innerHTML = `
      <tr><td colspan="11" class="empty-row">
        <strong>${hasRecords ? "找不到符合條件的授權" : "暫時沒有授權資料"}</strong>
        <span class="muted">${hasRecords ? "請清除搜尋或調整篩選條件。" : "新增第一項授權，或匯入 JSON 備份。"}</span>
      </td></tr>`;
    return;
  }

  licensesBody.innerHTML = visible.map((item) => {
    const status = getStatus(item, filters.expiringDays);
    const linkUrl = safeHttpUrl(item.subLink);
    const link = linkUrl
      ? `<a href="${escapeHtml(linkUrl)}" target="_blank" rel="noreferrer">打開</a>`
      : "-";

    return `
      <tr class="${status.type}">
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td>${escapeHtml(item.seats)}</td>
        <td>${escapeHtml(item.expiry)}</td>
        <td><span class="status ${status.type}">${escapeHtml(status.label)}</span></td>
        <td>${Number(item.price || 0).toFixed(2)}</td>
        <td>${escapeHtml(item.paymentMethod || "-")}</td>
        <td>${escapeHtml(item.pic || "-")}</td>
        <td>${escapeHtml(item.user || "-")}</td>
        <td>${link}</td>
        <td>${escapeHtml(item.remarks || "-")}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="secondary" data-edit="${item.id}">編輯</button>
            <button type="button" class="danger" data-delete="${item.id}">刪除</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function resetLicenseForm() {
  licenseForm.reset();
  licenseId.value = "";
  formTitle.textContent = "新增授權";
  cancelEdit.classList.add("hidden");
}

function hasDuplicateLicense(record, ignoreId = "") {
  const key = licenseRecordKey(record);
  return state.licenses.some((item) => item.id !== ignoreId && licenseRecordKey(item) === key);
}

function readLicenseForm() {
  const rawPrice = $("price").value.trim();
  const price = rawPrice === "" ? 0 : Number(rawPrice);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("價格必須是 0 或以上的有限數字。");
  }

  const subLink = safeHttpUrl($("sub-link").value);
  if (subLink === null) {
    throw new Error("訂閱連結必須是有效的 HTTP 或 HTTPS 網址。");
  }

  return {
    name: $("name").value.trim(),
    seats: $("seats").value.trim(),
    expiry: $("expiry").value,
    paymentMethod: $("payment-method").value.trim(),
    price,
    pic: $("pic").value.trim(),
    user: $("user").value.trim(),
    subLink,
    remarks: $("remarks").value.trim(),
    updatedAt: serverTimestamp()
  };
}

function editLicense(id) {
  const item = state.licenses.find((license) => license.id === id);
  if (!item) return;
  licenseId.value = item.id;
  $("name").value = item.name || "";
  $("seats").value = item.seats || "";
  $("expiry").value = item.expiry || "";
  $("payment-method").value = item.paymentMethod || "";
  $("price").value = item.price || "";
  $("pic").value = item.pic || "";
  $("user").value = item.user || "";
  $("sub-link").value = item.subLink || "";
  $("remarks").value = item.remarks || "";
  formTitle.textContent = "編輯授權";
  cancelEdit.classList.remove("hidden");
  document.querySelector(".editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function spreadsheetSafeText(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function normalizeImportedLicense(item, index) {
  const name = String(item?.name ?? "").trim();
  const seats = String(item?.seats ?? "").trim();
  const expiry = String(item?.expiry ?? "").trim();
  const price = item?.price === "" || item?.price == null ? 0 : Number(item.price);
  const subLink = safeHttpUrl(item?.subLink ?? item?.sub_link ?? "");

  if (!name || !seats || !isValidDateText(expiry)) {
    throw new Error(`第 ${index + 1} 筆資料缺少名稱、數量或有效到期日期。`);
  }
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`第 ${index + 1} 筆資料的價格無效。`);
  }
  if (subLink === null) {
    throw new Error(`第 ${index + 1} 筆資料的訂閱連結不是 HTTP(S) 網址。`);
  }

  return {
    name,
    seats,
    expiry,
    paymentMethod: String(item?.paymentMethod ?? item?.payment_method ?? "").trim(),
    price,
    pic: String(item?.pic ?? "").trim(),
    user: String(item?.user ?? "").trim(),
    subLink,
    remarks: String(item?.remarks ?? "").trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function getImportedRecords(parsed) {
  const records = Array.isArray(parsed) ? parsed : parsed?.licenses;
  if (!Array.isArray(records) || !records.length) {
    throw new Error("JSON 備份內沒有可匯入的授權資料。");
  }
  const normalized = records.map(normalizeImportedLicense);
  const existingKeys = new Set(state.licenses.map(licenseRecordKey));
  const unique = [];
  let skipped = 0;
  normalized.forEach((record) => {
    const key = licenseRecordKey(record);
    if (existingKeys.has(key)) {
      skipped += 1;
      return;
    }
    existingKeys.add(key);
    unique.push(record);
  });
  return { total: normalized.length, unique, skipped };
}

async function previewJsonBackup(file) {
  const parsed = JSON.parse(await file.text());
  return getImportedRecords(parsed);
}

async function importJsonBackup(file) {
  const parsed = JSON.parse(await file.text());
  const { total, unique, skipped } = getImportedRecords(parsed);

  if (!unique.length) {
    setMessage(licenseMessage, `沒有新增資料，跳過 ${skipped} 筆完全相同的授權。`, true);
    return { total, imported: 0, skipped };
  }
  const skippedText = skipped ? `，另跳過 ${skipped} 筆完全相同資料` : "";
  if (!confirm(`即將新增 ${unique.length} 筆授權資料${skippedText}。現有資料不會被刪除，確定繼續嗎？`)) {
    return { total, imported: 0, skipped, cancelled: true };
  }

  for (let offset = 0; offset < unique.length; offset += 400) {
    const batch = writeBatch(db);
    unique.slice(offset, offset + 400).forEach((record) => {
      batch.set(doc(collection(db, "licenses")), record);
    });
    await batch.commit();
  }
  setMessage(licenseMessage, `已匯入 ${unique.length} 筆授權資料${skippedText}。`, true);
  return { total, imported: unique.length, skipped };
}

function setImportSummary(message, error = false) {
  jsonImportSummary.textContent = message;
  jsonImportSummary.classList.toggle("error", error);
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1000);
}

function exportRows(format) {
  const filters = getFilters();
  const rows = getFilteredLicenses().map((item) => {
    const status = getStatus(item, filters.expiringDays);
    return [
      spreadsheetSafeText(item.name),
      spreadsheetSafeText(item.seats),
      item.expiry,
      status.label,
      status.daysLeft ?? "",
      Number(item.price || 0).toFixed(2),
      spreadsheetSafeText(item.paymentMethod),
      spreadsheetSafeText(item.pic),
      spreadsheetSafeText(item.user),
      spreadsheetSafeText(item.subLink),
      spreadsheetSafeText(item.remarks)
    ];
  });
  const headers = ["軟件名稱", "席位數/方案", "到期日", "狀態", "剩餘天數", "價格(HK$)", "付款方式", "PIC", "使用者/部門", "訂閱連結", "備註"];

  if (format === "csv") {
    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    downloadFile(`licenses-${Date.now()}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
    return;
  }

  const htmlRows = [headers, ...rows]
    .map((row, index) => `<tr>${row.map((cell) => index === 0 ? `<th>${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  const excel = `<html><head><meta charset="utf-8"></head><body><table>${htmlRows}</table></body></html>`;
  downloadFile(`licenses-${Date.now()}.xls`, excel, "application/vnd.ms-excel;charset=utf-8");
}

function exportJsonBackup() {
  const payload = state.licenses.map((item) => ({
    name: item.name || "",
    seats: item.seats || "",
    expiry: item.expiry || "",
    paymentMethod: item.paymentMethod || "",
    price: Number(item.price || 0),
    pic: item.pic || "",
    user: item.user || "",
    subLink: safeHttpUrl(item.subLink) || "",
    remarks: item.remarks || ""
  }));
  downloadFile(
    `licenses-backup-${Date.now()}.json`,
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8"
  );
  setMessage(licenseMessage, `已備份 ${payload.length} 筆授權資料。`, true);
}

function startLicenseListener() {
  state.licenseUnsubscribe?.();
  state.licenseLoaded = false;
  setSyncAvailability(false);
  renderLicenses();
  setConnectionState("checking", "正在同步", "正在檢查 Firebase 同步狀態");
  state.licenseUnsubscribe = onSnapshot(collection(db, "licenses"), (snapshot) => {
    state.licenses = sortLicensesByExpiry(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    state.licenseLoaded = true;
    setSyncAvailability(true);
    setConnectionState("connected", "已同步", `已同步 ${state.licenses.length} 筆授權資料`);
    renderLicenses();
    setMessage(licenseMessage);
  }, (error) => {
    state.licenseLoaded = true;
    setSyncAvailability(false);
    setConnectionState("error", "同步失敗", "Firebase 同步失敗");
    renderLicenses();
    setMessage(licenseMessage, `同步失敗：${formatFirebaseError(error)}`);
  });
}

async function unlockWithPassword(password) {
  if (!isConfigured()) {
    throw new Error("請先在 firebase-config.js 填入 Firebase Web App 設定。");
  }

  const inputHash = await sha256(password);
  const storedHash = await getPasswordHash();
  const allowed = inputHash === storedHash || inputHash === DEFAULT_PASSWORD_HASH;

  if (!allowed) {
    throw new Error("密碼不正確。");
  }

  await ensurePasswordDoc();
  state.unlocked = true;
  sessionStorage.setItem("licenseManagerUnlocked", "true");
  showOnly("app");
  startLicenseListener();
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(authMessage);
  const submitButton = $("auth-submit");
  const originalLabel = submitButton.innerHTML;
  submitButton.disabled = true;
  submitButton.innerHTML = "<span>正在驗證...</span><span aria-hidden=\"true\">···</span>";
  try {
    await unlockWithPassword($("gate-password").value);
    $("gate-password").value = "";
  } catch (error) {
    setMessage(authMessage, formatFirebaseError(error));
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = originalLabel;
  }
});

togglePassword.addEventListener("click", () => {
  const showing = gatePassword.type === "text";
  gatePassword.type = showing ? "password" : "text";
  togglePassword.textContent = showing ? "顯示" : "隱藏";
  togglePassword.setAttribute("aria-label", showing ? "顯示密碼" : "隱藏密碼");
  togglePassword.setAttribute("aria-pressed", String(!showing));
  gatePassword.focus();
});

$("logout").addEventListener("click", () => {
  state.unlocked = false;
  setSyncAvailability(false);
  sessionStorage.removeItem("licenseManagerUnlocked");
  state.licenseUnsubscribe?.();
  state.licenseUnsubscribe = null;
  setConnectionState("checking", "已鎖定", "已登出");
  showOnly("auth");
});

window.addEventListener("offline", () => {
  if (state.unlocked) {
    setSyncAvailability(false);
    setConnectionState("offline", "離線", "瀏覽器目前沒有網絡連線");
    setMessage(licenseMessage, "目前離線，暫停寫入及匯出，重新連線後會自動恢復。");
  }
});
window.addEventListener("online", () => {
  if (state.unlocked) startLicenseListener();
});

licenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(licenseMessage);
  const saveButton = licenseForm.querySelector(".save-button");
  saveButton.disabled = true;
  try {
    if (!syncReady) {
      throw new Error("正在同步授權資料，請稍候再儲存。");
    }
    const payload = readLicenseForm();
    if (!payload.name || !payload.seats || !payload.expiry) {
      throw new Error("軟件名稱、數量／帳戶和到期日期是必填欄位。");
    }
    if (!isValidDateText(payload.expiry)) {
      throw new Error("到期日期不存在，請重新選擇有效日期。");
    }
    if (hasDuplicateLicense(payload, licenseId.value)) {
      throw new Error("已有完全相同的授權資料，沒有儲存。");
    }

    if (licenseId.value) {
      await updateDoc(doc(db, "licenses", licenseId.value), payload);
    } else {
      await addDoc(collection(db, "licenses"), { ...payload, createdAt: serverTimestamp() });
    }
    resetLicenseForm();
    setMessage(licenseMessage, "授權資料已儲存。", true);
  } catch (error) {
    setMessage(licenseMessage, formatFirebaseError(error));
  } finally {
    saveButton.disabled = !syncReady;
  }
});

cancelEdit.addEventListener("click", resetLicenseForm);

licensesBody.addEventListener("click", async (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) editLicense(editId);
  if (deleteId && confirm("確定要刪除這筆授權資料嗎？")) {
    try {
      await deleteDoc(doc(db, "licenses", deleteId));
      setMessage(licenseMessage, "授權資料已刪除。", true);
    } catch (error) {
      setMessage(licenseMessage, formatFirebaseError(error));
    }
  }
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(settingsMessage);
  const newPassword = $("new-password").value;
  const confirmPassword = $("confirm-password").value;
  if (newPassword !== confirmPassword) {
    setMessage(settingsMessage, "兩次輸入的新密碼不一致。");
    return;
  }
  try {
    const passwordHash = await sha256(newPassword);
    await setDoc(doc(db, "settings", "access"), {
      passwordHash,
      updatedAt: serverTimestamp()
    }, { merge: true });
    settingsForm.reset();
    setMessage(settingsMessage, "自訂密碼已更新；共用密碼 36961500 仍然有效。", true);
  } catch (error) {
    setMessage(settingsMessage, formatFirebaseError(error));
  }
});

["search", "status-filter", "expiring-days"].forEach((id) => {
  $(id).addEventListener("input", renderLicenses);
});

document.querySelectorAll(".sort-button").forEach((button) => {
  button.addEventListener("click", () => sortLicenses(button.dataset.sortKey));
});
$("clear-filters").addEventListener("click", () => {
  $("search").value = "";
  $("status-filter").value = "all";
  $("expiring-days").value = "30";
  renderLicenses();
});
updateSortIndicators();
setSyncAvailability(false);
renderLicenses();

$("export-csv").addEventListener("click", () => exportRows("csv"));
$("export-excel").addEventListener("click", () => exportRows("excel"));
$("export-json").addEventListener("click", exportJsonBackup);
jsonImport.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  const requestId = ++importRequestId;
  pendingJsonFile = null;
  importJsonSubmit.disabled = true;
  setMessage(licenseMessage);
  if (!file) {
    setImportSummary("選擇檔案以先檢查差異");
    return;
  }

  setImportSummary("正在檢查檔案…");
  try {
    const result = await previewJsonBackup(file);
    if (requestId !== importRequestId) return;
    pendingJsonFile = file;
    const skippedText = result.skipped ? `，跳過 ${result.skipped} 筆重複` : "";
    setImportSummary(`共 ${result.total} 筆：可新增 ${result.unique.length} 筆${skippedText}`);
    importJsonSubmit.disabled = !syncReady || result.unique.length === 0;
  } catch (error) {
    if (requestId !== importRequestId) return;
    setImportSummary(`檢查失敗：${formatFirebaseError(error)}`, true);
  }
});
importJsonSubmit.addEventListener("click", async () => {
  if (!pendingJsonFile) return;
  const file = pendingJsonFile;
  importJsonSubmit.disabled = true;
  setMessage(licenseMessage);
  try {
    const result = await importJsonBackup(file);
    setImportSummary(result?.cancelled ? "已取消匯入；可重新選擇檔案" : "匯入完成；可再選擇其他 JSON 檔案");
  } catch (error) {
    setMessage(licenseMessage, formatFirebaseError(error));
    setImportSummary(`匯入失敗：${formatFirebaseError(error)}`, true);
  } finally {
    pendingJsonFile = null;
    jsonImport.value = "";
  }
});

if (!isConfigured()) {
  showOnly("auth");
  setMessage(authMessage, "Firebase config 尚未設定。");
} else if (state.unlocked) {
  showOnly("app");
  startLicenseListener();
} else {
  showOnly("auth");
}
