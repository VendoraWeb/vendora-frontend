// ─── Konfigurasi API & sesi login ───────────────────────────────────────────
// Produksi: backend di Vercel. Pengembangan lokal (frontend dibuka dari localhost /
// 127.0.0.1): backend lokal `go run .` di port 8081.
// Paksa salah satu lewat konsol browser:
//   localStorage.setItem('vendora_api_base', 'https://vendora-backend-zeta.vercel.app/api')
//   localStorage.removeItem('vendora_api_base')   // kembali otomatis
const PROD_API = 'https://vendora-backend-zeta.vercel.app/api';
const LOCAL_API = 'http://127.0.0.1:8081/api';
const SESSION_KEY = 'vendora_session';

function resolveApiBase() {
  try {
    const override = localStorage.getItem('vendora_api_base');
    if (override) return override.replace(/\/+$/, '');
  } catch (e) { /* storage diblokir */ }
  const host = window.location.hostname;
  return (host === 'localhost' || host === '127.0.0.1') ? LOCAL_API : PROD_API;
}

export const BASE_URL = resolveApiBase();

// Sesi disimpan di localStorage supaya tetap masuk saat membuka tab baru atau
// menutup browser (token berlaku 30 hari di server). Bila localStorage diblokir,
// pakai sessionStorage sebagai cadangan.
function store() {
  try { localStorage.setItem('__vdr', '1'); localStorage.removeItem('__vdr'); return localStorage; }
  catch (e) { return window.sessionStorage; }
}

export function getActiveSession() {
  try {
    const raw = store().getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.token && s.user ? s : null;
  } catch (e) {
    return null;
  }
}

export function setActiveSession(sessionData) {
  try {
    const st = store();
    st.setItem(SESSION_KEY, JSON.stringify(sessionData));
    if (st !== sessionStorage) sessionStorage.removeItem(SESSION_KEY); // bersihkan format lama
  } catch (e) {
    console.warn('Penyimpanan diblokir', e);
  }
}

export function clearActiveSession() {
  try { store().removeItem(SESSION_KEY); } catch (e) { /* abaikan */ }
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* abaikan */ }
}

/** Header Authorization untuk endpoint yang butuh login. Semua fetch ke BASE_URL juga
 *  otomatis membawa token (lihat pembungkus fetch di bawah); fungsi ini untuk kode yang
 *  ingin menyebut header-nya secara eksplisit. */
export function authHeaders(extra = {}) {
  const s = getActiveSession();
  const h = { ...extra };
  if (s && s.token) h['Authorization'] = `Bearer ${s.token}`;
  return h;
}

/** Perbarui data user di sesi tanpa mengganti token (mis. setelah menyewa ruko). */
export function updateSessionUser(patch) {
  const s = getActiveSession();
  if (!s) return;
  s.user = { ...s.user, ...patch };
  setActiveSession(s);
}

// ─── Token otomatis di setiap panggilan API ─────────────────────────────────
// Semua modul memakai fetch(`${BASE_URL}/...`). Di sini header Authorization
// ditambahkan sekali untuk semuanya, dan sesi kedaluwarsa (401) ditangani di satu tempat.
const nativeFetch = window.fetch.bind(window);
let expiredNotified = false;
const PRIVATE_PAGES = ['seller.html', 'admin.html', 'akun.html', 'pesanan.html'];

window.fetch = function (input, init = {}) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if (!url.startsWith(BASE_URL)) return nativeFetch(input, init);

  const session = getActiveSession();
  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
  if (session && session.token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${session.token}`);
  }
  return nativeFetch(input, { ...init, headers }).then((res) => {
    const isAuthCall = /\/(login|register|auth\/)/.test(url);
    if (res.status === 401 && session && !isAuthCall && !expiredNotified) {
      expiredNotified = true;
      clearActiveSession();
      const rawPage = location.pathname.split('/').pop() || 'index.html';
      const page = rawPage.includes('.') ? rawPage : `${rawPage}.html`;
      if (PRIVATE_PAGES.includes(page)) {
        // Halaman khusus akun: minta masuk lagi lalu kembali ke halaman ini
        if (window.showAlert) window.showAlert('Sesi berakhir. Silakan masuk lagi.', 'error');
        const next = encodeURIComponent(page + location.search + location.hash);
        setTimeout(() => { window.location.href = `login.html?next=${next}`; }, 1400);
      } else {
        // Halaman publik (belanja, bantuan, …): cukup lanjut sebagai tamu
        if (window.showAlert) window.showAlert('Sesi berakhir. Kamu bisa masuk lagi kapan saja.', 'error');
        setTimeout(() => window.location.reload(), 1400);
      }
    }
    return res;
  });
};

/** Keluar: hapus sesi di server lalu di browser. */
export async function logout() {
  try { await fetch(`${BASE_URL}/logout`, { method: 'POST' }); } catch (e) { /* tetap keluar */ }
  clearActiveSession();
}
