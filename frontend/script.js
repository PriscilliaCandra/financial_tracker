// script.js - AWAL
console.log("=== SCRIPT.JS START ===");
console.log("window.API:", window.API);
console.log("window.APPROOT:", window.APPROOT);

console.log("DEBUG TOKEN (script.js):", localStorage.getItem("token"));
// const API = "http://127.0.0.1:5000/api";
// const APPROOT = "http://127.0.0.1:5000";
const API = window.API || "http://127.0.0.1:5000/api";
const APPROOT = window.APPROOT || "http://127.0.0.1:5000";

console.log("Final API:", API);
console.log("Final APPROOT:", APPROOT);

/* ── Auth guard ─────────────────────────────────────────── */
function isTokenValid(token) {
  if (!token || token === "null" || token === "undefined") return false;
  try {
    var parts = token.split(".");
    if (parts.length !== 3) return false;
    var p = JSON.parse(atob(parts[1]));
    return p.exp > Date.now() / 1000;
  } catch (e) {
    return false;
  }
}

if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
  var token = localStorage.getItem("token");
  if (!isTokenValid(token)) {
    localStorage.clear();
    window.location.href = APPROOT + "/login";
  }
}

/* ── Data Categories ────────────────────────────────────── */
const incomeCategories = ["Salary", "Freelance", "Investment", "Other Income"];
const expenseCategories = ["Food", "Transport", "Housing", "Health", "Entertainment", "Shopping", "Other Expense"];

/* ── Dynamic Category Functions ─────────────────────────── */
function updateCategoryOptions(type) {
  var categorySelect = document.getElementById("category");
  if (!categorySelect) return;

  var previousValue = categorySelect.value;
  categorySelect.innerHTML = '';

  var defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.disabled = true;
  defaultOption.selected = true;
  defaultOption.textContent = 'Select…';
  categorySelect.appendChild(defaultOption);

  var categories = type === 'income' ? incomeCategories : expenseCategories;

  categories.forEach(function (cat) {
    var option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    categorySelect.appendChild(option);
  });

  if (previousValue && categories.includes(previousValue)) {
    categorySelect.value = previousValue;
  }
}

function updateEditCategoryOptions(type) {
  var editCategorySelect = document.getElementById("editCategory");
  if (!editCategorySelect) return;

  var previousValue = editCategorySelect.value;
  editCategorySelect.innerHTML = '';

  var categories = type === 'income' ? incomeCategories : expenseCategories;

  categories.forEach(function (cat) {
    var option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    editCategorySelect.appendChild(option);
  });

  if (previousValue && categories.includes(previousValue)) {
    editCategorySelect.value = previousValue;
  }
}

/* ── Auth fetch wrapper ─────────────────────────────────── */
function authFetch(url, options) {
  options = options || {};
  options.headers = options.headers || {};
  var token = localStorage.getItem("token");
  if (token && token !== "null" && token !== "undefined" && token.length > 10) {
    options.headers["Authorization"] = "Bearer " + token;
  } else {
    return Promise.reject(new Error("No token"));
  }
  return fetch(url, options).then(function (res) {
    if (res.status === 401) {
      localStorage.clear();
      window.location.href = APPROOT + "/login";
      throw new Error("Unauthorized");
    }
    return res;
  });
}

/* ── State ──────────────────────────────────────────────── */
var allTransactions = [];
var filterType = "all";
var filterSort = "latest";
var filterCategory = "";
var filterFrom = "";
var filterTo = "";

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
var monthlyBudgetCard = document.getElementById("monthlyBudgetCard");

/* ── History Drawer Elements ────────────────────────────── */
var historyOverlay = document.getElementById("historyOverlay");
var historyClose = document.getElementById("historyClose");
var activeHistoryTab = "daily";

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
  if (!el) return;
  el.textContent = text;
  el.className = "form-message " + type;
  setTimeout(function () {
    if (el) {
      el.textContent = "";
      el.className = "form-message";
    }
  }, 3000);
}

function setDefaultDate() {
  var dateInput = document.getElementById("date");
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
}

