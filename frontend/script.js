/* ═══════════════════════════════════════════════════════════
   Ledger — script.js
   All API calls go to Flask on port 5000.
   Auth guard redirects to Flask /login if no valid token.
   ═══════════════════════════════════════════════════════════ */

const API = "http://127.0.0.1:5000/api";
const APPROOT = "http://127.0.0.1:5000";

/* ── Auth guard ─────────────────────────────────────────── */
(function () {
  console.log("DEBUG - Auth guard running");
  var token = localStorage.getItem("token");
  console.log("DEBUG - Token found:", token);
  console.log("DEBUG - Token type:", typeof token);
  console.log("DEBUG - Token length:", token ? token.length : 0);

  if (!token || token === "null" || token === "undefined" || token.trim() === "") {
    console.log("DEBUG - No valid token, redirecting to login");
    localStorage.clear();
    window.location.href = APPROOT + "/login";
    return;
  }

  try {
    var parts = token.split(".");
    if (parts.length !== 3) {
      console.log("DEBUG - Invalid token format, parts:", parts.length);
      throw new Error("Invalid token");
    }
    var p = JSON.parse(atob(parts[1]));
    console.log("DEBUG - Token payload:", p);
    console.log("DEBUG - Token expiry:", new Date(p.exp * 1000));
    console.log("DEBUG - Current time:", new Date());

    if (p.exp < Date.now() / 1000) {
      console.log("DEBUG - Token expired");
      localStorage.clear();
      window.location.href = APPROOT + "/login";
    } else {
      console.log("DEBUG - Token valid, staying on dashboard");
    }
  } catch (e) {
    console.error("DEBUG - Token verification error:", e);
    localStorage.clear();
    window.location.href = APPROOT + "/login";
  }
})();

/* ── Auth fetch wrapper ─────────────────────────────────── */
function authFetch(url, options) {
  options = options || {};
  options.headers = options.headers || {};

  var token = localStorage.getItem("token");
  // Hanya tambahkan Authorization header jika token ada dan bukan null
  if (token && token !== "null" && token !== "undefined") {
    options.headers["Authorization"] = "Bearer " + token;
  } else {
    // Jika tidak ada token, langsung redirect ke login
    localStorage.clear();
    window.location.href = APPROOT + "/login";
    return Promise.reject("No token");
  }

  return fetch(url, options).then(function (res) {
    if (res.status === 401) {
      localStorage.clear();
      window.location.href = APPROOT + "/login";
    }
    return res;
  });
}

/* ── State ──────────────────────────────────────────────── */
var allTransactions = [];
var activeFilter = "all";

/* ── DOM refs ───────────────────────────────────────────── */
var txList = document.getElementById("txList");
var txForm = document.getElementById("txForm");
var formMessage = document.getElementById("formMessage");
var submitBtn = document.getElementById("submitBtn");
var totalIncomeEl = document.getElementById("totalIncome");
var totalExpenseEl = document.getElementById("totalExpense");
var balanceEl = document.getElementById("balance");
var budgetWrapper = document.getElementById("budgetWrapper");
var drawerOverlay = document.getElementById("drawerOverlay");
var drawerBody = document.getElementById("drawerBody");
var editOverlay = document.getElementById("editOverlay");
var editForm = document.getElementById("editForm");
var editMessage = document.getElementById("editMessage");
var editSubmitBtn = document.getElementById("editSubmitBtn");

/* ── Helpers ────────────────────────────────────────────── */

function formatRp(n) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0
  }).format(n);
}

function formatRpShort(n) {
  if (n >= 1000000) return "Rp " + (n / 1000000).toFixed(1).replace(/\.0$/, "") + " jt";
  if (n >= 1000) return "Rp " + (n / 1000).toFixed(0) + " rb";
  return "Rp " + n;
}

function showMessage(el, text, type) {
  el.textContent = text;
  el.className = "form-message " + type;
  setTimeout(function () { el.textContent = ""; el.className = "form-message"; }, 3000);
}

function setDefaultDate() {
  document.getElementById("date").value = new Date().toISOString().slice(0, 10);
}

