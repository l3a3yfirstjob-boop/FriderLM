function tileDeltaHtml(cur, prev) {
  if (prev === undefined || prev === null || !cur) return '';
  var prevNum = Number(prev);
  if (Math.abs(prevNum) < 10) return '';
  var diff = Number(cur) - prevNum;
  var pct = (diff / Math.abs(prevNum)) * 100;
  var up = diff >= 0;
  var pctStr = Math.abs(pct) > 999 ? '> 999%' : Math.abs(pct).toFixed(1) + '%';
  return ' <span style="font-size:9px; font-weight:800; color:' + (up ? 'var(--brand)' : 'var(--danger)') + ';">' + (up ? '↑' : '↓') + pctStr + '</span>';
}

/*************************************************************
 * Frontend logic. Nothing here recalculates Sheet formulas —
 * every number shown (Incentive, Revenue, Net Profit, KPI,
 * Monthly/Lifetime metrics) is read directly from what the
 * Sheet already computed. This file only formats & displays.
 *************************************************************/

var APP = {
  theme: localStorage.getItem('los_theme') || 'dark',
  lang: localStorage.getItem('los_lang') || 'th',
  dropdowns: { MODE: [], INCOME_NOTE: [], EXP_NOTE: [] },
  financeDate: new Date(),
  analysisDate: new Date(),
  historyMonth: new Date().getMonth() + 1,
  historyYear: new Date().getFullYear(),
  historyTab: 'monthly',
  historyLoadId: 0,
  analysisFilter: 'all',
  pinUnlocked: sessionStorage.getItem('los_pin_unlocked') === '1',
  hasPin: false,
  pendingPinCallback: null,
  pendingSave: null // { dateStr, payload, target: 'finance'|'quicksave' }
};

var FIELDS = [
  { key: 'mode', label: 'โหมดวันนี้ (Mode)', type: 'select', dd: 'MODE' },
  { key: 'jobs', label: 'จำนวนงาน (Jobs)', type: 'number', quick: [10, 13, 16, 19, 22] },
  { key: 'fare', label: 'ค่าโดยสารรวม (Fare)', type: 'number', cat: 'rev' },
  { key: 'distance', label: 'ระยะทางรวม (กม.)', type: 'number', cat: 'dist' },
  { key: 'hours', label: 'ชั่วโมงทำงาน', type: 'number', cat: 'time' },
  { key: 'minutes', label: 'นาที', type: 'number', cat: 'time' },
  { key: 'kwh', label: 'หน่วยไฟที่ชาร์จ (kWh)', type: 'number', cat: 'dist' },
  { key: 'appFee', label: 'App Fee', type: 'number', cat: 'exp' },
  { key: 'energy', label: 'ค่าไฟ/ชาร์จรถ (Energy)', type: 'number', cat: 'exp' },
  { key: 'otherIncome', label: 'รายได้อื่นๆ (บาท)', type: 'number', cat: 'rev' },
  { key: 'incomeNote', label: 'ประเภทรายได้อื่นๆ', type: 'select', dd: 'INCOME_NOTE', cat: 'rev' },
  { key: 'otherExp', label: 'ค่าใช้จ่ายอื่นๆ (บาท)', type: 'number', cat: 'exp' },
  { key: 'expNote', label: 'ประเภทค่าใช้จ่ายอื่นๆ', type: 'select', dd: 'EXP_NOTE', cat: 'exp' }
];

var READONLY_FIELDS = [
  { key: 'incD', label: 'อินเซนทีฟรายวัน (Inc.D)' },
  { key: 'incW', label: 'อินเซนทีฟรายสัปดาห์ (Inc.W)' },
  { key: 'cashback', label: 'เงินคืนค่ารถ (Cashback 890)' },
  { key: 'incM', label: 'อินเซนทีฟรายเดือน (Inc.M)' },
  { key: 'revenue', label: 'รายได้รวม (Revenue)' },
  { key: 'carRent', label: 'ค่าเช่ารถ (Car Rent)' },
  { key: 'totalExp', label: 'รายจ่ายรวม (Total Exp)' },
  { key: 'wht', label: 'ภาษีหัก ณ ที่จ่าย 3% (WHT)' },
  { key: 'netProfit', label: 'กำไรสุทธิ (Net Profit)' },
  { key: 'kpiStatus', label: 'สถานะ KPI' }
];

/* ============================= INIT ============================= */

window.addEventListener('DOMContentLoaded', function () {
  document.documentElement.setAttribute('data-theme', APP.theme);
  document.getElementById('themeToggleBtn').innerText = APP.theme === 'dark' ? '☀️' : '🌙';
  document.getElementById('langToggleBtn').innerText = APP.lang === 'th' ? 'TH' : 'EN';

  google.script.run.withSuccessHandler(function (dd) {
    APP.dropdowns = dd;
  }).getDropdowns();

  google.script.run.withSuccessHandler(function (st) {
    APP.hasPin = st.hasPin;
  }).getPinStatus();

  loadHome();
});

/* ============================= PIN LOCK ============================= */

function requirePin(callback) {
  // Always check fresh from the server — avoids a race where APP.hasPin
  // hasn't loaded yet on a fresh page load.
  google.script.run.withSuccessHandler(function (st) {
    APP.hasPin = st.hasPin;
    if (!APP.hasPin || APP.pinUnlocked) { callback(); return; }
    APP.pendingPinCallback = callback;
    document.getElementById('pinError').innerText = '';
    document.getElementById('pinModal').classList.add('show');
    focusPinPad();
  }).withFailureHandler(function () { callback(); }).getPinStatus();
}
function closePinModal() {
  document.getElementById('pinModal').classList.remove('show');
  APP.pendingPinCallback = null;
}
function focusPinPad() {
  APP.pinBuffer = '';
  buildPinPad();
  renderPinDots();
}
function buildPinPad() {
  var pad = document.getElementById('pinPad');
  if (!pad) return;
  var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  pad.innerHTML = keys.map(function (k) {
    if (k === '') return '<div class="pin-key empty"></div>';
    if (k === '⌫') return '<button class="pin-key" onclick="pinBackspace()">⌫</button>';
    return '<button class="pin-key" onclick="pinPress(\'' + k + '\')">' + k + '</button>';
  }).join('');
}
function pinPress(d) {
  APP.pinBuffer = (APP.pinBuffer || '') + d;
  if (APP.pinBuffer.length > 6) APP.pinBuffer = APP.pinBuffer.slice(0, 6);
  renderPinDots();
}
function pinBackspace() {
  APP.pinBuffer = (APP.pinBuffer || '').slice(0, -1);
  renderPinDots();
}
function renderPinDots() {
  var wrap = document.getElementById('pinDots');
  if (!wrap) return;
  var len = (APP.pinBuffer || '').length;
  var html = '';
  for (var i = 0; i < 6; i++) html += '<div class="pd' + (i < len ? ' filled' : '') + '"></div>';
  wrap.innerHTML = html;
}
function submitPin() {
  var pin = APP.pinBuffer || '';
  google.script.run.withSuccessHandler(function (res) {
    if (res.ok) {
      APP.pinUnlocked = true;
      sessionStorage.setItem('los_pin_unlocked', '1');
      document.getElementById('pinModal').classList.remove('show');
      var cb = APP.pendingPinCallback;
      APP.pendingPinCallback = null;
      if (cb) cb();
    } else {
      document.getElementById('pinError').innerText = 'PIN ไม่ถูกต้อง ลองใหม่อีกครั้ง';
      APP.pinBuffer = '';
      renderPinDots();
    }
  }).withFailureHandler(function (err) {
    document.getElementById('pinError').innerText = err.message || 'เกิดข้อผิดพลาด';
  }).verifyPin(pin);
}

/* ============================= SETTINGS ============================= */

function openSettings() {
  var body = document.getElementById('settingsBody');
  body.innerHTML = '<div class="spinner"></div>';
  document.getElementById('settingsModal').classList.add('show');
  google.script.run.withSuccessHandler(function (st) {
    var html = '<div style="font-weight:900; font-size:13px; margin-bottom:8px;">🔒 PIN ล็อกการแก้ไข</div>';
    if (st.hasPin) {
      html += '<div class="field-wrap"><label class="field">PIN ปัจจุบัน (สำหรับเปลี่ยน/ปิด)</label><input class="form-input" type="password" inputmode="numeric" id="set_oldpin"></div>';
      html += '<div class="field-wrap"><label class="field">PIN ใหม่ (เว้นว่างถ้าต้องการปิดการล็อก)</label><input class="form-input" type="password" inputmode="numeric" id="set_newpin"></div>';
      html += '<button class="btn btn-primary" onclick="saveSettingsPin(true)">บันทึก PIN ใหม่</button>';
      html += '<div style="height:8px;"></div>';
      html += '<button class="btn btn-danger" onclick="removeSettingsPin()">ปิดระบบ PIN</button>';
    } else {
      html += '<div class="field-wrap"><label class="field">ตั้ง PIN ใหม่ (4-6 หลัก) เพื่อล็อกการแก้ไข/บันทึก</label><input class="form-input" type="password" inputmode="numeric" id="set_newpin"></div>';
      html += '<button class="btn btn-primary" onclick="saveSettingsPin(false)">ตั้ง PIN</button>';
    }
    html += '<div id="settingsMsg" style="font-size:12px; color:var(--danger); margin-top:8px; text-align:center;"></div>';
    html += '<div style="height:18px; border-top:1px solid var(--border); margin-top:10px;"></div>';
    html += '<div id="goalsSettingsBody" style="margin-top:14px;"><div class="spinner"></div></div>';
    body.innerHTML = html;

    google.script.run.withSuccessHandler(function (goals) {
      renderGoalsSettings(goals);
    }).getGoals();
  }).getPinStatus();
}
function renderGoalsSettings(goals) {
  var wrap = document.getElementById('goalsSettingsBody');
  if (!wrap) return;
  var defs = [
    { key: 'revenue', label: 'Revenue (฿)' },
    { key: 'jobs', label: 'Jobs / KPI (งาน)' },
    { key: 'netProfit', label: 'Net Profit (฿)' }
  ];
  var html = '<div style="font-weight:900; font-size:13px; margin-bottom:8px;">🎯 เป้าหมายรายเดือน</div>';
  defs.forEach(function (d) {
    var g = goals[d.key] || { enabled: false, target: 0 };
    html += '<div class="field-wrap"><label class="field" style="display:flex; justify-content:space-between; align-items:center;">' + d.label +
      '<input type="checkbox" id="goal_en_' + d.key + '"' + (g.enabled ? ' checked' : '') + ' style="width:18px; height:18px;"></label>' +
      '<input class="form-input" type="number" id="goal_val_' + d.key + '" value="' + (g.target || 0) + '"></div>';
  });
  html += '<button class="btn btn-primary" onclick="saveGoalsSettings()">บันทึกเป้าหมาย</button>';
  wrap.innerHTML = html;
}
function saveGoalsSettings() {
  var goals = {};
  ['revenue', 'jobs', 'netProfit'].forEach(function (k) {
    goals[k] = {
      enabled: document.getElementById('goal_en_' + k).checked,
      target: Number(document.getElementById('goal_val_' + k).value) || 0
    };
  });
  google.script.run.withSuccessHandler(function () {
    showToast('✅ บันทึกเป้าหมายแล้ว');
    closeSettings();
    loadHome();
  }).withFailureHandler(showErr).setGoals(goals);
}
function closeSettings() {
  document.getElementById('settingsModal').classList.remove('show');
}
function saveSettingsPin(hadOld) {
  var oldPin = hadOld ? document.getElementById('set_oldpin').value : '';
  var newPin = document.getElementById('set_newpin').value;
  google.script.run.withSuccessHandler(function () {
    APP.hasPin = true;
    APP.pinUnlocked = true;
    sessionStorage.setItem('los_pin_unlocked', '1');
    showToast('✅ บันทึก PIN แล้ว');
    closeSettings();
  }).withFailureHandler(function (err) {
    document.getElementById('settingsMsg').innerText = err.message || 'เกิดข้อผิดพลาด';
  }).setPin(oldPin, newPin);
}
function removeSettingsPin() {
  var oldPin = document.getElementById('set_oldpin').value;
  google.script.run.withSuccessHandler(function () {
    APP.hasPin = false;
    showToast('✅ ปิดระบบ PIN แล้ว');
    closeSettings();
  }).withFailureHandler(function (err) {
    document.getElementById('settingsMsg').innerText = err.message || 'เกิดข้อผิดพลาด';
  }).clearPin(oldPin);
}