function renderHeaderDate() {
  var headerDate = document.getElementById("headerDate");
  if (headerDate) {
    headerDate.textContent = new Date()
      .toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
      .toUpperCase();
  }
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function spentPct(expense, income) {
  if (!income) return 0;
  return Math.min(100, Math.round((expense / income) * 100));
}

/* ── Summary ────────────────────────────────────────────── */
async function fetchSummary() {
  try {
    var data = await authFetch(API + "/summary").then(function (r) { return r.json(); });
    if (totalIncomeEl) totalIncomeEl.textContent = formatRp(data.total_income);
    if (totalExpenseEl) totalExpenseEl.textContent = formatRp(data.total_expense);
    if (balanceEl) balanceEl.textContent = formatRp(data.balance);
  } catch (e) {
    console.error("Fetch summary error:", e);
  }
}

/* ── Budget Tracker ─────────────────────────────────────── */
async function fetchBudget() {
  try {
    var data = await authFetch(API + "/salary-summary").then(function (r) { return r.json(); });
    if (budgetWrapper) renderBudget(data);
  } catch (e) {
    console.error("Fetch budget error:", e);
  }
}

function renderBudget(data) {
  if (!budgetWrapper) return;
  if (!data.cycles || data.cycles.length === 0) {
    budgetWrapper.innerHTML = '<div class="budget-nudge"><span class="budget-nudge-icon">◎</span><span>No salary detected yet. Add an <strong>Income → Salary</strong> transaction to enable budget tracking.</span></div>';
    return;
  }
  var cur = data.current_cycle;
  var status = cur ? cur.status : "ok";
  var spent = cur ? spentPct(cur.total_expense, cur.total_income) : 0;
  var remaining = cur ? cur.balance : 0;
  var remainingPct = cur && cur.total_income > 0 ? Math.round((cur.balance / cur.total_income) * 100) : 0;
  var alertText = "";
  if (status === "critical") alertText = "⚠ Critical: only " + remainingPct + "% of budget remaining.";
  if (status === "warning") alertText = "◉ Warning: " + remainingPct + "% of budget remaining.";
  var badgeHtml = "";
  if (status === "warning") badgeHtml = '<span class="budget-badge warning visible"><span class="budget-badge-dot"></span>Warning</span>';
  if (status === "critical") badgeHtml = '<span class="budget-badge critical visible"><span class="budget-badge-dot"></span>Critical</span>';
  var startFmt = cur ? new Date(cur.start + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short" }) : "—";
  var endFmt = cur ? new Date(cur.end + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "—";
  budgetWrapper.innerHTML = '<div class="budget-card status-' + status + '"><div class="budget-card-bar"></div><div class="budget-card-inner"><div class="budget-left"><div class="budget-cycle-label">Current Salary Cycle</div><div class="budget-dates">' + startFmt + ' → ' + endFmt + '</div><div class="budget-progress-wrap"><div class="budget-progress-track"><div class="budget-progress-fill" id="budgetFill" style="width:0%"></div></div><div class="budget-progress-labels"><span>Rp 0</span><span>Spent: ' + spent + '%</span><span>' + (cur ? formatRpShort(cur.total_income) : "—") + '</span></div></div><div class="budget-stats"><div class="budget-stat"><div class="budget-stat-label">Salary</div><div class="budget-stat-value income">' + (cur ? formatRpShort(cur.total_income) : "—") + '</div></div><div class="budget-stat"><div class="budget-stat-label">Spent</div><div class="budget-stat-value expense">' + (cur ? formatRpShort(cur.total_expense) : "—") + '</div></div><div class="budget-stat"><div class="budget-stat-label">Remaining</div><div class="budget-stat-value balance">' + (cur ? formatRpShort(remaining) : "—") + '</div></div></div></div><div class="budget-right">' + badgeHtml + '<button class="btn-history" id="btnHistory">All Cycles ›</button></div></div><div class="budget-alert ' + (status !== "ok" ? status : "") + '">' + alertText + '</div></div>';
  requestAnimationFrame(function () {
    setTimeout(function () {
      var fill = document.getElementById("budgetFill");
      if (fill) fill.style.width = spent + "%";
    }, 80);
  });
  var btnHistory = document.getElementById("btnHistory");
  if (btnHistory) {
    btnHistory.addEventListener("click", function () {
      renderDrawer(data.cycles);
      if (drawerOverlay) drawerOverlay.classList.add("open");
    });
  }
}

function renderDrawer(cycles) {
  if (!drawerBody) return;
  var reversed = cycles.slice().reverse();
  drawerBody.innerHTML = reversed.map(function (cyc, i) {
    var s = cyc.status;
    var sp = spentPct(cyc.total_expense, cyc.total_income);
    var badge = cyc.is_current ? "current" : s;
    var badgeTxt = cyc.is_current ? "Current" : s.charAt(0).toUpperCase() + s.slice(1);
    var startFmt = new Date(cyc.start + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    var endFmt = new Date(cyc.end + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    return '<div class="cycle-card status-' + s + (cyc.is_current ? " is-current" : "") + '" style="animation-delay:' + (i * 0.05) + 's"><div class="cycle-card-head"><span class="cycle-card-label">' + escHtml(cyc.label) + '</span><span class="cycle-card-badge ' + badge + '">' + badgeTxt + '</span></div><div class="cycle-card-body"><div class="cycle-dates">' + startFmt + ' → ' + endFmt + '</div><div class="cycle-mini-track"><div class="cycle-mini-fill ' + s + '" style="width:' + sp + '%"></div></div><div class="cycle-nums"><div><div class="cycle-num-label">Salary</div><div class="cycle-num-val income">' + formatRpShort(cyc.total_income) + '</div></div><div><div class="cycle-num-label">Spent</div><div class="cycle-num-val expense">' + formatRpShort(cyc.total_expense) + '</div></div><div><div class="cycle-num-label">Left</div><div class="cycle-num-val balance">' + formatRpShort(cyc.balance) + '</div></div><div><div class="cycle-num-label">Txns</div><div class="cycle-num-val">' + cyc.transactions.length + '</div></div></div></div></div>';
  }).join("");
}

var drawerClose = document.getElementById("drawerClose");
if (drawerClose) drawerClose.addEventListener("click", function () { if (drawerOverlay) drawerOverlay.classList.remove("open"); });
if (drawerOverlay) drawerOverlay.addEventListener("click", function (e) { if (e.target === drawerOverlay) drawerOverlay.classList.remove("open"); });

/* ── Transaction List ───────────────────────────────────── */
async function fetchTransactions() {
  try {
    var params = [];
    if (filterCategory) params.push("category=" + encodeURIComponent(filterCategory));
    if (filterFrom) params.push("from=" + encodeURIComponent(filterFrom));
    if (filterTo) params.push("to=" + encodeURIComponent(filterTo));
    var url = API + "/transactions" + (params.length ? "?" + params.join("&") : "");
    allTransactions = await authFetch(url).then(function (r) { return r.json(); });
    renderList();
  } catch (e) {
    console.error("Fetch transactions error:", e);
    if (txList) txList.innerHTML = '<li class="tx-empty">Could not load transactions.</li>';
  }
}

function renderList() {
  if (!txList) return;
  var items = filterType === "all" ? allTransactions.slice() : allTransactions.filter(function (t) { return t.type === filterType; });
  if (filterCategory) items = items.filter(function (t) { return t.category === filterCategory; });
  if (filterFrom) items = items.filter(function (t) { return t.date >= filterFrom; });
  if (filterTo) items = items.filter(function (t) { return t.date <= filterTo; });
  items.sort(function (a, b) {
    if (filterSort === "latest") return (a.date < b.date) ? 1 : (a.date > b.date) ? -1 : 0;
    if (filterSort === "oldest") return (a.date > b.date) ? 1 : (a.date < b.date) ? -1 : 0;
    if (filterSort === "highest") return b.amount - a.amount;
    if (filterSort === "lowest") return a.amount - b.amount;
    return 0;
  });
  updateFilterSummary(items.length);
  if (items.length === 0) {
    txList.innerHTML = '<li class="tx-empty">No transactions match your filters.</li>';
    return;
  }
  txList.innerHTML = items.map(function (t, i) {
    return '<li class="tx-item" data-id="' + t.id + '" style="animation-delay:' + (i * 0.035) + 's"><span class="tx-dot tx-dot--' + t.type + '"></span><div class="tx-meta"><div class="tx-category">' + escHtml(t.category) + '</div><div class="tx-sub">' + t.date + (t.note ? ' · ' + escHtml(t.note) : '') + '</div></div><span class="tx-amount tx-amount--' + t.type + '">' + (t.type === "income" ? "+" : "−") + formatRp(t.amount) + '</span><div class="tx-actions"><button class="btn-action btn-edit" title="Edit" data-id="' + t.id + '">&#9998;</button><button class="btn-action btn-delete" title="Delete" data-id="' + t.id + '">&#x2715;</button></div></li>';
  }).join("");
  txList.querySelectorAll(".btn-edit").forEach(function (btn) {
    btn.addEventListener("click", function () { openEditModal(parseInt(btn.dataset.id)); });
  });
  txList.querySelectorAll(".btn-delete").forEach(function (btn) {
    btn.addEventListener("click", function () { confirmDelete(parseInt(btn.dataset.id)); });
  });
}

/* ── Add Transaction ────────────────────────────────────── */
if (txForm) {
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
      showMessage(formMessage, "Please fill all required fields.", "error");
      return;
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      var btnText = submitBtn.querySelector(".btn-text");
      if (btnText) btnText.textContent = "Saving…";
    }
    try {
      var res = await authFetch(API + "/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      showMessage(formMessage, "Transaction added ✓", "success");
      txForm.reset();
      setDefaultDate();
      setType("income");
      await refresh();
    } catch (err) {
      showMessage(formMessage, err.message, "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        var btnText = submitBtn.querySelector(".btn-text");
        if (btnText) btnText.textContent = "Add Transaction";
      }
    }
  });
}

/* ── Edit Transaction ───────────────────────────────────── */
function openEditModal(id) {
  var t = allTransactions.find(function (tx) { return tx.id === id; });
  if (!t) return;
  document.getElementById("editId").value = t.id;
  document.getElementById("editDate").value = t.date;
  document.getElementById("editAmount").value = t.amount;
  document.getElementById("editNote").value = t.note || "";
  setEditType(t.type);
  var editCategorySelect = document.getElementById("editCategory");
  if (editCategorySelect) editCategorySelect.value = t.category;
  if (editOverlay) editOverlay.classList.add("open");
}

function closeEditModal() {
  if (editOverlay) editOverlay.classList.remove("open");
  if (editForm) editForm.reset();
  if (editMessage) editMessage.textContent = "";
}

var modalClose = document.getElementById("modalClose");
if (modalClose) modalClose.addEventListener("click", closeEditModal);
var modalCancel = document.getElementById("modalCancel");
if (modalCancel) modalCancel.addEventListener("click", closeEditModal);
if (editOverlay) editOverlay.addEventListener("click", function (e) { if (e.target === editOverlay) closeEditModal(); });

if (editForm) {
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
      showMessage(editMessage, "Please fill all required fields.", "error");
      return;
    }
    if (editSubmitBtn) {
      editSubmitBtn.disabled = true;
      var btnText = editSubmitBtn.querySelector(".btn-text");
      if (btnText) btnText.textContent = "Saving…";
    }
    try {
      var res = await authFetch(API + "/transactions/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      closeEditModal();
      await refresh();
    } catch (err) {
      showMessage(editMessage, err.message, "error");
    } finally {
      if (editSubmitBtn) {
        editSubmitBtn.disabled = false;
        var btnText = editSubmitBtn.querySelector(".btn-text");
        if (btnText) btnText.textContent = "Save Changes";
      }
    }
  });
}

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
  var typeInput = document.getElementById("type");
  if (typeInput) typeInput.value = value;
  document.querySelectorAll(".toggle[data-value]").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.value === value);
  });
  updateCategoryOptions(value);
}

