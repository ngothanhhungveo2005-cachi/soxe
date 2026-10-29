/* Sổ Xe — chế độ lái xe: tốc độ & giới hạn, cảnh báo vượt tốc độ, camera giám sát, lệch làn (thử nghiệm), giọng nói */
(function () {
  'use strict';
  const SX = window.SX, LX = SX.LX, S = SX.S, $ = SX.$, h = SX.h, Geo = SX.Geo, Voice = SX.Voice;

  /* ---------- giới hạn tốc độ (OSM) ---------- */
  const lim = { road: null, at: 0, pos: null, busy: false };
  const effLimit = () => (S.settings.autoLimit && lim.road) ? lim.road : S.settings.limit;
  async function fetchLimit(p) {
    lim.busy = true; lim.at = Date.now(); lim.pos = { lat: p.lat, lon: p.lon };
    try {
      const j = await SX.overpass('[out:json][timeout:10];way(around:25,' + p.lat + ',' + p.lon + ')["highway"]["maxspeed"];out tags 5;');
      let v = null;
      (j.elements || []).forEach(e => { const m = String(e.tags.maxspeed || '').match(/^(\d{2,3})(?!\d)(?!\s*mph)/); if (m && v == null) v = +m[1]; });
      lim.road = v;
    } catch (e) { /* giữ giá trị cũ */ }
    lim.busy = false;
  }

  /* ---------- camera giám sát ---------- */
  const cams = { osm: [], at: 0, pos: null, busy: false, warned: {} };
  let alertAt = 0;
  const allCams = () => cams.osm.concat(S.cams.map(c => ({ id: c.id, lat: c.lat, lon: c.lon, user: true })));
  async function fetchCams(p) {
    cams.busy = true; cams.at = Date.now(); cams.pos = { lat: p.lat, lon: p.lon };
    try {
      const j = await SX.overpass('[out:json][timeout:20];(node(around:3000,' + p.lat + ',' + p.lon + ')["highway"="speed_camera"];node(around:3000,' + p.lat + ',' + p.lon + ')["enforcement"~"maxspeed|traffic_signals|average_speed|red_light"];);out 100;');
      cams.osm = (j.elements || []).filter(e => e.lat != null).map(e => ({ id: 'o' + e.id, lat: e.lat, lon: e.lon }));
      if (SX.map) SX.map.drawCams();
    } catch (e) { /* bỏ qua */ }
    cams.busy = false;
  }
  function checkCams(p, speed, heading) {
    if (!S.settings.camWarn) return;
    allCams().forEach(c => {
      const d = LX.haversine(p.lat, p.lon, c.lat, c.lon);
      if (d > 700) { delete cams.warned[c.id]; return; }
      if (cams.warned[c.id] || d > 380 || speed < 8) return;
      if (heading != null && LX.angleDiff(heading, LX.bearing(p.lat, p.lon, c.lat, c.lon)) > 65) return; // không nằm phía trước
      cams.warned[c.id] = 1; alertAt = Date.now();
      Voice.beep(1000, 200);
      const msg = 'Phía trước khoảng ' + Math.round(d / 50) * 50 + ' mét có camera giám sát. Hãy giảm tốc độ.';
      setStatus('📸 ' + msg, 'err'); Voice.say(msg);
    });
  }
  function addCam(lat, lon) {
    if (lat == null) { if (!Geo.pos) { SX.toast('Chưa có vị trí GPS. Hãy bấm "Bắt đầu theo dõi" trước.'); return; } lat = Geo.pos.lat; lon = Geo.pos.lon; }
    S.cams.push({ id: LX.uid(), lat, lon, created: SX.today() }); SX.save(); renderCamList();
    if (SX.map) SX.map.drawCams(); SX.toast('Đã lưu vị trí camera. App sẽ cảnh báo khi bạn đến gần.');
  }
  function renderCamList() {
    const box = $('camList'); box.innerHTML = '';
    if (!S.cams.length) return;
    box.append(h('div', { class: 'lbl' }, 'Camera bạn đã báo (' + S.cams.length + ')'));
    S.cams.forEach(c => box.append(h('div', { class: 'item' }, h('div', { class: 'ico' }, '📸'),
      h('div', { class: 'mid' }, h('div', { class: 'd' }, c.lat.toFixed(5) + ', ' + c.lon.toFixed(5) + (c.created ? ' · ' + LX.fmtDate(c.created) : ''))),
      h('button', { class: 'mini del', onclick: () => { S.cams = S.cams.filter(x => x.id !== c.id); SX.save(); renderCamList(); if (SX.map) SX.map.drawCams(); } }, '🗑️'))));
  }

  /* ---------- hiển thị & cảnh báo tốc độ ---------- */
  function setStatus(m, cls) { const s = $('drvStatus'); s.textContent = m; s.className = 'status' + (cls ? ' ' + cls : ''); }
  function onGeo() {
    $('drvToggle').textContent = Geo.active ? '⏹️ Dừng theo dõi' : '▶️ Bắt đầu theo dõi';
    if (!Geo.active) { $('spd').textContent = '0'; $('spdBox').classList.remove('over'); if (!Geo.pos) setStatus('Chưa bật theo dõi GPS.'); return; }
    if (!Geo.pos) { setStatus('Đang chờ tín hiệu GPS…'); return; }
    const p = Geo.pos, kmh = Geo.speed, L0 = effLimit();
    $('spd').textContent = Math.round(kmh);
    $('limitVal').textContent = L0; $('limitSrc').textContent = (S.settings.autoLimit && lim.road) ? 'theo bản đồ' : 'đặt tay';
    const over = S.settings.speedWarn && kmh > L0 + S.settings.tol;
    $('spdBox').classList.toggle('over', over);
    if (over) {
      setStatus('🚨 Bạn đang chạy quá tốc độ cho phép (' + Math.round(kmh) + '/' + L0 + ' km/h).', 'err');
      if (Voice.say('Bạn đang chạy quá tốc độ. Giới hạn ' + L0 + ' kilômét một giờ.', 'spd', 12000)) Voice.beep(700, 250);
    } else if (Date.now() - alertAt > 8000) {
      setStatus('GPS hoạt động' + (p.acc ? ' (sai số ~' + Math.round(p.acc) + ' m)' : '') + '. ' + (kmh < 3 ? 'Đang dừng.' : 'Đang di chuyển.'), 'ok');
    }
    const now = Date.now();
    if (S.settings.autoLimit && !lim.busy && kmh > 8 && now - lim.at > 20000 && (!lim.pos || LX.haversine(lim.pos.lat, lim.pos.lon, p.lat, p.lon) > 80)) fetchLimit(p);
    if (S.settings.camWarn && !cams.busy && now - cams.at > 60000 && (!cams.pos || LX.haversine(cams.pos.lat, cams.pos.lon, p.lat, p.lon) > 1500)) fetchCams(p);
    checkCams(p, kmh, Geo.heading);
  }

  /* ---------- lệch làn (thử nghiệm) ---------- */
  const Lane = {
    stream: null, timer: null, W: 320, H: 180, c0: null, ctx0: null, ref: null, hl: [], hr: [], cnt: 0, lastWarn: 0, seen: 0,
    async start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { SX.toast('Camera cần mở app qua https'); $('sLane').checked = false; return; }
      try { Lane.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 360 } }, audio: false }); }
      catch (e) { SX.toast('Không mở được camera. Hãy cấp quyền camera.'); $('sLane').checked = false; S.settings.lane = false; SX.save(); return; }
      const v = $('laneVideo'); v.srcObject = Lane.stream; await v.play().catch(() => { });
      $('laneBox').classList.remove('hidden');
      Lane.c0 = document.createElement('canvas'); Lane.c0.width = Lane.W; Lane.c0.height = Lane.H; Lane.ctx0 = Lane.c0.getContext('2d', { willReadFrequently: true });
      Lane.ref = null; Lane.hl = []; Lane.hr = []; Lane.cnt = 0; Lane.seen = 0;
      clearInterval(Lane.timer); Lane.timer = setInterval(Lane.tick, 130);
      $('laneStatus').textContent = 'Đang tìm vạch kẻ đường… Hãy đi giữa làn vài giây để app tự hiệu chuẩn.';
    },
    stop() {
      clearInterval(Lane.timer); Lane.timer = null;
      if (Lane.stream) Lane.stream.getTracks().forEach(t => t.stop()); Lane.stream = null;
      $('laneVideo').srcObject = null; $('laneBox').classList.add('hidden');
    },
    // vị trí vạch gần tâm nhất mỗi bên, dựa trên điểm ảnh sáng/vàng trong vùng mặt đường
    scan() {
      const { W, H } = Lane, y0 = Math.floor(H * 0.58), y1 = Math.floor(H * 0.9), cx = W / 2;
      Lane.ctx0.drawImage($('laneVideo'), 0, 0, W, H);
      const data = Lane.ctx0.getImageData(0, y0, W, y1 - y0).data, rows = y1 - y0;
      const L = [], R = [], row = new Float32Array(W);
      for (let y = 0; y < rows; y += 3) {
        let sum = 0, sq = 0;
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
          let lu = 0.299 * r + 0.587 * g + 0.114 * b;
          if (r > 150 && g > 120 && b < 110) lu = Math.max(lu, 200); // vạch vàng
          row[x] = lu; sum += lu; sq += lu * lu;
        }
        const mean = sum / W, sd = Math.sqrt(Math.max(0, sq / W - mean * mean)), thr = Math.max(mean + Math.max(35, 1.2 * sd), 140);
        let bestL = null, bestR = null, x = 0;
        while (x < W) {
          if (row[x] > thr) {
            let e = x; while (e < W && row[e] > thr) e++;
            const len = e - x, c = (x + e) / 2;
            if (len >= 2 && len <= 26 && Math.abs(c - cx) < W * 0.42) {
              if (c < cx - 4 && (bestL == null || c > bestL)) bestL = c;
              if (c > cx + 4 && (bestR == null || c < bestR)) bestR = c;
            }
            x = e;
          } else x++;
        }
        if (bestL != null) L.push(bestL); if (bestR != null) R.push(bestR);
      }
      const med = a => { if (a.length < 3) return null; const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
      return { xl: med(L), xr: med(R), cx, y0, y1 };
    },
    tick() {
      const v = $('laneVideo'); if (!v.videoWidth) return;
      const s = Lane.scan(), cx = s.cx;
      // làm mượt: nhớ vài khung hình gần nhất để chịu được vạch đứt nét
      Lane.hl.push(s.xl); Lane.hr.push(s.xr); if (Lane.hl.length > 6) { Lane.hl.shift(); Lane.hr.shift(); }
      const avg = a => { const b = a.filter(x => x != null); return b.length >= 2 ? b.reduce((p, q) => p + q, 0) / b.length : null; };
      const xl = avg(Lane.hl), xr = avg(Lane.hr);
      const dL = xl != null ? cx - xl : null, dR = xr != null ? xr - cx : null;
      // tự hiệu chuẩn sau ~3 giây thấy đủ hai vạch
      if (!Lane.ref && dL != null && dR != null) { Lane.seen++; if (Lane.seen > 22) Lane.calib(dL, dR); } else if (!Lane.ref) Lane.seen = Math.max(0, Lane.seen - 1);
      Lane.draw(s, xl, xr);
      let drift = 0;
      if (Lane.ref) {
        if (dL != null && dL < Lane.ref.dL * 0.55) drift = -1;       // vạch trái áp sát tâm → đang lệch sang trái
        else if (dR != null && dR < Lane.ref.dR * 0.55) drift = 1;    // lệch sang phải
      }
      const moving = !Geo.active || Geo.speed >= 25;
      Lane.cnt = drift && moving ? Lane.cnt + 1 : 0;
      const st = $('laneStatus');
      if (!Lane.ref) st.textContent = 'Đang hiệu chuẩn… (' + (xl != null ? 'thấy vạch trái ' : '') + (xr != null ? 'thấy vạch phải' : '') + (xl == null && xr == null ? 'chưa thấy vạch' : '') + ')';
      else st.textContent = (dL != null || dR != null ? 'Đã nhận vạch ' + (dL != null && dR != null ? 'hai bên' : dL != null ? 'bên trái' : 'bên phải') + '. ' : 'Chưa thấy vạch. ') + (moving ? 'Đang giám sát.' : 'Tạm dừng khi xe chạy chậm (<25 km/h).');
      if (Lane.cnt >= 5 && Date.now() - Lane.lastWarn > 6000) {
        Lane.lastWarn = Date.now(); Lane.cnt = 0;
        Voice.beep(600, 300); Voice.say('Bạn đang lệch sang làn ' + (drift < 0 ? 'trái' : 'phải') + '. Hãy giữ làn.');
        st.textContent = '⚠️ Lệch sang ' + (drift < 0 ? 'trái' : 'phải'); st.className = 'status err'; setTimeout(() => { st.className = 'status'; }, 3000);
      }
    },
    calib(dL, dR) {
      if (dL == null || dR == null) { SX.toast('Chưa thấy đủ hai vạch kẻ đường để hiệu chuẩn'); return; }
      Lane.ref = { dL, dR }; SX.toast('Đã hiệu chuẩn vị trí giữa làn');
    },
    draw(s, xl, xr) {
      const c = $('laneCanvas'), v = $('laneVideo'); c.width = v.clientWidth || 320; c.height = v.clientHeight || 180;
      const g = c.getContext('2d'), k = c.width / Lane.W, ky = c.height / Lane.H;
      g.clearRect(0, 0, c.width, c.height);
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1; g.strokeRect(0, s.y0 * ky, c.width, (s.y1 - s.y0) * ky);
      g.lineWidth = 3;
      if (xl != null) { g.strokeStyle = '#4cf'; g.beginPath(); g.moveTo(xl * k, s.y0 * ky); g.lineTo(xl * k, s.y1 * ky); g.stroke(); }
      if (xr != null) { g.strokeStyle = '#fc4'; g.beginPath(); g.moveTo(xr * k, s.y0 * ky); g.lineTo(xr * k, s.y1 * ky); g.stroke(); }
      g.strokeStyle = '#4f4'; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(c.width / 2, s.y0 * ky); g.lineTo(c.width / 2, s.y1 * ky); g.stroke(); g.setLineDash([]);
    },
    calibNow() {
      const s = Lane.scan(); const avg = a => { const b = a.filter(x => x != null); return b.length >= 2 ? b.reduce((p, q) => p + q, 0) / b.length : null; };
      const xl = avg(Lane.hl.concat([s.xl])), xr = avg(Lane.hr.concat([s.xr]));
      Lane.calib(xl != null ? s.cx - xl : null, xr != null ? xr - s.cx : null);
    }
  };

  /* ---------- cài đặt ---------- */
  function loadSettings() {
    const s = S.settings;
    $('sVoice').checked = s.voice; $('sSpeed').checked = s.speedWarn; $('sAuto').checked = s.autoLimit; $('sCam').checked = s.camWarn; $('sLane').checked = s.lane;
    $('sLimit').value = s.limit; $('sTol').value = s.tol; $('limitVal').textContent = effLimit();
  }
  function bindSettings() {
    const chk = (id, key) => $(id).onchange = e => { S.settings[key] = e.target.checked; SX.save(); if (key === 'autoLimit') { lim.road = null; lim.at = 0; } onGeo(); };
    chk('sVoice', 'voice'); chk('sSpeed', 'speedWarn'); chk('sAuto', 'autoLimit'); chk('sCam', 'camWarn');
    $('sLimit').onchange = e => { S.settings.limit = Math.max(10, Math.min(150, +e.target.value || 50)); e.target.value = S.settings.limit; SX.save(); onGeo(); };
    $('sTol').onchange = e => { S.settings.tol = Math.max(0, Math.min(30, +e.target.value || 0)); e.target.value = S.settings.tol; SX.save(); };
    $('sLane').onchange = e => { S.settings.lane = e.target.checked; SX.save(); if (e.target.checked) Lane.start(); else Lane.stop(); };
  }

  SX.drive = {
    init() {
      bindSettings(); loadSettings(); renderCamList();
      $('drvToggle').onclick = async () => {
        if (Geo.active) { Geo.stop(); setStatus('Đã dừng theo dõi.'); return; }
        setStatus('Đang chờ tín hiệu GPS…'); await Geo.start();
        Voice.say('Đã bật theo dõi tốc độ', 'start', 0);
      };
      $('testVoice').onclick = () => { if (!S.settings.voice) { SX.toast('Giọng nói đang tắt trong cài đặt'); return; } Voice.say('Xin chào. Giọng nói tiếng Việt đang hoạt động.'); Voice.beep(800, 200); };
      $('camAdd').onclick = () => addCam();
      $('laneCalib').onclick = () => Lane.calibNow();
      Geo.on(onGeo); onGeo();
    },
    onShow() { loadSettings(); renderCamList(); if (S.settings.lane && !Lane.stream) Lane.start(); },
    loadSettings, addCam, allCams, Lane
  };
})();