function toggleAppTheme() {
  APP.theme = APP.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('los_theme', APP.theme);
  document.documentElement.setAttribute('data-theme', APP.theme);
  document.getElementById('themeToggleBtn').innerText = APP.theme === 'dark' ? '☀️' : '🌙';
}
function toggleAppLang() {
  APP.lang = APP.lang === 'th' ? 'en' : 'th';
  localStorage.setItem('los_lang', APP.lang);
  document.getElementById('langToggleBtn').innerText = APP.lang === 'th' ? 'TH' : 'EN';
  showToast(APP.lang === 'th' ? 'เปลี่ยนเป็นภาษาไทย' : 'Switched to English (labels stay Thai for Sheet-matched fields)');
}

/* ============================= NAV ============================= */

function switchPage(name) {
  document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-page') === name);
  });
  APP.currentPage = name;
  if (name === 'home') loadHome();
  if (name === 'finance') loadFinance();
  if (name === 'analysis') loadAnalysis();
  if (name === 'copilot' && window.initCopilot) window.initCopilot();
  if (name === 'history') loadHistory();
}

// Re-runs whichever loadX() belongs to the page currently on screen, after
// clearing the client-side read cache so it actually re-fetches instead of
// re-serving the cached result. Used by both the header refresh button and
// the pull-to-refresh gesture below.
function forceRefreshCurrentPage() {
  if (window.__friderCache) window.__friderCache.clear();
  var page = APP.currentPage || 'home';
  var btn = document.getElementById('refreshBtn');
  if (btn) btn.classList.add('spinning');
  showToast('กำลังรีเฟรช...');
  switchPage(page);
  setTimeout(function () { if (btn) btn.classList.remove('spinning'); }, 1200);
}

/* ============================= PULL TO REFRESH ============================= */
(function () {
  var startY = 0, pulling = false, armed = false;
  var THRESHOLD = 80;       // px of downward drag before it even starts arming
  var HOLD_MS = 1500;       // must stay pulled past THRESHOLD this long before release triggers a refresh
  var armedAt = null;

  function scrollY() {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  document.addEventListener('touchstart', function (e) {
    // Only arm the gesture if the WHOLE PAGE is scrolled all the way to the
    // top — checking a specific .page div's scrollTop was wrong (that div
    // never scrolls itself; the page/window does), which let mid-page swipes
    // accidentally trigger a refresh. This checks real page scroll position.
    if (scrollY() > 4) { pulling = false; return; }
    startY = e.touches[0].clientY;
    pulling = true;
    armed = false;
    armedAt = null;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!pulling) return;
    var dy = e.touches[0].clientY - startY;
    var indicator = document.getElementById('pullRefreshIndicator');
    if (dy < THRESHOLD) {
      // not pulled far enough yet — reset the hold timer and hide the indicator
      armed = false; armedAt = null;
      if (indicator) indicator.classList.remove('show', 'ready');
      return;
    }
    // pulled past the distance threshold — start (or continue) the hold timer
    if (!armedAt) armedAt = Date.now();
    var held = Date.now() - armedAt;
    if (indicator) {
      indicator.classList.add('show');
      if (held >= HOLD_MS) {
        armed = true;
        indicator.classList.add('ready');
        indicator.innerText = '↓ ปล่อยเพื่อรีเฟรช';
      } else {
        indicator.classList.remove('ready');
        indicator.innerText = '↓ รูดค้างไว้...';
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', function () {
    var indicator = document.getElementById('pullRefreshIndicator');
    if (indicator) { indicator.classList.remove('show', 'ready'); indicator.innerText = '↓ ปล่อยเพื่อรีเฟรช'; }
    if (pulling && armed) forceRefreshCurrentPage();
    pulling = false; armed = false; armedAt = null;
  }, { passive: true });
})();

function goToAnalysisDate(dateStr) {
  APP.analysisDate = parseDateKey(dateStr);
  switchPage('analysis');
}

/* ============================= UTIL ============================= */

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function toDateKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function parseDateKey(s) { var p = s.split('-'); return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)); }
function thaiDateLabel(d) {
  var days = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  var months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return 'วัน' + days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + (d.getFullYear() + 543);
}
function fmtNum(v) {
  if (v === '' || v === undefined || v === null || v === '-') return '—';
  if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v;
}
function showToast(msg) {
  var t = document.getElementById('appToast');
  t.innerText = msg; t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, 2000);
}
function ddOptionsHtml(list, selected) {
  var html = '<option value="">— เลือก —</option>';
  (list || []).forEach(function (opt) {
    html += '<option value="' + opt + '"' + (opt === selected ? ' selected' : '') + '>' + opt + '</option>';
  });
  return html;
}

/* ===================== SHARED FIELD FORM RENDER ===================== */

function renderFieldForm(entry, idPrefix) {
  var html = '';
  FIELDS.forEach(function (f) {
    var val = entry ? entry[f.key] : '';
    if (val === undefined || val === '-') val = '';
    var isEmpty = (val === '' || val === null || val === undefined);
    var catCls = f.cat ? ' field-' + f.cat : '';
    html += '<div class="field-wrap' + catCls + '">';
    html += '<label class="field">' + f.label + (isEmpty ? ' <span class="req-star">*</span>' : '') + '</label>';
    if (f.quick) {
      html += '<div class="quick-choice">';
      f.quick.forEach(function (q) {
        html += '<button type="button" class="qc-btn' + (Number(val) === q ? ' active' : '') + '" onclick="setQuickChoice(\'' + idPrefix + '\',\'' + f.key + '\',' + q + ')">' + q + '</button>';
      });
      html += '</div>';
      html += '<input class="form-input" type="number" inputmode="numeric" id="' + idPrefix + '_' + f.key + '" value="' + val + '" placeholder="หรือกรอกเอง">';
    } else if (f.type === 'select') {
      html += '<select class="form-input" id="' + idPrefix + '_' + f.key + '">' + ddOptionsHtml(APP.dropdowns[f.dd], val) + '</select>';
    } else {
      html += '<input class="form-input" type="number" inputmode="decimal" step="any" id="' + idPrefix + '_' + f.key + '" value="' + val + '" placeholder="0">';
    }
    html += '</div>';
  });
  return html;
}

function setQuickChoice(idPrefix, key, val) {
  document.getElementById(idPrefix + '_' + key).value = val;
  var wrap = document.getElementById(idPrefix + '_' + key).previousElementSibling;
  wrap.querySelectorAll('.qc-btn').forEach(function (b) { b.classList.toggle('active', b.innerText == val); });
}

function collectFieldForm(idPrefix) {
  var payload = {};
  FIELDS.forEach(function (f) {
    var el = document.getElementById(idPrefix + '_' + f.key);
    payload[f.key] = el ? el.value : '';
  });
  return payload;
}
function countEmptyFields(idPrefix) {
  var n = 0;
  FIELDS.forEach(function (f) {
    var el = document.getElementById(idPrefix + '_' + f.key);
    if (el && (el.value === '' || el.value === null)) n++;
  });
  return n;
}

// Accounting-style formatting: negatives shown in parentheses + red, per common bookkeeping convention.
function fmtAcct(v) {
  var num = Number(v);
  if (!isFinite(num) || v === '' || v === undefined || v === null || v === '-') return '<span>—</span>';
  if (num < 0) return '<span class="acct-neg">(' + Math.abs(num).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ')</span>';
  return '<span>' + num.toLocaleString(undefined, { maximumFractionDigits: 2 }) + '</span>';
}

function renderReadonlyResults(entry) {
  if (!entry) return '';
  var html = '<div class="card"><div class="card-title">ผลลัพธ์จากชีต (คำนวณอัตโนมัติ)</div>';
  READONLY_FIELDS.forEach(function (f) {
    var v = entry[f.key];
    if (f.key === 'kpiStatus') {
      html += '<div class="row"><span class="lbl">' + f.label + '</span><span class="val">' + fmtNum(v) + '</span></div>';
      return;
    }
    html += '<div class="row"><span class="lbl">' + f.label + '</span><span class="val">' + fmtAcct(v) + '</span></div>';
  });
  html += '</div>';

  // Simple P&L summary — Revenue minus Expense = Net Profit, laid out top to bottom
  html += '<div class="card"><div class="card-title">สรุปกำไรขาดทุน (P&amp;L)</div>';
  html += '<div class="pnl-row"><span>รายได้รวม (Revenue)</span>' + fmtAcct(entry.revenue) + '</div>';
  html += '<div class="pnl-row"><span>หัก: รายจ่ายรวม (Expense)</span>' + fmtAcct(-Math.abs(Number(entry.totalExp) || 0)) + '</div>';
  html += '<div class="pnl-row total"><span>กำไร/ขาดทุนสุทธิ (Net Profit)</span>' + fmtAcct(entry.netProfit) + '</div>';
  html += '</div>';
  return html;
}

/* ============================= HOME ============================= */

function skeletonCards(n) {
  var html = '';
  for (var i = 0; i < n; i++) {
    html += '<div class="card skel-card"><div class="skel skel-line w40"></div><div class="skel skel-line w80"></div><div class="skel skel-line w60"></div></div>';
  }
  return html;
}
function loadHome() {
  document.getElementById('homeContent').innerHTML = skeletonCards(4);
  google.script.run.withSuccessHandler(renderHome).withFailureHandler(errBox('homeContent', 'loadHome')).getHomeSummary();
}

function goToFinanceDate(dateStr) {
  APP.financeDate = parseDateKey(dateStr);
  switchPage('finance');
}

function renderMissingBanner(data) {
  var todayFormatted = data.todayFormatted || todayThaiLabel();
  var missing = data.missingDays || [];
  var html = '';
  if (!missing.length) {
    html += '<div class="cyber-alert-card" style="border-color:#10b981; box-shadow: 0 0 14px rgba(16, 185, 129, 0.2);">';
    html += '  <div class="cac-header" style="border-bottom:none; margin-bottom:0; padding-bottom:0;">';
    html += '    <div class="cac-today"><span>📅 ' + todayFormatted + '</span></div>';
    html += '    <span class="cac-badge all-good">✅ บันทึกครบทุกวัน</span>';
    html += '  </div>';
    html += '</div>';
    return html;
  }
  html += '<div class="cyber-alert-card">';
  html += '  <div class="cac-header">';
  html += '    <div class="cac-today"><span>📅 ' + todayFormatted + '</span></div>';
  html += '    <span class="cac-badge">ค้าง ' + missing.length + ' วัน</span>';
  html += '  </div>';
  html += '  <div class="cac-body">';
  html += '    <div>';
  html += '      <div class="cac-desc">ยังไม่ได้บันทึกข้อมูลย้อนหลัง:</div>';
  html += '      <div class="cac-pills">';
  missing.forEach(function(m) {
    html += '<span class="cac-pill-item" onclick="goToFinanceDate(\'' + m.dateStr + '\')">' + m.label + ' ✎</span>';
  });
  html += '      </div>';
  html += '    </div>';
  html += '    <button class="cac-action-btn" onclick="goToFinanceDate(\'' + missing[0].dateStr + '\')">กรอกข้อมูล ✎</button>';
  html += '  </div>';
  html += '</div>';
  return html;
}

function renderHome(data) {
  APP.homeData = data;
  var html = '';
  html += renderMissingBanner(data);
  html += renderGoalsSection(data);
  html += renderMonthlyOverview(data);
  html += renderTrendSection(data);
  html += renderSimpleCalendar(data);
  html += renderPerformanceSection(data);
  html += renderEfficiencySection(data);
  html += renderWeekCompareSection(data);
  html += renderRecordsSection(data);
  html += renderStreakSection(data);
  html += renderInsightSection(data);
  html += renderTodaySection(data);
  document.getElementById('homeContent').innerHTML = html;
}