function setEditType(value) {
  var editTypeInput = document.getElementById("editType");
  if (editTypeInput) editTypeInput.value = value;
  document.querySelectorAll(".toggle[data-edit-value]").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.editValue === value);
  });
  updateEditCategoryOptions(value);
}

document.querySelectorAll(".toggle[data-value]").forEach(function (btn) {
  btn.addEventListener("click", function () { setType(btn.dataset.value); });
});
document.querySelectorAll(".toggle[data-edit-value]").forEach(function (btn) {
  btn.addEventListener("click", function () { setEditType(btn.dataset.editValue); });
});

/* ── Filter & Sort Controls ─────────────────────────────── */
var btnFilterToggle = document.getElementById("btnFilterToggle");
if (btnFilterToggle) {
  btnFilterToggle.addEventListener("click", function () {
    var bar = document.getElementById("filterBar");
    if (bar) bar.classList.toggle("open");
    this.classList.toggle("active");
  });
}
document.querySelectorAll(".filter").forEach(function (btn) {
  btn.addEventListener("click", function () {
    filterType = btn.dataset.filter;
    document.querySelectorAll(".filter").forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
    renderList();
  });
});
document.querySelectorAll(".sort-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    filterSort = btn.dataset.sort;
    document.querySelectorAll(".sort-btn").forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
    renderList();
  });
});
var filterCategoryEl = document.getElementById("filterCategory");
if (filterCategoryEl) filterCategoryEl.addEventListener("change", function () { filterCategory = this.value; fetchTransactions(); });
var filterFromEl = document.getElementById("filterFrom");
if (filterFromEl) filterFromEl.addEventListener("change", function () { filterFrom = this.value; fetchTransactions(); });
var filterToEl = document.getElementById("filterTo");
if (filterToEl) filterToEl.addEventListener("change", function () { filterTo = this.value; fetchTransactions(); });
var btnFilterReset = document.getElementById("btnFilterReset");
if (btnFilterReset) {
  btnFilterReset.addEventListener("click", function () {
    filterType = "all";
    filterSort = "latest";
    filterCategory = "";
    filterFrom = "";
    filterTo = "";
    if (filterCategoryEl) filterCategoryEl.value = "";
    if (filterFromEl) filterFromEl.value = "";
    if (filterToEl) filterToEl.value = "";
    document.querySelectorAll(".filter").forEach(function (b) { b.classList.toggle("active", b.dataset.filter === "all"); });
    document.querySelectorAll(".sort-btn").forEach(function (b) { b.classList.toggle("active", b.dataset.sort === "latest"); });
    fetchTransactions();
  });
}

