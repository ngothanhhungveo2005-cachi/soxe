/* Sổ Xe — lõi ứng dụng: dữ liệu, tổng quan, bảo dưỡng, báo cáo, quản lý dữ liệu */
(function () {
  'use strict';
  const LX = window.LX;
  const SX = window.SX = { LX };
  const $ = SX.$ = id => document.getElementById(id);
  const fmt = LX.fmt, fmtDate = LX.fmtDate;
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const pad = LX.p2;
  const today = SX.today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

  // tạo DOM an toàn (không dùng innerHTML với dữ liệu người dùng)
  const h = SX.h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'value') e.value = v;
      else if (k.slice(0, 2) === 'on') e[k] = v;
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    kids.flat(Infinity).forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  };

  const TYPES = SX.TYPES = {
    fuel: ['⛽', 'Đổ xăng', '#0f9d83'], maint: ['🛠️', 'Bảo dưỡng', '#3b82f6'], repair: ['🔧', 'Sửa chữa', '#e0883a'],
    fee: ['🅿️', 'Gửi xe / phí', '#8b5cf6'], other: ['📦', 'Khác', '#94a3b8']
  };

  /* ================= dữ liệu ================= */
  const KEY = 'soxe.v3';
  function defaults() {
    return {
      vehicles: [], entries: [], cur: null, period: 'month', clientId: '', fav: [], cams: [],
      settings: { voice: true, speedWarn: true, tol: 5, limit: 50, autoLimit: true, camWarn: true, lane: false, notif: false }
    };
  }
  function load() {
    let o = null;
    for (const k of [KEY, 'soxe.v2', 'soxe.v1']) {
      try { const x = JSON.parse(localStorage.getItem(k) || 'null'); if (x && Array.isArray(x.vehicles)) { o = x; break; } } catch (e) { /* bỏ qua */ }
    }
    const S = Object.assign(defaults(), o || {});
    S.settings = Object.assign(defaults().settings, S.settings || {});
    if (!Array.isArray(S.fav)) S.fav = [];
    if (!Array.isArray(S.cams)) S.cams = [];
    if (!Array.isArray(S.entries)) S.entries = [];
    S.vehicles.forEach(v => {
      if (!v.kind) v.kind = v.tank > 15 ? 'car' : 'bike';
      if (!Array.isArray(v.sched)) v.sched = LX.makeSched(v.kind);
      v.inspectExp = v.inspectExp || ''; v.insExp = v.insExp || '';
      if (!Array.isArray(v.inspections)) v.inspections = [];
    });
    S.entries.forEach(e => { e.amount = +e.amount || 0; if (!Array.isArray(e.items)) e.items = []; });
    if (!S.cur && S.vehicles[0]) S.cur = S.vehicles[0].id;
    return S;
  }
  const S = SX.S = load();
  const save = SX.save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast('Bộ nhớ trình duyệt đầy. Hãy tải file sao lưu rồi xóa bớt ảnh phiếu.'); }
  };
  const toast = SX.toast = m => {
    const t = $('toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
  };
  const veh = SX.veh = () => S.vehicles.find(v => v.id === S.cur) || null;
  const entriesOf = v => S.entries.filter(e => e.vid === v.id);

  /* ================= chuyển tab ================= */
  const VIEWS = ['home', 'maint', 'report', 'map', 'drive', 'data'];
  let curView = 'home';
  const show = SX.show = v => {
    curView = v;
    VIEWS.forEach(x => $('v-' + x).classList.toggle('hidden', x !== v));
    document.querySelectorAll('.bottom button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    const needVeh = ['home', 'maint', 'report'].includes(v);
    $('noVeh').classList.toggle('hidden', !(needVeh && !veh()));
    $('vtabs').classList.toggle('hidden', v === 'map' || v === 'drive');
    $('alertBar').classList.toggle('hidden', v === 'map' || v === 'drive' || v === 'data');
    window.scrollTo(0, 0);
    if (v === 'report') renderReport();
    if (v === 'map' && SX.map) SX.map.onShow();
    if (v === 'drive' && SX.drive) SX.drive.onShow();
  };

  /* ================= thanh xe + cảnh báo ================= */
  function renderTabs() {
    const t = $('vtabs'); t.innerHTML = '';
    S.vehicles.forEach(x => t.append(h('button', {
      class: 'tab' + (x.id === S.cur ? ' on' : ''),
      onclick: () => { S.cur = x.id; save(); cancelEntry(); cancelMaint(); renderAll(); }
    }, (x.kind === 'car' ? '🚗 ' : '🛵 ') + x.name + (x.plate ? ' · ' + x.plate : ''))));
  }
  function renderAlerts() {
    const box = $('alertBar'); box.innerHTML = '';
    const all = [];
    S.vehicles.forEach(v => LX.alerts(v).filter(a => a.level !== 'info').forEach(a => all.push({ v, a })));
    all.slice(0, 8).forEach(({ v, a }) => box.append(h('div', {
      class: 'alert ' + a.level,
      onclick: () => { S.cur = v.id; save(); renderAll(); show(a.cat === 'reg' ? 'data' : 'maint'); }
    }, h('span', null, a.level === 'red' ? '🔴' : '🟠'),
      h('span', null, (S.vehicles.length > 1 ? v.name + ' · ' : '') + a.text))));
    if (all.length > 8) box.append(h('div', { class: 'note' }, '… và ' + (all.length - 8) + ' cảnh báo khác'));
  }

  /* ================= TỔNG QUAN ================= */
  const pLabel = { month: 'tháng này', last: 'tháng trước', q: '3 tháng gần đây', year: 'năm nay', all: 'tất cả thời gian' };
  function range() {
    const n = new Date(), y = n.getFullYear(), m = n.getMonth(), p = S.period;
    const d = (a, b, c) => new Date(a, b, c).getTime();
    if (p === 'month') return [d(y, m, 1), d(y, m + 1, 1)];
    if (p === 'last') return [d(y, m - 1, 1), d(y, m, 1)];
    if (p === 'q') return [d(y, m - 2, 1), d(y, m + 1, 1)];
    if (p === 'year') return [d(y, 0, 1), d(y + 1, 0, 1)];
    return [-Infinity, Infinity];
  }
  function inRange(e) { const [a, b] = range(); const t = new Date(e.date + 'T00:00:00').getTime(); return t >= a && t < b; }

  function fuelAvg(list) {
    const f = list.filter(e => e.type === 'fuel' && e.liters > 0 && e.odo > 0).sort((a, b) => a.odo - b.odo);
    if (f.length < 2) return null;
    const km = f[f.length - 1].odo - f[0].odo; if (km <= 0) return null;
    return f.slice(1).reduce((s, e) => s + e.liters, 0) / km * 100;
  }
  const statCard = (label, val) => h('div', { class: 'stat' }, h('span', null, label), h('b', null, val));

  function barChart(box, items, opts) {
    opts = opts || {}; box.innerHTML = '';
    const mx = Math.max(0, ...items.map(i => i.v));
    items.forEach(i => {
      const em = h('em', null, i.v ? (i.v >= 1e6 ? (i.v / 1e6).toFixed(1) + 'tr' : Math.round(i.v / 1000) + 'k') : '');
      if (opts.noLabelVal) em.textContent = '';
      box.append(h('div', { class: 'bar' }, em,
        h('i', { style: 'height:' + (mx ? i.v / mx * 85 : 0) + '%' }), h('small', null, i.l)));
    });
    return mx;
  }

  function renderHome() {
    $('homeMain').classList.toggle('hidden', !veh());
    const v = veh(); if (!v) return;
    $('period').value = S.period;
    const all = entriesOf(v), list = all.filter(inRange);
    const total = list.reduce((s, e) => s + e.amount, 0);
    const fuel = list.filter(e => e.type === 'fuel').reduce((s, e) => s + e.amount, 0);
    const odos = list.map(e => e.odo).filter(x => x > 0);
    const km = odos.length > 1 ? Math.max(...odos) - Math.min(...odos) : 0;
    const avg = fuelAvg(list);
    const cards = [['Tổng chi phí', fmt(total) + ' đ'], ['Tiền xăng', fmt(fuel) + ' đ'], ['Số lần ghi', list.length + '']];
    if (km > 0) { cards.push(['Đã chạy', fmt(km) + ' km']); cards.push(['Chi phí / km', fmt(total / km) + ' đ']); }
    if (avg) cards.push(['Tiêu hao thực tế', avg.toFixed(2) + ' L/100km']);
    if (v.tank > 0 && v.cons > 0) cards.push(['Đi được / bình', fmt(v.tank / v.cons * 100) + ' km']);
    cards.push(['Số km hiện tại', fmt(v.odo || 0) + ' km']);
    $('statTitle').textContent = '📊 ' + pLabel[S.period];
    $('stats').innerHTML = ''; cards.forEach(c => $('stats').append(statCard(c[0], c[1])));

    const n = new Date(), months = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(n.getFullYear(), n.getMonth() - i, 1); months.push({ k: d.getFullYear() + '-' + pad(d.getMonth() + 1), l: 'T' + (d.getMonth() + 1), v: 0 }); }
    all.forEach(e => { const m = months.find(x => x.k === e.date.slice(0, 7)); if (m) m.v += e.amount; });
    const mx = barChart($('bars'), months);
    $('chartBox').classList.toggle('hidden', mx === 0);

    const by = {}; list.forEach(e => by[e.type] = (by[e.type] || 0) + e.amount);
    $('splitBox').classList.toggle('hidden', total === 0);
    $('split').innerHTML = ''; $('leg').innerHTML = '';
    Object.keys(TYPES).forEach(k => {
      if (!by[k]) return;
      $('split').append(h('div', { style: 'width:' + (by[k] / total * 100) + '%;background:' + TYPES[k][2] }));
      $('leg').append(h('span', null, h('span', { class: 'dot', style: 'background:' + TYPES[k][2] }), TYPES[k][1] + ' ' + Math.round(by[k] / total * 100) + '%'));
    });

    const hist = $('hist'); hist.innerHTML = '';
    const rows = list.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    if (!rows.length) hist.append(h('div', { class: 'empty' }, 'Chưa có khoản chi nào trong ' + pLabel[S.period] + '.'));
    rows.forEach(e => hist.append(entryRow(e, () => startEdit(e.id), () => delEntry(e.id))));
  }

  function entryRow(e, onEdit, onDel) {
    const t = TYPES[e.type] || TYPES.other;
    let txt = fmtDate(e.date);
    if (e.place) txt += ' · ' + e.place;
    if (e.liters) txt += ' · ' + e.liters + ' lít';
    if (e.odo) txt += ' · ' + fmt(e.odo) + ' km';
    if (e.note) txt += ' · ' + e.note;
    const items = e.items && e.items.length ? e.items.map(i => i.name).filter(Boolean).join(', ') : '';
    const mid = h('div', { class: 'mid' }, h('div', { class: 't' }, t[1]), h('div', { class: 'd' }, txt));
    if (items) mid.append(h('div', { class: 'd' }, '🔩 ' + items));
    if (e.img) {
      const img = h('img', { class: 'thumb hidden', src: e.img, alt: 'Ảnh phiếu' });
      mid.append(h('button', { class: 'mini', style: 'margin-top:6px', onclick: () => img.classList.toggle('hidden') }, '🧾 Xem ảnh phiếu'), img);
    }
    return h('div', { class: 'item' }, h('div', { class: 'ico' }, t[0]), mid,
      h('div', { class: 'amt' }, fmt(e.amount) + ' đ'),
      h('button', { class: 'mini', title: 'Sửa', onclick: onEdit }, '✏️'),
      h('button', { class: 'mini del', title: 'Xóa', onclick: onDel }, '🗑️'));
  }
  function delEntry(id) {
    if (!confirm('Xóa khoản chi này?')) return;
    S.entries = S.entries.filter(x => x.id !== id); save(); renderAll(); toast('Đã xóa');
  }

  // --- form chi phí nhanh ---
  let editEid = null;
  const updPrice = () => { const a = num($('eAmt').value), l = num($('eLit').value); $('ePrice').value = (a > 0 && l > 0) ? fmt(a / l) + ' đ/lít' : ''; };
  const onType = () => $('fuelRow').classList.toggle('hidden', $('eType').value !== 'fuel');
  function cancelEntry() {
    editEid = null; $('entTitle').textContent = '➕ Ghi chi phí'; $('eCancel').classList.add('hidden');
    $('eType').value = 'fuel'; $('eDate').value = today();
    ['eAmt', 'eOdo', 'eLit', 'eNote'].forEach(i => $(i).value = ''); updPrice(); onType();
  }
  function startEdit(id) {
    const e = S.entries.find(x => x.id === id); if (!e) return;
    if (e.type === 'maint' && e.items && e.items.length) { editMaint(id); return; }
    editEid = id; show('home');
    $('entTitle').textContent = '✏️ Sửa khoản chi'; $('eCancel').classList.remove('hidden');
    $('eType').value = e.type; $('eDate').value = e.date; $('eAmt').value = e.amount || '';
    $('eOdo').value = e.odo || ''; $('eLit').value = e.liters || ''; $('eNote').value = e.note || '';
    updPrice(); onType(); $('entTitle').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function saveEntry() {
    const v = veh(); if (!v) return;
    const amount = num($('eAmt').value);
    if (amount <= 0) { toast('Nhập số tiền'); $('eAmt').focus(); return; }
    if (!$('eDate').value) { toast('Chọn ngày'); return; }
    const type = $('eType').value;
    const data = { vid: v.id, date: $('eDate').value, type, amount, odo: num($('eOdo').value), liters: type === 'fuel' ? num($('eLit').value) : 0, note: $('eNote').value.trim() };
    if (editEid) Object.assign(S.entries.find(x => x.id === editEid), data);
    else S.entries.push(Object.assign({ id: LX.uid(), items: [] }, data));
    if (data.odo > (v.odo || 0)) v.odo = data.odo;
    save(); cancelEntry(); renderAll(); toast('Đã lưu');
  }

  /* ================= BẢO DƯỠNG ================= */
  const CHIP = { over: ['Quá hạn', 'red'], soon: ['Sắp đến hạn', 'amber'], ok: ['Còn tốt', 'green'], unknown: ['Chưa có mốc', 'grey'] };
  function renderSched() {
    $('maintMain').classList.toggle('hidden', !veh());
    const v = veh(); const box = $('sched'); box.innerHTML = ''; if (!v) return;
    v.sched.forEach(it => {
      const st = LX.itemStatus(it, v.odo || 0, Date.now());
      const chip = CHIP[st.state];
      const parts = [];
      if (Number.isFinite(it.lastKm) || it.lastDate) parts.push('Lần cuối: ' + [Number.isFinite(it.lastKm) ? fmt(it.lastKm) + ' km' : '', it.lastDate ? fmtDate(it.lastDate) : ''].filter(Boolean).join(' · '));
      if (st.leftKm != null) parts.push(st.leftKm >= 0 ? 'còn ' + fmt(st.leftKm) + ' km' : 'quá ' + fmt(-st.leftKm) + ' km');
      if (st.leftDays != null) parts.push(st.leftDays >= 0 ? 'còn ' + st.leftDays + ' ngày' : 'quá ' + (-st.leftDays) + ' ngày');
      if (st.state === 'unknown') parts.push('Bấm "Vừa làm" hoặc nhập phiếu để bắt đầu theo dõi');
      const cycle = [it.km > 0 ? fmt(it.km) + ' km' : '', it.mo > 0 ? it.mo + ' tháng' : ''].filter(Boolean).join(' / ');
      box.append(h('div', { class: 'sitem' },
        h('div', { class: 'srow' }, h('div', { class: 'sname' }, it.name, h('span', { class: 'act' }, ' · ' + it.act + (cycle ? ' mỗi ' + cycle : ''))),
          h('span', { class: 'chip ' + chip[1] }, chip[0])),
        h('div', { class: 'prog' }, h('i', { class: chip[1], style: 'width:' + Math.min(100, Math.round(st.pct * 100)) + '%' })),
        h('div', { class: 'd' }, parts.join(' · ')),
        h('button', { class: 'mini', onclick: () => markDone(it) }, '✔ Vừa làm hôm nay')));
    });
    renderSchedEdit(v);
  }
  function markDone(it) {
    const v = veh();
    if (!confirm('Ghi nhận đã làm "' + it.name + '" hôm nay' + (v.odo ? ' tại ' + fmt(v.odo) + ' km' : '') + '?\n(Để ghi cả chi phí, hãy nhập phiếu bảo dưỡng.)')) return;
    it.lastKm = v.odo || 0; it.lastDate = today(); save(); renderAll();
  }
  function renderSchedEdit(v) {
    const box = $('schedEdit'); box.innerHTML = '';
    const inp = (val, type, fn, w) => h('input', { type, value: val == null ? '' : val, style: w ? 'min-width:' + w : null, onchange: e => { fn(e.target.value); save(); renderSched(); renderAlerts(); } });
    const rows = v.sched.map(it => h('tr', null,
      h('td', null, inp(it.name, 'text', x => it.name = x.trim() || it.name, '130px')),
      h('td', null, inp(it.km, 'number', x => it.km = Math.max(0, num(x)))),
      h('td', null, inp(it.mo, 'number', x => it.mo = Math.max(0, num(x)))),
      h('td', null, inp(Number.isFinite(it.lastKm) ? it.lastKm : '', 'number', x => it.lastKm = x === '' ? null : num(x))),
      h('td', null, inp(it.lastDate || '', 'date', x => it.lastDate = x || null)),
      h('td', null, h('button', { class: 'mini del', onclick: () => { if (confirm('Xóa hạng mục "' + it.name + '"?')) { v.sched = v.sched.filter(s => s.id !== it.id); save(); renderAll(); } } }, '✕'))));
    box.append(h('table', null, h('thead', null, h('tr', null, ['Hạng mục', 'Chu kỳ km', 'Chu kỳ tháng', 'Lần cuối (km)', 'Lần cuối (ngày)', ''].map(x => h('th', null, x)))), h('tbody', null, rows)));
  }

  // --- phiếu bảo dưỡng ---
  let mLines = [], editMid = null, mImg = null;
  function updMTotal() { $('mTotal').textContent = fmt(mLines.reduce((s, l) => s + (l.amount || 0), 0)) + ' đ'; }
  function renderLines() {
    const box = $('mLines'); box.innerHTML = ''; const v = veh();
    mLines.forEach((ln, i) => {
      const sel = h('select', { onchange: e => { ln.sid = e.target.value; } }, h('option', { value: '' }, '— gắn lịch —'), ...(v ? v.sched.map(s => h('option', { value: s.id }, s.name)) : []));
      sel.value = ln.sid || '';
      const nm = h('input', {
        placeholder: 'Tên hạng mục / phụ tùng', value: ln.name || '',
        oninput: e => {
          ln.name = e.target.value;
          if (!ln.sid && v) { const k = LX.matchKey(ln.name); const s = k && v.sched.find(x => x.key === k); if (s) { ln.sid = s.id; sel.value = s.id; } }
        }
      });
      const am = h('input', { type: 'number', inputmode: 'numeric', min: 0, placeholder: 'Thành tiền', value: ln.amount || '', oninput: e => { ln.amount = num(e.target.value); updMTotal(); } });
      box.append(h('div', { class: 'mline' }, nm, sel, am, h('button', { class: 'mini del', onclick: () => { mLines.splice(i, 1); renderLines(); } }, '✕')));
    });
    updMTotal();
  }
  function cancelMaint() {
    editMid = null; mImg = null; mLines = [{ name: '', amount: 0, sid: '' }];
    $('mTitle').textContent = '🧾 Nhập phiếu bảo dưỡng'; $('mCancel').classList.add('hidden');
    $('mDate').value = today(); $('mOdo').value = veh() && veh().odo ? veh().odo : ''; $('mPlace').value = ''; $('mNote').value = ''; $('mKeep').checked = false;
    renderLines();
  }
  function editMaint(id) {
    const e = S.entries.find(x => x.id === id); if (!e) return;
    S.cur = e.vid; show('maint'); renderAll();
    editMid = id; mImg = e.img || null;
    mLines = e.items.map(i => ({ name: i.name, amount: i.amount, sid: i.sid || '' }));
    if (!mLines.length) mLines = [{ name: '', amount: e.amount, sid: '' }];
    $('mTitle').textContent = '✏️ Sửa phiếu bảo dưỡng'; $('mCancel').classList.remove('hidden');
    $('mDate').value = e.date; $('mOdo').value = e.odo || ''; $('mPlace').value = e.place || ''; $('mNote').value = e.note || ''; $('mKeep').checked = !!e.img;
    renderLines(); $('mTitle').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function saveMaint() {
    const v = veh(); if (!v) return;
    const items = mLines.filter(l => (l.name || '').trim() || l.amount > 0).map(l => ({ name: (l.name || '').trim() || 'Hạng mục', amount: l.amount || 0, sid: l.sid || '' }));
    const amount = items.reduce((s, i) => s + i.amount, 0);
    if (!items.length) { toast('Thêm ít nhất một hạng mục'); return; }
    if (amount <= 0) { toast('Nhập thành tiền cho các hạng mục'); return; }
    const date = $('mDate').value; if (!date) { toast('Chọn ngày'); return; }
    const odo = num($('mOdo').value);
    const data = { vid: v.id, date, type: 'maint', amount, odo, liters: 0, place: $('mPlace').value.trim(), note: $('mNote').value.trim(), items, img: $('mKeep').checked && mImg ? mImg : null };
    if (editMid) Object.assign(S.entries.find(x => x.id === editMid), data);
    else S.entries.push(Object.assign({ id: LX.uid() }, data));
    if (odo > (v.odo || 0)) v.odo = odo;
    // cập nhật mốc lần cuối cho các hạng mục trong lịch
    const daysAgo = LX.daysUntil(date) * -1;
    const km = odo > 0 ? odo : (daysAgo <= 3 ? (v.odo || null) : null);
    new Set(items.map(i => i.sid).filter(Boolean)).forEach(sid => {
      const s = v.sched.find(x => x.id === sid); if (!s) return;
      if (!s.lastDate || date >= s.lastDate) { s.lastDate = date; if (km != null) s.lastKm = km; }
    });
    save(); cancelMaint(); renderAll(); toast('Đã lưu phiếu. Mốc bảo dưỡng đã được cập nhật.');
    $('scanStatus').textContent = 'Chụp hoặc chọn ảnh phiếu, app sẽ tự đọc ngày, số km, các hạng mục và số tiền. Bạn kiểm tra lại rồi lưu.';
    $('scanStatus').className = 'status';
  }
  function renderMHist() {
    const box = $('mhist'); box.innerHTML = ''; const v = veh(); if (!v) return;
    const rows = entriesOf(v).filter(e => e.type === 'maint' || e.type === 'repair').sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    if (!rows.length) box.append(h('div', { class: 'empty' }, 'Chưa có phiếu bảo dưỡng hay sửa chữa nào.'));
    rows.forEach(e => box.append(entryRow(e, () => startEdit(e.id), () => delEntry(e.id))));
  }

  // kết quả quét phiếu → điền vào form
  SX.applyScan = function (parsed, thumb) {
    // tự chuyển sang xe có biển số khớp
    if (parsed.plate) {
      const m = S.vehicles.find(x => LX.normPlate(x.plate) === parsed.plate);
      if (m && m.id !== S.cur) { S.cur = m.id; save(); renderAll(); toast('Đã chuyển sang xe ' + m.name + ' theo biển số trên phiếu'); }
    }
    const v = veh(); if (!v) return;
    show('maint');
    editMid = null; $('mTitle').textContent = '🧾 Nhập phiếu bảo dưỡng'; $('mCancel').classList.add('hidden');
    if (parsed.date) $('mDate').value = parsed.date;
    if (parsed.odo) $('mOdo').value = parsed.odo;
    mLines = parsed.items.map(i => {
      const s = i.key ? v.sched.find(x => x.key === i.key) : null;
      return { name: i.name, amount: i.amount, sid: s ? s.id : '' };
    });
    const sum = mLines.reduce((s, l) => s + l.amount, 0);
    if (parsed.total && parsed.total - sum >= 1000) mLines.push({ name: 'Công thợ / chi phí khác', amount: parsed.total - sum, sid: '' });
    if (!mLines.length) mLines = [{ name: '', amount: 0, sid: '' }];
    mImg = thumb || null; $('mKeep').checked = false;
    renderLines();
    const n = parsed.items.length;
    const st = $('scanStatus');
    st.className = 'status ' + (n ? 'ok' : 'err');
    st.textContent = n
      ? 'Đã đọc được ' + n + ' dòng' + (parsed.date ? ', ngày ' + fmtDate(parsed.date) : '') + (parsed.odo ? ', ' + fmt(parsed.odo) + ' km' : '') + '. Hãy kiểm tra lại từng dòng trước khi lưu, vì chữ trên phiếu có thể bị đọc sai.'
      : 'Không đọc được dòng hàng nào. Hãy chụp lại rõ hơn (đủ sáng, thẳng, không rung) hoặc nhập tay bên dưới.';
    $('mDate').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  /* ================= BÁO CÁO ================= */
  const monthKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1);
  function fillYears() {
    const sel = $('rYear'), keep = sel.value;
    const ys = new Set([new Date().getFullYear()]);
    S.entries.forEach(e => ys.add(+e.date.slice(0, 4)));
    sel.innerHTML = '';
    Array.from(ys).sort((a, b) => b - a).forEach(y => sel.append(h('option', { value: y }, 'Năm ' + y)));
    sel.value = keep && ys.has(+keep) ? keep : String(new Date().getFullYear());
  }
  const hbar = (label, val, max, color, tail) => h('div', { class: 'hbar' },
    h('div', { class: 't' }, h('span', null, label), h('span', null, fmt(val) + ' đ' + (tail || ''))),
    h('div', { class: 'b' }, h('i', { style: 'width:' + (max ? val / max * 100 : 0) + '%' + (color ? ';background:' + color : '') })));
  const rcard = (title, ...kids) => h('div', { class: 'card' }, h('h2', null, title), ...kids);

  let lastReportRows = [];
  function renderReport() {
    if (!$('rYear').options.length) fillYears();
    if (!$('rMonth').value) $('rMonth').value = monthKey(new Date());
    const out = $('repOut'); out.innerHTML = '';
    const v = veh();
    if (!S.vehicles.length) return;
    const mode = $('rMode').value, scope = $('rScope').value;
    $('rMonth').classList.toggle('hidden', mode !== 'month'); $('rYear').classList.toggle('hidden', mode !== 'year');
    const base = S.entries.filter(e => scope === 'all' || (v && e.vid === v.id));
    let val, prevVal, title;
    if (mode === 'month') {
      val = $('rMonth').value; const [y, m] = val.split('-').map(Number); prevVal = monthKey(new Date(y, m - 2, 1)); title = 'Tháng ' + m + '/' + y;
    } else { val = $('rYear').value; prevVal = String(+val - 1); title = 'Năm ' + val; }
    const list = base.filter(e => e.date.startsWith(val)).sort((a, b) => a.date.localeCompare(b.date));
    const prev = base.filter(e => e.date.startsWith(prevVal));
    lastReportRows = list;
    const ag = LX.aggregate(list), pag = LX.aggregate(prev);
    const scopeName = scope === 'all' ? 'tất cả xe' : (v ? v.name : '');

    // tóm tắt
    let diff = null;
    if (pag.total > 0) diff = (ag.total - pag.total) / pag.total * 100;
    const maintTotal = (ag.byType.maint || 0) + (ag.byType.repair || 0);
    const tiles = [statCard('Tổng chi phí', fmt(ag.total) + ' đ'), statCard('Số lần ghi', ag.count + ''), statCard('Tiền xăng', fmt(ag.byType.fuel || 0) + ' đ'), statCard('Bảo dưỡng + sửa chữa', fmt(maintTotal) + ' đ')];
    if (ag.km > 0) { tiles.push(statCard('Đã chạy', fmt(ag.km) + ' km')); tiles.push(statCard('Chi phí / km', fmt(ag.total / ag.km) + ' đ')); }
    tiles.push(statCard(mode === 'year' ? 'Trung bình / tháng' : 'Trung bình / ngày', fmt(ag.total / (mode === 'year' ? 12 : new Date(+val.slice(0, 4), +val.slice(5, 7), 0).getDate())) + ' đ'));
    const head = rcard('📈 ' + title + ' · ' + scopeName, h('div', { class: 'grid' }, tiles));
    if (diff != null) head.append(h('p', { class: 'note' }, 'So với ' + (mode === 'year' ? 'năm trước' : 'tháng trước') + ' (' + fmt(pag.total) + ' đ): ', h('b', { class: diff > 0 ? 'up' : 'down' }, (diff > 0 ? '▲ tăng ' : '▼ giảm ') + Math.abs(diff).toFixed(0) + '%')));
    out.append(head);
    if (!list.length) { out.append(h('div', { class: 'card empty' }, 'Chưa có khoản chi nào trong kỳ này.')); return; }

    // biểu đồ theo tháng (năm) / theo ngày (tháng)
    const chart = h('div', { class: 'bars' + (mode === 'month' ? ' thin' : '') });
    if (mode === 'year') {
      const arr = Array.from({ length: 12 }, (_, i) => ({ l: 'T' + (i + 1), v: 0 }));
      list.forEach(e => arr[+e.date.slice(5, 7) - 1].v += e.amount);
      barChart(chart, arr);
    } else {
      const dim = new Date(+val.slice(0, 4), +val.slice(5, 7), 0).getDate();
      const arr = Array.from({ length: dim }, (_, i) => ({ l: (i + 1) % 5 === 1 || i === dim - 1 ? String(i + 1) : '', v: 0 }));
      list.forEach(e => arr[+e.date.slice(8, 10) - 1].v += e.amount);
      barChart(chart, arr, { noLabelVal: true });
    }
    out.append(rcard(mode === 'year' ? 'Chi phí theo tháng' : 'Chi phí theo ngày', chart));

    // theo loại
    const maxT = Math.max(...Object.values(ag.byType));
    out.append(rcard('Theo loại chi phí', Object.keys(TYPES).filter(k => ag.byType[k]).map(k =>
      hbar(TYPES[k][0] + ' ' + TYPES[k][1], ag.byType[k], maxT, TYPES[k][2], ' · ' + Math.round(ag.byType[k] / ag.total * 100) + '%'))));

    // bảng 12 tháng (năm)
    if (mode === 'year') {
      const keys = Object.keys(TYPES);
      const rows = Array.from({ length: 12 }, () => ({ t: {}, sum: 0 }));
      list.forEach(e => { const r = rows[+e.date.slice(5, 7) - 1]; r.t[e.type] = (r.t[e.type] || 0) + e.amount; r.sum += e.amount; });
      const body = rows.map((r, i) => h('tr', null, h('td', null, 'Tháng ' + (i + 1)), keys.map(k => h('td', null, r.t[k] ? fmt(r.t[k]) : '–')), h('td', null, h('b', null, r.sum ? fmt(r.sum) : '–'))));
      const foot = h('tr', null, h('td', null, 'Cả năm'), keys.map(k => h('td', null, fmt(ag.byType[k] || 0))), h('td', null, fmt(ag.total)));
      out.append(rcard('Chi tiết 12 tháng (đ)', h('div', { class: 'tblwrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, ''), keys.map(k => h('th', null, TYPES[k][1])), h('th', null, 'Tổng'))), h('tbody', null, body), h('tfoot', null, foot)))));
    }

    // theo hạng mục bảo dưỡng
    const its = Object.entries(ag.byItem).sort((a, b) => b[1] - a[1]);
    if (its.length) out.append(rcard('🔩 Chi tiết hạng mục bảo dưỡng / sửa chữa', its.slice(0, 15).map(([n, a]) => hbar(n, a, its[0][1], '#3b82f6'))));

    // theo xe
    if (scope === 'all' && S.vehicles.length > 1) {
      const per = S.vehicles.map(x => ({ x, t: list.filter(e => e.vid === x.id).reduce((s, e) => s + e.amount, 0) })).filter(r => r.t > 0).sort((a, b) => b.t - a.t);
      out.append(rcard('🚗 Theo xe', per.map(r => hbar(r.x.name, r.t, per[0].t))));
    }

    // danh sách chi tiết
    const det = h('div', { class: 'hist' });
    list.slice().reverse().forEach(e => {
      const t = TYPES[e.type] || TYPES.other, vv = S.vehicles.find(x => x.id === e.vid);
      const desc = [fmtDate(e.date), scope === 'all' && vv ? vv.name : '', e.place, e.items && e.items.length ? e.items.map(i => i.name).join(', ') : '', e.note].filter(Boolean).join(' · ');
      det.append(h('div', { class: 'item' }, h('div', { class: 'ico' }, t[0]), h('div', { class: 'mid' }, h('div', { class: 't' }, t[1]), h('div', { class: 'd' }, desc)), h('div', { class: 'amt' }, fmt(e.amount) + ' đ')));
    });
    out.append(rcard('🧾 Tất cả khoản chi trong kỳ (' + list.length + ')', det));
  }

  /* ================= XE ================= */
  let editVid = null, addingVeh = false, vImg = null;
  const VF = { vOwner: 'owner', vBrand: 'brand', vModel: 'model', vColor: 'color', vChassis: 'chassis', vEngine: 'engine', vRegDate: 'regDate' };
  const VN = { vYear: 'year', vCap: 'capacity', vSeats: 'seats' };
  function showVehForm(v) {
    show('data'); addingVeh = true; editVid = v ? v.id : null; vImg = v && v.regImg ? v.regImg : null;
    $('vehCard').classList.remove('hidden');
    $('vehTitle').textContent = v ? '✏️ Sửa xe' : '🚗 Thêm xe';
    $('vName').value = v ? v.name : ''; $('vPlate').value = v ? v.plate : ''; $('vKind').value = v ? v.kind : 'bike';
    $('vOdo').value = v ? v.odo : ''; $('vTank').value = v && v.tank ? v.tank : ''; $('vCons').value = v && v.cons ? v.cons : '';
    $('vInspect').value = v ? v.inspectExp : ''; $('vIns').value = v ? v.insExp : '';
    Object.keys(VF).forEach(id => $(id).value = v && v[VF[id]] || '');
    Object.keys(VN).forEach(id => $(id).value = v && v[VN[id]] || '');
    $('vKeep').checked = !!vImg;
    $('regStatus').className = 'status';
    $('vCancel').classList.toggle('hidden', S.vehicles.length === 0);
    $('vehCard').scrollIntoView({ block: 'start' });
  }
  function hideVehForm() { addingVeh = false; editVid = null; vImg = null; $('vehCard').classList.add('hidden'); }
  function saveVeh() {
    const name = $('vName').value.trim();
    if (!name) { toast('Nhập tên xe'); $('vName').focus(); return; }
    const data = { name, plate: $('vPlate').value.trim().toUpperCase(), kind: $('vKind').value, odo: num($('vOdo').value), tank: num($('vTank').value), cons: num($('vCons').value), inspectExp: $('vInspect').value, insExp: $('vIns').value };
    Object.keys(VF).forEach(id => data[VF[id]] = $(id).value.trim());
    data.chassis = data.chassis.toUpperCase(); data.engine = data.engine.toUpperCase();
    Object.keys(VN).forEach(id => data[VN[id]] = num($(id).value));
    data.regImg = $('vKeep').checked && vImg ? vImg : null;
    if (editVid) {
      const v = S.vehicles.find(x => x.id === editVid);
      if (v.kind !== data.kind && confirm('Bạn đổi loại xe. Thay lịch bảo dưỡng bằng bộ mặc định của loại xe mới? (Mốc lần cuối hiện tại sẽ mất)')) v.sched = LX.makeSched(data.kind);
      Object.assign(v, data);
    } else {
      const id = LX.uid();
      S.vehicles.push(Object.assign({ id, sched: LX.makeSched(data.kind), inspections: [] }, data)); S.cur = id;
    }
    save(); hideVehForm(); cancelMaint(); renderAll(); show('home'); toast('Đã lưu xe');
  }

  // kết quả quét giấy đăng ký → điền form thêm / sửa xe
  SX.applyReg = function (p, thumb) {
    const same = p.plate && S.vehicles.find(x => LX.normPlate(x.plate) === p.plate);
    if (!addingVeh) showVehForm(same || null);
    else if (same && !editVid && confirm('Xe biển số ' + same.plate + ' đã có trong app. Cập nhật thông tin cho xe "' + same.name + '"?')) showVehForm(same);
    const set = (id, val) => { if (val) $(id).value = val; };
    set('vPlate', p.plate ? (p.plate.replace(/^(\d{2}[A-Z]{1,2}\d?)(\d{3})(\d{2})$/, '$1-$2.$3').replace(/^(\d{2}[A-Z]{1,2}\d?)(\d{4})$/, '$1-$2')) : '');
    Object.keys(VF).forEach(id => set(id, p[VF[id]]));
    Object.keys(VN).forEach(id => set(id, p[VN[id]]));
    if (p.kind) $('vKind').value = p.kind;
    if (!$('vName').value.trim()) $('vName').value = [p.brand, p.model].filter(Boolean).join(' ') + (p.year ? ' ' + p.year : '');
    vImg = thumb || vImg;
    const got = [p.plate, p.brand, p.model, p.color, p.chassis, p.engine, p.year, p.owner].filter(Boolean).length;
    const st = $('regStatus'); st.className = 'status ' + (got >= 3 ? 'ok' : 'err');
    st.textContent = got >= 3
      ? 'Đã đọc được ' + got + '/8 mục chính. Hãy kiểm tra kỹ nhất là số khung, số máy và biển số vì chữ trên giấy dễ bị đọc sai, rồi bấm Lưu xe.'
      : 'Đọc được rất ít thông tin. Hãy chụp lại rõ hơn (đủ sáng, thẳng, không rung, không lóa) hoặc nhập tay bên dưới.';
    $('vName').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  /* ================= THÔNG TIN XE + ĐĂNG KIỂM ================= */
  function renderVInfo() {
    const box = $('vinfo'); box.innerHTML = ''; const v = veh();
    $('vinfoCard').classList.toggle('hidden', !v);
    if (!v) return;
    const rows = [['Tên xe', v.name], ['Biển số', v.plate], ['Chủ xe', v.owner], ['Nhãn hiệu', v.brand], ['Số loại', v.model], ['Màu sơn', v.color], ['Số khung', v.chassis], ['Số máy', v.engine],
      ['Năm sản xuất', v.year || ''], ['Dung tích', v.capacity ? v.capacity + ' cm³' : ''], ['Số chỗ ngồi', v.seats || ''], ['Đăng ký lần đầu', v.regDate ? fmtDate(v.regDate) : ''],
      ['Số km', v.odo ? fmt(v.odo) + ' km' : ''], ['Hạn đăng kiểm', v.inspectExp ? fmtDate(v.inspectExp) : ''], ['Hạn bảo hiểm TNDS', v.insExp ? fmtDate(v.insExp) : '']].filter(r => r[1]);
    box.append(h('div', { class: 'kv' }, rows.map(r => [h('span', null, r[0]), h('b', null, String(r[1]))])));
    if (!v.chassis && !v.engine) box.append(h('p', { class: 'note' }, 'Chưa có số khung / số máy. Bấm "Sửa xe này" rồi chụp giấy đăng ký để app tự điền.'));
    if (v.regImg) box.append(h('img', { class: 'thumb', src: v.regImg, alt: 'Ảnh giấy đăng ký' }));
  }

  let editIid = null, iImg = null;
  const latestExp = v => (v.inspections || []).reduce((m, i) => i.expiry && i.expiry > m ? i.expiry : m, '');
  function resetInsp() {
    editIid = null; iImg = null; const v = veh();
    ['iDate', 'iExp', 'iCert', 'iCenter', 'iCost', 'iNote'].forEach(i => $(i).value = '');
    $('iDate').value = today(); $('iOdo').value = v && v.odo ? v.odo : '';
    $('iExpense').checked = true; $('iKeep').checked = false; $('iCancel').classList.add('hidden'); $('iSave').textContent = 'Lưu đăng kiểm';
  }
  function renderInsp() {
    const v = veh(); $('inspCard').classList.toggle('hidden', !v);
    const box = $('ihist'); box.innerHTML = ''; if (!v) return;
    const d = v.inspectExp ? LX.daysUntil(v.inspectExp) : null;
    $('inspNow').textContent = v.inspectExp
      ? 'Hạn đăng kiểm hiện tại: ' + fmtDate(v.inspectExp) + (d < 0 ? ' (đã quá hạn ' + (-d) + ' ngày)' : ' (còn ' + d + ' ngày)')
      : 'Chưa có thông tin hạn đăng kiểm. Hãy chụp giấy kiểm định hoặc nhập bên dưới.';
    const rows = (v.inspections || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!rows.length) box.append(h('div', { class: 'empty' }, 'Chưa có lần đăng kiểm nào được ghi.'));
    rows.forEach(i => box.append(h('div', { class: 'item' },
      h('div', { class: 'ico' }, '📋'),
      h('div', { class: 'mid' }, h('div', { class: 't' }, 'Kiểm định ' + (i.date ? fmtDate(i.date) : '?') + ' → hết hạn ' + (i.expiry ? fmtDate(i.expiry) : '?')),
        h('div', { class: 'd' }, [i.cert && 'Seri ' + i.cert, i.center, i.odo && fmt(i.odo) + ' km', i.note].filter(Boolean).join(' · ')),
        i.img ? h('img', { class: 'thumb', src: i.img, alt: 'Ảnh giấy đăng kiểm' }) : null),
      h('div', { class: 'amt' }, i.cost ? fmt(i.cost) + ' đ' : '',
        h('div', null, h('button', { class: 'mini', onclick: () => editInsp(i.id) }, '✏️'), h('button', { class: 'mini del', onclick: () => delInsp(i.id) }, '🗑️'))))));
  }
  function editInsp(id) {
    const v = veh(), i = v && v.inspections.find(x => x.id === id); if (!i) return;
    editIid = id; iImg = i.img || null;
    $('iDate').value = i.date || ''; $('iExp').value = i.expiry || ''; $('iCert').value = i.cert || ''; $('iCenter').value = i.center || '';
    $('iCost').value = i.cost || ''; $('iOdo').value = i.odo || ''; $('iNote').value = i.note || ''; $('iKeep').checked = !!i.img; $('iExpense').checked = false;
    $('iCancel').classList.remove('hidden'); $('iSave').textContent = 'Cập nhật đăng kiểm'; $('inspCard').scrollIntoView({ block: 'start' });
  }
  function delInsp(id) {
    const v = veh(); if (!v || !confirm('Xóa lần đăng kiểm này?')) return;
    const i = v.inspections.find(x => x.id === id);
    v.inspections = v.inspections.filter(x => x.id !== id);
    if (i && i.eid) S.entries = S.entries.filter(e => e.id !== i.eid);
    v.inspectExp = latestExp(v); save(); renderAll(); toast('Đã xóa');
  }
  function saveInsp() {
    const v = veh(); if (!v) { toast('Hãy thêm xe trước'); return; }
    const date = $('iDate').value, expiry = $('iExp').value;
    if (!expiry) { toast('Nhập ngày hết hạn đăng kiểm'); $('iExp').focus(); return; }
    if (date && date > expiry) { toast('Ngày hết hạn phải sau ngày kiểm định'); return; }
    const rec = { date, expiry, cert: $('iCert').value.trim().toUpperCase(), center: $('iCenter').value.trim(), cost: num($('iCost').value), odo: num($('iOdo').value), note: $('iNote').value.trim(), img: $('iKeep').checked && iImg ? iImg : null };
    let cur = editIid ? v.inspections.find(x => x.id === editIid) : null;
    if (cur) Object.assign(cur, rec); else { cur = Object.assign({ id: LX.uid(), eid: '' }, rec); v.inspections.push(cur); }
    if ($('iExpense').checked && rec.cost > 0 && !cur.eid) {
      const eid = LX.uid(); cur.eid = eid;
      S.entries.push({ id: eid, vid: v.id, date: date || today(), type: 'fee', amount: rec.cost, odo: rec.odo, liters: 0, place: rec.center, note: 'Đăng kiểm' + (rec.cert ? ' · ' + rec.cert : ''), items: [], img: null });
    } else if (cur.eid) { const e = S.entries.find(x => x.id === cur.eid); if (e) { e.amount = rec.cost; e.date = date || e.date; e.place = rec.center; } }
    if (rec.odo > (v.odo || 0)) v.odo = rec.odo;
    v.inspectExp = latestExp(v);
    save(); resetInsp(); renderAll(); toast('Đã lưu đăng kiểm. Hạn mới: ' + fmtDate(v.inspectExp));
  }
  SX.applyInsp = function (p, thumb) {
    if (p.plate) {
      const m = S.vehicles.find(x => LX.normPlate(x.plate) === p.plate);
      if (m && m.id !== S.cur) { S.cur = m.id; save(); renderAll(); toast('Đã chuyển sang xe ' + m.name + ' theo biển số trên giấy'); }
    }
    const v = veh(); if (!v) return;
    show('data'); resetInsp(); iImg = thumb || null;
    if (p.date) $('iDate').value = p.date;
    if (p.expiry) $('iExp').value = p.expiry;
    if (p.certNo) $('iCert').value = p.certNo;
    if (p.center) $('iCenter').value = p.center;
    if (p.cost) $('iCost').value = p.cost;
    if (p.odo) $('iOdo').value = p.odo;
    // bổ sung số khung / số máy còn thiếu cho xe
    let filled = '';
    if (!v.chassis && p.chassis) { v.chassis = p.chassis; filled += ' số khung'; }
    if (!v.engine && p.engine) { v.engine = p.engine; filled += ' số máy'; }
    if (filled) { save(); renderVInfo(); }
    const st = $('inspStatus'), ok = !!p.expiry;
    st.className = 'status ' + (ok ? 'ok' : 'err');
    st.textContent = ok
      ? 'Đã đọc hạn đăng kiểm ' + fmtDate(p.expiry) + (p.date ? ', kiểm định ' + fmtDate(p.date) : '') + (filled ? '; đã bổ sung' + filled + ' cho xe' : '') + '. Hãy kiểm tra lại các ngày rồi bấm Lưu đăng kiểm.'
      : 'Không đọc được ngày hết hạn. Hãy chụp lại rõ hơn hoặc nhập tay bên dưới.';
    $('iExp').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  /* ================= SAO LƯU ================= */
  const backup = SX.backup = () => JSON.stringify({ app: 'soxe', version: 3, exportedAt: new Date().toISOString(), vehicles: S.vehicles, entries: S.entries, cur: S.cur, fav: S.fav, cams: S.cams, settings: S.settings }, null, 2);
  SX.restore = function (txt) {
    let o; try { o = JSON.parse(txt); } catch (e) { toast('File không hợp lệ'); return false; }
    if (!o || !Array.isArray(o.vehicles) || !Array.isArray(o.entries)) { toast('File không đúng định dạng Sổ Xe'); return false; }
    if (!confirm('Khôi phục sẽ thay toàn bộ dữ liệu hiện tại (' + S.vehicles.length + ' xe, ' + S.entries.length + ' khoản chi) bằng bản sao lưu (' + o.vehicles.length + ' xe, ' + o.entries.length + ' khoản chi). Tiếp tục?')) return false;
    const n = Object.assign(defaults(), { vehicles: o.vehicles, entries: o.entries, cur: o.cur, fav: o.fav || [], cams: o.cams || [], settings: Object.assign(defaults().settings, o.settings || {}) });
    n.vehicles.forEach(v => { if (!v.kind) v.kind = v.tank > 15 ? 'car' : 'bike'; if (!Array.isArray(v.sched)) v.sched = LX.makeSched(v.kind); v.inspectExp = v.inspectExp || ''; v.insExp = v.insExp || ''; if (!Array.isArray(v.inspections)) v.inspections = []; });
    n.entries.forEach(e => { e.amount = +e.amount || 0; if (!Array.isArray(e.items)) e.items = []; });
    S.vehicles = n.vehicles; S.entries = n.entries; S.fav = n.fav; S.cams = n.cams; S.settings = n.settings;
    S.cur = n.vehicles.some(v => v.id === n.cur) ? n.cur : (n.vehicles[0] ? n.vehicles[0].id : null);
    save(); hideVehForm(); renderAll(); if (SX.drive) SX.drive.loadSettings(); if (SX.map) SX.map.renderFavs(); toast('Đã khôi phục'); return true;
  };
  function download(name, text, mime) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const csvq = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  function csvOf(rows, name) {
    const out = [['Xe', 'Biển số', 'Ngày', 'Loại', 'Số tiền', 'Số lít', 'Số km', 'Nơi làm', 'Hạng mục', 'Ghi chú']];
    rows.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
      const v = S.vehicles.find(x => x.id === e.vid) || {};
      out.push([v.name, v.plate, e.date, (TYPES[e.type] || TYPES.other)[1], e.amount, e.liters || '', e.odo || '', e.place || '', (e.items || []).map(i => i.name + ' (' + i.amount + ')').join('; '), e.note || '']);
    });
    download(name, '﻿' + out.map(r => r.map(csvq).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
    toast('Đã xuất file .csv');
  }

  /* ================= nhắc việc ================= */
  function notifyDue() {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !S.settings.notif) return;
    const t = today(); if (localStorage.getItem('soxe.notified') === t) return;
    const items = [];
    S.vehicles.forEach(v => LX.alerts(v).filter(a => a.level !== 'info').forEach(a => items.push(v.name + ': ' + a.text)));
    if (!items.length) return;
    try { localStorage.setItem('soxe.notified', t); new Notification('Sổ Xe: cần chú ý', { body: items.slice(0, 4).join('\n') }); } catch (e) { /* bỏ qua */ }
  }

  /* ================= vẽ lại & khởi động ================= */
  const renderAll = SX.render = () => { renderTabs(); renderAlerts(); renderHome(); renderSched(); renderMHist(); renderVInfo(); renderInsp(); if (curView === 'report') renderReport(); $('noVeh').classList.toggle('hidden', !(['home', 'maint', 'report'].includes(curView) && !veh())); ['bEdit', 'bDel', 'bCsgt'].forEach(i => $(i).disabled = !veh()); };

  SX.init = function () {
    document.querySelectorAll('.bottom button').forEach(b => b.onclick = () => show(b.dataset.view));
    $('noVehBtn').onclick = () => showVehForm(null);
    $('period').onchange = e => { S.period = e.target.value; save(); renderHome(); };
    $('eType').onchange = onType; $('eAmt').oninput = updPrice; $('eLit').oninput = updPrice;
    $('eSave').onclick = saveEntry; $('eCancel').onclick = cancelEntry;
    $('mAddLine').onclick = () => { mLines.push({ name: '', amount: 0, sid: '' }); renderLines(); };
    $('mSave').onclick = saveMaint; $('mCancel').onclick = cancelMaint;
    $('addSched').onclick = () => {
      const v = veh(); if (!v) return;
      const name = (prompt('Tên hạng mục (ví dụ: Lọc gió điều hòa)') || '').trim(); if (!name) return;
      const km = num(prompt('Chu kỳ theo km (nhập 0 nếu không tính theo km)', '5000'));
      const mo = num(prompt('Chu kỳ theo tháng (nhập 0 nếu không tính theo tháng)', '6'));
      v.sched.push({ id: LX.uid(), key: LX.matchKey(name) || '', name, act: 'thay', km, mo, lastKm: null, lastDate: null });
      save(); renderAll();
    };
    ['rMode', 'rMonth', 'rYear', 'rScope'].forEach(id => $(id).onchange = renderReport);
    $('rCsv').onclick = () => csvOf(lastReportRows, 'bao-cao-' + today() + '.csv');
    $('rPrint').onclick = () => window.print();

    $('vSave').onclick = saveVeh; $('vCancel').onclick = () => { hideVehForm(); renderAll(); };
    $('bAdd').onclick = () => showVehForm(null);
    $('bEdit').onclick = () => { const v = veh(); if (v) showVehForm(v); };
    $('bDel').onclick = () => {
      const v = veh(); if (!v) return;
      if (!confirm('Xóa xe "' + v.name + '" và toàn bộ lịch sử chi phí của xe này?')) return;
      S.entries = S.entries.filter(e => e.vid !== v.id); S.vehicles = S.vehicles.filter(x => x.id !== v.id);
      S.cur = S.vehicles[0] ? S.vehicles[0].id : null; save(); cancelMaint(); renderAll(); toast('Đã xóa xe');
    };
    $('bCsgt').onclick = () => {
      const v = veh(); if (!v) return;
      if (v.plate && navigator.clipboard) navigator.clipboard.writeText(v.plate).then(() => toast('Đã sao chép biển số ' + v.plate), () => { });
      toast('Trên csgt.vn chọn "Tra cứu phương tiện vi phạm" rồi dán biển số');
      window.open('https://www.csgt.vn/', '_blank', 'noopener');
    };
    $('bNotif').onclick = async () => {
      if (!('Notification' in window)) { toast('Trình duyệt không hỗ trợ thông báo'); return; }
      const r = await Notification.requestPermission();
      S.settings.notif = r === 'granted'; save(); toast(r === 'granted' ? 'Đã bật: app sẽ nhắc khi bạn mở' : 'Bạn chưa cấp quyền thông báo');
      notifyDue();
    };
    $('bJson').onclick = () => { download('so-xe-' + today() + '.json', backup(), 'application/json'); toast('Đã tải file sao lưu'); };
    $('bCopy').onclick = async () => { try { await navigator.clipboard.writeText(backup()); toast('Đã sao chép bản sao lưu'); } catch (e) { prompt('Sao chép đoạn sau (Ctrl+C):', backup()); } };
    $('bOpen').onclick = () => $('fileIn').click();
    $('fileIn').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => SX.restore(r.result); r.readAsText(f); e.target.value = ''; };
    $('bCsv').onclick = () => csvOf(S.entries, 'so-xe-' + today() + '.csv');

    $('iSave').onclick = saveInsp; $('iCancel').onclick = resetInsp; resetInsp();
    cancelEntry(); cancelMaint();
    renderAll();
    if (!S.vehicles.length) showVehForm(null); else show('home');
    window.addEventListener('load', notifyDue);
    ['geo', 'scan', 'map', 'drive', 'gdrive'].forEach(m => SX[m] && SX[m].init && SX[m].init());
  };
})();
