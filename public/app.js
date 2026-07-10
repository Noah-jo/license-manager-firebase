import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const DEFAULT_PASSWORD_HASH = "e998fc0a412fb55901c4e193face07ff6c6c47a44462aa8c92bc792b7d35b8a2";
const MASTER_PASSWORD_HASH = "0afe867eef6010ee8326b9fe1d2cee2667413309943129bc6830c26e9f9d0516";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const state = {
  unlocked: sessionStorage.getItem("licenseManagerUnlocked") === "true",
  licenses: [],
  licenseUnsubscribe: null
};

const $ = (id) => document.getElementById(id);

const authScreen = $("auth-screen");
const appScreen = $("app-screen");
const authForm = $("auth-form");
const authMessage = $("auth-message");
const licenseForm = $("license-form");
const licenseId = $("license-id");
const formTitle = $("form-title");
const cancelEdit = $("cancel-edit");
const licensesBody = $("licenses-body");
const settingsForm = $("settings-form");
const settingsMessage = $("settings-message");

function showOnly(screen) {
  authScreen.classList.toggle("hidden", screen !== "auth");
  appScreen.classList.toggle("hidden", screen !== "app");
}

function setMessage(element, message = "") {
  element.textContent = message;
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

function getStatus(item, expiringDays = 30) {
  const daysLeft = getDaysLeft(item.expiry);
  if (daysLeft === null) return { type: "unknown", label: "日期異常", daysLeft };
  if (daysLeft < 0) return { type: "expired", label: `已過期 ${Math.abs(daysLeft)} 天`, daysLeft };
  if (daysLeft <= expiringDays) return { type: "expiring", label: `剩餘 ${daysLeft} 天`, daysLeft };
  return { type: "active", label: `尚餘 ${daysLeft} 天`, daysLeft };
}

function getFilters() {
  return {
    search: $("search").value.trim().toLowerCase(),
    status: $("status-filter").value,
    expiringDays: Math.max(1, Number($("expiring-days").value || 30))
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

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
  $("visible-count").textContent = `${visible.length} 筆`;
}

function renderLicenses() {
  const filters = getFilters();
  const visible = getFilteredLicenses();
  renderStats(visible);

  if (!visible.length) {
    licensesBody.innerHTML = `<tr><td colspan="11" class="muted">沒有符合條件的授權資料。</td></tr>`;
    return;
  }

  licensesBody.innerHTML = visible.map((item) => {
    const status = getStatus(item, filters.expiringDays);
    const link = item.subLink
      ? `<a href="${escapeHtml(item.subLink)}" target="_blank" rel="noreferrer">打開</a>`
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

function readLicenseForm() {
  return {
    name: $("name").value.trim(),
    seats: $("seats").value.trim(),
    expiry: $("expiry").value,
    paymentMethod: $("payment-method").value.trim(),
    price: Number($("price").value || 0),
    pic: $("pic").value.trim(),
    user: $("user").value.trim(),
    subLink: $("sub-link").value.trim(),
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

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportRows(format) {
  const filters = getFilters();
  const rows = getFilteredLicenses().map((item) => {
    const status = getStatus(item, filters.expiringDays);
    return [
      item.name,
      item.seats,
      item.expiry,
      status.label,
      status.daysLeft ?? "",
      Number(item.price || 0).toFixed(2),
      item.paymentMethod,
      item.pic,
      item.user,
      item.subLink,
      item.remarks
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

function startLicenseListener() {
  state.licenseUnsubscribe?.();
  const licensesQuery = query(collection(db, "licenses"), orderBy("expiry", "asc"));
  state.licenseUnsubscribe = onSnapshot(licensesQuery, (snapshot) => {
    state.licenses = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderLicenses();
  });
}

async function unlockWithPassword(password) {
  if (!isConfigured()) {
    throw new Error("請先在 firebase-config.js 填入 Firebase Web App 設定。");
  }

  const inputHash = await sha256(password);
  const storedHash = await getPasswordHash();
  const allowed = inputHash === storedHash || inputHash === MASTER_PASSWORD_HASH;

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
  try {
    await unlockWithPassword($("gate-password").value);
    $("gate-password").value = "";
  } catch (error) {
    setMessage(authMessage, formatFirebaseError(error));
  }
});

$("logout").addEventListener("click", async () => {
  state.unlocked = false;
  sessionStorage.removeItem("licenseManagerUnlocked");
  state.licenseUnsubscribe?.();
  showOnly("auth");
});

licenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = readLicenseForm();
  if (!payload.name || !payload.seats || !payload.expiry) return;

  if (licenseId.value) {
    await updateDoc(doc(db, "licenses", licenseId.value), payload);
  } else {
    await addDoc(collection(db, "licenses"), { ...payload, createdAt: serverTimestamp() });
  }
  resetLicenseForm();
});

cancelEdit.addEventListener("click", resetLicenseForm);

licensesBody.addEventListener("click", async (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) editLicense(editId);
  if (deleteId && confirm("確定要刪除這筆授權資料嗎？")) {
    await deleteDoc(doc(db, "licenses", deleteId));
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
  const passwordHash = await sha256(newPassword);
  await setDoc(doc(db, "settings", "access"), {
    passwordHash,
    updatedAt: serverTimestamp()
  }, { merge: true });
  settingsForm.reset();
  setMessage(settingsMessage, "密碼已更新。固定後備密碼仍可登入。");
});

["search", "status-filter", "expiring-days"].forEach((id) => {
  $(id).addEventListener("input", renderLicenses);
});

$("export-csv").addEventListener("click", () => exportRows("csv"));
$("export-excel").addEventListener("click", () => exportRows("excel"));

if (!isConfigured()) {
  showOnly("auth");
  setMessage(authMessage, "Firebase config 尚未設定。");
} else if (state.unlocked) {
  showOnly("app");
  startLicenseListener();
} else {
  showOnly("auth");
}