function updateFilterSummary(count) {
  var el = document.getElementById("filterSummary");
  if (!el) return;
  var parts = [];
  if (filterType !== "all") parts.push(filterType);
  if (filterCategory) parts.push(filterCategory);
  if (filterFrom || filterTo) parts.push((filterFrom || "…") + " → " + (filterTo || "…"));
  if (filterSort !== "latest") parts.push("sort: " + filterSort);
  if (parts.length === 0) {
    el.innerHTML = "";
  } else {
    el.innerHTML = "Showing <span>" + count + "</span> result" + (count !== 1 ? "s" : "") + " — " + parts.map(function (p) { return "<span>" + escHtml(p) + "</span>"; }).join(", ");
  }
}

/* ── Monthly Budget ─────────────────────────────────────── */
async function fetchMonthlyBudget() {
  if (!monthlyBudgetCard) return;
  try {
    var data = await authFetch(API + "/budget").then(function (r) { return r.json(); });
    renderMonthlyBudget(data);
  } catch (e) {
    if (monthlyBudgetCard) monthlyBudgetCard.innerHTML = "";
  }
}

function renderMonthlyBudget(data) {
  if (!monthlyBudgetCard) return;
  var limit = data.limit_amount;
  var expense = data.total_expense;
  var status = data.status || "ok";
  var pct = data.percent_used || 0;
  var month = data.month;

  var parts = month.split("-");
  var monthFmt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  var alertText = "";
  var alertClass = "";
  if (status === "warning") {
    alertText = "◉ Warning: " + pct + "% of your monthly budget spent.";
    alertClass = "warning";
  }
  if (status === "critical") {
    alertText = "⚠ Critical: " + pct + "% — you have exceeded your monthly budget!";
    alertClass = "critical";
  }

  var remaining = limit ? limit - expense : null;
  var remLabel = remaining !== null && remaining < 0 ? "Over by" : "Remaining";
  var remClass = remaining !== null && remaining < 0 ? "over" : "remaining";
  var remDisplay = remaining !== null ? formatRpShort(Math.abs(remaining)) : "—";

  monthlyBudgetCard.className = "monthly-budget-card" + (status !== "ok" ? " status-" + status : "");
  monthlyBudgetCard.innerHTML =
    '<div class="mbudget-inner">' +
    '<span class="mbudget-label">Monthly Budget</span>' +
    '<div class="mbudget-track-wrap">' +
    '<div class="mbudget-month">' + escHtml(monthFmt) + (limit ? " — " + pct + "% used" : " — no limit set") + '</div>' +
    '<div class="mbudget-track">' +
    '<div class="mbudget-fill" id="mbudgetFill" style="width:0%"></div>' +
    '</div>' +
    '</div>' +
    (limit ?
      '<div class="mbudget-nums">' +
      '<div class="mbudget-num"><div class="mbudget-num-label">Limit</div><div class="mbudget-num-value">' + formatRpShort(limit) + '</div></div>' +
      '<div class="mbudget-num"><div class="mbudget-num-label">Spent</div><div class="mbudget-num-value spent">' + formatRpShort(expense) + '</div></div>' +
      '<div class="mbudget-num"><div class="mbudget-num-label">' + remLabel + '</div><div class="mbudget-num-value ' + remClass + '">' + remDisplay + '</div></div>' +
      '</div>'
      : '') +
    '<div class="mbudget-form">' +
    '<div class="mbudget-input-wrap">' +
    '<span>Rp</span>' +
    '<input class="mbudget-input" id="mbudgetInput" type="number" min="1" step="any" placeholder="Set limit…" value="' + (limit || "") + '" />' +
    '</div>' +
    '<button class="mbudget-save" id="mbudgetSave">Save</button>' +
    (limit ? '<button class="mbudget-clear" id="mbudgetClear">✕</button>' : '') +
    '</div>' +
    '</div>' +
    '<div class="mbudget-alert ' + alertClass + '">' + alertText + '</div>';

  requestAnimationFrame(function () {
    setTimeout(function () {
      var fill = document.getElementById("mbudgetFill");
      if (fill) fill.style.width = Math.min(pct, 100) + "%";
    }, 80);
  });

  document.getElementById("mbudgetSave").addEventListener("click", async function () {
    var val = parseFloat(document.getElementById("mbudgetInput").value);
    if (!val || val <= 0) return;
    await authFetch(API + "/budget", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit_amount: val })
    });
    fetchMonthlyBudget();
  });

  var clearBtn = document.getElementById("mbudgetClear");
  if (clearBtn) {
    clearBtn.addEventListener("click", async function () {
      if (!confirm("Remove the budget limit for " + monthFmt + "?")) return;
      await authFetch(API + "/budget?month=" + encodeURIComponent(month), { method: "DELETE" });
      fetchMonthlyBudget();
    });
  }
}