function renderHeaderDate() {
  document.getElementById("headerDate").textContent = new Date()
    .toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    .toUpperCase();
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function spentPct(expense, income) {
  if (!income) return 0;
  return Math.min(100, Math.round((expense / income) * 100));
}

/* ── Summary ────────────────────────────────────────────── */

async function fetchSummary() {
  try {
    var data = await authFetch(API + "/summary").then(function (r) { return r.json(); });
    totalIncomeEl.textContent = formatRp(data.total_income);
    totalExpenseEl.textContent = formatRp(data.total_expense);
    balanceEl.textContent = formatRp(data.balance);
  } catch (e) {
    [totalIncomeEl, totalExpenseEl, balanceEl].forEach(function (el) { el.textContent = "—"; });
  }
}

/* ── Budget Tracker ─────────────────────────────────────── */

async function fetchBudget() {
  try {
    var data = await authFetch(API + "/salary-summary").then(function (r) { return r.json(); });
    renderBudget(data);
  } catch (e) { budgetWrapper.innerHTML = ""; }
}

function renderBudget(data) {
  if (!data.cycles || data.cycles.length === 0) {
    budgetWrapper.innerHTML =
      '<div class="budget-nudge">' +
      '<span class="budget-nudge-icon">◎</span>' +
      '<span>No salary detected yet. Add an <strong>Income → Salary</strong> transaction to enable budget tracking.</span>' +
      '</div>';
    return;
  }

  var cur = data.current_cycle;
  var status = cur ? cur.status : "ok";
  var spent = cur ? spentPct(cur.total_expense, cur.total_income) : 0;
  var remaining = cur ? cur.balance : 0;
  var remainingPct = cur && cur.total_income > 0 ? Math.round((cur.balance / cur.total_income) * 100) : 0;

  var alertText = "";
  if (status === "critical") alertText = "⚠ Critical: only " + remainingPct + "% of budget remaining. Consider pausing non-essential spending.";
  if (status === "warning") alertText = "◉ Warning: " + remainingPct + "% of budget remaining. Watch your spending.";

  var badgeHtml = "";
  if (status === "warning") badgeHtml = '<span class="budget-badge warning visible"><span class="budget-badge-dot"></span>Warning</span>';
  if (status === "critical") badgeHtml = '<span class="budget-badge critical visible"><span class="budget-badge-dot"></span>Critical</span>';

  var startFmt = cur ? new Date(cur.start + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short" }) : "—";
  var endFmt = cur ? new Date(cur.end + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "—";

  budgetWrapper.innerHTML =
    '<div class="budget-card status-' + status + '">' +
    '<div class="budget-card-bar"></div>' +
    '<div class="budget-card-inner">' +
    '<div class="budget-left">' +
    '<div class="budget-cycle-label">Current Salary Cycle</div>' +
    '<div class="budget-dates">' + startFmt + ' &rarr; ' + endFmt + '</div>' +
    '<div class="budget-progress-wrap">' +
    '<div class="budget-progress-track">' +
    '<div class="budget-progress-fill" id="budgetFill" style="width:0%"></div>' +
    '</div>' +
    '<div class="budget-progress-labels">' +
    '<span>Rp 0</span>' +
    '<span>Spent: ' + spent + '%</span>' +
    '<span>' + (cur ? formatRpShort(cur.total_income) : "—") + '</span>' +
    '</div>' +
    '</div>' +
    '<div class="budget-stats">' +
    '<div class="budget-stat"><div class="budget-stat-label">Salary</div><div class="budget-stat-value income">' + (cur ? formatRpShort(cur.total_income) : "—") + '</div></div>' +
    '<div class="budget-stat"><div class="budget-stat-label">Spent</div><div class="budget-stat-value expense">' + (cur ? formatRpShort(cur.total_expense) : "—") + '</div></div>' +
    '<div class="budget-stat"><div class="budget-stat-label">Remaining</div><div class="budget-stat-value balance">' + (cur ? formatRpShort(remaining) : "—") + '</div></div>' +
    '</div>' +
    '</div>' +
    '<div class="budget-right">' +
    badgeHtml +
    '<button class="btn-history" id="btnHistory">All Cycles ›</button>' +
    '</div>' +
    '</div>' +
    '<div class="budget-alert ' + (status !== "ok" ? status : "") + '">' + alertText + '</div>' +
    '</div>';

  requestAnimationFrame(function () {
    setTimeout(function () {
      var fill = document.getElementById("budgetFill");
      if (fill) fill.style.width = spent + "%";
    }, 80);
  });

  document.getElementById("btnHistory").addEventListener("click", function () {
    renderDrawer(data.cycles);
    drawerOverlay.classList.add("open");
  });
}

/* ── Cycle History Drawer ───────────────────────────────── */

function renderDrawer(cycles) {
  var reversed = cycles.slice().reverse();
  drawerBody.innerHTML = reversed.map(function (cyc, i) {
    var s = cyc.status;
    var sp = spentPct(cyc.total_expense, cyc.total_income);
    var badge = cyc.is_current ? "current" : s;
    var badgeTxt = cyc.is_current ? "Current" : s.charAt(0).toUpperCase() + s.slice(1);
    var startFmt = new Date(cyc.start + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    var endFmt = new Date(cyc.end + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    return (
      '<div class="cycle-card status-' + s + (cyc.is_current ? " is-current" : "") + '" style="animation-delay:' + (i * 0.05) + 's">' +
      '<div class="cycle-card-head">' +
      '<span class="cycle-card-label">' + escHtml(cyc.label) + '</span>' +
      '<span class="cycle-card-badge ' + badge + '">' + badgeTxt + '</span>' +
      '</div>' +
      '<div class="cycle-card-body">' +
      '<div class="cycle-dates">' + startFmt + ' → ' + endFmt + '</div>' +
      '<div class="cycle-mini-track"><div class="cycle-mini-fill ' + s + '" style="width:' + sp + '%"></div></div>' +
      '<div class="cycle-nums">' +
      '<div><div class="cycle-num-label">Salary</div><div class="cycle-num-val income">' + formatRpShort(cyc.total_income) + '</div></div>' +
      '<div><div class="cycle-num-label">Spent</div><div class="cycle-num-val expense">' + formatRpShort(cyc.total_expense) + '</div></div>' +
      '<div><div class="cycle-num-label">Left</div><div class="cycle-num-val balance">' + formatRpShort(cyc.balance) + '</div></div>' +
      '<div><div class="cycle-num-label">Txns</div><div class="cycle-num-val">' + cyc.transactions.length + '</div></div>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }).join("");
}

document.getElementById("drawerClose").addEventListener("click", function () { drawerOverlay.classList.remove("open"); });
drawerOverlay.addEventListener("click", function (e) { if (e.target === drawerOverlay) drawerOverlay.classList.remove("open"); });

/* ── Transaction List ───────────────────────────────────── */

async function fetchTransactions() {
  try {
    allTransactions = await authFetch(API + "/transactions").then(function (r) { return r.json(); });
    renderList();
  } catch (e) {
    txList.innerHTML = '<li class="tx-empty">Could not load transactions.</li>';
  }
}

function renderList() {
  var items = activeFilter === "all"
    ? allTransactions
    : allTransactions.filter(function (t) { return t.type === activeFilter; });

  if (items.length === 0) {
    txList.innerHTML = '<li class="tx-empty">No transactions yet.</li>';
    return;
  }

  txList.innerHTML = items.map(function (t, i) {
    return (
      '<li class="tx-item" data-id="' + t.id + '" style="animation-delay:' + (i * 0.035) + 's">' +
      '<span class="tx-dot tx-dot--' + t.type + '"></span>' +
      '<div class="tx-meta">' +
      '<div class="tx-category">' + escHtml(t.category) + '</div>' +
      '<div class="tx-sub">' + t.date + (t.note ? ' · ' + escHtml(t.note) : '') + '</div>' +
      '</div>' +
      '<span class="tx-amount tx-amount--' + t.type + '">' +
      (t.type === "income" ? "+" : "−") + formatRp(t.amount) +
      '</span>' +
      '<div class="tx-actions">' +
      '<button class="btn-action btn-edit"   title="Edit"   data-id="' + t.id + '">&#9998;</button>' +
      '<button class="btn-action btn-delete" title="Delete" data-id="' + t.id + '">&#x2715;</button>' +
      '</div>' +
      '</li>'
    );
  }).join("");

  txList.querySelectorAll(".btn-edit").forEach(function (btn) {
    btn.addEventListener("click", function () { openEditModal(parseInt(btn.dataset.id)); });
  });
  txList.querySelectorAll(".btn-delete").forEach(function (btn) {
    btn.addEventListener("click", function () { confirmDelete(parseInt(btn.dataset.id)); });
  });
}

/* ── Add Transaction ────────────────────────────────────── */

txForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  var payload = {
    date: document.getElementById("date").value,
    type: document.getElementById("type").value,
    category: document.getElementById("category").value,
    amount: parseFloat(document.getElementById("amount").value),
    note: document.getElementById("note").value.trim(),
  };
  if (!payload.date || !payload.category || isNaN(payload.amount)) {
    showMessage(formMessage, "Please fill all required fields.", "error"); return;
  }
  submitBtn.disabled = true;
  submitBtn.querySelector(".btn-text").textContent = "Saving…";
  try {
    var res = await authFetch(API + "/transactions", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || "Server error");
    showMessage(formMessage, "Transaction added ✓", "success");
    txForm.reset(); setDefaultDate(); setType("income");
    await refresh();
  } catch (err) {
    showMessage(formMessage, err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.querySelector(".btn-text").textContent = "Add Transaction";
  }
});

/* ── Edit Transaction ───────────────────────────────────── */

function openEditModal(id) {
  var t = allTransactions.find(function (tx) { return tx.id === id; });
  if (!t) return;
  document.getElementById("editId").value = t.id;
  document.getElementById("editDate").value = t.date;
  document.getElementById("editCategory").value = t.category;
  document.getElementById("editAmount").value = t.amount;
  document.getElementById("editNote").value = t.note || "";
  setEditType(t.type);
  editOverlay.classList.add("open");
}

function closeEditModal() {
  editOverlay.classList.remove("open");
  editForm.reset();
  editMessage.textContent = "";
}

document.getElementById("modalClose").addEventListener("click", closeEditModal);
document.getElementById("modalCancel").addEventListener("click", closeEditModal);
editOverlay.addEventListener("click", function (e) { if (e.target === editOverlay) closeEditModal(); });

editForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  var id = parseInt(document.getElementById("editId").value);
  var payload = {
    date: document.getElementById("editDate").value,
    type: document.getElementById("editType").value,
    category: document.getElementById("editCategory").value,
    amount: parseFloat(document.getElementById("editAmount").value),
    note: document.getElementById("editNote").value.trim(),
  };
  if (!payload.date || !payload.category || isNaN(payload.amount)) {
    showMessage(editMessage, "Please fill all required fields.", "error"); return;
  }
  editSubmitBtn.disabled = true;
  editSubmitBtn.querySelector(".btn-text").textContent = "Saving…";
  try {
    var res = await authFetch(API + "/transactions/" + id, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || "Server error");
    closeEditModal();
    await refresh();
  } catch (err) {
    showMessage(editMessage, err.message, "error");
  } finally {
    editSubmitBtn.disabled = false;
    editSubmitBtn.querySelector(".btn-text").textContent = "Save Changes";
  }
});

/* ── Delete Transaction ─────────────────────────────────── */

async function confirmDelete(id) {
  var t = allTransactions.find(function (tx) { return tx.id === id; });
  if (!t) return;
  if (!confirm('Delete "' + t.category + '" (' + formatRp(t.amount) + ')?\nThis cannot be undone.')) return;
  try {
    var res = await authFetch(API + "/transactions/" + id, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");
    await refresh();
  } catch (err) { alert(err.message); }
}

/* ── Type Toggles ───────────────────────────────────────── */

function setType(value) {
  document.getElementById("type").value = value;
  document.querySelectorAll(".toggle[data-value]").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.value === value);
  });
}

function setEditType(value) {
  document.getElementById("editType").value = value;
  document.querySelectorAll(".toggle[data-edit-value]").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.editValue === value);
  });
}

document.querySelectorAll(".toggle[data-value]").forEach(function (btn) {
  btn.addEventListener("click", function () { setType(btn.dataset.value); });
});
document.querySelectorAll(".toggle[data-edit-value]").forEach(function (btn) {
  btn.addEventListener("click", function () { setEditType(btn.dataset.editValue); });
});

/* ── Filter Buttons ─────────────────────────────────────── */

document.querySelectorAll(".filter").forEach(function (btn) {
  btn.addEventListener("click", function () {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll(".filter").forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
    renderList();
  });
});

/* ── Refresh ────────────────────────────────────────────── */

async function refresh() {
  await Promise.all([fetchTransactions(), fetchSummary(), fetchBudget()]);
}

/* ── Init ───────────────────────────────────────────────── */

function init() {
  renderHeaderDate();
  setDefaultDate();

  // Show logged-in username in header
  var username = localStorage.getItem("username") || "";
  var headerEl = document.getElementById("headerUsername");
  if (headerEl) headerEl.textContent = username ? "◈ " + username : "";

  // Logout button
  var logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      if (confirm("Sign out of Ledger?")) {
        localStorage.clear();
        window.location.href = APPROOT + "/login";
      }
    });
  }

  refresh();
}

init();
