'use strict';

/* ---------- Storage ---------- */
const STORE_KEY = 'mybudget:v1';
const DEFAULT_EXPENSE_CATS = ['Food', 'Groceries', 'Transport', 'Shopping', 'Bills', 'Health', 'Fun', 'Other'];
const INCOME_CATS = ['Salary', 'Freelance', 'Gift', 'Refund', 'Other'];

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY));
    if (data && Array.isArray(data.txns)) {
      data.settings = { currency: '₹', budget: 0, startDay: 1, categories: DEFAULT_EXPENSE_CATS.slice(), ...data.settings };
      return data;
    }
  } catch (_) { /* fall through to defaults */ }
  return { settings: { currency: '₹', budget: 0, startDay: 1, categories: DEFAULT_EXPENSE_CATS.slice() }, txns: [] };
}

let state = load();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (_) {
    toast('Could not save — storage is full or blocked');
  }
}

// Ask the browser not to evict our data under storage pressure.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- Date helpers (local time, YYYY-MM-DD) ---------- */
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
const todayKey = () => toKey(new Date());
const daysBetween = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);

// A budget period runs from settings.startDay of one month to the day before it in the next.
function periodFor(key, offset = 0) {
  const s = Math.min(Math.max(parseInt(state.settings.startDay, 10) || 1, 1), 28);
  const d = fromKey(key);
  let y = d.getFullYear(), m = d.getMonth();
  if (d.getDate() < s) m -= 1;
  m += offset;
  const start = new Date(y, m, s);
  const end = new Date(y, m + 1, s - 1);
  return { start: toKey(start), end: toKey(end), days: daysBetween(toKey(start), toKey(end)) + 1 };
}

function periodLabel(p) {
  const s = fromKey(p.start), e = fromKey(p.end);
  if (s.getDate() === 1) return s.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const f = { day: 'numeric', month: 'short' };
  return `${s.toLocaleDateString(undefined, f)} – ${e.toLocaleDateString(undefined, f)}`;
}

function dayLabel(key) {
  const t = todayKey();
  if (key === t) return 'Today';
  if (key === addDays(t, -1)) return 'Yesterday';
  if (key === addDays(t, 1)) return 'Tomorrow';
  return fromKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: fromKey(key).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

/* ---------- Formatting ---------- */
const numFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const money = (n) => `${n < 0 ? '−' : ''}${state.settings.currency}${numFmt.format(Math.abs(n))}`;
const round2 = (n) => Math.round(n * 100) / 100;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function catColor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 50%)`;
}

/* ---------- Queries ---------- */
const inRange = (t, a, b) => t.date >= a && t.date <= b;
const sum = (list) => round2(list.reduce((s, t) => s + t.amount, 0));
const expenses = (a, b) => state.txns.filter((t) => t.type === 'expense' && inRange(t, a, b));
const incomes = (a, b) => state.txns.filter((t) => t.type === 'income' && inRange(t, a, b));
const sortTx = (list) => list.slice().sort((x, y) => (y.date.localeCompare(x.date)) || (y.ts - x.ts));

/* ---------- DOM ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let currentView = 'today';
let selectedDay = todayKey();
let statsOffset = 0;

const TITLES = { today: 'Today', history: 'History', stats: 'Stats', settings: 'Settings' };

function showView(name) {
  currentView = name;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $('#title').textContent = TITLES[name];
  $('#fab').hidden = name === 'settings';
  render();
  window.scrollTo(0, 0);
}

function txItem(t) {
  const li = document.createElement('li');
  li.className = 'tx';
  li.dataset.id = t.id;
  const sign = t.type === 'income' ? '+' : '−';
  li.innerHTML = `
    <div class="tx-icon" style="background:${t.type === 'income' ? 'var(--pos)' : catColor(t.category)}">${esc(t.category.slice(0, 1).toUpperCase())}</div>
    <div class="tx-main">
      <div class="tx-cat">${esc(t.category)}</div>
      ${t.note ? `<div class="tx-note">${esc(t.note)}</div>` : ''}
    </div>
    <div class="tx-amt ${t.type === 'income' ? 'pos' : ''}">${sign}${state.settings.currency}${numFmt.format(t.amount)}</div>`;
  li.addEventListener('click', () => openSheet(t));
  return li;
}

/* ---------- Today ---------- */
function renderToday() {
  const day = selectedDay;
  const p = periodFor(day);
  const budget = Number(state.settings.budget) || 0;
  const spentDay = sum(expenses(day, day));
  const incomeDay = sum(incomes(day, day));
  const spentPeriod = sum(expenses(p.start, p.end));

  $('#day-label').textContent = dayLabel(day);
  $('#spent-day').textContent = money(spentDay);
  $('#income-day').textContent = money(incomeDay);

  const ring = $('#ring-fg');
  const C = 2 * Math.PI * 52;
  ring.style.strokeDasharray = C;

  if (budget > 0) {
    // Spread what's left of the period budget evenly over the remaining days (incl. this one).
    const spentBefore = sum(expenses(p.start, addDays(day, -1)));
    const daysLeft = daysBetween(day, p.end) + 1;
    const allowance = Math.max(0, (budget - spentBefore) / daysLeft);
    const left = round2(allowance - spentDay);
    // When over, draw a full red ring; otherwise the ring shows the share of today's allowance left.
    const frac = left < 0 ? 1 : allowance > 0 ? Math.min(left / allowance, 1) : 0;
    ring.style.strokeDashoffset = C * (1 - frac);
    ring.style.opacity = frac > 0 ? 1 : 0;
    ring.style.stroke = left < 0 ? 'var(--neg)' : frac < 0.25 ? '#f59e0b' : 'var(--accent)';
    $('#left-label').textContent = left < 0 ? 'Over today' : 'Left today';
    $('#left-today').textContent = money(Math.abs(left));
    $('#left-today').className = `ring-amount ${left < 0 ? 'neg' : ''}`;
    $('#allowance').textContent = `${money(round2(allowance))} / day for ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
    const ml = round2(budget - spentPeriod);
    $('#month-left').textContent = money(ml);
    $('#month-left').className = ml < 0 ? 'neg' : '';
  } else {
    ring.style.opacity = 0;
    $('#left-label').textContent = 'Spent';
    $('#left-today').textContent = money(spentDay);
    $('#left-today').className = 'ring-amount';
    $('#allowance').innerHTML = 'Set a monthly budget in <b>Settings</b> to see your daily allowance';
    $('#month-left').textContent = '—';
    $('#month-left').className = '';
  }

  const list = $('#day-list');
  list.replaceChildren(...sortTx(state.txns.filter((t) => t.date === day)).map(txItem));
  $('#day-empty').hidden = list.children.length > 0;
}

