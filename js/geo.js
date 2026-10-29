/* Sổ Xe — dùng chung cho bản đồ và lái xe: GPS, giọng nói, Overpass (OSM), nhận lệnh giọng nói */
(function () {
  'use strict';
  const SX = window.SX, LX = SX.LX, S = SX.S;

  /* ---------- giọng nói ---------- */
  const Voice = SX.Voice = {
    voices: [], t: {}, ctx: null,
    init() {
      if (!('speechSynthesis' in window)) return;
      const f = () => { Voice.voices = speechSynthesis.getVoices(); };
      f(); speechSynthesis.onvoiceschanged = f;
    },
    say(text, key, gapMs) {
      if (!S.settings.voice || !('speechSynthesis' in window)) return false;
      const now = Date.now();
      if (key) { if (now - (Voice.t[key] || 0) < (gapMs || 0)) return false; Voice.t[key] = now; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'vi-VN';
      const v = Voice.voices.find(x => /^vi/i.test(x.lang)); if (v) u.voice = v;
      u.rate = 1; speechSynthesis.cancel(); speechSynthesis.speak(u); return true;
    },
    beep(freq, ms) {
      if (!S.settings.voice) return;
      try {
        const C = window.AudioContext || window.webkitAudioContext; if (!Voice.ctx) Voice.ctx = new C();
        const o = Voice.ctx.createOscillator(), g = Voice.ctx.createGain();
        o.frequency.value = freq || 880; g.gain.value = 0.2; o.connect(g); g.connect(Voice.ctx.destination);
        o.start(); o.stop(Voice.ctx.currentTime + (ms || 180) / 1000);
      } catch (e) { /* bỏ qua */ }
    }
  };

  /* nhận lệnh giọng nói (tiếng Việt) */
  SX.listen = function (onText) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { SX.toast('Trình duyệt này chưa hỗ trợ nhận giọng nói (hãy dùng Chrome)'); return; }
    const r = new SR(); r.lang = 'vi-VN'; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = e => { const t = e.results[0][0].transcript; if (t) onText(t); };
    r.onerror = () => SX.toast('Không nghe được, hãy thử lại');
    SX.toast('Đang nghe…'); try { r.start(); } catch (e) { /* đang chạy */ }
  };

  /* ---------- GPS ---------- */
  const Geo = SX.Geo = {
    watchId: null, pos: null, speed: 0, heading: null, last: null, active: false, fn: [], lock: null,
    on(f) { Geo.fn.push(f); },
    async start() {
      if (Geo.watchId != null) return true;
      if (!navigator.geolocation) { SX.toast('Thiết bị không hỗ trợ GPS'); return false; }
      Geo.watchId = navigator.geolocation.watchPosition(Geo.onPos, err => {
        SX.toast(err.code === 1 ? 'Bạn chưa cấp quyền vị trí cho trang này' : 'Không lấy được vị trí GPS');
        if (err.code === 1) Geo.stop();
      }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
      Geo.active = true; Geo.wake(); Geo.fn.forEach(f => f(Geo)); return true;
    },
    stop() {
      if (Geo.watchId != null) navigator.geolocation.clearWatch(Geo.watchId);
      Geo.watchId = null; Geo.active = false; Geo.speed = 0;
      if (Geo.lock) { Geo.lock.release().catch(() => { }); Geo.lock = null; }
      Geo.fn.forEach(f => f(Geo));
    },
    async wake() { try { if ('wakeLock' in navigator) Geo.lock = await navigator.wakeLock.request('screen'); } catch (e) { /* bỏ qua */ } },
    onPos(p) {
      const c = p.coords, now = p.timestamp || Date.now();
      let sp = c.speed != null && !isNaN(c.speed) ? c.speed * 3.6 : null;
      let hd = c.heading != null && !isNaN(c.heading) ? c.heading : null;
      const lat = c.latitude, lon = c.longitude;
      if (Geo.last) {
        const dt = (now - Geo.last.t) / 1000, d = LX.haversine(Geo.last.lat, Geo.last.lon, lat, lon);
        if (sp == null && dt > 0.5 && dt < 10) sp = d / dt * 3.6;
        if (hd == null && d > 6) hd = LX.bearing(Geo.last.lat, Geo.last.lon, lat, lon);
      }
      if (!Geo.last || LX.haversine(Geo.last.lat, Geo.last.lon, lat, lon) > 3) Geo.last = { lat, lon, t: now };
      Geo.speed = sp == null ? 0 : Math.max(0, sp);
      if (hd != null && Geo.speed > 3) Geo.heading = hd;
      Geo.pos = { lat, lon, acc: c.accuracy };
      Geo.fn.forEach(f => f(Geo));
    },
    // lấy một vị trí (dùng cho tìm cây xăng, quán ăn…)
    once() {
      if (Geo.pos) return Promise.resolve(Geo.pos);
      return new Promise((res, rej) => {
        if (!navigator.geolocation) return rej(new Error('Thiết bị không hỗ trợ GPS'));
        navigator.geolocation.getCurrentPosition(p => {
          Geo.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
          Geo.fn.forEach(f => f(Geo)); res(Geo.pos);
        }, e => rej(new Error(e.code === 1 ? 'Bạn chưa cấp quyền vị trí cho trang này' : 'Không lấy được vị trí')), { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
      });
    }
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Geo.active) Geo.wake(); });

  /* ---------- Overpass (dữ liệu OpenStreetMap) ---------- */
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  SX.overpass = async function (q) {
    let err;
    for (const u of OVERPASS) {
      try {
        const r = await fetch(u, { method: 'POST', body: 'data=' + encodeURIComponent(q) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
      } catch (e) { err = e; }
    }
    throw new Error('Không lấy được dữ liệu bản đồ (' + (err && err.message) + ')');
  };

  /* tên khu vực (phường/quận, thành phố) cho điểm yêu thích */
  SX.areaOf = async function (lat, lon) {
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=vi&lat=' + lat + '&lon=' + lon);
      const j = await r.json(), a = j.address || {};
      const small = a.suburb || a.quarter || a.village || a.neighbourhood || a.town || '';
      const mid = a.city_district || a.county || a.district || '';
      const big = a.city || a.state || '';
      const parts = [small, mid, big].filter((x, i, arr) => x && arr.indexOf(x) === i);
      return parts.slice(0, 3).join(', ') || 'Khu vực khác';
    } catch (e) { return 'Khu vực khác'; }
  };

  SX.geo = { init() { Voice.init(); } };
})();
