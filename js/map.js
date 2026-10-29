/* Sổ Xe — bản đồ, tìm địa điểm, cây xăng gần nhất, quán ăn, dẫn đường bằng giọng nói, điểm yêu thích theo khu vực */
(function () {
  'use strict';
  const SX = window.SX, LX = SX.LX, S = SX.S, $ = SX.$, h = SX.h, Geo = SX.Geo, Voice = SX.Voice;
  let map = null, me = null, accC = null, routeLn = null, destMk = null, placeLayer = null, favLayer = null, camLayer = null, popup = null;
  let ready = null, lastPlaces = [];
  const nav = { active: false, dest: null, coords: [], M: [], k: 1, said: {}, off: 0, lastRe: 0, total: 0, dur: 0 };
  // mở Google Maps (ứng dụng trên điện thoại hoặc web) để dẫn đường, không cần API key
  function gmaps(lat, lon) {
    const v = SX.veh(), mode = v && v.kind === 'bike' ? 'two-wheeler' : 'driving';
    window.open('https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lon + '&travelmode=' + mode, '_blank', 'noopener');
  }
  const EM = { fuel: '⛽', food: '🍜', cafe: '☕', other: '📍' };

  function loadLeaflet() {
    if (ready) return ready;
    ready = new Promise((res, rej) => {
      if (window.L && window.L.map) return res();
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = res;
      s.onerror = () => { ready = null; rej(new Error('Không tải được bản đồ (kiểm tra kết nối mạng).')); };
      document.head.appendChild(s);
    });
    return ready;
  }
  const emoji = (e, size) => L.divIcon({ html: e, className: 'emj', iconSize: [size || 24, size || 24], iconAnchor: [(size || 24) / 2, (size || 24) / 2] });

  async function ensureMap() {
    await loadLeaflet();
    if (map) return map;
    const c = Geo.pos ? [Geo.pos.lat, Geo.pos.lon] : [10.9, 106.6];
    map = L.map('map').setView(c, 14);
    // Nhiều nguồn nền bản đồ không cần API key; nguồn nào bị chặn thì chọn nguồn khác ở nút góc phải bản đồ
    const street = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' });
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' });
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' });
    street.addTo(map);
    L.control.layers({ 'Đường phố (Esri)': street, 'Vệ tinh (Esri)': sat, 'OpenStreetMap': osm }, null, { position: 'topright' }).addTo(map);
    placeLayer = L.layerGroup().addTo(map); favLayer = L.layerGroup().addTo(map); camLayer = L.layerGroup().addTo(map);
    map.on('click', e => pointPopup(e.latlng));
    renderFavs(); drawCams();
    return map;
  }

  /* ---------- vị trí của tôi ---------- */
  function onGeo() {
    if (!map || !Geo.pos) return;
    const ll = [Geo.pos.lat, Geo.pos.lon];
    if (!me) { me = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map); accC = L.circle(ll, { radius: Geo.pos.acc || 20, color: '#1a73e8', weight: 1, fillOpacity: 0.1 }).addTo(map); }
    else { me.setLatLng(ll); accC.setLatLng(ll).setRadius(Geo.pos.acc || 20); }
    if (nav.active) map.setView(ll, Math.max(map.getZoom(), 16), { animate: true });
  }
  async function goMe() {
    try { await ensureMap(); const p = await Geo.once(); Geo.start(); map.setView([p.lat, p.lon], 16); onGeo(); }
    catch (e) { SX.toast(e.message); }
  }

  /* ---------- chạm bản đồ ---------- */
  function pointPopup(ll, name) {
    const box = h('div', null, h('div', { style: 'font-weight:600;margin-bottom:6px' }, name || 'Điểm đã chọn'),
      h('div', { class: 'btns' },
        h('button', { class: 'mini pri', onclick: () => { map.closePopup(); startNav({ lat: ll.lat, lon: ll.lng, name: name || 'Điểm đã chọn' }); } }, '➡️ Dẫn đường'),
        h('button', { class: 'mini', onclick: () => gmaps(ll.lat, ll.lng) }, '🧭 Google Maps'),
        h('button', { class: 'mini', onclick: () => { map.closePopup(); addFav({ name: name || '', lat: ll.lat, lon: ll.lng }); } }, '⭐ Yêu thích'),
        h('button', { class: 'mini', onclick: () => { map.closePopup(); SX.drive.addCam(ll.lat, ll.lng); } }, '📷 Báo camera')));
    L.popup().setLatLng(ll).setContent(box).openOn(map);
  }

  /* ---------- tìm địa điểm ---------- */
  async function search(q) {
    q = (q || '').trim(); if (!q) return;
    const res = $('mapRes'); res.innerHTML = ''; res.append(h('div', { class: 'note' }, 'Đang tìm…'));
    try {
      let url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=vn&accept-language=vi&q=' + encodeURIComponent(q);
      if (Geo.pos) { const d = 0.6; url += '&viewbox=' + (Geo.pos.lon - d) + ',' + (Geo.pos.lat + d) + ',' + (Geo.pos.lon + d) + ',' + (Geo.pos.lat - d); }
      const r = await fetch(url); const j = await r.json();
      res.innerHTML = '';
      if (!j.length) { res.append(h('div', { class: 'note' }, 'Không tìm thấy. Thử gõ cụ thể hơn (tên đường, quận, thành phố).')); return; }
      await ensureMap();
      j.forEach(it => res.append(h('button', {
        onclick: () => {
          res.innerHTML = ''; const ll = { lat: +it.lat, lng: +it.lon };
          map.setView(ll, 16); if (destMk) map.removeLayer(destMk); destMk = L.marker(ll).addTo(map); pointPopup(ll, it.display_name.split(',').slice(0, 2).join(','));
        }
      }, '📍 ' + it.display_name)));
    } catch (e) { res.innerHTML = ''; res.append(h('div', { class: 'status err' }, 'Không tìm được: ' + e.message)); }
  }

  /* ---------- cây xăng / quán ăn gần đây ---------- */
  async function findPlaces(kind) {
    try {
      await ensureMap();
      SX.toast('Đang xác định vị trí…');
      const p = await Geo.once(); Geo.start(); onGeo();
      const tag = kind === 'fuel' ? '["amenity"="fuel"]' : kind === 'cafe' ? '["amenity"="cafe"]' : '["amenity"~"^(restaurant|fast_food|food_court)$"]';
      let found = [];
      for (const R of kind === 'fuel' ? [3000, 8000, 20000] : [1500, 4000]) {
        const q = '[out:json][timeout:25];(node(around:' + R + ',' + p.lat + ',' + p.lon + ')' + tag + ';way(around:' + R + ',' + p.lat + ',' + p.lon + ')' + tag + ';);out center 80;';
        const j = await SX.overpass(q);
        found = (j.elements || []).map(e => {
          const lat = e.lat != null ? e.lat : e.center && e.center.lat, lon = e.lon != null ? e.lon : e.center && e.center.lon;
          if (lat == null) return null; const t = e.tags || {};
          return { name: t.name || t['name:vi'] || t.brand || t.operator || (kind === 'fuel' ? 'Cây xăng (chưa có tên)' : 'Quán (chưa có tên)'), lat, lon, d: LX.haversine(p.lat, p.lon, lat, lon), tags: t };
        }).filter(Boolean).sort((a, b) => a.d - b.d);
        if (found.length) break;
      }
      if (!found.length) { SX.toast('Không tìm thấy địa điểm nào quanh đây trong dữ liệu bản đồ'); return; }
      showPlaces(found.slice(0, 15), kind);
      if (kind === 'fuel') Voice.say('Cây xăng gần nhất là ' + found[0].name + ', cách ' + LX.fmtDist(found[0].d), 'fuelnear', 0);
    } catch (e) { SX.toast(e.message); }
  }
  function showPlaces(list, kind) {
    lastPlaces = list; placeLayer.clearLayers();
    $('placesCard').classList.remove('hidden');
    $('placesTitle').textContent = kind === 'fuel' ? '⛽ Cây xăng gần bạn' : kind === 'cafe' ? '☕ Quán cà phê gần bạn' : '🍜 Quán ăn gần bạn';
    const box = $('places'); box.innerHTML = '';
    const pts = [];
    list.forEach(pl => {
      pts.push([pl.lat, pl.lon]);
      L.marker([pl.lat, pl.lon], { icon: emoji(EM[kind]) }).addTo(placeLayer).on('click', () => pointPopup({ lat: pl.lat, lng: pl.lon }, pl.name));
      const extra = [pl.tags.brand && pl.tags.brand !== pl.name ? pl.tags.brand : '', pl.tags.cuisine ? 'Món: ' + pl.tags.cuisine.replace(/_/g, ' ') : '', pl.tags.opening_hours ? 'Giờ mở: ' + pl.tags.opening_hours : ''].filter(Boolean).join(' · ');
      box.append(h('div', { class: 'item' }, h('div', { class: 'ico' }, EM[kind]),
        h('div', { class: 'mid' }, h('div', { class: 't' }, pl.name), h('div', { class: 'd' }, LX.fmtDist(pl.d) + (extra ? ' · ' + extra : ''))),
        h('button', { class: 'mini pri', title: 'Dẫn đường trong app', onclick: () => startNav(pl) }, '➡️'),
        h('button', { class: 'mini', title: 'Mở bằng Google Maps', onclick: () => gmaps(pl.lat, pl.lon) }, '🧭'),
        kind !== 'fuel' ? h('button', { class: 'mini', title: 'Lưu yêu thích', onclick: () => addFav({ name: pl.name, lat: pl.lat, lon: pl.lon, kind }) }, '⭐') : null));
    });
    if (Geo.pos) pts.push([Geo.pos.lat, Geo.pos.lon]);
    if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 16 });
    $('placesCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- yêu thích theo khu vực ---------- */
  let favDraft = null;
  function addFav(p) {
    favDraft = p; $('fvName').value = p.name || ''; $('fvKind').value = p.kind || 'food'; $('fvRate').value = '5'; $('fvNote').value = '';
    $('favDlg').showModal();
  }
  async function saveFav() {
    const name = $('fvName').value.trim(); if (!name) { SX.toast('Nhập tên địa điểm'); return; }
    $('favDlg').close(); SX.toast('Đang xác định khu vực…');
    const area = await SX.areaOf(favDraft.lat, favDraft.lon);
    S.fav.push({ id: LX.uid(), name, kind: $('fvKind').value, rating: +$('fvRate').value, note: $('fvNote').value.trim(), lat: favDraft.lat, lon: favDraft.lon, area, created: SX.today() });
    SX.save(); renderFavs(); SX.toast('Đã lưu vào ' + area);
  }
  function renderFavs() {
    const box = $('favBox'); box.innerHTML = '';
    if (favLayer) favLayer.clearLayers();
    if (!S.fav.length) { box.append(h('div', { class: 'empty' }, 'Chưa có điểm nào. Tìm quán ăn rồi bấm ⭐, hoặc chạm bản đồ để lưu một điểm.')); return; }
    const groups = {};
    S.fav.forEach(f => (groups[f.area || 'Khu vực khác'] = groups[f.area || 'Khu vực khác'] || []).push(f));
    const near = a => Geo.pos ? Math.min(...groups[a].map(f => LX.haversine(Geo.pos.lat, Geo.pos.lon, f.lat, f.lon))) : 0;
    Object.keys(groups).sort((a, b) => near(a) - near(b) || a.localeCompare(b, 'vi')).forEach(area => {
      const g = h('div', { class: 'fgroup' }, h('h3', null, '📍 ' + area + ' (' + groups[area].length + ')'));
      groups[area].sort((a, b) => b.rating - a.rating).forEach(f => {
        const d = Geo.pos ? ' · ' + LX.fmtDist(LX.haversine(Geo.pos.lat, Geo.pos.lon, f.lat, f.lon)) : '';
        g.append(h('div', { class: 'item' }, h('div', { class: 'ico' }, EM[f.kind] || '📍'),
          h('div', { class: 'mid' }, h('div', { class: 't' }, f.name, ' ', h('span', { class: 'stars' }, '★'.repeat(f.rating))), h('div', { class: 'd' }, (f.note || 'Không có ghi chú') + d)),
          h('button', { class: 'mini pri', title: 'Dẫn đường trong app', onclick: () => startNav({ lat: f.lat, lon: f.lon, name: f.name }) }, '➡️'),
          h('button', { class: 'mini', title: 'Mở bằng Google Maps', onclick: () => gmaps(f.lat, f.lon) }, '🧭'),
          h('button', { class: 'mini', title: 'Xem trên bản đồ', onclick: async () => { await ensureMap(); map.setView([f.lat, f.lon], 17); $('map').scrollIntoView({ behavior: 'smooth' }); } }, '🗺️'),
          h('button', { class: 'mini del', onclick: () => { if (confirm('Xóa "' + f.name + '" khỏi yêu thích?')) { S.fav = S.fav.filter(x => x.id !== f.id); SX.save(); renderFavs(); } } }, '🗑️')));
        if (favLayer) L.marker([f.lat, f.lon], { icon: emoji('⭐') }).addTo(favLayer).on('click', () => pointPopup({ lat: f.lat, lng: f.lon }, f.name));
      });
      box.append(g);
    });
  }

  /* ---------- dẫn đường ---------- */
  async function startNav(dest) {
    try {
      await ensureMap();
      if (!Geo.active) await Geo.start();
      SX.toast('Đang tìm đường…');
      const p = await Geo.once();
      const url = 'https://router.project-osrm.org/route/v1/driving/' + p.lon + ',' + p.lat + ';' + dest.lon + ',' + dest.lat + '?overview=full&geometries=geojson&steps=true';
      const r = await fetch(url); if (!r.ok) throw new Error('Máy chủ tìm đường báo lỗi ' + r.status);
      const j = await r.json(); if (!j.routes || !j.routes[0]) throw new Error('Không tìm được đường đi tới điểm này');
      const rt = j.routes[0], steps = rt.legs[0].steps;
      nav.coords = rt.geometry.coordinates; nav.total = rt.distance; nav.dur = rt.duration;
      nav.M = steps.map(s => ({ loc: s.maneuver.location, text: LX.instruction(s), dist: s.distance, type: s.maneuver.type }));
      nav.k = Math.min(1, nav.M.length - 1); if (nav.M.length > 1) nav.k = 1;
      nav.dest = dest; nav.said = {}; nav.off = 0; nav.active = true;
      if (routeLn) map.removeLayer(routeLn);
      routeLn = L.polyline(nav.coords.map(c => [c[1], c[0]]), { color: '#1a73e8', weight: 6, opacity: 0.85 }).addTo(map);
      if (destMk) map.removeLayer(destMk); destMk = L.marker([dest.lat, dest.lon]).addTo(map);
      map.fitBounds(routeLn.getBounds(), { padding: [30, 30] });
      $('navBar').classList.remove('hidden'); updNav();
      Voice.say('Bắt đầu dẫn đường tới ' + (dest.name || 'điểm đến') + '. Quãng đường ' + LX.fmtDist(rt.distance) + ', khoảng ' + Math.max(1, Math.round(rt.duration / 60)) + ' phút.');
      $('map').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { SX.toast(e.message); }
  }
  function stopNav(say) {
    nav.active = false; $('navBar').classList.add('hidden');
    if (routeLn && map) { map.removeLayer(routeLn); routeLn = null; }
    if (say) Voice.say('Đã dừng dẫn đường');
  }
  function updNav() {
    if (!nav.active || !Geo.pos) return;
    const p = Geo.pos, m = nav.M[nav.k]; if (!m) return;
    const d = LX.haversine(p.lat, p.lon, m.loc[1], m.loc[0]);
    // còn lại ≈ khoảng cách tới điểm rẽ kế tiếp + các đoạn sau đó
    let rest = d; for (let j = nav.k; j < nav.M.length; j++) rest += nav.M[j].dist || 0;
    $('navText').textContent = (d < 1000 ? 'Sau ' + LX.fmtDist(d) + ': ' : 'Đi tiếp ' + LX.fmtDist(d) + ': ') + m.text;
    const eta = nav.total ? Math.round(rest * (nav.dur / nav.total) / 60) : 0;
    $('navSub').textContent = 'Còn ' + LX.fmtDist(rest) + ' · khoảng ' + Math.max(1, eta) + ' phút';
    const last = nav.k >= nav.M.length - 1;
    if (last && d < 40) { Voice.say('Bạn đã đến nơi'); SX.toast('Đã đến nơi'); stopNav(false); return; }
    if (!last && d < 30) { nav.k++; return updNav(); }
    if (d <= 380 && d > 120 && !nav.said[nav.k + 'f'] && (nav.M[nav.k - 1] ? nav.M[nav.k - 1].dist > 400 : true)) { nav.said[nav.k + 'f'] = 1; Voice.say('Phía trước ' + LX.fmtDist(d) + ', ' + m.text); }
    if (d <= 90 && !nav.said[nav.k + 'n']) { nav.said[nav.k + 'n'] = 1; Voice.say(m.text); }
    // lệch đường → tìm lại
    const off = LX.distToPolyline(p, nav.coords).dist;
    nav.off = off > 70 ? nav.off + 1 : 0;
    if (nav.off >= 3 && Date.now() - nav.lastRe > 15000) { nav.lastRe = Date.now(); nav.off = 0; Voice.say('Bạn đã đi lệch đường. Đang tìm lại đường.'); startNav(nav.dest); }
  }

  /* ---------- camera giám sát trên bản đồ ---------- */
  function drawCams() {
    if (!camLayer) return; camLayer.clearLayers();
    SX.drive && SX.drive.allCams().forEach(c => L.marker([c.lat, c.lon], { icon: emoji('📸', 22) }).addTo(camLayer).bindPopup(c.user ? 'Camera bạn đã báo' : 'Camera (dữ liệu OSM)'));
  }

  /* ---------- lệnh giọng nói ---------- */
  function voiceCmd(t) {
    const f = LX.fold(t); $('mapQ').value = t;
    if (/xang|do xang/.test(f)) return findPlaces('fuel');
    if (/ca phe|cafe/.test(f)) return findPlaces('cafe');
    if (/\b(an|quan an|nha hang|an uong|do an)\b/.test(f)) return findPlaces('food');
    const m = t.match(/(?:dẫn đường|đi|chỉ đường)(?: đến| tới)?\s+(.+)/i);
    search(m ? m[1] : t);
  }

  SX.map = {
    init() {
      $('mapGo').onclick = () => search($('mapQ').value);
      $('mapQ').onkeydown = e => { if (e.key === 'Enter') search($('mapQ').value); };
      $('mapMic').onclick = () => SX.listen(voiceCmd);
      $('qFuel').onclick = () => findPlaces('fuel'); $('qFood').onclick = () => findPlaces('food'); $('qCafe').onclick = () => findPlaces('cafe');
      $('qMe').onclick = goMe; $('navStop').onclick = () => stopNav(true);
      $('navG').onclick = () => { if (nav.dest) gmaps(nav.dest.lat, nav.dest.lon); };
      $('fvOk').onclick = saveFav; $('fvCancel').onclick = () => $('favDlg').close();
      Geo.on(() => { onGeo(); updNav(); });
      renderFavs();
    },
    onShow() { ensureMap().then(() => { setTimeout(() => map.invalidateSize(), 80); renderFavs(); }).catch(e => SX.toast(e.message)); },
    renderFavs, drawCams, isNav: () => nav.active
  };
})();