/* ---------- History ---------- */
function renderHistory() {
  const q = $('#search').value.trim().toLowerCase();
  const list = sortTx(state.txns).filter((t) => !q || t.category.toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q));
  const box = $('#history-list');
  box.replaceChildren();
  const groups = new Map();
  for (const t of list) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  for (const [date, items] of groups) {
    const g = document.createElement('div');
    g.className = 'day-group';
    const spent = sum(items.filter((t) => t.type === 'expense'));
    g.innerHTML = `<div class="day-head"><span>${esc(dayLabel(date))}</span><span>${spent ? money(spent) : ''}</span></div>`;
    const ul = document.createElement('ul');
    ul.className = 'tx-list';
    ul.append(...items.map(txItem));
    g.append(ul);
    box.append(g);
  }
  $('#history-empty').hidden = list.length > 0;
}

/* ---------- Stats ---------- */
function renderStats() {
  const p = periodFor(todayKey(), statsOffset);
  const budget = Number(state.settings.budget) || 0;
  const exp = expenses(p.start, p.end);
  const spent = sum(exp);
  const income = sum(incomes(p.start, p.end));

  $('#month-label').textContent = periodLabel(p);
  $('#month-next').disabled = statsOffset >= 0;
  $('#m-spent').textContent = money(spent);
  $('#m-income').textContent = money(income);
  $('#m-budget').textContent = budget ? money(budget) : '—';

  const bar = $('#m-bar');
  bar.style.width = budget ? `${Math.min(spent / budget, 1) * 100}%` : '0%';
  bar.classList.toggle('over', budget > 0 && spent > budget);
  if (budget) {
    const diff = round2(budget - spent);
    $('#m-note').textContent = diff >= 0 ? `${money(diff)} under budget (${Math.round((spent / budget) * 100)}% used)` : `${money(-diff)} over budget`;
  } else {
    $('#m-note').textContent = income ? `Net: ${money(round2(income - spent))}` : '';
  }

  // Daily columns
  const perDay = [];
  for (let i = 0; i < p.days; i++) {
    const k = addDays(p.start, i);
    perDay.push(sum(exp.filter((t) => t.date === k)));
  }
  const dailyBudget = budget ? budget / p.days : 0;
  const max = Math.max(...perDay, dailyBudget, 1);
  const chart = $('#daily-chart');
  chart.replaceChildren();
  perDay.forEach((v, i) => {
    const c = document.createElement('div');
    c.className = `col${v === 0 ? ' zero' : ''}${dailyBudget && v > dailyBudget ? ' over' : ''}`;
    c.style.height = `${(v / max) * 100}%`;
    c.title = `${dayLabel(addDays(p.start, i))}: ${money(v)}`;
    chart.append(c);
  });
  if (dailyBudget) {
    const g = document.createElement('div');
    g.className = 'guide';
    g.style.bottom = `${(dailyBudget / max) * 100}%`;
    chart.append(g);
  }

  // Categories
  const byCat = new Map();
  for (const t of exp) byCat.set(t.category, (byCat.get(t.category) || 0) + t.amount);
  const cats = [...byCat].sort((a, b) => b[1] - a[1]);
  const ul = $('#cat-list');
  ul.innerHTML = cats.length
    ? cats.map(([name, v]) => `
      <li>
        <div class="row"><span>${esc(name)}</span><span>${money(round2(v))} <span class="muted small">${Math.round((v / spent) * 100)}%</span></span></div>
        <div class="bar"><div class="bar-fill" style="width:${(v / cats[0][1]) * 100}%;background:${catColor(name)}"></div></div>
      </li>`).join('')
    : '<li class="muted">No expenses in this period.</li>';
}