/* ── Charts ─────────────────────────────────────────────── */
var CHART_COLORS = ["#e8d5b0", "#4ade80", "#f87171", "#60a5fa", "#fbbf24", "#a78bfa", "#34d399", "#fb923c"];
var chartTooltip = (function () {
  var el = document.createElement("div");
  el.className = "chart-tooltip";
  document.body.appendChild(el);
  return el;
})();

function showTooltip(html, x, y) {
  chartTooltip.innerHTML = html;
  chartTooltip.classList.add("visible");
  var tw = chartTooltip.offsetWidth;
  var th = chartTooltip.offsetHeight;
  chartTooltip.style.left = (x + 12 + tw > window.innerWidth ? x - tw - 12 : x + 12) + "px";
  chartTooltip.style.top = (y + 12 + th > window.innerHeight ? y - th - 8 : y + 8) + "px";
}
function hideTooltip() { chartTooltip.classList.remove("visible"); }

async function fetchCategoryChart(month) {
  var donutWrap = document.getElementById("donutWrap");
  if (!donutWrap) return;
  donutWrap.innerHTML = '<div class="tx-empty">Loading…</div>';
  try {
    var url = API + "/summary/categories" + (month ? "?month=" + encodeURIComponent(month) : "");
    var data = await authFetch(url).then(function (r) { return r.json(); });
    renderDonut(data);
  } catch (e) {
    donutWrap.innerHTML = '<div class="tx-empty">Could not load data.</div>';
  }
}

