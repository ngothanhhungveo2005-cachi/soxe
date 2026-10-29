/* Sổ Xe — logic thuần (không đụng DOM), chạy được cả trong trình duyệt lẫn Node để kiểm thử */
(function (root) {
  'use strict';
  const L = {};

  /* ---------- tiện ích chung ---------- */
  const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  L.fold = fold;
  L.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  L.fmt = n => Math.round(n || 0).toLocaleString('vi-VN');
  const p2 = n => String(n).padStart(2, '0');
  L.p2 = p2;
  L.fmtDate = d => { if (!d) return ''; const a = String(d).split('-'); return a.length === 3 ? a[2] + '/' + a[1] + '/' + a[0] : d; };
  L.normPlate = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const DAY = 864e5;
  L.daysUntil = (dateStr, now) => {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d)) return null;
    const t = new Date(now == null ? Date.now() : now);
    const t0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((d - t0) / DAY);
  };

  /* ---------- lịch bảo dưỡng mặc định ---------- */
  // [key, tên, hành động, km, tháng]  (km/tháng = 0 nghĩa là không tính theo đại lượng đó)
  L.PRESETS = {
    bike: [
      ['oil', 'Nhớt máy', 'thay', 2000, 3],
      ['gearoil', 'Nhớt hộp số / láp', 'thay', 8000, 12],
      ['airfilter', 'Lọc gió', 'thay', 12000, 12],
      ['spark', 'Bugi', 'thay', 10000, 24],
      ['brakepad', 'Má phanh', 'kiểm tra', 5000, 6],
      ['brakefluid', 'Dầu phanh', 'thay', 0, 24],
      ['belt', 'Dây curoa / nhông sên dĩa', 'kiểm tra', 10000, 12],
      ['tire', 'Lốp xe', 'kiểm tra', 10000, 12],
      ['battery', 'Ắc quy', 'kiểm tra', 0, 24],
      ['coolant', 'Nước làm mát', 'thay', 0, 24]
    ],
    car: [
      ['oil', 'Nhớt máy', 'thay', 5000, 6],
      ['oilfilter', 'Lọc nhớt', 'thay', 5000, 6],
      ['airfilter', 'Lọc gió động cơ', 'thay', 15000, 12],
      ['cabin', 'Lọc gió điều hòa', 'thay', 15000, 12],
      ['fuelfilter', 'Lọc nhiên liệu', 'thay', 20000, 24],
      ['spark', 'Bugi', 'thay', 40000, 36],
      ['brakepad', 'Má phanh', 'kiểm tra', 15000, 12],
      ['brakefluid', 'Dầu phanh', 'thay', 40000, 24],
      ['coolant', 'Nước làm mát', 'thay', 40000, 24],
      ['gearoil', 'Dầu hộp số', 'thay', 40000, 36],
      ['battery', 'Ắc quy', 'kiểm tra', 0, 24],
      ['tire', 'Lốp xe', 'kiểm tra', 10000, 12],
      ['rotate', 'Đảo lốp', 'thực hiện', 10000, 6]
    ]
  };
  L.makeSched = kind => (L.PRESETS[kind] || L.PRESETS.bike).map(p => ({
    id: L.uid(), key: p[0], name: p[1], act: p[2], km: p[3], mo: p[4], lastKm: null, lastDate: null
  }));

  /* ---------- trạng thái hạng mục ---------- */
  L.itemStatus = function (it, odo, now) {
    now = now == null ? Date.now() : now;
    const hasKmBase = Number.isFinite(it.lastKm);
    const hasDate = !!it.lastDate;
    if (!hasKmBase && !hasDate) return { state: 'unknown', pct: 0 };
    let pk = 0, pm = 0, usedKm = null, usedMo = null, leftKm = null, leftDays = null;
    if (it.km > 0 && hasKmBase) {
      usedKm = Math.max(0, (odo || 0) - it.lastKm);
      pk = usedKm / it.km;
      leftKm = it.km - usedKm;
    }
    if (it.mo > 0 && hasDate) {
      const d = new Date(it.lastDate + 'T00:00:00');
      const ms = now - d;
      usedMo = ms / (30.4375 * DAY);
      pm = usedMo / it.mo;
      leftDays = Math.round(it.mo * 30.4375 - ms / DAY);
    }
    if (usedKm == null && usedMo == null) return { state: 'unknown', pct: 0 };
    const pct = Math.max(pk, pm);
    const state = pct >= 1 ? 'over' : pct >= 0.85 ? 'soon' : 'ok';
    return { state, pct, usedKm, usedMo, leftKm, leftDays };
  };

  function detail(it, st) {
    const parts = [];
    if (st.usedKm != null) parts.push('đã chạy ' + L.fmt(st.usedKm) + '/' + L.fmt(it.km) + ' km');
    if (st.usedMo != null) parts.push(Math.round(st.usedMo * 30.4375) + ' ngày/' + it.mo + ' tháng');
    return parts.join(', ');
  }
  L.itemDetail = detail;

  /* ---------- cảnh báo tổng hợp ---------- */
  L.alerts = function (v, now) {
    now = now == null ? Date.now() : now;
    const out = [];
    (v.sched || []).forEach(it => {
      const st = L.itemStatus(it, v.odo || 0, now);
      if (st.state === 'over') out.push({ level: 'red', cat: 'maint', id: it.id, text: it.name + ': quá hạn ' + it.act + ' (' + detail(it, st) + ')' });
      else if (st.state === 'soon') out.push({ level: 'amber', cat: 'maint', id: it.id, text: it.name + ': sắp đến hạn ' + it.act + ' (' + detail(it, st) + ')' });
      else if (st.state === 'unknown') out.push({ level: 'info', cat: 'maint', id: it.id, text: it.name + ': chưa có mốc bảo dưỡng gần nhất' });
    });
    [['inspectExp', 'Đăng kiểm'], ['insExp', 'Bảo hiểm TNDS']].forEach(([k, label]) => {
      const d = L.daysUntil(v[k], now);
      if (d == null) {
        if (k === 'inspectExp' && v.kind === 'car') out.push({ level: 'info', cat: 'reg', text: 'Chưa nhập hạn đăng kiểm' });
      } else if (d < 0) out.push({ level: 'red', cat: 'reg', text: label + ' đã quá hạn ' + (-d) + ' ngày (hết hạn ' + L.fmtDate(v[k]) + ')' });
      else if (d <= 30) out.push({ level: 'amber', cat: 'reg', text: label + ' còn ' + d + ' ngày (hết hạn ' + L.fmtDate(v[k]) + ')' });
    });
    const rank = { red: 0, amber: 1, info: 2 };
    return out.sort((a, b) => rank[a.level] - rank[b.level]);
  };

  /* ---------- nhận diện hạng mục từ tên ---------- */
  const KEYS = [
    ['oilfilter', /loc nhot|loc dau/],
    ['cabin', /loc (gio )?(dieu hoa|may lanh|cabin)|loc gio dh/],
    ['airfilter', /loc gio|loc khong khi/],
    ['fuelfilter', /loc xang|loc nhien lieu|loc diesel/],
    ['gearoil', /nhot (hop so|lock|lap|can bang)|dau (hop so|cau|lap)|nhot hs/],
    ['brakefluid', /dau (phanh|thang)/],
    ['coolant', /nuoc (mat|lam mat)|dung dich lam mat|coolant/],
    ['spark', /bugi|buji|\bbu gi\b/],
    ['brakepad', /ma phanh|bo thang|bo phanh|\bheo\b/],
    ['battery', /ac quy|acquy|binh dien/],
    ['rotate', /dao lop|can bang lop/],
    ['tire', /\blop\b|vo xe|\bsam\b/],
    ['belt', /day cu ?roa|curoa|dai truyen|nhong|sen dia|\bxich\b|day dai/],
    ['oil', /nhot|dau may|dau nhon|dau dong co|\boil\b/]
  ];
  L.matchKey = name => {
    const f = fold(name);
    for (const [k, re] of KEYS) if (re.test(f)) return k;
    return null;
  };

  /* ---------- đọc phiếu bảo dưỡng từ văn bản OCR ---------- */
  const MONEY = /\d{1,3}(?:[.,]\d{3})+(?!\d)|\d{4,}/g;
  const moneyVals = line => (line.match(MONEY) || []).map(t => parseInt(t.replace(/\D/g, ''), 10))
    .filter(v => v >= 1000 && v <= 99999999);

  L.parseInvoice = function (text) {
    const lines = String(text || '').split(/\r?\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const res = { date: null, odo: 0, total: 0, plate: null, items: [] };

    // ngày
    const ftext = fold(text);
    let dm = ftext.match(/ngay\s*(\d{1,2})\s*thang\s*(\d{1,2})\s*nam\s*(\d{4})/);
    if (dm) res.date = dm[3] + '-' + p2(+dm[2]) + '-' + p2(+dm[1]);
    if (!res.date) {
      for (const ln of lines) {
        const m = ln.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4}|\d{2})\b/);
        if (!m) continue;
        let d = +m[1], mo = +m[2], y = +m[3];
        if (y < 100) y += 2000;
        if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100) { res.date = y + '-' + p2(mo) + '-' + p2(d); break; }
      }
    }

    // biển số
    const up = fold(text).toUpperCase();
    const pm = up.match(/\b(\d{2}[A-Z]{1,2}\d?)[\s\-.]{0,2}(\d{3}[\s.]?\d{2}|\d{4,5})\b/);
    if (pm) res.plate = L.normPlate(pm[1] + pm[2]);

    // số km
    const toKm = s => parseInt(String(s).replace(/\D/g, ''), 10);
    for (const ln of lines) {
      const f = fold(ln);
      let m = f.match(/(?:so km|odo|km hien tai|cong to met|ctm|km di duoc)\D{0,12}(\d{1,3}(?:[.,]\d{3})+|\d{3,7})/) ||
        f.match(/(\d{1,3}(?:[.,]\d{3})+|\d{3,7})\s*km\b/);
      if (m) {
        const v = toKm(m[1]);
        if (v >= 100 && v <= 999999) { res.odo = v; break; }
      }
    }

    // tổng tiền & các dòng hàng
    const TOTAL = /(tong|thanh toan|thanh tien|cong tien|total|phai tra|can thanh toan)/;
    const SKIP = /(tien mat|chuyen khoan|dien thoai|\bsdt\b|hotline|dia chi|bien so|\bngay\b|khach|cam on|\bmst\b|ma so thue|so hd|hoa don|phieu|\bvat\b|thue|giam gia|chiet khau|so km|\bodo\b|km hien tai|cong to met)/;
    const seen = new Set();
    let totalCand = 0;
    lines.forEach(ln => {
      const f = fold(ln);
      const vals = moneyVals(ln);
      if (!vals.length) return;
      if (TOTAL.test(f)) { totalCand = Math.max(totalCand, ...vals); return; }
      if (SKIP.test(f)) return;
      const name = ln.replace(MONEY, ' ').replace(/[|_=~\[\]{}<>]/g, ' ')
        .replace(/^\s*\d+\s*[.)\-]?\s+/, '').replace(/\s+[xX*]\s*\d*\s*$/, '').replace(/\s+\d{1,2}(\s+[xX*])?\s*$/, '')
        .replace(/\s+/g, ' ').trim();
      if (!/[A-Za-zÀ-ỹ]{2}/.test(name)) return;
      const amount = vals[vals.length - 1];
      const k = fold(name) + '|' + amount;
      if (seen.has(k)) return;
      seen.add(k);
      res.items.push({ name, amount, key: L.matchKey(name) });
    });
    const sum = res.items.reduce((s, i) => s + i.amount, 0);
    res.total = totalCand || sum;
    return res;
  };

  /* ---------- đọc giấy đăng ký xe / giấy chứng nhận kiểm định ---------- */
  const toISO = (d, m, y) => {
    d = +d; m = +m; y = +y; if (y < 100) y += 2000;
    return d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1980 && y <= 2100 ? y + '-' + p2(m) + '-' + p2(d) : null;
  };
  const allDates = str => {
    const out = [], re = /(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4}|\d{2})\b/g; let m;
    while ((m = re.exec(str))) { const iso = toISO(m[1], m[2], m[3]); if (iso) out.push(iso); }
    return out;
  };
  const monthYearEnd = str => { // "11/2027" → ngày cuối tháng
    const m = String(str).match(/(?:^|\D)(\d{1,2})\s*[\/\-.]\s*(20\d{2})(?!\d)/);
    if (!m || +m[1] < 1 || +m[1] > 12) return null;
    return m[2] + '-' + p2(+m[1]) + '-' + p2(new Date(+m[2], +m[1], 0).getDate());
  };
  const titleCase = v => v !== v.toUpperCase() ? v : v.toLowerCase().replace(/(^|[\s\-])(\S)/g, (m, a, b) => a + b.toUpperCase());
  const cleanText = v => String(v || '').replace(/[|_=~\[\]{}<>]/g, ' ').replace(/\s+/g, ' ').trim();
  const KNOWN_LABEL = /(so may|so khung|nhan hieu|mau son|chu xe|loai xe|dung tich|nam san xuat|bien so|so loai|dang ky lan dau|so cho|seri|hieu luc|ngay kiem dinh|trung tam|don vi)/;

  // giá trị của một nhãn: ưu tiên phần sau dấu ":" cuối cùng; nếu trống thì lấy dòng kế tiếp
  function valueAfter(lines, i, re) {
    const raw = lines[i], f = fold(raw), m = re.exec(f);
    if (!m) return null;
    const after = raw.slice(m.index + m[0].length);
    const ci = after.lastIndexOf(':');
    let v = ci >= 0 ? after.slice(ci + 1) : after.replace(/^[\s\/\-|.()]*(?:[A-Za-z .°'N]{0,28}[\/|)]\s*)?/, '');
    v = v.replace(/^[\s:|\-_]+/, '').trim();
    if (v.length < 2 && lines[i + 1] && !KNOWN_LABEL.test(fold(lines[i + 1]))) v = lines[i + 1].trim();
    return v;
  }
  function firstField(lines, re) {
    for (let i = 0; i < lines.length; i++) if (re.test(fold(lines[i]))) { const v = valueAfter(lines, i, re); if (v) return v; }
    return '';
  }
  const PLATE_RE = /\b(\d{2}[A-Z]{1,2}\d?)[\s\-.]{0,2}(\d{3}[\s.]?\d{2}|\d{4,5})\b/;
  const findPlate = text => { const m = fold(text).toUpperCase().match(PLATE_RE); return m ? L.normPlate(m[1] + m[2]) : ''; };
  const cleanChassis = v => { let c = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length === 17) c = c.replace(/[OQ]/g, '0').replace(/I/g, '1'); return c.length >= 8 && c.length <= 20 && /\d/.test(c) ? c : ''; };
  const cleanEngine = v => { const c = String(v || '').toUpperCase().replace(/[^A-Z0-9\-]/g, ''); return c.length >= 6 && c.length <= 24 && /\d/.test(c) ? c : ''; };
  const odoFrom = lines => {
    for (const ln of lines) {
      const f = fold(ln);
      const m = f.match(/(?:so km|odo|km hien tai|cong to met|ctm|km di duoc|km da di)\D{0,14}(\d{1,3}(?:[.,]\d{3})+|\d{3,7})/) || f.match(/(\d{1,3}(?:[.,]\d{3})+|\d{3,7})\s*km\b/);
      if (m) { const v = parseInt(m[1].replace(/\D/g, ''), 10); if (v >= 100 && v <= 999999) return v; }
    }
    return 0;
  };
  const splitLines = text => String(text || '').split(/\r?\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

  L.parseRegistration = function (text) {
    const lines = splitLines(text);
    const res = { plate: '', brand: '', model: '', type: '', color: '', engine: '', chassis: '', capacity: 0, year: 0, seats: 0, owner: '', regDate: '', kind: '' };
    res.plate = findPlate(text);
    res.brand = titleCase(cleanText(firstField(lines, /nhan hieu|\bbrand\b|hieu xe/)).slice(0, 30));
    const model = cleanText(firstField(lines, /so loai|model code|\bmodel\b/)).slice(0, 30);
    res.model = /[\d\-]/.test(model) ? model : titleCase(model);
    res.type = cleanText(firstField(lines, /loai xe|\btype\b/)).slice(0, 40);
    res.color = titleCase(cleanText(firstField(lines, /mau son|\bcolou?r\b/)).slice(0, 24));
    res.engine = cleanEngine(firstField(lines, /so may|engine/));
    res.chassis = cleanChassis(firstField(lines, /so khung|chassis|\bvin\b/));
    const cap = firstField(lines, /dung tich|cylinder/).match(/(\d{2,4})(?:[.,]\d+)?/); res.capacity = cap ? +cap[1] : 0;
    const yr = firstField(lines, /nam san xuat|year of manufacture|nam sx/).match(/(19|20)\d{2}/); res.year = yr ? +yr[0] : 0;
    const st = firstField(lines, /so cho|seat|cho ngoi/).match(/\d{1,2}/); res.seats = st ? +st[0] : 0;
    res.owner = titleCase(cleanText(firstField(lines, /chu xe|\bowner\b|ten chu/)).replace(/\(.*?\)/g, '').slice(0, 60));
    const rd = firstField(lines, /dang ky lan dau|first registered|ngay dang ky|date of first/); res.regDate = (allDates(rd)[0]) || '';
    const t = fold(res.type);
    if (/mo to|xe may|2 banh|hai banh/.test(t)) res.kind = 'bike';
    else if (/o to|oto|con\b|tai\b|khach|ban tai|\bpick/.test(t) || res.seats >= 4) res.kind = 'car';
    else if (res.capacity > 0 && res.capacity <= 175 && res.seats <= 2) res.kind = 'bike';
    return res;
  };

  L.parseInspection = function (text) {
    const lines = splitLines(text);
    const res = { plate: findPlate(text), date: '', expiry: '', certNo: '', center: '', cost: 0, odo: odoFrom(lines), chassis: '', engine: '' };
    res.chassis = cleanChassis(firstField(lines, /so khung|chassis|\bvin\b/));
    res.engine = cleanEngine(firstField(lines, /so may|engine/));
    const DATE_L = /ngay kiem dinh|date of inspection|inspection date|kiem dinh ngay|ngay kd/;
    const EXP_L = /hieu luc|valid until|het han|han den|expir|co gia tri den/;
    lines.forEach((ln, i) => {
      const f = fold(ln), isD = DATE_L.test(f), isE = EXP_L.test(f);
      if (!isD && !isE) return;
      let ds = allDates(ln); if (!ds.length && !monthYearEnd(ln) && lines[i + 1]) ds = allDates(lines[i + 1]);
      ds = ds.slice().sort();
      if (isE) {
        const exp = ds.length ? ds[ds.length - 1] : (monthYearEnd(ln) || (lines[i + 1] ? monthYearEnd(lines[i + 1]) : null));
        if (exp && !res.expiry) res.expiry = exp;
        if (ds.length > 1 && !res.date) res.date = ds[0];
      }
      if (isD && ds.length && !res.date) res.date = ds[0];
    });
    if ((!res.date || !res.expiry)) { // không có nhãn rõ ràng: sớm nhất = ngày kiểm định, muộn nhất = hết hạn
      const all = allDates(text).sort();
      if (all.length >= 2) { if (!res.date) res.date = all[0]; if (!res.expiry) res.expiry = all[all.length - 1]; }
    }
    const seri = firstField(lines, /so seri|serial|so giay chung nhan|\bseri\b/);
    const cn = String(seri).toUpperCase().replace(/[^A-Z0-9\-\/]/g, ''); res.certNo = cn.length >= 5 && cn.length <= 24 ? cn : '';
    res.center = cleanText(firstField(lines, /trung tam|don vi kiem dinh|co so dang kiem|inspection (center|station)|tram dang kiem/)).slice(0, 80);
    lines.forEach(ln => { if (/\bphi\b|le phi|\bfee\b|tong tien|thanh tien/.test(fold(ln))) res.cost = Math.max(res.cost, ...moneyVals(ln), 0); });
    return res;
  };

  /* ---------- tổng hợp báo cáo ---------- */
  L.kmSpan = list => {
    const by = {};
    list.forEach(e => {
      if (!(e.odo > 0)) return;
      const b = by[e.vid] || (by[e.vid] = { min: Infinity, max: -Infinity });
      b.min = Math.min(b.min, e.odo); b.max = Math.max(b.max, e.odo);
    });
    return Object.values(by).reduce((s, b) => s + (b.max > b.min ? b.max - b.min : 0), 0);
  };
  L.aggregate = list => {
    const byType = {}, byItem = {};
    let total = 0;
    list.forEach(e => {
      total += e.amount;
      byType[e.type] = (byType[e.type] || 0) + e.amount;
      (e.items || []).forEach(i => {
        const n = (i.name || '(không tên)').trim();
        byItem[n] = (byItem[n] || 0) + (i.amount || 0);
      });
    });
    return { total, count: list.length, byType, byItem, km: L.kmSpan(list) };
  };

  /* ---------- hình học / bản đồ ---------- */
  const R = 6371000, rad = x => x * Math.PI / 180, deg = x => x * 180 / Math.PI;
  L.haversine = (a1, o1, a2, o2) => {
    const dLat = rad(a2 - a1), dLon = rad(o2 - o1);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a1)) * Math.cos(rad(a2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  };
  L.bearing = (a1, o1, a2, o2) => {
    const y = Math.sin(rad(o2 - o1)) * Math.cos(rad(a2));
    const x = Math.cos(rad(a1)) * Math.sin(rad(a2)) - Math.sin(rad(a1)) * Math.cos(rad(a2)) * Math.cos(rad(o2 - o1));
    return (deg(Math.atan2(y, x)) + 360) % 360;
  };
  L.angleDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  L.fmtDist = m => m < 1000 ? (Math.max(10, Math.round(m / 10) * 10)) + ' mét' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
  // coords: [[lon,lat],...]
  L.distToPolyline = (p, coords) => {
    const kx = 111320 * Math.cos(rad(p.lat)), ky = 110540;
    let best = Infinity, bi = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const ax = (coords[i][0] - p.lon) * kx, ay = (coords[i][1] - p.lat) * ky;
      const bx = (coords[i + 1][0] - p.lon) * kx, by = (coords[i + 1][1] - p.lat) * ky;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let t = l2 ? -(ax * dx + ay * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < best) { best = d; bi = i; }
    }
    return { dist: best, idx: bi };
  };

  const MOD = { left: 'trái', right: 'phải', 'slight left': 'nhẹ sang trái', 'slight right': 'nhẹ sang phải', 'sharp left': 'gấp sang trái', 'sharp right': 'gấp sang phải' };
  L.instruction = step => {
    const m = step.maneuver || {}, t = m.type, mod = m.modifier;
    const on = step.name ? ' vào ' + step.name : '';
    switch (t) {
      case 'depart': return 'Bắt đầu đi' + (step.name ? ' trên ' + step.name : '');
      case 'arrive': return 'Bạn đã đến nơi';
      case 'roundabout': case 'rotary': case 'roundabout turn':
        return 'Vào vòng xuyến' + (m.exit ? ', ra lối thứ ' + m.exit : '') + on;
      case 'merge': return 'Nhập làn' + on;
      case 'fork': return 'Giữ bên ' + (mod && mod.indexOf('left') >= 0 ? 'trái' : 'phải') + ' ở ngã ba' + on;
      case 'on ramp': return 'Đi theo lối vào' + on;
      case 'off ramp': return 'Đi theo lối ra' + on;
      case 'continue': case 'new name': return 'Tiếp tục đi thẳng' + on;
      default:
        if (mod === 'uturn') return 'Quay đầu xe';
        if (!mod || mod === 'straight') return 'Đi thẳng' + on;
        return 'Rẽ ' + (MOD[mod] || mod) + on;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  root.LX = L;
})(typeof window !== 'undefined' ? window : globalThis);
