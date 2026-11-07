// ─── Halaman Pengaturan Akun (akun.html) ─────────────────────────────────────
import { BASE_URL, getActiveSession, setActiveSession, clearActiveSession } from "../config/api.js?v=5";
import { fmtDate } from "../ui.js?v=2";

const $ = (id) => document.getElementById(id);
const ROLE_LABEL = { buyer: 'Pembeli', seller: 'Penjual', admin: 'Admin' };

function toast(message, type) {
  if (window.showAlert) window.showAlert(message, type);
}

/** Perkecil foto jadi persegi 256px JPEG (data URL) sebelum dikirim ke backend. */
function resizeImage(file, size = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode'));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function paintAvatar(el, user) {
  if (!el) return;
  const initial = (user.name || '?').trim().charAt(0).toUpperCase();
  if (user.avatar) {
    el.style.backgroundImage = `url("${String(user.avatar).replace(/"/g, '%22')}")`;
    el.textContent = '';
    el.classList.add('has-photo');
  } else {
    el.style.backgroundImage = '';
    el.textContent = initial;
    el.classList.remove('has-photo');
  }
}

export async function initAccountPage() {
  const session = getActiveSession();
  if (!session || !session.user) {
    $('account-locked').hidden = false;
    $('account-app').hidden = true;
    return;
  }

  // Data terbaru dari server (avatar, alamat, tanggal bergabung)
  let user = { ...session.user };
  try {
    const res = await fetch(`${BASE_URL}/users`);
    const data = await res.json();
    const fresh = (data.data || []).find(u => u.id === user.id);
    if (fresh) user = { ...user, ...fresh };
  } catch (e) { /* tetap pakai data sesi */ }

  // Tautan kembali sesuai peran
  const back = $('account-back');
  if (user.role === 'seller') { back.href = 'seller.html'; back.lastChild.textContent = ' Dashboard toko'; }
  if (user.role === 'admin') { back.href = 'admin.html'; back.lastChild.textContent = ' Konsol admin'; }

  // Label alamat untuk penjual
  if (user.role === 'seller') {
    $('address-title').textContent = 'Alamat toko';
    $('address-desc').textContent = 'Lokasi ruko atau gudang. Ditampilkan ke pembeli sebagai "Dikirim dari" dan dipakai sebagai alamat pengiriman saat kamu berbelanja.';
    $('acc-phone-hint').textContent = 'Kontak toko untuk pembeli dan admin.';
  }

  // Ringkasan akun
  const fillSummary = () => {
    paintAvatar($('acc-summary-avatar'), user);
    paintAvatar($('acc-avatar-preview'), user);
    paintAvatar($('acc-top-avatar'), user);
    $('acc-summary-name').textContent = user.name || '–';
    $('acc-summary-email').textContent = user.email || '';
    $('acc-summary-role').textContent = ROLE_LABEL[user.role] || user.role;
    $('acc-summary-since').textContent = user.created_at ? `Bergabung ${fmtDate(user.created_at)}` : '';
    $('acc-avatar-remove').hidden = !user.avatar;
  };

  // Isi form
  $('acc-name').value = user.name || '';
  $('acc-email').value = user.email || '';
  $('acc-phone').value = user.phone || '';
  $('acc-address').value = user.address || '';
  let avatar = user.avatar || '';
  fillSummary();

  // Simpan — backend menimpa email, phone, address, avatar sekaligus,
  // jadi selalu kirim keempatnya dari isi form saat ini.
  const snapshot = () => JSON.stringify([
    $('acc-email').value.trim(), $('acc-phone').value.trim(), $('acc-address').value.trim(), avatar
  ]);
  let saved = snapshot();
  const refreshDirty = () => {
    const dirty = snapshot() !== saved;
    document.querySelectorAll('[data-save]').forEach(b => { b.disabled = !dirty; });
  };
  ['acc-email', 'acc-phone', 'acc-address'].forEach(id => $(id).addEventListener('input', refreshDirty));
  refreshDirty();

  async function save(btn) {
    const email = $('acc-email').value.trim();
    const phone = $('acc-phone').value.trim();
    const address = $('acc-address').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast('Format email belum benar.', 'error'); $('acc-email').focus(); return;
    }
    if (phone && !/^\+?\d[\d\s-]{7,15}$/.test(phone)) {
      toast('Nomor WhatsApp hanya boleh angka, 8–16 digit.', 'error'); $('acc-phone').focus(); return;
    }
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Menyimpan…';
    try {
      const res = await fetch(`${BASE_URL}/user/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, email, phone, address, avatar })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan');
      user = { ...user, email, phone, address, avatar };
      const s = getActiveSession();
      if (s) { s.user = { ...s.user, email, phone, address, avatar }; setActiveSession(s); }
      saved = snapshot();
      fillSummary();
      toast('Perubahan disimpan.', 'success');
    } catch (err) {
      toast(err.message === 'Failed to fetch' ? 'Koneksi bermasalah. Coba lagi.' : (err.message || 'Gagal menyimpan.'), 'error');
    } finally {
      btn.textContent = label;
      refreshDirty();
    }
  }
  document.querySelectorAll('[data-save]').forEach(btn => btn.addEventListener('click', () => save(btn)));

  // Foto profil
  $('acc-avatar-input').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast('Gunakan foto JPG, PNG, atau WebP.', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { toast('Ukuran foto maksimal 5 MB.', 'error'); return; }
    try {
      avatar = await resizeImage(file);
      paintAvatar($('acc-avatar-preview'), { ...user, avatar });
      $('acc-avatar-remove').hidden = false;
      refreshDirty();
      toast('Foto siap. Klik "Simpan profil" untuk menyimpan.', 'success');
    } catch {
      toast('Foto tidak bisa dibaca. Coba file lain.', 'error');
    }
  });
  $('acc-avatar-remove').addEventListener('click', () => {
    avatar = '';
    paintAvatar($('acc-avatar-preview'), { ...user, avatar: '' });
    $('acc-avatar-remove').hidden = true;
    refreshDirty();
  });

  // Keamanan: status verifikasi email / nomor HP + tautan ganti kata sandi lewat OTP
  const verifyBadge = (ok) => `<span class="v-status${ok ? ' v-status--good' : ''}">${ok ? 'Terverifikasi' : 'Belum diverifikasi'}</span>`;
  const setText = (el, text) => { const s = document.createElement('span'); s.textContent = text; el.replaceChildren(s); };
  const emailEl = $('acc-verify-email');
  const phoneEl = $('acc-verify-phone');
  if (emailEl) {
    setText(emailEl, user.email || '–');
    emailEl.insertAdjacentHTML('beforeend', ' ' + verifyBadge(user.email_verified));
  }
  if (phoneEl) {
    if (user.phone) {
      setText(phoneEl, user.phone);
      phoneEl.insertAdjacentHTML('beforeend', ' ' + verifyBadge(user.phone_verified));
    } else {
      setText(phoneEl, 'Belum ditambahkan. Isi di bagian Profil supaya bisa menerima OTP lewat WhatsApp/SMS.');
    }
  }
  const changePass = $('acc-change-pass');
  if (changePass) changePass.href = `login.html?reset=1&id=${encodeURIComponent(user.email || '')}`;

  // Keamanan: sesi di perangkat ini
  $('acc-session-device').textContent = (() => {
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return `${browser}${os ? ' di ' + os : ''}`;
  })();
  $('acc-logout').addEventListener('click', () => {
    clearActiveSession();
    window.location.href = 'index.html';
  });

  // Notifikasi — disimpan di perangkat ini
  const prefKey = `vendora_notif_${user.id}`;
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(prefKey) || '{}'); } catch { prefs = {}; }
  document.querySelectorAll('[data-pref]').forEach(input => {
    const k = input.dataset.pref;
    if (k in prefs) input.checked = !!prefs[k];
    input.addEventListener('change', () => {
      prefs[k] = input.checked;
      try { localStorage.setItem(prefKey, JSON.stringify(prefs)); } catch { /* abaikan */ }
      toast('Preferensi notifikasi disimpan.', 'success');
    });
  });

  // Navigasi bagian (hash)
  const tabs = document.querySelectorAll('.acc-nav a');
  const panels = document.querySelectorAll('.acc-panel');
  const show = (id) => {
    if (!document.getElementById(`panel-${id}`)) id = 'profil';
    tabs.forEach(t => {
      const on = t.getAttribute('href') === `#${id}`;
      t.classList.toggle('active', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    panels.forEach(p => { p.hidden = p.id !== `panel-${id}`; });
  };
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1) || 'profil');

  $('account-app').hidden = false;
  document.body.classList.add('is-ready');
  $('acc-summary-name').title = user.name || '';
}