function renderDonut(data) {
  var donutWrap = document.getElementById("donutWrap");
  if (!donutWrap) return;
  var cats = data.categories;
  if (!cats || cats.length === 0) {
    donutWrap.innerHTML = '<div class="tx-empty">No expense data yet.</div>';
    return;
  }
  var W = 180, H = 180, cx = W / 2, cy = H / 2;
  var outerR = 70, innerR = 42, gap = 0.018;
  function polarToXY(angle, r) { return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }; }
  function arcPath(startAngle, endAngle, color, idx) {
    var s = startAngle + gap, e = endAngle - gap;
    if (e <= s) { s = startAngle; e = endAngle; }
    var large = (e - s) > Math.PI ? 1 : 0;
    var p1 = polarToXY(s, outerR), p2 = polarToXY(e, outerR);
    var p3 = polarToXY(e, innerR), p4 = polarToXY(s, innerR);
    var d = ["M", p1.x, p1.y, "A", outerR, outerR, 0, large, 1, p2.x, p2.y, "L", p3.x, p3.y, "A", innerR, innerR, 0, large, 0, p4.x, p4.y, "Z"].join(" ");
    return '<path d="' + d + '" fill="' + color + '" opacity="0.9" data-idx="' + idx + '" style="cursor:pointer;transition:opacity .15s" onmouseenter="donutHover(event,' + idx + ')" onmouseleave="hideTooltip()" />';
  }
  var startAngle = -Math.PI / 2;
  var paths = "";
  cats.forEach(function (cat, i) {
    var sweep = (cat.percent / 100) * 2 * Math.PI;
    paths += arcPath(startAngle, startAngle + sweep, CHART_COLORS[i % CHART_COLORS.length], i);
    startAngle += sweep;
  });
  var centerLabel = '<text x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle" font-family="DM Serif Display,serif" font-size="13" fill="#f0ebe3">' + formatRpShort(data.grand_total) + '</text><text x="' + cx + '" y="' + (cy + 12) + '" text-anchor="middle" font-family="DM Mono,monospace" font-size="9" fill="#6b6560">TOTAL</text>';
  var svg = '<svg class="donut-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' + paths + centerLabel + '</svg>';
  var legend = '<div class="donut-legend">' + cats.map(function (cat, i) { return '<div class="legend-item" onmouseenter="donutHoverLegend(event,' + i + ')" onmouseleave="hideTooltip()"><span class="legend-dot" style="background:' + CHART_COLORS[i % CHART_COLORS.length] + '"></span><span class="legend-label">' + escHtml(cat.category) + '</span><span class="legend-pct">' + cat.percent + '%</span><span class="legend-amt">' + formatRpShort(cat.total) + '</span></div>'; }).join("") + '</div>';
  donutWrap.innerHTML = svg + legend;
  donutWrap._catData = cats;
}

function donutHover(event, idx) {
  var donutWrap = document.getElementById("donutWrap");
  var cats = donutWrap ? donutWrap._catData : null;
  if (!cats || !cats[idx]) return;
  var cat = cats[idx];
  showTooltip('<b>' + escHtml(cat.category) + '</b><br>' + formatRp(cat.total) + ' (' + cat.percent + '%)', event.clientX, event.clientY);
}
function donutHoverLegend(event, idx) { donutHover(event, idx); }

async function fetchBarChart() {
  var barWrap = document.getElementById("barWrap");
  if (!barWrap) return;
  barWrap.innerHTML = '<div class="tx-empty">Loading…</div>';
  try {
    var data = await authFetch(API + "/summary/monthly").then(function (r) { return r.json(); });
    renderBar(data);
  } catch (e) {
    barWrap.innerHTML = '<div class="tx-empty">Could not load data.</div>';
  }
}

