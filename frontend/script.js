/* ── Config ────────────────────────────────────────────── */
const API = "http://127.0.0.1:5000/api";

/* ── State ─────────────────────────────────────────────── */
let allTransactions = [];   // full list from server
let activeFilter = "all"; // 'all' | 'income' | 'expense'

/* ── DOM refs ───────────────────────────────────────────── */
const txList = document.getElementById("txList");
const txForm = document.getElementById("txForm");
const formMessage = document.getElementById("formMessage");
const submitBtn = document.getElementById("submitBtn");

const totalIncomeEl = document.getElementById("totalIncome");
const totalExpenseEl = document.getElementById("totalExpense");
const balanceEl = document.getElementById("balance");

/* ── Helpers ────────────────────────────────────────────── */

/** Format number as Indonesian Rupiah */
function formatRp(amount) {
    return new Intl.NumberFormat("id-ID", {
        style: "currency", currency: "IDR",
        minimumFractionDigits: 0,
    }).format(amount);
}

/** Show a short feedback message under the form */
function showMessage(text, type = "success") {
    formMessage.textContent = text;
    formMessage.className = `form-message ${type}`;
    setTimeout(() => { formMessage.textContent = ""; formMessage.className = "form-message"; }, 3000);
}

/** Set today's date as default in the date field */
function setDefaultDate() {
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById("date").value = today;
}

/** Write today's date in the header */
function renderHeaderDate() {
    const el = document.getElementById("headerDate");
    el.textContent = new Date().toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
    }).toUpperCase();
}

/* ── Summary ────────────────────────────────────────────── */

async function fetchSummary() {
    try {
        const res = await fetch(`${API}/summary`);
        const data = await res.json();
        totalIncomeEl.textContent = formatRp(data.total_income);
        totalExpenseEl.textContent = formatRp(data.total_expense);
        balanceEl.textContent = formatRp(data.balance);
    } catch {
        [totalIncomeEl, totalExpenseEl, balanceEl].forEach(el => el.textContent = "—");
    }
}

/* ── Transactions List ──────────────────────────────────── */

async function fetchTransactions() {
    try {
        const res = await fetch(`${API}/transactions`);
        allTransactions = await res.json();
        renderList();
    } catch {
        txList.innerHTML = `<li class="tx-empty">Could not load transactions.</li>`;
    }
}

function renderList() {
    const items = activeFilter === "all"
        ? allTransactions
        : allTransactions.filter(t => t.type === activeFilter);

    if (items.length === 0) {
        txList.innerHTML = `<li class="tx-empty">No transactions yet.</li>`;
        return;
    }

    txList.innerHTML = items.map((t, i) => `
    <li class="tx-item" style="animation-delay:${i * 0.04}s">
      <span class="tx-dot tx-dot--${t.type}"></span>
      <div class="tx-meta">
        <div class="tx-category">${escHtml(t.category)}</div>
        <div class="tx-sub">${t.date}${t.note ? " · " + escHtml(t.note) : ""}</div>
      </div>
      <span class="tx-amount tx-amount--${t.type}">
        ${t.type === "income" ? "+" : "−"}${formatRp(t.amount)}
      </span>
    </li>
  `).join("");
}

/** Minimal XSS guard */
function escHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ── Add Transaction ────────────────────────────────────── */

txForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
        date: document.getElementById("date").value,
        type: document.getElementById("type").value,
        category: document.getElementById("category").value,
        amount: parseFloat(document.getElementById("amount").value),
        note: document.getElementById("note").value.trim(),
    };

    // Basic client-side guard
    if (!payload.date || !payload.category || isNaN(payload.amount)) {
        showMessage("Please fill all required fields.", "error");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.querySelector(".btn-text").textContent = "Saving…";

    try {
        const res = await fetch(`${API}/transactions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Server error");

        showMessage("Transaction added ✓", "success");
        txForm.reset();
        setDefaultDate();
        // Reset type toggle back to income
        setType("income");

        await Promise.all([fetchTransactions(), fetchSummary()]);

    } catch (err) {
        showMessage(err.message, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.querySelector(".btn-text").textContent = "Add Transaction";
    }
});

/* ── Type Toggle ────────────────────────────────────────── */

function setType(value) {
    document.getElementById("type").value = value;
    document.querySelectorAll(".toggle").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.value === value);
    });
}

document.querySelectorAll(".toggle").forEach(btn => {
    btn.addEventListener("click", () => setType(btn.dataset.value));
});

/* ── Filter Buttons ─────────────────────────────────────── */

document.querySelectorAll(".filter").forEach(btn => {
    btn.addEventListener("click", () => {
        activeFilter = btn.dataset.filter;
        document.querySelectorAll(".filter").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderList();
    });
});

/* ── Init ───────────────────────────────────────────────── */

function init() {
    renderHeaderDate();
    setDefaultDate();
    fetchSummary();
    fetchTransactions();
}

init();