/* ---------- 1. Monthly Goals (Cyber Neon HUD - Concept A) ---------- */
function renderGoalsSection(data) {
  var g = (data && data.goals) || {};
  var mt = (data && data.monthTotals) || {};
  var wc = (data && data.weekCompare) || {};
  var wThis = wc.thisWeek || null, wLast = wc.lastWeek || null;

  var defs = [
    { key: 'revenue', label: '🎯 REVENUE GOAL', unit: ' ฿', have: mt.revenue, theme: 'cyan-theme', fillCls: 'nh-cyan', color: '#38bdf8', curKey: 'revenue' },
    { key: 'jobs', label: '🚕 JOBS / KPI GOAL', unit: ' งาน', have: mt.jobs, theme: 'green-theme', fillCls: 'nh-green', color: '#34d399', curKey: 'jobs' },
    { key: 'netProfit', label: '📈 NET PROFIT GOAL', unit: ' ฿', have: mt.netProfit, theme: 'rose-theme', fillCls: 'nh-rose', color: '#fb7185', curKey: 'netProfit' }
  ];

  var active = defs.filter(function (d) { return g[d.key] && g[d.key].enabled; });
  if (!active.length) {
    return '<div class="card"><div class="card-title">เป้าหมายเดือนนี้</div><div class="empty-hint">ยังไม่ได้ตั้งเป้าหมาย — กด ⚙ ด้านบนเพื่อตั้งค่า</div></div>';
  }

  var today = new Date();
  var daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  var daysLeft = Math.max(1, daysInMonth - today.getDate());

  var wavePaths = [
    'M0 14 Q 25 4, 55 12 T 110 4',
    'M0 16 Q 35 6, 70 14 T 110 3',
    'M0 12 Q 30 18, 65 6 T 110 10'
  ];

  var html = '<div class="goal-hud-wrap" style="margin-bottom: 16px;">';
  active.forEach(function (d, i) {
    var target = Number(g[d.key].target) || 1;
    var have = Number(d.have) || 0;
    var pct = Math.min(100, Math.round((have / target) * 100));
    var remaining = Math.max(0, target - have);
    var perDay = remaining / daysLeft;
    var waveD = wavePaths[i % wavePaths.length];

    var deltaText = '';
    if (wThis && wLast && wThis[d.curKey] !== undefined && wLast[d.curKey] !== undefined) {
      var curVal = Number(wThis[d.curKey]) || 0;
      var prevVal = Number(wLast[d.curKey]) || 0;
      if (prevVal > 0) {
        var diff = curVal - prevVal;
        var diffPct = (diff / Math.abs(prevVal)) * 100;
        var up = diff >= 0;
        deltaText = (up ? '▲ ' : '▼ ') + (diffPct > 999 ? '> 999%' : Math.abs(diffPct).toFixed(1) + '%') + ' สัปดาห์นี้';
      }
    }
    if (!deltaText) {
      deltaText = remaining > 0 ? 'ขาดอีก ' + fmtNum(remaining) + d.unit : 'ถึงเป้าหมายแล้ว 🎉';
    }

    html += '<div class="neon-hud-card ' + d.theme + '">';
    html += '  <div class="nh-top">';
    html += '    <span class="nh-label">' + d.label + '</span>';
    html += '    <span class="nh-pct-badge" style="background: rgba(255,255,255,0.06); color:' + d.color + '; border: 1px solid ' + d.color + ';">' + pct + '%</span>';
    html += '  </div>';
    html += '  <div class="nh-val-row">';
    html += '    <span>' + fmtNum(have) + d.unit + ' <small>/ ' + fmtNum(target) + d.unit + '</small></span>';
    html += '    <span style="font-size:11px; color:' + d.color + ';">' + (remaining > 0 ? 'เฉลี่ย ' + perDay.toFixed(1) + d.unit + '/วัน' : '🎉 สำเร็จ') + '</span>';
    html += '  </div>';
    html += '  <div class="nh-track">';
    html += '    <div class="nh-fill ' + d.fillCls + '" style="width:' + pct + '%;"></div>';
    html += '  </div>';
    html += '  <div class="nh-footer">';
    html += '    <span style="color:' + (pct >= 100 ? '#34d399' : d.color) + '; font-weight:800;">' + deltaText + '</span>';
    html += '    <svg class="nh-wave-svg" style="color:' + d.color + ';" viewBox="0 0 110 20">';
    html += '      <path d="' + waveD + '" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />';
    html += '    </svg>';
    html += '  </div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

/* ---------- 2. Monthly Overview (Cyber Glow 2-Column Grid) ---------- */
function renderMonthlyOverview(data) {
  var mt = data.monthTotals || {};
  var wc = data.weekCompare;
  var wThis = wc ? wc.thisWeek : null, wLast = wc ? wc.lastWeek : null;

  var cards = [
    {
      cls: 'glow-green',
      icon: '💰',
      label: 'Revenue',
      val: fmtNum(mt.revenue) + ' ฿',
      sub: wLast ? tileDeltaHtml(wThis.revenue, wLast.revenue) : 'ยอดรายได้รวม',
      fill: '85%'
    },
    {
      cls: 'glow-rose',
      icon: '📈',
      label: 'Net Profit',
      val: fmtNum(mt.netProfit) + ' ฿',
      sub: wLast ? tileDeltaHtml(wThis.netProfit, wLast.netProfit) : 'กำไรสุทธิเดือนนี้',
      fill: '60%'
    },
    {
      cls: 'glow-blue',
      icon: '🚕',
      label: 'Jobs',
      val: fmtNum(mt.jobs),
      sub: wLast ? tileDeltaHtml(wThis.jobs, wLast.jobs) : 'จำนวนงานทั้งหมด',
      fill: '75%'
    },
    {
      cls: 'glow-cyan',
      icon: '⏰',
      label: 'Work Time',
      val: (mt.hoursDecimal || 0).toFixed(0) + ' ชม.',
      sub: 'เวลาขับรวม',
      fill: '70%'
    },
    {
      cls: 'glow-amber',
      icon: '🛣️',
      label: 'Distance',
      val: fmtNum(mt.distance) + ' กม.',
      sub: wLast ? tileDeltaHtml(wThis.distance, wLast.distance) : 'ระยะทางทั้งหมด',
      fill: '55%'
    },
    {
      cls: 'glow-purple',
      icon: '📅',
      label: 'Work Days',
      val: fmtNum(mt.workingDays) + ' วัน',
      sub: 'วันทำงานเดือนนี้',
      fill: '90%'
    }
  ];

  var html = '<div class="card"><div class="card-title">ภาพรวมเดือนนี้</div><div class="glow-grid-2">';
  cards.forEach(function (c) {
    html += '<div class="glow-card ' + c.cls + '">';
    html += '<div class="card-top"><span>' + c.icon + '</span><span>' + c.label + '</span></div>';
    html += '<div class="card-mid">' + c.val + '</div>';
    html += '<div class="card-subtext">' + c.sub + '</div>';
    html += '<div class="card-bar-bg"><div class="card-bar-fill" style="width:' + c.fill + ';"></div></div>';
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}

/* ---------- 3. Trend ---------- */
function renderTrendSection(data) {
  var days = (data.last30 || []).filter(function (d) { return d.hasData; });
  if (days.length < 2) return '';
  APP.trendMetric = APP.trendMetric || 'netProfit';
  APP.trendRange = APP.trendRange || 30;
  var html = '<div class="card"><div class="card-title">แนวโน้ม (Trend)</div>';
  html += '<div class="filter-pills">';
  [['netProfit', 'Net Profit'], ['revenue', 'Revenue'], ['jobs', 'Jobs']].forEach(function (m) {
    html += '<button class="filter-pill' + (APP.trendMetric === m[0] ? ' active' : '') + '" onclick="setTrendMetric(\'' + m[0] + '\')">' + m[1] + '</button>';
  });
  html += '</div>';
  html += '<div class="filter-pills">';
  [[7, '7 วัน'], [30, '30 วัน']].forEach(function (r) {
    html += '<button class="filter-pill' + (APP.trendRange === r[0] ? ' active' : '') + '" onclick="setTrendRange(' + r[0] + ')">' + r[1] + '</button>';
  });
  html += '</div>';
  html += '<div id="trendChartWrap" class="sparkline-wrap" style="margin-top:10px;">' + buildMetricSparkline(days, APP.trendMetric, APP.trendRange) + '</div>';
  html += '</div>';
  return html;
}
function setTrendMetric(m) { APP.trendMetric = m; renderHome(APP.homeData); }
function setTrendRange(r) { APP.trendRange = r; renderHome(APP.homeData); }
function buildMetricSparkline(days, metric, range) {
  var slice = days.slice(Math.max(0, days.length - range));
  var vals = slice.map(function (d) { return Number(d[metric]) || 0; });
  var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  if (min === max) { min -= 1; max += 1; }
  var w = 280, h = 60, pad = 4;
  var stepX = vals.length > 1 ? (w - pad * 2) / (vals.length - 1) : 0;
  var pts = vals.map(function (v, i) {
    var x = pad + i * stepX;
    var y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  var color = metric === 'netProfit' && vals[vals.length - 1] < 0 ? '#f43f5e' : '#00B900';
  var areaPts = pad + ',' + (h - pad) + ' ' + pts.join(' ') + ' ' + (w - pad) + ',' + (h - pad);
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
    '<polygon points="' + areaPts + '" fill="' + color + '" opacity="0.12"></polygon>' +
    '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>' +
    '</svg>';
}

/* ---------- 4. Monthly Calendar (simple traffic-light) ---------- */
function renderSimpleCalendar(data) {
  var days = data.monthDays || [];
  if (!days.length) return '';
  var today = new Date();
  var firstDow = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  var leadEmpty = (firstDow === 0) ? 6 : (firstDow - 1);
  var dowLabels = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

  var html = '<div class="card"><div class="card-title">ปฏิทินเดือนนี้</div>';
  html += '<div class="cal-grid">';
  dowLabels.forEach(function (d) { html += '<div class="cal-dow">' + d + '</div>'; });
  for (var i = 0; i < leadEmpty; i++) html += '<div class="cal-cell empty"></div>';
  days.forEach(function (day) {
    var cls, mark;
    if (!day.hasData) { cls = 'cal-cell'; mark = '—'; }
    else if (day.mode === 'หยุด') { cls = 'cal-cell off'; mark = ''; }
    else if ((day.kpiStatus || '').indexOf('🥇') !== -1) { cls = 'cal-cell gold'; mark = ''; }
    else if (Number(day.netProfit) < 0) { cls = 'cal-cell fail'; mark = ''; }
    else { cls = 'cal-cell partial'; mark = ''; }
    var tapAttr = day.hasData ? ' onclick="goToAnalysisDate(\'' + day.dateStr + '\')" style="cursor:pointer;"' : '';
    html += '<div class="' + cls + '"' + tapAttr + '><span class="dnum">' + day.day + '</span>' + (mark ? '<span class="dmark">' + mark + '</span>' : '') + '</div>';
  });
  html += '</div>';
  html += '<div class="cal-legend">';
  html += '<span><i class="dot" style="background:#facc15;"></i>ถึงเป้า</span>';
  html += '<span><i class="dot" style="background:var(--warn);"></i>ต่ำกว่าเป้า</span>';
  html += '<span><i class="dot" style="background:var(--danger);"></i>ขาดทุน</span>';
  html += '<span><i class="dot" style="background:var(--text-sub);"></i>หยุด</span>';
  html += '</div></div>';
  return html;
}

/* ---------- 5. Performance ---------- */
function renderPerformanceSection(data) {
  var mt = data.monthTotals || {};
  if (!mt.workingDays) return '';
  var html = '<div class="card"><div class="card-title">Performance เฉลี่ย</div>';
  html += metricRow('Revenue / Day', mt.revenue / mt.workingDays, ' ฿');
  html += metricRow('Jobs / Day', mt.avgJobsPerDay, ' งาน');
  html += metricRow('Net Profit / Day', mt.avgProfitPerDay, ' ฿');
  html += metricRow('Revenue / Job', mt.jobs ? mt.revenue / mt.jobs : 0, ' ฿');
  html += metricRow('Jobs / Hour', mt.avgJobsPerHour, '');
  html += metricRow('Revenue / Hour', mt.avgRevenuePerHour, ' ฿');
  html += '</div>';
  return html;
}

/* ---------- 6. Efficiency ---------- */
function renderEfficiencySection(data) {
  var mt = data.monthTotals || {};
  if (!mt.workingDays) return '';
  var html = '<div class="card"><div class="card-title">Efficiency</div>';
  html += metricRow('฿ / km', mt.profitPerKm, ' ฿');
  html += metricRow('฿ / Job', mt.profitPerJob, ' ฿');
  html += metricRow('฿ / Hour', mt.profitPerHour, ' ฿');
  html += metricRow('km / Hour', mt.avgDistancePerHour, ' กม.');
  html += metricRow('Distance / Job', mt.avgDistancePerJob, ' กม.');
  html += '</div>';
  return html;
}

/* ---------- 7. Week vs Previous Week ---------- */
function renderWeekCompareSection(data) {
  var wc = data.weekCompare;
  if (!wc || !wc.lastWeek) return '';
  var rows = [
    ['Revenue', wc.thisWeek.revenue, wc.lastWeek.revenue, ' ฿'],
    ['Jobs', wc.thisWeek.jobs, wc.lastWeek.jobs, ''],
    ['Net Profit', wc.thisWeek.netProfit, wc.lastWeek.netProfit, ' ฿'],
    ['Distance', wc.thisWeek.distance, wc.lastWeek.distance, ' กม.']
  ];
  var html = '<div class="card"><div class="card-title">สัปดาห์นี้ vs สัปดาห์ก่อน</div>';
  rows.forEach(function (r) {
    var diff = r[1] - r[2];
    var pct = r[2] !== 0 ? (diff / Math.abs(r[2]) * 100) : null;
    var up = diff >= 0;
    html += '<div class="row"><span class="lbl">' + r[0] + '</span><span class="val">' + fmtNum(r[1]) + r[3] +
      ' <span style="font-size:11px; color:' + (up ? 'var(--brand)' : 'var(--danger)') + ';">' + (up ? '↑' : '↓') + (pct === null ? '' : ' ' + Math.abs(pct).toFixed(1) + '%') + '</span></span></div>';
  });
  html += '</div>';
  return html;
}

/* ---------- 8. Personal Records (this month) ---------- */
function renderRecordsSection(data) {
  var days = (data.monthDays || []).filter(function (d) { return d.hasData; });
  if (!days.length) return '';
  var byRevenue = days.slice().sort(function (a, b) { return b.revenue - a.revenue; })[0];
  var byProfit = days.slice().sort(function (a, b) { return b.netProfit - a.netProfit; })[0];
  var byJobs = days.slice().sort(function (a, b) { return b.jobs - a.jobs; })[0];
  var byDistance = days.slice().sort(function (a, b) { return b.distance - a.distance; })[0];

  var html = '<div class="card"><div class="card-title">🏆 สถิติเดือนนี้</div>';
  html += recordRow('Revenue สูงสุด', byRevenue, fmtNum(byRevenue.revenue) + ' ฿');
  html += recordRow('Net Profit สูงสุด', byProfit, fmtNum(byProfit.netProfit) + ' ฿');
  html += recordRow('Jobs สูงสุด', byJobs, fmtNum(byJobs.jobs) + ' งาน');
  html += recordRow('ระยะทางสูงสุด', byDistance, fmtNum(byDistance.distance) + ' กม.');
  html += '</div>';
  return html;
}
function recordRow(label, day, valueStr) {
  return '<div class="row" onclick="goToAnalysisDate(\'' + day.dateStr + '\')" style="cursor:pointer;"><span class="lbl">' + label + '</span><span class="val">' + valueStr + ' <span style="font-size:11px; color:var(--text-sub);">(วันที่ ' + day.day + ')</span></span></div>';
}

/* ---------- 9. Streak ---------- */
function renderStreakSection(data) {
  var streak = data.streak || 0;
  if (streak < 1) return '';
  return '<div class="card" style="text-align:center;"><div style="font-size:28px; font-weight:900; color:var(--brand);">🔥 ' + streak + ' วัน</div><div style="font-size:12px; color:var(--text-sub);">ถึงเป้า 🥇 ติดต่อกัน</div></div>';
}

/* ---------- 10. Frider Insight (rule-based, free) ---------- */
function renderInsightSection(data) {
  var days = (data.last30 || []).filter(function (d) { return d.hasData; });
  if (days.length < 8) return '';
  var last7 = days.slice(-7);
  var prior = days.slice(0, -7);
  if (!prior.length) return '';

  function avg(arr, key) { return arr.reduce(function (s, d) { return s + (Number(d[key]) || 0); }, 0) / arr.length; }
  var insights = [];

  var last7ProfitPerJob = avg(last7, 'jobs') ? avg(last7, 'netProfit') / avg(last7, 'jobs') : 0;
  var priorProfitPerJob = avg(prior, 'jobs') ? avg(prior, 'netProfit') / avg(prior, 'jobs') : 0;
  if (priorProfitPerJob > 0) {
    var pctChange = ((last7ProfitPerJob - priorProfitPerJob) / priorProfitPerJob) * 100;
    if (Math.abs(pctChange) >= 5) {
      insights.push({
        type: pctChange >= 0 ? 'good' : 'warn',
        text: 'กำไร/งาน ช่วง 7 วันล่าสุด' + (pctChange >= 0 ? 'เพิ่มขึ้น ' : 'ลดลง ') + Math.abs(pctChange).toFixed(1) + '% เทียบค่าเฉลี่ยก่อนหน้า'
      });
    }
  }

  var last7DistPerJob = avg(last7, 'jobs') ? avg(last7, 'distance') / avg(last7, 'jobs') : 0;
  var priorDistPerJob = avg(prior, 'jobs') ? avg(prior, 'distance') / avg(prior, 'jobs') : 0;
  if (priorDistPerJob > 0) {
    var distChange = ((last7DistPerJob - priorDistPerJob) / priorDistPerJob) * 100;
    if (Math.abs(distChange) >= 8) {
      insights.push({
        type: distChange >= 0 ? 'warn' : 'good',
        text: 'ระยะทาง/งาน สัปดาห์นี้' + (distChange >= 0 ? 'เพิ่มขึ้น ' : 'ลดลง ') + Math.abs(distChange).toFixed(1) + '%'
      });
    }
  }

  var last7Profit = avg(last7, 'netProfit');
  var priorProfit = avg(prior, 'netProfit');
  var last7Hours = last7.length; // rough proxy; kept qualitative only
  if (priorProfit !== 0) {
    var profitChange = ((last7Profit - priorProfit) / Math.abs(priorProfit)) * 100;
    if (profitChange >= 8) insights.push({ type: 'good', text: 'กำไรเฉลี่ยต่อวันสัปดาห์นี้ดีขึ้น ' + profitChange.toFixed(1) + '% เทียบก่อนหน้า' });
    else if (profitChange <= -8) insights.push({ type: 'warn', text: 'กำไรเฉลี่ยต่อวันสัปดาห์นี้ลดลง ' + Math.abs(profitChange).toFixed(1) + '% เทียบก่อนหน้า' });
  }

  if (!insights.length) return '';
  var html = '<div class="card"><div class="card-title">🤖 Frider Insight</div>';
  insights.slice(0, 3).forEach(function (ins) {
    var icon = ins.type === 'good' ? '🟢' : '⚠️';
    var color = ins.type === 'good' ? 'var(--brand)' : 'var(--warn)';
    html += '<div style="display:flex; gap:8px; padding:8px 0; border-bottom:1px solid var(--border); font-size:13px;"><span>' + icon + '</span><span style="color:' + color + ';">' + ins.text + '</span></div>';
  });
  html += '</div>';
  return html;
}

/* ---------- 11. Today (de-emphasized, near bottom) ---------- */
function renderTodaySection(data) {
  var t = data.today;
  var hasToday = t && t.exists && t.hasData;
  var html = '<div class="card"><div class="card-title">วันนี้ • ' + todayThaiLabel() + '</div>';
  if (!hasToday) {
    html += '<div class="empty-hint">ยังไม่มีข้อมูล — กดปุ่ม + เพื่อบันทึกด่วน</div>';
  } else {
    html += '<div class="row"><span class="lbl">งาน</span><span class="val">' + fmtNum(t.jobs) + '</span></div>';
    html += '<div class="row"><span class="lbl">Revenue</span><span class="val pos">' + fmtNum(t.revenue) + ' ฿</span></div>';
    html += '<div class="row"><span class="lbl">Net Profit</span><span class="val ' + (Number(t.netProfit) >= 0 ? 'pos' : 'neg') + '">' + fmtNum(t.netProfit) + ' ฿</span></div>';
    html += '<div class="row"><span class="lbl">ระยะทาง</span><span class="val">' + fmtNum(t.distance) + ' กม.</span></div>';
  }
  html += '</div>';
  return html;
}

function statBox(num, lbl) {
  return '<div class="stat-box"><div class="num">' + num + '</div><div class="lbl">' + lbl + '</div></div>';
}

// One comparison row for the History MoM card: label, this-month value, vs
// last-month value, with a %-change chip. unit is appended after the number
// ('฿' for money, '' for a plain count like job count).
function momStatRow(label, curVal, prevVal, unit) {
  curVal = Number(curVal) || 0;
  prevVal = Number(prevVal) || 0;
  var pct = prevVal !== 0 ? ((curVal - prevVal) / Math.abs(prevVal) * 100) : null;
  var up = pct === null ? true : pct >= 0;
  var textColor = pct === null ? '#8b93a7' : (up ? '#00d26a' : '#f43f5e');
  var bgColor = pct === null ? 'rgba(139,147,167,0.12)' : (up ? 'rgba(0,210,106,0.12)' : 'rgba(244,63,94,0.12)');
  var chipText = pct === null ? '—' : ((up ? '+' : '') + pct.toFixed(1) + '%');
  return '<div class="mom-stat-row">' +
    '<div class="mom-stat-label">' + label + '</div>' +
    '<div class="mom-stat-values">' +
      '<span class="mom-stat-prev">' + fmtNum(prevVal) + unit + '</span>' +
      '<span class="mom-stat-sep">→</span>' +
      '<span class="mom-stat-cur">' + fmtNum(curVal) + unit + '</span>' +
    '</div>' +
    '<div class="mom-stat-chip" style="color:' + textColor + '; background:' + bgColor + ';">' + (pct === null ? chipText : (up ? '↗ ' : '↘ ') + chipText) + '</div>' +
  '</div>';
}

function fmtSigned(n) {
  var num = Number(n) || 0;
  return (num >= 0 ? '' : '-') + Math.abs(num).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function todayThaiLabel() {
  return thaiDateLabel(new Date());
}

// Tiny inline SVG line+area chart — no chart library needed. Works for any length trend.
function buildSparkline(days) {
  var pts2 = days.filter(function (d) { return d.hasData; });
  var vals = days.map(function (d) { return Number(d.netProfit) || 0; });
  var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  if (min === max) { min -= 1; max += 1; }
  var w = 280, h = 60, pad = 4;
  var stepX = (w - pad * 2) / (vals.length - 1);
  var pts = vals.map(function (v, i) {
    var x = pad + i * stepX;
    var y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  var lastPos = vals[vals.length - 1] >= 0;
  var color = lastPos ? '#00B900' : '#f43f5e';
  var areaPts = pad + ',' + (h - pad) + ' ' + pts.join(' ') + ' ' + (w - pad) + ',' + (h - pad);
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
    '<polygon points="' + areaPts + '" fill="' + color + '" opacity="0.12"></polygon>' +
    '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>' +
    '</svg>';
}

// Circular progress ring built from conic-gradient — no chart library needed.
function buildRing(pct, centerNum, centerLabel) {
  var deg = Math.min(360, pct * 3.6);
  var style = 'background: conic-gradient(var(--brand) ' + deg + 'deg, var(--card-2) ' + deg + 'deg); border-radius: 50%; width:100%; height:100%; display:flex; align-items:center; justify-content:center;';
  return '<div class="ring-wrap"><div style="' + style + '"><div style="width:78%; height:78%; background:var(--card); border-radius:50%; display:flex; align-items:center; justify-content:center;">' +
    '<div class="ring-center"><div class="n">' + centerNum + '</div><div class="l">' + centerLabel + '</div></div></div></div></div>';
}

var EXPENSE_COLORS = ['#f43f5e', '#f59e0b', '#38bdf8', '#a78bfa'];
function buildExpenseDonutCard(t, title) {
  var items = [
    { name: 'ค่าเช่ารถ', value: Number(t.carRent) || 0 },
    { name: 'ค่าไฟ/ชาร์จ', value: Number(t.energy) || 0 },
    { name: 'App Fee', value: Number(t.appFee) || 0 },
    { name: 'อื่นๆ + WHT', value: (Number(t.otherExp) || 0) + (Number(t.wht) || 0) }
  ];
  return buildDonutCard(title, items);
}

function buildDonutCard(title, items) {
  var total = items.reduce(function (s, i) { return s + i.value; }, 0);
  if (total <= 0) return '';
  var gradParts = [];
  var acc = 0;
  items.forEach(function (item, i) {
    var start = acc / total * 360;
    acc += item.value;
    var end = acc / total * 360;
    gradParts.push((item.color || EXPENSE_COLORS[i % EXPENSE_COLORS.length]) + ' ' + start.toFixed(1) + 'deg ' + end.toFixed(1) + 'deg');
  });
  var html = '<div class="card"><div class="card-title">' + title + '</div>';
  html += '<div class="donut-row">';
  html += '<div class="donut-wrap" style="background:conic-gradient(' + gradParts.join(',') + ');"><div class="donut-hole"><div class="n">' + fmtNum(total) + '</div><div class="l">รวม ฿</div></div></div>';
  html += '<div class="donut-legend">';
  items.forEach(function (item, i) {
    if (item.value <= 0) return;
    var pct = (item.value / total * 100).toFixed(0);
    html += '<div class="dl-row"><span class="dl-name"><span class="dl-dot" style="background:' + (item.color || EXPENSE_COLORS[i % EXPENSE_COLORS.length]) + ';"></span>' + item.name + '</span><span class="dl-val">' + pct + '%</span></div>';
  });
  html += '</div></div></div>';
  return html;
}

/* ============================= FINANCE ============================= */

function loadFinance() {
  document.getElementById('financeDateLabel').innerText = thaiDateLabel(APP.financeDate);
  document.getElementById('financeContent').innerHTML = skeletonCards(2);
  var key = toDateKey(APP.financeDate);
  google.script.run.withSuccessHandler(function (entry) { renderFinance(entry, key); }).withFailureHandler(errBox('financeContent', 'loadFinance')).getDailyEntry(key);
}
function financeShiftDate(d) {
  APP.financeDate.setDate(APP.financeDate.getDate() + d);
  loadFinance();
}
function renderFinance(entry, key) {
  var hasData = entry && entry.hasData;
  var startCollapsed = !!hasData; // if already filled, keep it tidy/collapsed; empty day opens ready to fill
  var html = '<div class="card">';
  html += '<div class="card-title">กรอกข้อมูลวันนี้</div>';
  html += '<button class="form-toggle-btn" id="finToggleBtn" onclick="toggleFinForm()">' + (startCollapsed ? 'แตะเพื่อแก้ไขข้อมูล ✎' : 'ซ่อนฟอร์ม ▲') + '</button>';
  html += '<div class="field-form-body' + (startCollapsed ? ' collapsed' : '') + '" id="finFormBody">';
  html += renderFieldForm(entry, 'fin');
  html += '</div>';
  html += '</div>';
  html += renderReadonlyResults(entry && entry.exists ? entry : null);
  html += '<div class="card"><div class="card-title">วางข้อมูลดิบจาก Gemini (Data_Text)</div>';
  html += '<textarea class="form-input" id="rawTextArea" rows="6" placeholder="วาง DATE=... / JOB_01=... ที่นี่" style="height:120px; font-family:monospace; font-size:12px;"></textarea>';
  html += '</div>';
  html += '<button class="btn btn-primary" onclick="saveFinance(\'' + key + '\')" style="margin-bottom:16px;">💾 บันทึกทั้งหมด</button>';
  document.getElementById('financeContent').innerHTML = html;
  document.getElementById('financeContent').dataset.hasData = (entry && entry.hasData) ? '1' : '0';

  google.script.run.withSuccessHandler(function (raw) {
    var ta = document.getElementById('rawTextArea');
    if (ta && raw && raw.rawText) ta.value = raw.rawText;
  }).getRawText(key);
}
function toggleFinForm() {
  var body = document.getElementById('finFormBody');
  var btn = document.getElementById('finToggleBtn');
  var collapsed = body.classList.toggle('collapsed');
  btn.innerText = collapsed ? 'แตะเพื่อแก้ไขข้อมูล ✎' : 'ซ่อนฟอร์ม ▲';
}

// Single button saves both the Finance fields and the raw Data_Text together.
function saveFinance(dateStr) {
  requirePin(function () { checkThenSaveFinance(dateStr); });
}
function checkThenSaveFinance(dateStr) {
  var payload = collectFieldForm('fin');
  var rawText = document.getElementById('rawTextArea') ? document.getElementById('rawTextArea').value : '';
  var hasData = document.getElementById('financeContent').dataset.hasData === '1';
  var emptyCount = countEmptyFields('fin');

  if (!hasData && emptyCount === 0) {
    doSaveFinanceAndRaw(dateStr, payload, rawText);
    return;
  }
  APP.pendingSave = { dateStr: dateStr, payload: payload, rawText: rawText, target: 'finance' };
  var icon = document.getElementById('confirmIcon');
  var title = document.getElementById('confirmTitle');
  var msg = document.getElementById('confirmMsg');
  if (hasData && emptyCount > 0) {
    icon.innerText = '⚠️';
    title.innerText = 'มีข้อมูลเดิมอยู่ + กรอกไม่ครบ';
    msg.innerText = 'วันนี้มีข้อมูลอยู่แล้ว (จะถูกเขียนทับ) และยังกรอกไม่ครบ ' + emptyCount + ' ช่อง — ยืนยันบันทึกเลยไหม (กลับมาเติมทีหลังได้)';
  } else if (hasData) {
    icon.innerText = '⚠️';
    title.innerText = 'มีข้อมูลของวันนี้อยู่แล้ว';
    msg.innerText = 'การบันทึกจะเขียนทับข้อมูลเดิมของวันที่เลือกทั้งหมด ยืนยันหรือไม่?';
  } else {
    icon.innerText = '📝';
    title.innerText = 'กรอกข้อมูลยังไม่ครบ';
    msg.innerText = 'ยังไม่ได้กรอก ' + emptyCount + ' ช่อง — บันทึกไปก่อนแล้วกลับมาเติมทีหลังได้ไหม?';
  }
  document.getElementById('overwriteConfirmBox').classList.add('show');
}
function doSaveFinanceAndRaw(dateStr, payload, rawText) {
  showToast('กำลังบันทึก...');
  google.script.run.withSuccessHandler(function (freshEntry) {
    google.script.run.withSuccessHandler(function () {
      showToast('✅ บันทึกสำเร็จ (ข้อมูลรายวัน + ข้อมูลดิบ)');
    }).withFailureHandler(showErr).saveRawText(dateStr, rawText);
    renderFinance(freshEntry, dateStr);
    loadHome();
  }).withFailureHandler(showErr).saveDailyEntry(dateStr, payload);
}

/* ============================= QUICK SAVE ============================= */

function openQuickSave() {
  var today = new Date();
  var key = toDateKey(today);
  google.script.run.withSuccessHandler(function (entry) {
    var html = '<div class="field-wrap"><label class="field">วันที่</label>';
    html += '<input class="form-input" type="date" id="qs_date" value="' + key + '" onchange="onQuickSaveDateChange()">';
    html += '</div>';
    html += '<div id="qsFieldsWrap">' + renderFieldForm(entry, 'qs') + '</div>';
    html += '<button class="btn btn-primary" onclick="saveQuickSave()">💾 บันทึกด่วน</button>';
    html += '<div style="height:8px;"></div>';
    html += '<button class="btn btn-ghost" onclick="closeQuickSave()">ปิด</button>';
    document.getElementById('quickSaveFormWrap').innerHTML = html;
    document.getElementById('quickSaveFormWrap').dataset.hasData = (entry && entry.hasData) ? '1' : '0';
    document.getElementById('quickSaveModal').classList.add('show');
  }).withFailureHandler(showErr).getDailyEntry(key);
}
function onQuickSaveDateChange() {
  var key = document.getElementById('qs_date').value;
  google.script.run.withSuccessHandler(function (entry) {
    document.getElementById('qsFieldsWrap').innerHTML = renderFieldForm(entry, 'qs');
    document.getElementById('quickSaveFormWrap').dataset.hasData = (entry && entry.hasData) ? '1' : '0';
  }).withFailureHandler(showErr).getDailyEntry(key);
}
function closeQuickSave() {
  document.getElementById('quickSaveModal').classList.remove('show');
}
function saveQuickSave() {
  requirePin(function () { checkThenSaveQuickSave(); });
}
function checkThenSaveQuickSave() {
  var dateStr = document.getElementById('qs_date').value;
  var payload = collectFieldForm('qs');
  var hasData = document.getElementById('quickSaveFormWrap').dataset.hasData === '1';
  var emptyCount = countEmptyFields('qs');

  if (!hasData && emptyCount === 0) {
    doSave(dateStr, payload, 'quicksave');
    return;
  }
  APP.pendingSave = { dateStr: dateStr, payload: payload, target: 'quicksave' };
  var icon = document.getElementById('confirmIcon');
  var title = document.getElementById('confirmTitle');
  var msg = document.getElementById('confirmMsg');
  if (hasData && emptyCount > 0) {
    icon.innerText = '⚠️';
    title.innerText = 'มีข้อมูลเดิมอยู่ + กรอกไม่ครบ';
    msg.innerText = 'วันนี้มีข้อมูลอยู่แล้ว (จะถูกเขียนทับ) และยังกรอกไม่ครบ ' + emptyCount + ' ช่อง — ยืนยันบันทึกเลยไหม (กลับมาเติมทีหลังได้)';
  } else if (hasData) {
    icon.innerText = '⚠️';
    title.innerText = 'มีข้อมูลของวันนี้อยู่แล้ว';
    msg.innerText = 'การบันทึกจะเขียนทับข้อมูลเดิมของวันที่เลือกทั้งหมด ยืนยันหรือไม่?';
  } else {
    icon.innerText = '📝';
    title.innerText = 'กรอกข้อมูลยังไม่ครบ';
    msg.innerText = 'ยังไม่ได้กรอก ' + emptyCount + ' ช่อง — บันทึกไปก่อนแล้วกลับมาเติมทีหลังได้ไหม?';
  }
  document.getElementById('overwriteConfirmBox').classList.add('show');
}

/* ===================== SAVE + OVERWRITE CONFIRM ===================== */

function cancelOverwrite() {
  APP.pendingSave = null;
  document.getElementById('overwriteConfirmBox').classList.remove('show');
}
function confirmOverwrite() {
  if (!APP.pendingSave) return;
  var p = APP.pendingSave;
  document.getElementById('overwriteConfirmBox').classList.remove('show');
  if (p.target === 'finance') {
    doSaveFinanceAndRaw(p.dateStr, p.payload, p.rawText);
  } else {
    doSave(p.dateStr, p.payload, p.target);
  }
  APP.pendingSave = null;
}
function doSave(dateStr, payload, target) {
  showToast('กำลังบันทึก...');
  google.script.run.withSuccessHandler(function (freshEntry) {
    showToast('✅ บันทึกสำเร็จ');
    if (target === 'quicksave') {
      closeQuickSave();
      if (toDateKey(APP.financeDate) === dateStr) loadFinance();
      loadHome();
    } else {
      renderFinance(freshEntry, dateStr);
      loadHome();
    }
  }).withFailureHandler(showErr).saveDailyEntry(dateStr, payload);
}

/* ============================= ANALYSIS ============================= */

function loadAnalysis() {
  document.getElementById('analysisDateLabel').innerText = thaiDateLabel(APP.analysisDate);
  document.getElementById('analysisContent').innerHTML = skeletonCards(3);
  APP.analysisFilter = 'all';
  var key = toDateKey(APP.analysisDate);
  google.script.run.withSuccessHandler(function (data) {
    renderAnalysisPage(data);
    prefetchAnalysisAround_(APP.analysisDate);
  }).withFailureHandler(errBox('analysisContent', 'loadAnalysis')).getAnalysisPageData(key);
}

// Quietly loads getAnalysisPageData for the 3 days before and after the one
// just viewed, so ±1-3 day navigation feels instant (data is already sitting
// in the api-shim's read cache by the time the user taps prev/next). No UI
// update happens here — success handlers are empty, this only warms the cache.
// Jumping far away (e.g. day 20 -> day 10) is a cache miss as normal, and
// prefetching simply re-centers around wherever the user lands next.
function prefetchAnalysisAround_(centerDate) {
  for (var offset = -3; offset <= 3; offset++) {
    if (offset === 0) continue;
    var d = new Date(centerDate);
    d.setDate(d.getDate() + offset);
    var key = toDateKey(d);
    google.script.run.withSuccessHandler(function () {}).withFailureHandler(function () {}).getAnalysisPageData(key);
  }
}
function analysisShiftDate(d) {
  APP.analysisDate.setDate(APP.analysisDate.getDate() + d);
  loadAnalysis();
}
function renderAnalysisPage(data) {
  renderAnalysis(data.entry, data.trend7, data.modeRadar, data.deep);
}
function renderAnalysis(entry, trend7, modeRadar, deep) {
  if (!entry || !entry.exists || !entry.hasData) {
    document.getElementById('analysisContent').innerHTML = '<div class="card empty-hint">ไม่มีข้อมูลของวันนี้</div>';
    return;
  }
  var html = '';

  // Hero summary
  var netProfit = Number(entry.netProfit) || 0;
  html += '<div class="card hero-card">';
  html += '<div class="hero-date">' + fmtNum(entry.mode) + ' • ' + fmtNum(entry.jobs) + ' งาน</div>';
  html += '<div class="hero-amt" style="color:' + (netProfit >= 0 ? 'var(--brand)' : 'var(--danger)') + ';">' + fmtSigned(netProfit) + ' ฿</div>';
  html += '<div class="hero-sub">กำไรสุทธิวันนั้น</div>';
  if (entry.prevHasData && entry.prevNetProfit !== null && entry.prevNetProfit !== undefined) {
    var diff = netProfit - Number(entry.prevNetProfit);
    var pct = entry.prevNetProfit !== 0 ? (diff / Math.abs(entry.prevNetProfit) * 100) : null;
    var up = diff >= 0;
    html += '<div class="change-chip ' + (up ? 'up' : 'down') + '">' + (up ? '↗' : '↘') + ' ' + (pct === null ? fmtSigned(diff) + ' ฿' : (up ? '+' : '') + pct.toFixed(1) + '%') + ' vs วันก่อนหน้า</div>';
  }
  if (trend7 && trend7.filter(function (d) { return d.hasData; }).length > 1) {
    html += '<div class="sparkline-wrap">' + buildSparkline(trend7) + '</div>';
  }
  if (entry.kpiStatus) html += '<div style="margin-top:8px;"><span class="kpi-pill">' + entry.kpiStatus + '</span></div>';
  html += '</div>';

  // Filter pills
  html += '<div class="filter-pills" id="analysisFilterPills">';
  [['all', 'ทั้งหมด'], ['rev', 'รายได้'], ['exp', 'รายจ่าย'], ['eff', 'ประสิทธิภาพ'], ['dist', 'ระยะทาง-เวลา']].forEach(function (f) {
    html += '<button class="filter-pill' + (f[0] === 'all' ? ' active' : '') + '" data-filter="' + f[0] + '" onclick="setAnalysisFilter(\'' + f[0] + '\')">' + f[1] + '</button>';
  });
  html += '</div>';

  // Revenue vs expense donut
  var donutItems = [
    { name: 'รายได้', value: Number(entry.revenue) || 0, color: '#00B900' },
    { name: 'รายจ่าย', value: Number(entry.totalExp) || 0, color: '#f43f5e' }
  ];
  html += buildDonutCard('สัดส่วนรายได้ vs รายจ่าย', donutItems);

  // Revenue / Expense — bento tiles that expand into full detail
  html += '<div class="bento-grid">';
  html += '<div class="bento-tile revenue" onclick="toggleAcc(\'acc_rev\')"><div class="bt-label">รายได้รวม</div><div class="bt-amt">' + fmtNum(entry.revenue) + ' ฿</div><div class="bt-hint">แตะดูรายละเอียด ▾</div></div>';
  html += '<div class="bento-tile expense" onclick="toggleAcc(\'acc_exp\')"><div class="bt-label">รายจ่ายรวม</div><div class="bt-amt">' + fmtNum(entry.totalExp) + ' ฿</div><div class="bt-hint">แตะดูรายละเอียด ▾</div></div>';
  html += '</div>';

  // Revenue detail (collapsed by default — opened from the bento tile above)
  html += '<div class="card an-cat card-revenue" data-cat="rev">';
  html += '<div class="acc-body collapsed" id="acc_rev">';
  html += '<div class="card-title">รายได้แยกส่วน</div>';
  html += iconRow('rev', '฿', 'ค่าโดยสาร', fmtNum(entry.fare) + ' ฿');
  html += iconRow('rev', '฿', 'อินเซนทีฟรายวัน', fmtNum(entry.incD) + ' ฿');
  html += iconRow('rev', '฿', 'อินเซนทีฟรายสัปดาห์', fmtNum(entry.incW));
  html += iconRow('rev', '฿', 'เงินคืนค่ารถ (890)', fmtNum(entry.cashback));
  html += iconRow('rev', '฿', 'อินเซนทีฟรายเดือน', fmtNum(entry.incM));
  html += iconRow('rev', '฿', 'รายได้อื่นๆ', fmtNum(entry.otherIncome) + (entry.incomeNote ? ' (' + entry.incomeNote + ')' : ''));
  html += '<div class="row"><span class="lbl"><b>รวมรายได้</b></span><span class="val pos"><b>' + fmtNum(entry.revenue) + ' ฿</b></span></div>';
  html += '</div></div>';

  // Expense detail (collapsed by default)
  html += '<div class="card an-cat card-expense" data-cat="exp">';
  html += '<div class="acc-body collapsed" id="acc_exp">';
  html += '<div class="card-title">รายจ่าย</div>';
  html += iconRow('exp', '−', 'ค่าเช่ารถ', fmtNum(entry.carRent) + ' ฿');
  html += iconRow('exp', '−', 'App Fee', fmtNum(entry.appFee) + ' ฿');
  html += iconRow('exp', '−', 'ค่าไฟ/ชาร์จ', fmtNum(entry.energy) + ' ฿');
  html += iconRow('exp', '−', 'ค่าใช้จ่ายอื่นๆ', fmtNum(entry.otherExp) + (entry.expNote ? ' (' + entry.expNote + ')' : ''));
  html += iconRow('exp', '−', 'ภาษีหัก 3% (WHT)', fmtNum(entry.wht) + ' ฿');
  html += '<div class="row"><span class="lbl"><b>รวมรายจ่าย</b></span><span class="val neg"><b>' + fmtNum(entry.totalExp) + ' ฿</b></span></div>';
  html += '</div></div>';

  // Distance/time
  html += '<div class="card an-cat" data-cat="dist"><div class="card-title">ระยะทาง/เวลา/ไฟ</div>';
  html += iconRow('dist', '🛣', 'ระยะทาง', fmtNum(entry.distance) + ' กม.');
  html += iconRow('dist', '⏱', 'ชั่วโมงทำงาน', fmtNum(entry.hours) + ' ชม. ' + fmtNum(entry.minutes) + ' นาที');
  html += iconRow('dist', '🔋', 'หน่วยไฟที่ชาร์จ', fmtNum(entry.kwh) + ' kWh');
  html += '</div>';

  // Efficiency (derived, display-only)
  html += renderDerivedYield(entry);

  // Deep analytics from Data_Text (job-level raw data), when available for this date
  html += renderDeepAnalytics(deep);

  // Mode radar
  if (modeRadar && modeRadar.modes && modeRadar.modes.length >= 2) {
    html += buildRadarCard(modeRadar.modes);
  }

  document.getElementById('analysisContent').innerHTML = html;
  applyAnalysisFilter();
}

var JOB_TYPE_COLORS = { 'แท็กซี่': '#f59e0b', 'ไรด์(อีโค่)': '#00B900', 'คอมฟอร์ท': '#38bdf8' };
function colorForJobType(type) { return JOB_TYPE_COLORS[type] || '#a78bfa'; }
var JOB_TYPE_ICONS = { 'แท็กซี่': '🚕', 'ไรด์(อีโค่)': '🚗', 'คอมฟอร์ท': '🚙' };
function iconForJobType(type) { return JOB_TYPE_ICONS[type] || '🚘'; }

function renderDeepAnalytics(deep) {
  if (!deep || !deep.available) {
    return '<div class="card an-cat" data-cat="eff"><div class="card-title">ข้อมูลเชิงลึกจาก Data_Text</div>' +
      '<div class="empty-hint">ยังไม่มีข้อมูลดิบของวันนี้ — วางข้อมูลจาก Gemini ในหน้าการเงินก่อน</div></div>';
  }
  var html = '';

  // Deadhead / job utilization
  html += '<div class="card an-cat" data-cat="dist"><div class="card-title">ระยะทางที่ใช้ทำงานจริง (Job Utilization)</div>';
  if (deep.utilizationPct !== null) {
    html += '<div class="progress-track"><div class="progress-fill" style="width:' + Math.min(100, Math.round(deep.utilizationPct)) + '%;"></div></div>';
    html += '<div class="progress-caption"><span>ใช้งานจริง ' + deep.utilizationPct.toFixed(1) + '%</span><span>รวม ' + fmtNum(deep.totalDistance) + ' กม.</span></div>';
  }
  html += '<div style="height:8px;"></div>';
  html += iconRow('dist', '🛣', 'ระยะทางที่มีผู้โดยสาร', fmtNum(deep.jobDistance) + ' กม.');
  html += iconRow('dist', '🛣', 'ระยะทางวิ่งเปล่า (Deadhead)', fmtNum(deep.nonJobDistance) + ' กม.');
  html += '</div>';

  // Mode breakdown donut — split by revenue (฿), with job-count ratio noted per line
  if (deep.modeBreakdown && deep.modeBreakdown.length) {
    var totalJobsAll = deep.modeBreakdown.reduce(function (s, m) { return s + m.count; }, 0);
    var modeItems = deep.modeBreakdown.map(function (m) {
      var jobPct = totalJobsAll ? (m.count / totalJobsAll * 100).toFixed(0) : '0';
      return { name: iconForJobType(m.type) + ' ' + m.type + ' — ' + m.count + ' งาน (' + jobPct + '% ของงาน)', value: m.fare, color: colorForJobType(m.type) };
    });
    html += buildDonutCard('สัดส่วนประเภทงาน (Mode Breakdown) — วงกลมแบ่งตามรายได้ ฿', modeItems);
  }

  // Hourly earnings bar chart
  var activeHours = deep.hourly.filter(function (h) { return h.fare > 0; });
  if (activeHours.length) {
    var maxFare = Math.max.apply(null, deep.hourly.map(function (h) { return h.fare; }).concat([1]));
    html += '<div class="card an-cat" data-cat="eff"><div class="card-title">รายได้ตลอดวัน (รายชั่วโมง)</div>';
    html += '<div style="display:flex; align-items:flex-end; gap:2px; height:90px;">';
    deep.hourly.forEach(function (h) {
      var hpct = Math.max(2, Math.round((h.fare / maxFare) * 100));
      html += '<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%;">' +
        '<div style="width:100%; border-radius:3px 3px 0 0; background:' + (h.fare > 0 ? 'var(--brand)' : 'var(--card-2)') + '; height:' + hpct + '%;"></div></div>';
    });
    html += '</div>';
    html += '<div style="display:flex; justify-content:space-between; font-size:8px; color:var(--text-sub); margin-top:4px;"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>';
    html += '</div>';
  }

  // Job ledger
  if (deep.jobs && deep.jobs.length) {
    var totalJobsCount = deep.jobs.length;
    html += '<div class="card an-cat" data-cat="dist"><div class="card-title">รายการงานละเอียด (' + totalJobsCount + ' งาน)</div>';
    if (deep.modeBreakdown && deep.modeBreakdown.length) {
      html += '<div style="margin-bottom:10px;">';
      deep.modeBreakdown.forEach(function (m) {
        var jobPct = totalJobsCount ? (m.count / totalJobsCount * 100).toFixed(1) : '0';
        html += '<div class="dl-row"><span class="dl-name"><span class="dl-dot" style="background:' + colorForJobType(m.type) + ';"></span>' + iconForJobType(m.type) + ' ' + m.type + '</span><span class="dl-val">' + m.count + ' งาน (' + jobPct + '%)</span></div>';
      });
      html += '</div>';
    }
    deep.jobs.forEach(function (j) {
      html += '<div class="icon-row"><div class="icon-dot" style="background:' + colorForJobType(j.type) + '22; color:' + colorForJobType(j.type) + '; font-size:15px;">' + iconForJobType(j.type) + '</div>';
      html += '<div class="ir-label">' + j.type + ' • ' + j.from + ' → ' + j.to + '<br><span style="font-size:10px; opacity:.7;">' + j.start + '-' + j.end + ' • ' + j.distanceKm.toFixed(1) + ' กม.</span></div>';
      html += '<div class="ir-val">' + j.fare.toFixed(0) + ' ฿</div></div>';
    });
    html += '</div>';
  }

  return html;
}

function buildRadarCard(modes) {
  var axes = [
    { key: 'avgJobs', label: 'งาน/วัน' },
    { key: 'avgRevenue', label: 'รายได้/วัน' },
    { key: 'avgDistance', label: 'ระยะทาง/วัน' },
    { key: 'avgProfitPerHour', label: 'กำไร/ชม.' }
  ];
  var maxByAxis = axes.map(function (a) {
    return Math.max.apply(null, modes.map(function (m) { return Number(m[a.key]) || 0; }).concat([1]));
  });
  var cx = 100, cy = 100, r = 78;
  var n = axes.length;
  function pointFor(i, valuePct) {
    var angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    var rad = r * Math.max(0.04, Math.min(1, valuePct));
    return [cx + rad * Math.cos(angle), cy + rad * Math.sin(angle)];
  }
  var gridRings = [0.25, 0.5, 0.75, 1].map(function (frac) {
    var pts = axes.map(function (a, i) { var p = pointFor(i, frac); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    return '<polygon points="' + pts + '" fill="none" stroke="var(--border)" stroke-width="1"></polygon>';
  }).join('');
  var axisLines = axes.map(function (a, i) {
    var p = pointFor(i, 1);
    return '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '" stroke="var(--border)" stroke-width="1"></line>';
  }).join('');
  var labels = axes.map(function (a, i) {
    var p = pointFor(i, 1.18);
    return '<text x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" font-size="9" fill="var(--text-sub)" text-anchor="middle">' + a.label + '</text>';
  }).join('');
  var radarColors = ['#00B900', '#38bdf8', '#f59e0b', '#a78bfa'];
  var series = modes.map(function (m, mi) {
    var pts = axes.map(function (a, i) {
      var pct = maxByAxis[i] ? (Number(m[a.key]) || 0) / maxByAxis[i] : 0;
      var p = pointFor(i, pct);
      return p[0].toFixed(1) + ',' + p[1].toFixed(1);
    }).join(' ');
    var color = radarColors[mi % radarColors.length];
    return '<polygon points="' + pts + '" fill="' + color + '" fill-opacity="0.18" stroke="' + color + '" stroke-width="2"></polygon>';
  }).join('');
  var legend = modes.map(function (m, mi) {
    var color = radarColors[mi % radarColors.length];
    return '<span class="dl-name" style="margin-right:12px;"><span class="dl-dot" style="background:' + color + ';"></span>' + m.mode + ' (' + m.count + ' วัน)</span>';
  }).join('');

  var html = '<div class="card an-cat" data-cat="eff"><div class="card-title">เปรียบเทียบโหมดงาน (เฉลี่ยต่อวัน เดือนนี้)</div>';
  html += '<svg viewBox="0 0 200 200" style="width:100%; max-width:260px; display:block; margin:0 auto;">' + gridRings + axisLines + series + labels + '</svg>';
  html += '<div style="display:flex; flex-wrap:wrap; justify-content:center; margin-top:8px; font-size:11px;">' + legend + '</div>';
  html += '</div>';
  return html;
}

function toggleAcc(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('collapsed');
}

function iconRow(cat, glyph, label, val) {
  var cls = cat === 'rev' ? 'c-rev' : (cat === 'exp' ? 'c-exp' : (cat === 'eff' ? 'c-eff' : 'c-dist'));
  return '<div class="icon-row"><div class="icon-dot ' + cls + '">' + glyph + '</div><div class="ir-label">' + label + '</div><div class="ir-val">' + val + '</div></div>';
}

function setAnalysisFilter(cat) {
  APP.analysisFilter = cat;
  document.querySelectorAll('#analysisFilterPills .filter-pill').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-filter') === cat);
  });
  applyAnalysisFilter();
}
function applyAnalysisFilter() {
  var cat = APP.analysisFilter || 'all';
  document.querySelectorAll('.an-cat').forEach(function (el) {
    el.style.display = (cat === 'all' || el.getAttribute('data-cat') === cat) ? '' : 'none';
  });
}

// Simple arithmetic on values the Sheet already gave us for this one day.
// Not a Sheet formula duplication — the Sheet has no per-day version of these ratios
// (only month-level averages in MONTHLY_DASHBOARD). Display-only, never written back.
function renderDerivedYield(entry) {
  var jobs = Number(entry.jobs) || 0;
  var distance = Number(entry.distance) || 0;
  var hoursTotal = (Number(entry.hours) || 0) + (Number(entry.minutes) || 0) / 60;
  var netProfit = Number(entry.netProfit) || 0;
  var fare = Number(entry.fare) || 0;
  var revenue = Number(entry.revenue) || 0;

  var rows = [];
  if (jobs > 0) {
    rows.push(['กำไรสุทธิ/งาน', (netProfit / jobs).toFixed(2) + ' ฿']);
    rows.push(['รายได้/งาน', (revenue / jobs).toFixed(2) + ' ฿']);
  }
  if (distance > 0) {
    rows.push(['กำไรสุทธิ/กม.', (netProfit / distance).toFixed(2) + ' ฿']);
    rows.push(['ค่าโดยสาร/กม.', (fare / distance).toFixed(2) + ' ฿']);
    if (jobs > 0) rows.push(['ระยะทาง/งาน', (distance / jobs).toFixed(2) + ' กม.']);
  }
  if (hoursTotal > 0) {
    rows.push(['กำไรสุทธิ/ชม.', (netProfit / hoursTotal).toFixed(2) + ' ฿']);
    rows.push(['งาน/ชม.', (jobs / hoursTotal).toFixed(2) + ' งาน']);
    if (distance > 0) rows.push(['ระยะทาง/ชม.', (distance / hoursTotal).toFixed(2) + ' กม.']);
  }
  if (!rows.length) return '';

  var html = '<div class="card an-cat" data-cat="eff"><div class="card-title">อัตราส่วนประสิทธิภาพ (คำนวณเพิ่มเติม ไม่ได้เขียนกลับชีต)</div>';
  rows.forEach(function (r) {
    html += iconRow('eff', 'x', r[0], r[1]);
  });
  html += '</div>';
  return html;
}

/* ============================= HISTORY ============================= */

function switchHistoryTab(tab) {
  APP.historyTab = tab;
  document.getElementById('histTabMonthly').classList.toggle('active', tab === 'monthly');
  document.getElementById('histTabLifetime').classList.toggle('active', tab === 'lifetime');
  loadHistory();
}
function loadHistory() {
  document.getElementById('historyContent').innerHTML = skeletonCards(3);
  var loadId = ++APP.historyLoadId;
  var timedOut = setTimeout(function () {
    if (loadId === APP.historyLoadId) errBox('historyContent', 'loadHistory')({ message: 'ใช้เวลานานเกินไป (timeout) — เช็คอินเทอร์เน็ตหรือลองใหม่' });
  }, 15000);
  function wrap(fn) {
    return function (res) { clearTimeout(timedOut); if (loadId === APP.historyLoadId) fn(res); };
  }
  if (APP.historyTab === 'monthly') {
    google.script.run.withSuccessHandler(wrap(function (data) {
      renderHistoryMonthly(data);
      prefetchHistoryAround_(APP.historyMonth, APP.historyYear);
    })).withFailureHandler(wrap(errBox('historyContent', 'loadHistory'))).getMonthlyStats(APP.historyMonth, APP.historyYear);
  } else {
    google.script.run.withSuccessHandler(wrap(renderHistoryLifetime)).withFailureHandler(wrap(errBox('historyContent', 'loadHistory'))).getLifetimeSummary();
  }
}

// Same idea as prefetchAnalysisAround_ but for months either side of the
// one just viewed — warms the cache silently, no UI change.
function prefetchHistoryAround_(month, year) {
  for (var offset = -2; offset <= 2; offset++) {
    if (offset === 0) continue;
    var m = month + offset, y = year;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    google.script.run.withSuccessHandler(function () {}).withFailureHandler(function () {}).getMonthlyStats(m, y);
  }
}
function historyShiftMonth(d) {
  APP.historyMonth += d;
  if (APP.historyMonth > 12) { APP.historyMonth = 1; APP.historyYear++; }
  if (APP.historyMonth < 1) { APP.historyMonth = 12; APP.historyYear--; }
  loadHistory();
}
function jumpToMonth(m) {
  APP.historyMonth = parseInt(m, 10);
  loadHistory();
}
function jumpToYear(y) {
  APP.historyYear = parseInt(y, 10);
  loadHistory();
}
function renderMetricGroup(title, items) {
  if (!items || !items.length) return '';
  var html = '<div class="card"><div class="card-title">' + title + '</div>';
  items.forEach(function (m) {
    html += '<div class="row"><span class="lbl">' + m.label + '</span><span class="val">' + fmtNum(m.value) + '</span></div>';
  });
  html += '</div>';
  return html;
}
function statusCategory(status) {
  if (!status) return 'plain';
  if (status.indexOf('🥇') !== -1) return 'gold';
  if (status.indexOf('🛡️') !== -1) return 'guarantee';
  if (status.indexOf('☕') !== -1) return 'off';
  if (status.indexOf('⚠️') !== -1) return 'partial';
  if (status.indexOf('❌') !== -1) return 'fail';
  if (status.indexOf('✅') !== -1) return 'pass';
  return 'plain';
}
function statusGlyph(status) {
  if (!status) return '';
  var parts = status.split(' ');
  return parts[0] || '';
}
function kpiCellClass(day) {
  if (!day.hasData) return 'cal-cell';
  return 'cal-cell ' + statusCategory(day.kpiStatus);
}

function renderKpiCalendar(days, year, month) {
  var dowLabels = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
  var firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  var leadEmpty = (firstDow === 0) ? 6 : (firstDow - 1); // cells before day 1

  var html = '<div class="card"><div class="card-title">ปฏิทิน KPI</div>';
  html += '<div class="cal-grid">';
  dowLabels.forEach(function (d) { html += '<div class="cal-dow">' + d + '</div>'; });
  for (var i = 0; i < leadEmpty; i++) html += '<div class="cal-cell empty"></div>';
  days.forEach(function (day) {
    var cls = kpiCellClass(day);
    var tapAttr = day.hasData ? ' onclick="goToAnalysisDate(\'' + day.dateStr + '\')" style="cursor:pointer;"' : '';
    var glyph = day.hasData ? statusGlyph(day.kpiStatus) : '';
    html += '<div class="' + cls + '"' + tapAttr + '><span class="dnum">' + day.day + '</span>' + (glyph ? '<span class="dmark">' + glyph + '</span>' : '') + '</div>';
  });
  html += '</div>';
  html += '<div class="cal-legend">';
  html += '<span><i class="dot" style="background:#facc15;"></i>🥇 ถึงเป้า</span>';
  html += '<span><i class="dot" style="background:var(--brand);"></i>✅ ผ่าน</span>';
  html += '<span><i class="dot" style="background:#38bdf8;"></i>🛡️ การันตี</span>';
  html += '<span><i class="dot" style="background:var(--warn);"></i>⚠️ ครึ่งวัน</span>';
  html += '<span><i class="dot" style="background:var(--danger);"></i>❌ ไม่ผ่าน</span>';
  html += '<span><i class="dot" style="background:var(--text-sub);"></i>☕ หยุด</span>';
  html += '</div>';
  html += '</div>';
  return html;
}

var REV_COLS = ['fare', 'incD', 'incW', 'cashback', 'incM', 'otherIncome', 'revenue'];
var EXP_COLS = ['carRent', 'appFee', 'energy', 'otherExp', 'wht', 'totalExp'];
function renderFullDailyTable(days) {
  var cols = [
    ['day', 'วัน'], ['jobs', 'งาน'], ['fare', 'ค่าโดยสาร'], ['incD', 'อิน.วัน'],
    ['incW', 'อิน.สัปดาห์'], ['cashback', 'คืนรถ'], ['incM', 'อิน.เดือน'],
    ['otherIncome', 'รายได้อื่น'], ['revenue', 'รวมรายได้'], ['carRent', 'ค่าเช่ารถ'],
    ['appFee', 'App Fee'], ['energy', 'ค่าไฟ'], ['otherExp', 'จ่ายอื่น'],
    ['wht', 'WHT'], ['totalExp', 'รวมจ่าย'], ['netProfit', 'กำไรสุทธิ'], ['kpiStatus', 'สถานะ']
  ];
  var html = '<div class="card"><div class="card-title">ตารางรายวัน แบบละเอียด (เลื่อนดูได้)</div>';
  html += '<div class="table-scroll"><table class="full-table"><thead><tr>';
  cols.forEach(function (c) {
    var headCls = REV_COLS.indexOf(c[0]) !== -1 ? 'th-rev' : (EXP_COLS.indexOf(c[0]) !== -1 ? 'th-exp' : '');
    html += '<th class="' + headCls + '">' + c[1] + '</th>';
  });
  html += '</tr></thead><tbody>';
  var any = false;
  days.forEach(function (d) {
    if (!d.hasData) return;
    any = true;
    html += '<tr onclick="goToAnalysisDate(\'' + d.dateStr + '\')">';
    cols.forEach(function (c) {
      var v = d[c[0]];
      var cellCls = 'cell-neutral';
      if (c[0] === 'netProfit') cellCls = Number(v) >= 0 ? 'cell-profit' : 'cell-loss';
      else if (c[0] === 'kpiStatus') cellCls = 'cell-status cell-' + statusCategory(v);
      else if (REV_COLS.indexOf(c[0]) !== -1) cellCls = 'cell-rev';
      else if (EXP_COLS.indexOf(c[0]) !== -1) cellCls = 'cell-exp';
      html += '<td class="' + cellCls + '">' + (c[0] === 'kpiStatus' ? (v || '') : fmtNum(v)) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  if (!any) html += '<div class="empty-hint">ไม่มีข้อมูลในเดือนนี้</div>';
  html += '</div>';
  return html;
}

function renderHistoryMonthly(data) {
  var monthNames = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var t = data.totals || {};
  var html = '';
  html += '<div class="my-picker">';
  html += '<select onchange="jumpToMonth(this.value)">';
  for (var m = 1; m <= 12; m++) {
    html += '<option value="' + m + '"' + (m === data.month ? ' selected' : '') + '>' + monthNames[m] + '</option>';
  }
  html += '</select>';
  html += '<select onchange="jumpToYear(this.value)">';
  for (var y = data.year - 2; y <= data.year + 1; y++) {
    html += '<option value="' + y + '"' + (y === data.year ? ' selected' : '') + '>' + (y + 543) + '</option>';
  }
  html += '</select>';
  html += '</div>';
  html += '<div class="date-nav"><button onclick="historyShiftMonth(-1)">‹</button>';
  html += '<div class="date-label">' + monthNames[data.month] + ' ' + (data.year + 543) + '</div>';
  html += '<button onclick="historyShiftMonth(1)">›</button></div>';

  if (!data.days || !data.days.length) {
    document.getElementById('historyContent').innerHTML = '<div class="card empty-hint">ไม่มีข้อมูลในเดือนนี้</div>';
    return;
  }

  // 1) Summary
  html += '<div class="card big-profit">';
  html += '<div class="amt">' + fmtNum(t.netProfit) + ' ฿</div>';
  html += '<div class="sub">กำไรสุทธิรวมเดือนนี้</div>';
  html += '</div>';
  html += '<div class="grid3" style="margin-bottom:12px;">';
  html += statBox(fmtNum(t.workingDays), 'วันทำงาน');
  html += statBox(fmtNum(t.jobs), 'งานทั้งหมด');
  html += statBox(fmtNum(t.targetDays), 'วันถึงเป้า 🥇');
  html += '</div>';

  // 2) Trend — full month's daily net-profit line, same chart used on Home
  html += '<div class="card"><div class="card-title">แนวโน้มกำไรรายวัน — เดือนนี้</div>';
  html += '<div class="sparkline-wrap" style="margin-top:6px;">' + buildMetricSparkline(data.days, 'netProfit', data.days.length) + '</div>';
  html += '</div>';

  // 3) Revenue vs Expense donut for the month
  html += buildDonutCard('สัดส่วนรายได้ vs รายจ่าย — เดือนนี้', [
    { label: 'รายได้', value: Number(t.revenue) || 0, color: '#00B900' },
    { label: 'รายจ่าย', value: Number(t.totalExp) || 0, color: '#f43f5e' }
  ]);

  // 4) Full daily table
  html += renderFullDailyTable(data.days);

  // 3) KPI calendar
  html += renderKpiCalendar(data.days, data.year, data.month);

  // 4) MoM — now compares Revenue, Jobs, and Net Profit vs previous month (not just profit)
  html += '<div class="card"><div class="card-title">เทียบเดือนก่อน (MoM)</div>';
  html += momStatRow('รายได้', t.revenue, data.prevMonthRevenue, '฿');
  html += momStatRow('งาน', t.jobs, data.prevMonthJobs, '');
  html += momStatRow('กำไรสุทธิ', t.netProfit, data.prevMonthProfit, '฿');
  html += '</div>';

  // 5) Revenue breakdown
  html += '<div class="card"><div class="card-title">รายได้แยกส่วน</div>';
  html += metricRow('ค่าโดยสาร', t.fare);
  html += metricRow('อินเซนทีฟรายวัน', t.incD);
  html += metricRow('อินเซนทีฟรายสัปดาห์', t.incW);
  html += metricRow('เงินคืนค่ารถ (890)', t.cashback);
  html += metricRow('อินเซนทีฟรายเดือน', t.incM);
  html += metricRow('รายได้อื่นๆ', t.otherIncome);
  html += '<div class="row"><span class="lbl"><b>รวมรายได้</b></span><span class="val pos"><b>' + fmtNum(t.revenue) + ' ฿</b></span></div>';
  html += '</div>';

  // 6) Expense breakdown
  html += '<div class="card"><div class="card-title">รายจ่ายแยกส่วน</div>';
  html += metricRow('ค่าเช่ารถ', t.carRent);
  html += metricRow('App Fee', t.appFee);
  html += metricRow('ค่าไฟ/ชาร์จ', t.energy);
  html += metricRow('ค่าใช้จ่ายอื่นๆ', t.otherExp);
  html += metricRow('ภาษีหัก 3% (WHT)', t.wht);
  html += '<div class="row"><span class="lbl"><b>รวมรายจ่าย</b></span><span class="val neg"><b>' + fmtNum(t.totalExp) + ' ฿</b></span></div>';
  html += '<div class="row"><span class="lbl">% กำไรขั้นต้น</span><span class="val">' + (t.profitMarginPct || 0).toFixed(1) + '%</span></div>';
  html += '</div>';

  // 7) Weekly recap
  if (data.weeks && data.weeks.length) {
    html += '<div class="card"><div class="card-title">สรุปกำไรรายสัปดาห์</div>';
    var maxAbs = Math.max.apply(null, data.weeks.map(function (w) { return Math.abs(w.netProfit); }).concat([1]));
    data.weeks.forEach(function (w) {
      var widthPct = Math.min(100, Math.round(Math.abs(w.netProfit) / maxAbs * 100));
      html += '<div class="week-row"><div class="wr-top"><span class="lbl">' + w.label + '</span><span class="val" style="color:' + (w.netProfit >= 0 ? 'var(--brand)' : 'var(--danger)') + ';">' + fmtNum(w.netProfit) + ' ฿</span></div>';
      html += '<div class="week-bar-track"><div class="week-bar-fill' + (w.netProfit < 0 ? ' neg' : '') + '" style="width:' + widthPct + '%;"></div></div></div>';
    });
    html += '</div>';
  }

  // 8) Efficiency
  html += '<div class="card"><div class="card-title">ประสิทธิภาพต่องาน/ชั่วโมง</div>';
  html += metricRow('กำไรเฉลี่ย/วัน', t.avgProfitPerDay, ' ฿');
  html += metricRow('งานเฉลี่ย/วัน', t.avgJobsPerDay, ' งาน');
  html += metricRow('กำไร/งาน', t.profitPerJob, ' ฿');
  html += metricRow('ต้นทุน/งาน', t.costPerJob, ' ฿');
  html += metricRow('กำไร/กม.', t.profitPerKm, ' ฿');
  html += metricRow('กำไร/ชม.', t.profitPerHour, ' ฿');
  html += metricRow('งาน/ชม.', t.avgJobsPerHour, '');
  html += metricRow('ระยะทางเฉลี่ย/งาน', t.avgDistancePerJob, ' กม.');
  html += metricRow('เวลาเฉลี่ย/งาน', t.avgTimePerJobMin, ' นาที');
  html += '</div>';

  // 9) EV
  html += '<div class="card"><div class="card-title">ต้นทุน EV (EV Cost/km)</div>';
  html += metricRow('ค่าไฟ/กม.', t.energyCostPerKm, ' ฿');
  html += metricRow('ค่าเช่ารถ/กม.', t.carRentPerKm, ' ฿');
  html += metricRow('ต้นทุน EV รวม/กม.', t.evCostPerKm, ' ฿');
  html += metricRow('สัดส่วนกำไร : ต้นทุน EV', t.evProfitRatio, 'x');
  html += metricRow('หน่วยไฟรวมที่ชาร์จ', t.kwh, ' kWh');
  html += metricRow('ค่าไฟเฉลี่ย', t.avgKwhCost, ' ฿/kWh');
  html += metricRow('ระยะทาง/หน่วยไฟ', t.kmPerKwh, ' กม./kWh');
  html += '</div>';

  document.getElementById('historyContent').innerHTML = html;
}

function metricRow(label, value, unit) {
  if (value === undefined || value === null) return '';
  var num = Number(value);
  var display = isFinite(num) ? num.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
  return '<div class="row"><span class="lbl">' + label + '</span><span class="val">' + display + (unit || ' ฿') + '</span></div>';
}

function renderHistoryLifetime(data) {
  var metrics = (data && data.metrics) || [];
  var icons = ['💰', '🚗', '📈', '🚕', '📅', '📊', '📈', '🥇', '🛡️'];
  var glowStyles = ['glow-green', 'glow-amber', 'glow-rose', 'glow-blue', 'glow-purple', 'glow-cyan', 'glow-green', 'glow-rose', 'glow-blue'];
  
  var html = '<div class="card"><div class="card-title">🏆 สรุปตลอดอายุการใช้งาน</div><div class="glow-grid-2">';
  metrics.forEach(function (m, i) {
    var gCls = glowStyles[i % glowStyles.length];
    var ic = icons[i % icons.length];
    html += '<div class="glow-card ' + gCls + '">';
    html += '<div class="card-top"><span>' + ic + '</span><span>' + m.label + '</span></div>';
    html += '<div class="card-mid">' + fmtNum(m.value) + '</div>';
    html += '<div class="card-subtext">สถิติตลอดอายุ</div>';
    html += '<div class="card-bar-bg"><div class="card-bar-fill" style="width:80%;"></div></div>';
    html += '</div>';
  });
  html += '</div></div>';
  document.getElementById('historyContent').innerHTML = html;
}

/* ============================= ERROR ============================= */

function showErr(err) {
  console.error(err);
  showToast('❌ ' + (err && err.message ? err.message : 'เกิดข้อผิดพลาด'));
}

// Renders a retry box into a given container instead of leaving a spinner stuck forever.
function errBox(containerId, retryFnName) {
  return function (err) {
    console.error(err);
    var msg = (err && err.message) ? err.message : 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
    var el = document.getElementById(containerId);
    if (el) {
      el.innerHTML = '<div class="card empty-hint">⚠️ โหลดไม่สำเร็จ<br><span style="font-size:11px;opacity:.7;">' + msg + '</span><br><br>' +
        '<button class="btn btn-ghost" onclick="' + retryFnName + '()">🔄 ลองใหม่</button></div>';
    }
    showToast('❌ โหลดไม่สำเร็จ');
  };
}