function renderBar(rows) {
  var barWrap = document.getElementById("barWrap");
  if (!barWrap) return;
  if (!rows || rows.length === 0) {
    barWrap.innerHTML = '<div class="tx-empty">No monthly data yet.</div>';
    return;
  }
  var data = rows.slice(0, 6).reverse();
  var svgW = 520, svgH = 180;
  var padL = 58, padR = 12, padT = 14, padB = 36;
  var chartW = svgW - padL - padR;
  var chartH = svgH - padT - padB;
  var maxVal = 0;
  data.forEach(function (d) { maxVal = Math.max(maxVal, d.total_income, d.total_expense); });
  if (maxVal === 0) maxVal = 1;
  var groupW = chartW / data.length;
  var barW = Math.min(groupW * 0.36, 26);
  var barGap = Math.min(groupW * 0.06, 5);
  function scaleY(val) { return chartH - (val / maxVal) * chartH; }
  var gridLines = "";
  for (var i = 0; i <= 4; i++) {
    var val = (maxVal / 4) * i;
    var y = padT + scaleY(val);
    gridLines += '<line class="bar-grid-line" x1="' + padL + '" y1="' + y + '" x2="' + (padL + chartW) + '" y2="' + y + '" stroke-dasharray="3,3" /><text class="bar-axis-label" x="' + (padL - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + formatRpShort(val) + '</text>';
  }
  var bars = "";
  data.forEach(function (d, i) {
    var groupX = padL + i * groupW + (groupW - (barW * 2 + barGap)) / 2;
    var incomeH = (d.total_income / maxVal) * chartH;
    var expenseH = (d.total_expense / maxVal) * chartH;
    var incomeY = padT + scaleY(d.total_income);
    var expenseY = padT + scaleY(d.total_expense);
    var parts = d.month.split("-");
    var mLabel = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1).toLocaleDateString("en-US", { month: "short" });
    var yLabel = parts[0].slice(2);
    var labelX = padL + i * groupW + groupW / 2;
    bars += '<rect class="bar-group-income" x="' + groupX + '" y="' + incomeY + '" width="' + barW + '" height="' + incomeH + '" rx="3" data-month="' + escHtml(d.month) + '" onmouseenter="barHover(event,\'' + escHtml(d.month) + '\',' + d.total_income + ',' + d.total_expense + ')" onmouseleave="hideTooltip()" /><rect class="bar-group-expense" x="' + (groupX + barW + barGap) + '" y="' + expenseY + '" width="' + barW + '" height="' + expenseH + '" rx="3" onmouseenter="barHover(event,\'' + escHtml(d.month) + '\',' + d.total_income + ',' + d.total_expense + ')" onmouseleave="hideTooltip()" /><text class="bar-axis-label" x="' + labelX + '" y="' + (padT + chartH + 16) + '" text-anchor="middle">' + mLabel + ' \'' + yLabel + '</text>';
  });
  var svg = '<svg class="bar-svg" viewBox="0 0 ' + svgW + ' ' + svgH + '" preserveAspectRatio="xMidYMid meet">' + gridLines + bars + '</svg>';
  var legend = '<div class="bar-legend"><div class="bar-legend-item"><span class="bar-legend-dot" style="background:var(--income)"></span>Income</div><div class="bar-legend-item"><span class="bar-legend-dot" style="background:var(--expense)"></span>Expenses</div></div>';
  barWrap.innerHTML = svg + legend;
}

function barHover(event, month, income, expense) {
  var parts = month.split("-");
  var mLabel = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  showTooltip('<b>' + mLabel + '</b><br>&#9650; ' + formatRp(income) + '<br>&#9660; ' + formatRp(expense), event.clientX, event.clientY);
}

async function populateMonthSelector() {
  try {
    var rows = await authFetch(API + "/summary/monthly").then(function (r) { return r.json(); });
    var select = document.getElementById("donutMonthSelect");
    if (!select || !rows.length) return;
    rows.forEach(function (row) {
      var parts = row.month.split("-");
      var label = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
      var opt = document.createElement("option");
      opt.value = row.month;
      opt.textContent = label;
      select.appendChild(opt);
    });
    select.addEventListener("change", function () { fetchCategoryChart(this.value); });
  } catch (e) { }
}

/* ── History Summary Functions ──────────────────────────── */
function openHistoryDrawer() {
  if (historyOverlay) {
    historyOverlay.classList.add("open");
    loadHistory(activeHistoryTab);
  }
}

function closeHistoryDrawer() {
  if (historyOverlay) historyOverlay.classList.remove("open");
}

document.querySelectorAll(".history-tab").forEach(function (tab) {
  tab.addEventListener("click", function () {
    activeHistoryTab = tab.dataset.tab;
    document.querySelectorAll(".history-tab").forEach(function (t) { t.classList.remove("active"); });
    tab.classList.add("active");
    var dailyPane = document.getElementById("historyDaily");
    var monthlyPane = document.getElementById("historyMonthly");
    if (dailyPane) dailyPane.style.display = activeHistoryTab === "daily" ? "block" : "none";
    if (monthlyPane) monthlyPane.style.display = activeHistoryTab === "monthly" ? "block" : "none";
    loadHistory(activeHistoryTab);
  });
});