/* ---------- Settings ---------- */
function renderSettings() {
  const s = state.settings;
  if (document.activeElement !== $('#set-budget')) $('#set-budget').value = s.budget || '';
  if (document.activeElement !== $('#set-currency')) $('#set-currency').value = s.currency;
  if (document.activeElement !== $('#set-startday')) $('#set-startday').value = s.startDay;
  const chips = $('#cat-chips');
  chips.innerHTML = s.categories.map((c, i) => `<button class="chip" data-i="${i}">${esc(c)}<span class="x">×</span></button>`).join('');
}

function render() {
  ({ today: renderToday, history: renderHistory, stats: renderStats, settings: renderSettings })[currentView]();
}

/* ---------- Add / edit sheet ---------- */
let editing = null;
let formType = 'expense';
let formCat = null;

function renderFormCats() {
  const cats = formType === 'income' ? INCOME_CATS : state.settings.categories;
  if (!cats.includes(formCat)) formCat = cats[0];
  $('#f-cats').innerHTML = cats.map((c) => `<button type="button" class="chip${c === formCat ? ' active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
}

function setFormType(type) {
  formType = type;
  $$('.segmented button').forEach((b) => b.classList.toggle('active', b.dataset.type === type));
  renderFormCats();
}

function openSheet(tx) {
  editing = tx || null;
  $('#cur-symbol').textContent = state.settings.currency;
  $('#f-amount').value = tx ? tx.amount : '';
  $('#f-note').value = tx ? tx.note || '' : '';
  $('#f-date').value = tx ? tx.date : (currentView === 'today' ? selectedDay : todayKey());
  formCat = tx ? tx.category : null;
  setFormType(tx ? tx.type : 'expense');
  $('#f-delete').hidden = !tx;
  $('#sheet').classList.add('open');
  $('#sheet-backdrop').classList.add('open');
  if (!tx) setTimeout(() => $('#f-amount').focus(), 50);
}

function closeSheet() {
  document.activeElement && document.activeElement.blur();
  $('#sheet').classList.remove('open');
  $('#sheet-backdrop').classList.remove('open');
  editing = null;
}

$('#sheet').addEventListener('submit', (e) => {
  e.preventDefault();
  const amount = round2(parseFloat($('#f-amount').value));
  const date = $('#f-date').value;
  if (!(amount > 0)) return toast('Enter an amount');
  if (!date) return toast('Pick a date');
  const data = { type: formType, amount, category: formCat, note: $('#f-note').value.trim(), date };
  if (editing) {
    Object.assign(editing, data);
    toast('Updated');
  } else {
    const id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    state.txns.push({ id, ts: Date.now(), ...data });
    toast(`${formType === 'income' ? 'Income' : 'Expense'} added`);
  }
  save();
  closeSheet();
  render();
});

$('#f-delete').addEventListener('click', () => {
  if (!editing || !confirm('Delete this entry?')) return;
  state.txns = state.txns.filter((t) => t.id !== editing.id);
  save();
  closeSheet();
  render();
  toast('Deleted');
});

$('#f-cancel').addEventListener('click', closeSheet);
$('#sheet-backdrop').addEventListener('click', closeSheet);
$$('.segmented button').forEach((b) => b.addEventListener('click', () => setFormType(b.dataset.type)));
$('#f-cats').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-cat]');
  if (!chip) return;
  formCat = chip.dataset.cat;
  renderFormCats();
});

/* ---------- Navigation & controls ---------- */
$$('.tabbar button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
$('#fab').addEventListener('click', () => openSheet());
$('#day-prev').addEventListener('click', () => { selectedDay = addDays(selectedDay, -1); renderToday(); });
$('#day-next').addEventListener('click', () => { selectedDay = addDays(selectedDay, 1); renderToday(); });
$('#day-label').addEventListener('click', () => { selectedDay = todayKey(); renderToday(); });
$('#month-prev').addEventListener('click', () => { statsOffset--; renderStats(); });
$('#month-next').addEventListener('click', () => { if (statsOffset < 0) statsOffset++; renderStats(); });
$('#search').addEventListener('input', renderHistory);

// Swipe left/right on the Today view to change day.
(() => {
  let x0 = null, y0 = null;
  const el = $('#view-today');
  el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      selectedDay = addDays(selectedDay, dx < 0 ? 1 : -1);
      renderToday();
    }
    x0 = null;
  }, { passive: true });
})();

$('#set-budget').addEventListener('change', (e) => { state.settings.budget = Math.max(0, parseFloat(e.target.value) || 0); save(); toast('Budget saved'); });
$('#set-currency').addEventListener('change', (e) => { state.settings.currency = e.target.value.trim() || '₹'; save(); renderSettings(); });
$('#set-startday').addEventListener('change', (e) => {
  state.settings.startDay = Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), 28);
  save();
  renderSettings();
});

$('#cat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#cat-new').value.trim();
  if (!name) return;
  if (state.settings.categories.some((c) => c.toLowerCase() === name.toLowerCase())) return toast('Already exists');
  state.settings.categories.push(name);
  $('#cat-new').value = '';
  save();
  renderSettings();
});

$('#cat-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-i]');
  if (!chip) return;
  const cats = state.settings.categories;
  if (cats.length <= 1) return toast('Keep at least one category');
  const name = cats[chip.dataset.i];
  if (!confirm(`Remove category "${name}"? Existing entries keep their category.`)) return;
  cats.splice(Number(chip.dataset.i), 1);
  save();
  renderSettings();
});

/* ---------- Backup ---------- */
function download(name, text, type) {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  // On iPhone the share sheet is the friendliest way to save to Files.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: name }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

$('#export-csv').addEventListener('click', () => {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['Date', 'Type', 'Category', 'Amount', 'Note']]
    .concat(sortTx(state.txns).reverse().map((t) => [t.date, t.type, t.category, t.amount, t.note || '']));
  download(`mybudget-${todayKey()}.csv`, rows.map((r) => r.map(q).join(',')).join('\n'), 'text/csv');
});

$('#export-json').addEventListener('click', () => {
  download(`mybudget-backup-${todayKey()}.json`, JSON.stringify(state, null, 2), 'application/json');
});

$('#import-json').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.txns)) throw new Error('bad file');
    const valid = data.txns.every((t) => t && t.id && (t.type === 'expense' || t.type === 'income') && typeof t.amount === 'number' && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && typeof t.category === 'string');
    if (!valid) throw new Error('bad entries');
    if (!confirm(`Restore ${data.txns.length} entries? This replaces your current data.`)) return;
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    state = load();
    render();
    toast('Backup restored');
  } catch (_) {
    toast('That file is not a MyBudget backup');
  }
});

$('#clear-all').addEventListener('click', () => {
  if (!confirm('Delete ALL entries and settings? This cannot be undone.')) return;
  localStorage.removeItem(STORE_KEY);
  state = load();
  render();
  toast('All data deleted');
});

/* ---------- Misc ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

if (window.navigator.standalone || matchMedia('(display-mode: standalone)').matches) {
  document.documentElement.classList.add('standalone');
}

// Coming back to the app on a new day should jump to that day.
let lastToday = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const t = todayKey();
  if (t !== lastToday) {
    if (selectedDay === lastToday) selectedDay = t;
    lastToday = t;
  }
  render();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

showView('today');
