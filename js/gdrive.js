/* Sổ Xe — đồng bộ Google Drive (chỉ thư mục dữ liệu riêng của app: drive.appdata) */
(function () {
  'use strict';
  const SX = window.SX, $ = SX.$, S = SX.S, uid = SX.LX.uid;
  let tokenClient = null, token = null;
  const gs = (m, c) => { const s = $('gStatus'); s.textContent = m; s.className = 'status' + (c ? ' ' + c : ''); };

  function loadGis() {
    return new Promise((res, rej) => {
      if (window.google && google.accounts && google.accounts.oauth2) return res();
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(new Error('Không tải được thư viện đăng nhập Google (kiểm tra mạng).'));
      document.head.appendChild(s);
    });
  }
  async function gfetch(url, opt, what) {
    opt = opt || {}; opt.headers = Object.assign({ Authorization: 'Bearer ' + token }, opt.headers || {});
    const r = await fetch(url, opt);
    if (r.status === 401) { token = null; $('gUp').disabled = $('gDown').disabled = true; throw new Error('Phiên đăng nhập hết hạn, hãy kết nối lại.'); }
    if (!r.ok) {
      let why = '';
      try { const j = await r.clone().json(); why = (j.error && (j.error.message || j.error.status)) || ''; } catch (e) { /* không có nội dung */ }
      throw new Error('Google Drive báo lỗi ' + r.status + (what ? ' (' + what + ')' : '') + (why ? ': ' + why : ''));
    }
    return r;
  }
  async function findFile() {
    const r = await gfetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=' + encodeURIComponent("name='so-xe.json'") + '&fields=files(id)', null, 'tìm file');
    const j = await r.json(); return j.files && j.files[0] ? j.files[0].id : null;
  }

  SX.gdrive = {
    init() {
      $('cid').value = S.clientId || '';
      $('cidSave').onclick = () => {
        const v = $('cid').value.trim();
        if (v && !/\.apps\.googleusercontent\.com$/.test(v)) { gs('Client ID phải kết thúc bằng .apps.googleusercontent.com', 'err'); return; }
        S.clientId = v; tokenClient = null; SX.save(); gs(v ? 'Đã lưu Client ID. Bấm "Kết nối Google Drive".' : 'Đã xóa Client ID.', 'ok');
      };
      $('gConn').onclick = async () => {
        if (!S.clientId) { gs('Hãy dán Google Client ID ở ô bên dưới rồi bấm Lưu.', 'err'); $('cid').focus(); return; }
        try {
          gs('Đang mở cửa sổ đăng nhập Google…');
          await loadGis();
          if (!tokenClient) {
            tokenClient = google.accounts.oauth2.initTokenClient({
              client_id: S.clientId, scope: 'https://www.googleapis.com/auth/drive.appdata',
              callback: r => {
                if (r.error) { gs('Kết nối thất bại: ' + r.error, 'err'); return; }
                token = r.access_token; $('gUp').disabled = false; $('gDown').disabled = false; gs('Đã kết nối Google Drive.', 'ok');
              },
              error_callback: e => gs(e && e.type === 'popup_closed' ? 'Bạn đã đóng cửa sổ đăng nhập. Bấm "Kết nối Google Drive" để thử lại.' : 'Không mở được cửa sổ đăng nhập (trình duyệt có thể đang chặn popup).', 'err')
            });
          }
          tokenClient.requestAccessToken({ prompt: token ? '' : 'consent' });
        } catch (e) { gs(e.message, 'err'); }
      };
      $('gUp').onclick = async () => {
        try {
          gs('Đang lưu lên Drive…');
          const id = await findFile(), body = SX.backup();
          if (id) await gfetch('https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }, 'ghi file');
          else {
            const b = 'soxe' + uid();
            const meta = JSON.stringify({ name: 'so-xe.json', parents: ['appDataFolder'] });
            const mp = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + b + '\r\nContent-Type: application/json\r\n\r\n' + body + '\r\n--' + b + '--';
            await gfetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: mp }, 'tạo file');
          }
          gs('Đã lưu lên Drive lúc ' + new Date().toLocaleTimeString('vi-VN') + '.', 'ok');
        } catch (e) { gs(e.message, 'err'); }
      };
      $('gDown').onclick = async () => {
        try {
          gs('Đang tải từ Drive…');
          const id = await findFile();
          if (!id) { gs('Chưa có bản sao lưu nào trên Drive. Hãy bấm "Lưu lên Drive" trước.', 'err'); return; }
          const r = await gfetch('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media', null, 'đọc file');
          const ok = SX.restore(await r.text());
          gs(ok ? 'Đã tải và khôi phục từ Drive.' : 'Đã hủy khôi phục.', ok ? 'ok' : '');
        } catch (e) { gs(e.message, 'err'); }
      };
    }
  };
})();