async function loadHistory(tab) {
  if (tab === "daily") await loadDailySummary();
  if (tab === "monthly") await loadMonthlySummary();
}

async function loadDailySummary() {
  var body = document.getElementById("dailyBody");
  if (!body) return;
  body.innerHTML = '<div class="tx-empty">Loading…</div>';
  try {
    var rows = await authFetch(API + "/summary/daily").then(function (r) { return r.json(); });
    if (!rows.length) { body.innerHTML = '<div class="tx-empty">No transactions yet.</div>'; return; }
    body.innerHTML = rows.map(function (row, i) {
      var date = new Date(row.date + "T00:00:00");
      var label = date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
      var income = row.total_income || 0;
      var expense = row.total_expense || 0;
      var balance = row.balance || 0;
      var balClass = balance >= 0 ? "pos" : "neg";
      return '<div class="summary-row" style="animation-delay:' + (i * 0.03) + 's"><div class="summary-row-date">' + escHtml(label) + '<span>' + date.getFullYear() + '</span></div><div class="summary-row-val income">' + (income > 0 ? "+" + formatRpShort(income) : "—") + '</div><div class="summary-row-val expense">' + (expense > 0 ? "−" + formatRpShort(expense) : "—") + '</div><div class="summary-row-val balance ' + balClass + '">' + formatRpShort(balance) + '</div></div>';
    }).join("");
  } catch (e) {
    body.innerHTML = '<div class="tx-empty">Could not load daily summary.</div>';
  }
}

async function loadMonthlySummary() {
  var body = document.getElementById("monthlyBody");
  if (!body) return;
  body.innerHTML = '<div class="tx-empty">Loading…</div>';
  try {
    var rows = await authFetch(API + "/summary/monthly").then(function (r) { return r.json(); });
    if (!rows.length) { body.innerHTML = '<div class="tx-empty">No transactions yet.</div>'; return; }
    body.innerHTML = rows.map(function (row, i) {
      var parts = row.month.split("-");
      var date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
      var label = date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      var income = row.total_income || 0;
      var expense = row.total_expense || 0;
      var balance = row.balance || 0;
      var balClass = balance >= 0 ? "pos" : "neg";
      return '<div class="summary-row" style="animation-delay:' + (i * 0.03) + 's"><div class="summary-row-date">' + escHtml(label) + '<span>Monthly</span></div><div class="summary-row-val income">' + (income > 0 ? "+" + formatRpShort(income) : "—") + '</div><div class="summary-row-val expense">' + (expense > 0 ? "−" + formatRpShort(expense) : "—") + '</div><div class="summary-row-val balance ' + balClass + '">' + formatRpShort(balance) + '</div></div>';
    }).join("");
  } catch (e) {
    body.innerHTML = '<div class="tx-empty">Could not load monthly summary.</div>';
  }
}

function addHistoryButton() {
  if (!document.getElementById("historyButton")) {
    var btn = document.createElement("button");
    btn.id = "historyButton";
    btn.innerHTML = "📊 History";
    btn.className = "btn-history-open";
    btn.style.cssText = "position: fixed; bottom: 2rem; right: 2rem; background: #6366f1; border: none; border-radius: 3rem; padding: 0.75rem 1.5rem; color: white; font-weight: 500; cursor: pointer; z-index: 100; font-family: inherit; box-shadow: 0 4px 12px rgba(0,0,0,0.15);";
    btn.addEventListener("click", openHistoryDrawer);
    document.body.appendChild(btn);
  }
}

if (historyClose) historyClose.addEventListener("click", closeHistoryDrawer);
if (historyOverlay) historyOverlay.addEventListener("click", function (e) { if (e.target === historyOverlay) closeHistoryDrawer(); });

/* ── Refresh ────────────────────────────────────────────── */
async function refresh() {
  console.log("Refreshing data...");
  try {
    await Promise.all([fetchTransactions(), fetchSummary(), fetchBudget(), fetchMonthlyBudget(), fetchCategoryChart(""), fetchBarChart()]);
    console.log("Data refresh complete");
  } catch (error) {
    console.error("Error refreshing data:", error);
  }
}

/* ── Init ───────────────────────────────────────────────── */
function init() {
  if (!isTokenValid(localStorage.getItem("token"))) {
    window.location.href = APPROOT + "/login";
    return;
  }
  renderHeaderDate();
  setDefaultDate();
  var username = localStorage.getItem("username") || "";
  var headerEl = document.getElementById("headerUsername");
  if (headerEl) headerEl.textContent = username ? "◈ " + username : "";
  var logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      if (confirm("Sign out of Money Tracker?")) {
        localStorage.clear();
        window.location.href = APPROOT + "/login";
      }
    });
  }
  updateCategoryOptions("income");
  updateEditCategoryOptions("income");
  addHistoryButton();
  populateMonthSelector();
  refresh();
}

if (!window.location.pathname.includes("/login") && !window.location.pathname.includes("/register")) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}

