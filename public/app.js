import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const state = {
  unlocked: false,
  user: null,
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
const licenseMessage = $("license-message");
const jsonImport = $("json-import");
const settingsMessage = $("settings-message");
const settingsAccountEmail = $("settings-account-email");

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

function isConfigured() {
  return !firebaseConfig.projectId.startsWith("REPLACE_WITH") && Boolean(firebaseConfig.allowedAdminEmail);
}

function formatFirebaseError(error) {
  const code = error?.code || "";
  if (code.includes("permission-denied")) return "Firebase 權限不足，請確認 Firestore Rules 已部署。";
  if (code.includes("popup-closed-by-user")) return "登入視窗已關閉。";
  if (code.includes("popup-blocked")) return "瀏覽器阻擋了登入視窗，請允許此網站開啟視窗後再試。";
  if (code.includes("unauthorized-domain")) return "此網站尚未加入 Firebase Authentication 的授權網域。";
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
  const filters = getFilters();
  const visible = getFilteredLicenses();
  renderStats(visible);

  if (!visible.length) {
    licensesBody.innerHTML = `
      <tr><td colspan="11" class="empty-row">
        <strong>暫時沒有授權資料</strong>
        <span class="muted">新增第一項授權，或調整上方搜尋條件。</span>
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

  if (!name || !seats || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
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

async function importJsonBackup(file) {
  const parsed = JSON.parse(await file.text());
  const records = Array.isArray(parsed) ? parsed : parsed?.licenses;
  if (!Array.isArray(records) || !records.length) {
    throw new Error("JSON 備份內沒有可匯入的授權資料。");
  }
  if (!confirm(`即將新增 ${records.length} 筆授權資料，現有資料不會被刪除。確定繼續嗎？`)) return;

  const normalized = records.map(normalizeImportedLicense);
  for (let offset = 0; offset < normalized.length; offset += 400) {
    const batch = writeBatch(db);
    normalized.slice(offset, offset + 400).forEach((record) => {
      batch.set(doc(collection(db, "licenses")), record);
    });
    await batch.commit();
  }
  setMessage(licenseMessage, `已匯入 ${normalized.length} 筆授權資料。`, true);
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

function startLicenseListener() {
  state.licenseUnsubscribe?.();
  const licensesQuery = query(collection(db, "licenses"), orderBy("expiry", "asc"));
  state.licenseUnsubscribe = onSnapshot(licensesQuery, (snapshot) => {
    state.licenses = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderLicenses();
    setMessage(licenseMessage);
  }, (error) => {
    setMessage(licenseMessage, `同步失敗：${formatFirebaseError(error)}`);
  });
}

function isAuthorizedUser(user) {
  return Boolean(
    user?.email &&
    user.email.toLowerCase() === firebaseConfig.allowedAdminEmail.toLowerCase() &&
    user.emailVerified
  );
}

function updateAccountUi(user) {
  const email = user?.email || "尚未登入";
  $("current-user").textContent = user?.email ? user.email : "未登入";
  settingsAccountEmail.textContent = email;
}

async function unlockWithGoogle() {
  if (!isConfigured()) {
    throw new Error("請先在 firebase-config.js 填入 Firebase 設定和管理員 email。");
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (!isAuthorizedUser(result.user)) {
      await signOut(auth);
      throw new Error("此 Google 帳戶沒有授權使用此系統。");
    }
  } catch (error) {
    if (error?.code === "auth/popup-blocked") {
      await signInWithRedirect(auth, googleProvider);
      return;
    }
    throw error;
  }
}

async function handleAuthStateChange(user) {
  state.user = user;
  if (!user) {
    state.unlocked = false;
    state.licenseUnsubscribe?.();
    state.licenseUnsubscribe = null;
    updateAccountUi(null);
    showOnly("auth");
    return;
  }

  if (!isAuthorizedUser(user)) {
    await signOut(auth);
    setMessage(authMessage, "此 Google 帳戶沒有授權使用此系統。");
    return;
  }

  state.unlocked = true;
  updateAccountUi(user);
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
    await unlockWithGoogle();
  } catch (error) {
    setMessage(authMessage, formatFirebaseError(error));
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = originalLabel;
  }
});

async function logout() {
  await signOut(auth);
  setMessage(settingsMessage, "已安全登出。", true);
}

$("logout").addEventListener("click", logout);
$("settings-logout").addEventListener("click", logout);

licenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(licenseMessage);
  const saveButton = licenseForm.querySelector(".save-button");
  saveButton.disabled = true;
  try {
    const payload = readLicenseForm();
    if (!payload.name || !payload.seats || !payload.expiry) {
      throw new Error("軟件名稱、數量／帳戶和到期日期是必填欄位。");
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
    saveButton.disabled = false;
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

["search", "status-filter", "expiring-days"].forEach((id) => {
  $(id).addEventListener("input", renderLicenses);
});

$("export-csv").addEventListener("click", () => exportRows("csv"));
$("export-excel").addEventListener("click", () => exportRows("excel"));
jsonImport.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  setMessage(licenseMessage);
  try {
    await importJsonBackup(file);
  } catch (error) {
    setMessage(licenseMessage, formatFirebaseError(error));
  } finally {
    event.target.value = "";
  }
});

if (!isConfigured()) {
  showOnly("auth");
  setMessage(authMessage, "Firebase config 或管理員 email 尚未設定。");
} else {
  showOnly("auth");
  onAuthStateChanged(auth, (user) => {
    handleAuthStateChange(user).catch((error) => {
      setMessage(authMessage, formatFirebaseError(error));
    });
  });
}
