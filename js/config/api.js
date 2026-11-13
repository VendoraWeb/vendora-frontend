// API Configuration
// Produksi: backend di Vercel. Pengembangan lokal (frontend dibuka dari localhost /
// 127.0.0.1): backend lokal `go run main.go` di port 8081.
// Paksa salah satu lewat konsol browser:
//   localStorage.setItem('vendora_api_base', 'https://vendora-backend-zeta.vercel.app/api')
//   localStorage.removeItem('vendora_api_base')   // kembali otomatis
const PROD_API = 'https://vendora-backend-zeta.vercel.app/api';
const LOCAL_API = 'http://127.0.0.1:8081/api';

function resolveApiBase() {
  try {
    const override = localStorage.getItem('vendora_api_base');
    if (override) return override.replace(/\/+$/, '');
  } catch (e) { /* storage diblokir */ }
  const host = window.location.hostname;
  return (host === 'localhost' || host === '127.0.0.1') ? LOCAL_API : PROD_API;
}

export const BASE_URL = resolveApiBase();

// Helper to get active session user (cek sessionStorage lalu fallback ke localStorage)
export function getActiveSession() {
  try {
    const sStr = sessionStorage.getItem('vendora_session') || localStorage.getItem('vendora_session');
    if (!sStr) return null;
    return JSON.parse(sStr);
  } catch (e) {
    return null;
  }
}

// Helper to set active session (simpan di sessionStorage & localStorage agar sinkron)
export function setActiveSession(sessionData) {
  try {
    const json = JSON.stringify(sessionData);
    sessionStorage.setItem('vendora_session', json);
    localStorage.setItem('vendora_session', json);
  } catch (e) {
    console.warn('Storage blocked', e);
  }
}

// Header Authorization untuk endpoint yang butuh login (ubah status pesanan, komplain, dompet, dll.)
export function authHeaders(extra = {}) {
  const s = getActiveSession();
  const h = { ...extra };
  if (s && s.token) h['Authorization'] = `Bearer ${s.token}`;
  return h;
}

// Helper to clear session
export function clearActiveSession() {
  try {
    sessionStorage.removeItem('vendora_session');
    localStorage.removeItem('vendora_session');
  } catch (e) {}
}
