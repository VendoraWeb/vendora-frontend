import { BASE_URL, setActiveSession, getActiveSession } from "../config/api.js?v=105";

// ─── Alert helper ──────────────────────────────────────────────────────────
function showAlert(message, type) {
  const container = document.getElementById('alert-container') || document.body;
  container.innerHTML = '';
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type}`;
  alertDiv.setAttribute('role', type === 'error' ? 'alert' : 'status');
  alertDiv.textContent = message;
  container.prepend(alertDiv);
  setTimeout(() => alertDiv.remove(), 5000);
}

// ─── Redirect after login ───────────────────────────────────────────────────
function redirectByRole(role) {
  const routes = { admin: 'admin.html', seller: 'seller.html', buyer: 'index.html' };
  window.location.href = routes[role] || 'index.html';
}

const $ = (id) => document.getElementById(id);

async function api(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    // Bukan JSON (mis. "Cannot POST …"): backend yang dihubungi belum punya fitur ini
    data = {
      status: res.status,
      message: res.status === 404
        ? 'Server belum mendukung fitur ini. Pastikan backend terbaru sedang berjalan, lalu muat ulang halaman (Ctrl + Shift + R).'
        : 'Server membalas dengan format yang tidak dikenali. Coba lagi sebentar.',
    };
    console.warn(`[Vendora] ${path} → HTTP ${res.status} dari ${BASE_URL}`);
  }
  return { ok: res.ok, status: res.status, data };
}

function setBusy(btn, busy, busyLabel) {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.dataset.label || btn.textContent;
    btn.disabled = true;
    btn.textContent = busyLabel;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }
}

const NETWORK_ERR = 'Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.';

// ─── Status alur OTP ────────────────────────────────────────────────────────
const flow = {
  purpose: 'login',      // 'login' | 'reset'
  challengeId: null,
  channels: [],
  channel: null,
  resetToken: null,
  identifier: '',
  timer: null,
};

// ─── Main auth initializer ──────────────────────────────────────────────────
export function initAuth() {
  console.info('[Vendora] Backend API:', BASE_URL);
  const views = {
    signin: $('signin-view'),
    signup: $('signup-view'),
    reset: $('reset-view'),
    otp: $('otp-view'),
  };
  const tabs = $('auth-tabs');
  const tabSignin = $('tab-signin');
  const tabSignup = $('tab-signup');

  function show(name) {
    Object.entries(views).forEach(([k, el]) => { if (el) el.style.display = k === name ? 'block' : 'none'; });
    const inTabs = name === 'signin' || name === 'signup';
    if (tabs) tabs.style.display = inTabs ? '' : 'none';
    if (inTabs) {
      tabSignin.classList.toggle('active', name === 'signin');
      tabSignup.classList.toggle('active', name === 'signup');
      tabSignin.setAttribute('aria-selected', name === 'signin');
      tabSignup.setAttribute('aria-selected', name === 'signup');
    }
    window.scrollTo({ top: 0 });
  }

  tabSignin?.addEventListener('click', () => show('signin'));
  tabSignup?.addEventListener('click', () => show('signup'));
  $('to-signup-link')?.addEventListener('click', (e) => { e.preventDefault(); show('signup'); });
  $('to-signin-link')?.addEventListener('click', (e) => { e.preventDefault(); show('signin'); });
  $('to-reset-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    const id = $('login-identifier').value.trim();
    if (id) $('reset-identifier').value = id;
    show('reset');
    $('reset-identifier').focus();
  });
  document.querySelectorAll('[data-back-to]').forEach(b => b.addEventListener('click', () => show(b.dataset.backTo)));

  // Tampilkan / sembunyikan kata sandi (ikon mata)
  const EYE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><path d="M14.12 14.12a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  document.querySelectorAll('[data-toggle-pw]').forEach(btn => {
    btn.innerHTML = EYE;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      const input = $(btn.dataset.togglePw);
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      btn.innerHTML = reveal ? EYE_OFF : EYE;
      btn.setAttribute('aria-pressed', String(reveal));
      btn.setAttribute('aria-label', reveal ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
      input.focus();
    });
  });

  function finishLogin(payload) {
    setActiveSession({ token: payload.token, user: payload.user });
    showAlert('Berhasil masuk. Mengalihkan…', 'success');
    setTimeout(() => redirectByRole(payload.user.role), 600);
  }

  // ── Masuk: email/nomor HP + kata sandi → langsung masuk ───────────────────
  $('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = $('login-identifier').value.trim();
    const password = $('login-password').value;
    if (!identifier || !password) { showAlert('Isi email/nomor HP dan kata sandi.', 'error'); return; }
    const btn = $('signin-submit-btn');
    setBusy(btn, true, 'Memeriksa…');
    try {
      const { data } = await api('/login', { identifier, password });
      if (data.status === 200 && data.data && data.data.token) {
        finishLogin(data.data);
      } else if (data.status === 200 && data.data && data.data.otp_required) {
        flow.identifier = identifier;   // backend lama yang masih mewajibkan OTP
        startOtp('login', data.data);
      } else {
        showAlert(data.message || 'Email/nomor HP atau kata sandi salah.', 'error');
      }
    } catch {
      showAlert(NETWORK_ERR, 'error');
    } finally {
      setBusy(btn, false);
    }
  });

  // ── Daftar ────────────────────────────────────────────────────────────────
  $('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('reg-name').value.trim();
    const email = $('reg-email').value.trim();
    const phone = $('reg-phone') ? $('reg-phone').value.trim() : '';
    const password = $('reg-password').value;
    const role = $('reg-role').value;
    const shop_name = $('reg-shop-name').value.trim();

    if (!name || !email || !password) { showAlert('Nama, email, dan kata sandi wajib diisi.', 'error'); return; }
    if (password.length < 8) { showAlert('Kata sandi minimal 8 karakter.', 'error'); $('reg-password').focus(); return; }
    if (role === 'seller' && !shop_name) { showAlert('Isi nama toko untuk akun penjual.', 'error'); $('reg-shop-name').focus(); return; }

    const btn = $('signup-submit-btn');
    setBusy(btn, true, 'Membuat akun…');
    try {
      const payload = { name, email, password, role, phone };
      if (role === 'seller') payload.shop_name = shop_name;
      const { data, status } = await api('/register', payload);
      if (status === 409 && /email/i.test(data.message || '')) {
        // Email sudah punya akun → arahkan ke masuk, dengan opsi lupa kata sandi
        $('login-identifier').value = email;
        $('reset-identifier').value = email;
        show('signin');
        showAlert('Email ini sudah terdaftar. Silakan masuk, atau pakai "Lupa kata sandi?" bila lupa.', 'error');
        $('login-password').focus();
        return;
      }
      if (data.status !== 201) {
        showAlert(data.message || 'Pendaftaran gagal.', 'error');
        return;
      }
      // Akun dibuat → langsung masuk
      const login = await api('/login', { identifier: email, password });
      if (login.data.status === 200 && login.data.data && login.data.data.token) {
        finishLogin(login.data.data);
      } else if (login.data.status === 200 && login.data.data && login.data.data.otp_required) {
        flow.identifier = email;
        startOtp('login', login.data.data, 'Akun berhasil dibuat. Verifikasi dulu untuk masuk.');
      } else {
        showAlert('Akun berhasil dibuat. Silakan masuk.', 'success');
        $('login-identifier').value = email;
        show('signin');
      }
    } catch {
      showAlert(NETWORK_ERR, 'error');
    } finally {
      setBusy(btn, false);
    }
  });

  // ── Lupa kata sandi (tahap 1) ─────────────────────────────────────────────
  $('reset-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = $('reset-identifier').value.trim();
    if (!identifier) { showAlert('Isi email atau nomor HP akunmu.', 'error'); return; }
    const btn = $('reset-submit-btn');
    setBusy(btn, true, 'Mencari akun…');
    try {
      const { data } = await api('/auth/reset/start', { identifier });
      if (data.status === 200 && data.data) {
        flow.identifier = identifier;
        startOtp('reset', data.data);
      } else {
        showAlert(data.message || 'Akun tidak ditemukan.', 'error');
      }
    } catch {
      showAlert(NETWORK_ERR, 'error');
    } finally {
      setBusy(btn, false);
    }
  });

  // ── OTP ───────────────────────────────────────────────────────────────────
  const steps = ['otp-step-channel', 'otp-step-code', 'otp-step-newpass', 'otp-step-done'];
  function step(id) {
    steps.forEach(s => { $(s).hidden = s !== id; });
    $('otp-back').hidden = id === 'otp-step-done' || id === 'otp-step-newpass';
  }

  function channelIcon(type) {
    return type === 'email'
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22 6 12 13 2 6"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>';
  }

  function startOtp(purpose, data, notice) {
    flow.purpose = purpose;
    flow.challengeId = data.challenge_id;
    flow.channels = data.channels || [];
    flow.channel = flow.channels[0] ? flow.channels[0].type : null;
    flow.sentChannel = null;
    flow.resetToken = null;

    $('otp-title').textContent = purpose === 'reset' ? 'Atur ulang kata sandi' : 'Verifikasi masuk';
    $('otp-subtitle').textContent = flow.channels.length > 1
      ? 'Akunmu terdaftar dengan email dan nomor HP. Pilih ke mana kode verifikasi dikirim.'
      : 'Kode verifikasi akan dikirim ke:';
    $('otp-back-label').textContent = purpose === 'reset' ? 'Kembali' : 'Kembali ke masuk';
    $('otp-change-channel').hidden = flow.channels.length < 2;

    const list = $('otp-channels');
    list.innerHTML = flow.channels.map((c, i) => `
      <label class="channel-option">
        <input type="radio" name="otp-channel" value="${c.type}" ${i === 0 ? 'checked' : ''}>
        <span class="channel-icon">${channelIcon(c.type)}</span>
        <span class="channel-text"><b>${c.label}</b><small>${c.masked}</small></span>
      </label>`).join('');
    list.querySelectorAll('input').forEach(r => r.addEventListener('change', () => { flow.channel = r.value; }));

    show('otp');
    step('otp-step-channel');
    if (notice) showAlert(notice, 'success');
  }

  function channelBy(type) { return flow.channels.find(c => c.type === type) || {}; }

  function startTimer(seconds) {
    clearInterval(flow.timer);
    const btn = $('otp-resend-btn');
    const label = $('otp-timer');
    let left = seconds;
    btn.disabled = true;
    const tick = () => {
      if (left <= 0) {
        clearInterval(flow.timer);
        btn.disabled = false;
        label.textContent = '';
        return;
      }
      label.textContent = `(${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')})`;
      left -= 1;
    };
    tick();
    flow.timer = setInterval(tick, 1000);
  }

  function selectChannel(type) {
    flow.channel = type;
    const radio = document.querySelector(`input[name="otp-channel"][value="${type}"]`);
    if (radio) radio.checked = true;
  }

  /**
   * Kirim kode ke saluran yang dipilih.
   * Langkah "Masukkan kode" hanya ditampilkan bila kode benar-benar terkirim
   * (atau masih berlaku dari pengiriman sebelumnya ke saluran YANG SAMA).
   */
  async function sendCode(btn, { resend = false } = {}) {
    if (!flow.challengeId || !flow.channel) return;
    if (resend) btn.disabled = true;               // tombol kirim ulang berisi penghitung waktu, jangan ganti teksnya
    else setBusy(btn, true, 'Mengirim…');
    try {
      const { data, status } = await api('/auth/otp/send', { challenge_id: flow.challengeId, channel: flow.channel });
      if (data.status === 200 && data.data) {
        flow.sentChannel = flow.channel;
        const c = channelBy(flow.channel);
        $('otp-sent-via').textContent = c.label || (flow.channel === 'email' ? 'Email' : 'WhatsApp/SMS');
        $('otp-sent-to').textContent = data.data.sent_to;
        $('otp-dev-note').hidden = !data.data.dev_mode;
        clearBoxes();
        step('otp-step-code');
        startTimer(data.data.resend_in || 60);
        boxes[0].focus();
        showAlert(`Kode dikirim ke ${data.data.sent_to}.`, 'success');
        return;
      }
      if (status === 429 && data.data && data.data.retry_in && flow.channel === flow.sentChannel) {
        // kode sebelumnya ke saluran ini masih berlaku
        step('otp-step-code');
        startTimer(data.data.retry_in);
        showAlert(`Kode sebelumnya masih berlaku. Kirim ulang bisa dalam ${data.data.retry_in} detik.`, 'error');
        return;
      }
      if (status === 410) {
        showAlert(data.message || 'Sesi verifikasi berakhir. Ulangi dari awal.', 'error');
        show(flow.purpose === 'reset' ? 'reset' : 'signin');
        return;
      }
      showAlert(data.message || 'Kode gagal dikirim. Coba lagi.', 'error');
      if (resend) btn.disabled = false;
    } catch {
      showAlert(NETWORK_ERR, 'error');
      if (resend) btn.disabled = false;
    } finally {
      if (!resend) setBusy(btn, false);
    }
  }

  $('otp-send-btn')?.addEventListener('click', (e) => sendCode(e.currentTarget));
  $('otp-resend-btn')?.addEventListener('click', (e) => sendCode(e.currentTarget, { resend: true }));
  $('otp-change-channel')?.addEventListener('click', () => {
    clearInterval(flow.timer);
    $('otp-timer').textContent = '';
    // tawarkan saluran lain dari yang terakhir dipakai
    const other = flow.channels.find(c => c.type !== flow.sentChannel);
    if (other) selectChannel(other.type);
    step('otp-step-channel');
  });
  $('otp-back')?.addEventListener('click', () => {
    clearInterval(flow.timer);
    const onCode = !$('otp-step-code').hidden;
    if (onCode && flow.channels.length > 1) { step('otp-step-channel'); return; }
    show(flow.purpose === 'reset' ? 'reset' : 'signin');
  });

  // Kotak 6 digit: ketik, hapus, tempel
  const boxes = Array.from(document.querySelectorAll('#otp-boxes input'));
  const verifyBtn = $('otp-verify-btn');
  const codeValue = () => boxes.map(b => b.value).join('');
  function clearBoxes() { boxes.forEach(b => { b.value = ''; b.classList.remove('is-error'); }); verifyBtn.disabled = true; }
  function fillFrom(index, text) {
    const digits = text.replace(/\D/g, '').slice(0, 6 - index).split('');
    digits.forEach((d, i) => { boxes[index + i].value = d; });
    const next = Math.min(index + digits.length, 5);
    boxes[next].focus();
    onCodeChange();
  }
  function onCodeChange() {
    boxes.forEach(b => b.classList.remove('is-error'));
    const code = codeValue();
    verifyBtn.disabled = code.length !== 6;
    if (code.length === 6) $('otp-form').requestSubmit();
  }
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      const v = box.value.replace(/\D/g, '');
      if (v.length > 1) { fillFrom(i, v); return; }
      box.value = v;
      if (v && i < 5) boxes[i + 1].focus();
      onCodeChange();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ''; e.preventDefault(); onCodeChange(); }
      if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
      if (e.key === 'ArrowRight' && i < 5) boxes[i + 1].focus();
    });
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      fillFrom(i, (e.clipboardData || window.clipboardData).getData('text'));
    });
    box.addEventListener('focus', () => box.select());
  });

  $('otp-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = codeValue();
    if (code.length !== 6 || verifyBtn.dataset.busy) return;
    verifyBtn.dataset.busy = '1';
    setBusy(verifyBtn, true, 'Memverifikasi…');
    try {
      const { data } = await api('/auth/otp/verify', { challenge_id: flow.challengeId, code });
      if (data.status === 200 && data.data) {
        clearInterval(flow.timer);
        if (flow.purpose === 'reset') {
          flow.resetToken = data.data.reset_token;
          step('otp-step-newpass');
          $('new-password').focus();
        } else {
          setActiveSession({ token: data.data.token, user: data.data.user });
          showAlert('Berhasil masuk. Mengalihkan…', 'success');
          setTimeout(() => redirectByRole(data.data.user.role), 700);
        }
      } else {
        boxes.forEach(b => b.classList.add('is-error'));
        showAlert(data.message || 'Kode salah.', 'error');
        if (data.status === 410) { show(flow.purpose === 'reset' ? 'reset' : 'signin'); }
        boxes.forEach(b => { b.value = ''; });
        boxes[0].focus();
      }
    } catch {
      showAlert(NETWORK_ERR, 'error');
    } finally {
      delete verifyBtn.dataset.busy;
      setBusy(verifyBtn, false);
      verifyBtn.disabled = codeValue().length !== 6;
    }
  });

  // ── Kata sandi baru ───────────────────────────────────────────────────────
  $('newpass-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('new-password').value;
    const confirm = $('new-password-confirm').value;
    if (pw.length < 8) { showAlert('Kata sandi minimal 8 karakter.', 'error'); return; }
    if (pw !== confirm) { showAlert('Kedua kata sandi belum sama.', 'error'); $('new-password-confirm').focus(); return; }
    const btn = $('newpass-submit-btn');
    setBusy(btn, true, 'Menyimpan…');
    try {
      const { data } = await api('/auth/reset/complete', {
        challenge_id: flow.challengeId, reset_token: flow.resetToken, new_password: pw,
      });
      if (data.status === 200) {
        $('new-password').value = '';
        $('new-password-confirm').value = '';
        step('otp-step-done');
      } else {
        showAlert(data.message || 'Gagal menyimpan kata sandi baru.', 'error');
      }
    } catch {
      showAlert(NETWORK_ERR, 'error');
    } finally {
      setBusy(btn, false);
    }
  });
  $('otp-done-btn')?.addEventListener('click', () => {
    $('login-identifier').value = flow.identifier;
    $('login-password').value = '';
    show('signin');
    $('login-password').focus();
  });

  // ── Tautan langsung: login.html?reset=1&id=email ──────────────────────────
  const params = new URLSearchParams(window.location.search);
  if (params.get('reset') === '1') {
    if (params.get('id')) $('reset-identifier').value = params.get('id');
    show('reset');
  } else if (params.get('tab') === 'daftar') {
    show('signup');
    // Dari tombol "Buka toko": langsung pilih peran penjual
    if (params.get('role') === 'seller') {
      const sellerRadio = document.querySelector('input[name="reg-role-choice"][value="seller"]');
      if (sellerRadio) {
        sellerRadio.checked = true;
        sellerRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const title = document.querySelector('#signup-view .auth-title');
      if (title) title.textContent = 'Buka tokomu di Vendora';
      const sub = document.querySelector('#signup-view .auth-subtitle');
      if (sub) sub.textContent = 'Daftar sebagai penjual, lalu sewa ruko virtual dan mulai jualan.';
      const session = getActiveSession();
      if (session && session.user) {
        showAlert(`Kamu sedang masuk sebagai ${session.user.name || 'pembeli'}. Akun penjual memakai email terpisah.`, 'success');
      }
      setTimeout(() => $('reg-name')?.focus(), 100);
    }
  }
}
