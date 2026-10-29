/* Sổ Xe — quét phiếu bảo dưỡng: chọn ảnh hoặc chụp bằng camera → OCR (Tesseract.js, chạy ngay trên máy) → điền form */
(function () {
  'use strict';
  const SX = window.SX, LX = SX.LX, $ = SX.$;
  let worker = null, stream = null, busy = false;

  const loadScript = src => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res;
    s.onerror = () => rej(new Error('Không tải được thư viện đọc chữ (kiểm tra kết nối mạng).')); document.head.appendChild(s);
  });
  const setStatus = (m, cls) => { const s = $('scanStatus'); s.textContent = m; s.className = 'status' + (cls ? ' ' + cls : ''); };

  async function getWorker() {
    if (worker) return worker;
    if (!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    worker = await window.Tesseract.createWorker('vie', 1, {
      logger: m => {
        if (m.status === 'recognizing text') setStatus('Đang đọc chữ trên phiếu… ' + Math.round((m.progress || 0) * 100) + '%');
        else if (/loading/.test(m.status || '')) setStatus('Đang tải dữ liệu tiếng Việt (lần đầu hơi lâu)…');
      }
    });
    return worker;
  }

  // đưa ảnh về canvas, giảm/tăng kích thước, chuyển xám và kéo giãn tương phản để OCR tốt hơn
  async function toCanvas(source) {
    let bmp;
    if (source instanceof Blob) {
      try { bmp = await createImageBitmap(source, { imageOrientation: 'from-image' }); }
      catch (e) {
        bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(source); });
      }
    } else bmp = source;
    const w0 = bmp.width || bmp.videoWidth, h0 = bmp.height || bmp.videoHeight;
    const longest = Math.max(w0, h0);
    const scale = longest > 2200 ? 2200 / longest : (longest < 1200 ? 1200 / longest : 1);
    const c = document.createElement('canvas'); c.width = Math.round(w0 * scale); c.height = Math.round(h0 * scale);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data, hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = g; hist[g]++; }
    const n = c.width * c.height; let lo = 0, hi = 255, acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.01) { lo = i; break; } }
    acc = 0; for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.01) { hi = i; break; } }
    const span = Math.max(40, hi - lo);
    for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) / span) * 255)); d[i] = d[i + 1] = d[i + 2] = v; }
    ctx.putImageData(img, 0, 0);
    return { canvas: c, original: bmp, w: w0, h: h0 };
  }

  function thumbOf(src, w, h) {
    const max = 720, s = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.5);
  }

  async function process(source) {
    if (busy) return; busy = true;
    $('scanCam').disabled = $('scanFile').disabled = true;
    try {
      if (!SX.veh()) { SX.toast('Hãy thêm xe trước'); return; }
      setStatus('Đang xử lý ảnh…');
      const { canvas, original, w, h } = await toCanvas(source);
      const wk = await getWorker();
      const { data } = await wk.recognize(canvas);
      const parsed = LX.parseInvoice(data.text || '');
      SX.applyScan(parsed, thumbOf(original, w, h));
    } catch (e) {
      setStatus('Không đọc được phiếu: ' + (e && e.message ? e.message : e), 'err');
    } finally {
      busy = false; $('scanCam').disabled = $('scanFile').disabled = false;
    }
  }

  /* ----- camera ----- */
  async function openCamera() {
    if (!SX.veh()) { SX.toast('Hãy thêm xe trước'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { SX.toast('Camera cần mở app qua https (ví dụ trang GitHub Pages)'); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    } catch (e) { SX.toast('Không mở được camera. Hãy cấp quyền camera cho trang này.'); return; }
    const v = $('camVideo'); v.srcObject = stream; await v.play().catch(() => { });
    $('scanModal').classList.remove('hidden');
    $('camMsg').textContent = 'Đưa phiếu vào khung hình, giữ chắc tay rồi bấm Chụp.';
  }
  function closeCamera() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    $('camVideo').srcObject = null; $('scanModal').classList.add('hidden');
  }
  async function shot() {
    const v = $('camVideo'); if (!v.videoWidth) { SX.toast('Camera chưa sẵn sàng'); return; }
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    closeCamera();
    await process(c);
  }

  SX.scan = {
    init() {
      $('scanCam').onclick = openCamera;
      $('scanFile').onclick = () => $('scanInput').click();
      $('scanInput').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) process(f); };
      $('camShot').onclick = shot; $('camClose').onclick = closeCamera;
    }
  };
})();
