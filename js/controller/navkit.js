// ─── Navigasi bersama: notifikasi (lonceng) & menu HP ────────────────────────
import { BASE_URL, getActiveSession, logout } from "../config/api.js?v=20261114";
import { esc } from "../ui.js?v=20261114";
import { CATEGORIES } from "../categories.js?v=20261114";

const SEEN_KEY = 'vendora_notif_seen';
const POLL_MS = 60000;

function relTime(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

const KIND_ICON = {
  order: '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>',
  shop: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v2a3 3 0 01-6 0 3 3 0 01-6 0 3 3 0 01-6 0z"/><path d="M5 13v8h14v-8"/>',
  ticket: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.4-4.6A8.4 8.4 0 0 1 3 11.5a8.5 8.5 0 0 1 9-8.4 8.5 8.5 0 0 1 9 8.4z"/>',
  escrow: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M16 15h2"/>',
  dispute: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  promo: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  system: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
};

/** Tautan notifikasi hanya ke halaman Vendora atau alamat https (bukan javascript:, data:, dll.). */
function safeLink(link) {
  const l = String(link || '').trim();
  if (!l) return '#';
  if (/^https:\/\//i.test(l)) return l;
  if (/[:\s"'<>\\]/.test(l) || l.startsWith('//')) return '#';
  return l;
}

/** Notifikasi dari server → bentuk yang dipakai panel. */
const toItem = (n) => ({
  id: n.id || '',
  kind: n.type || n.kind || 'system',
  title: n.title || '',
  body: n.message || n.body || '',
  link: safeLink(n.link),
  at: n.created_at || n.at,
  read: !!n.is_read,
});

const isNew = (n, seen) => !n.read && new Date(n.at) > seen;

function seenAt(userId) {
  try { return Number(JSON.parse(localStorage.getItem(SEEN_KEY) || '{}')[userId] || 0); } catch { return 0; }
}
function markSeen(userId) {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
    all[userId] = Date.now();
    localStorage.setItem(SEEN_KEY, JSON.stringify(all));
  } catch { /* abaikan */ }
}

/** Lonceng notifikasi. Tombol: elemen dengan [data-notif-btn]. */
export function initNotifications() {
  const btn = document.querySelector('[data-notif-btn]');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.style.position = 'relative';
  const badge = document.createElement('span');
  badge.className = 'notif-badge';
  badge.hidden = true;
  btn.appendChild(badge);

  const panel = document.createElement('div');
  panel.className = 'notif-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Notifikasi');
  panel.hidden = true;
  document.body.appendChild(panel);

  const session = getActiveSession();
  let items = [];

  const position = () => {
    const r = btn.getBoundingClientRect();
    const w = Math.min(380, window.innerWidth - 24);
    panel.style.width = `${w}px`;
    panel.style.top = `${r.bottom + 10}px`;
    panel.style.left = `${Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12))}px`;
  };

  const render = () => {
    if (!session) {
      panel.innerHTML = `
        <div class="notif-head"><b>Notifikasi</b></div>
        <div class="notif-empty">Masuk untuk melihat status pesanan, dana, promo, dan balasan tim Vendora.
          <a href="login.html" class="btn-ink btn-ink--sm">Masuk</a></div>`;
      return;
    }
    const seen = seenAt(session.user.id);
    panel.innerHTML = `
      <div class="notif-head"><b>Notifikasi</b>${items.length ? '<button type="button" class="notif-mark">Tandai sudah dibaca</button>' : ''}</div>
      ${items.length ? `<ul class="notif-list">${items.map(n => `
        <li><a href="${esc(n.link)}" class="notif-item${isNew(n, seen) ? ' is-new' : ''}"${n.id ? ` data-nid="${esc(n.id)}"` : ''}>
          <span class="notif-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${KIND_ICON[n.kind] || KIND_ICON.order}</svg></span>
          <span class="notif-text"><b>${esc(n.title)}</b>${n.body ? `<span>${esc(n.body)}</span>` : ''}<time>${esc(relTime(n.at))}</time></span>
        </a></li>`).join('')}</ul>` : '<div class="notif-empty">Belum ada notifikasi.</div>'}`;
    panel.querySelectorAll('.notif-item[data-nid]').forEach(a => a.addEventListener('click', () => {
      const nid = a.dataset.nid;
      if (!nid) return;
      const found = items.find(x => x.id === nid);
      if (found) found.read = true;
      fetch(`${BASE_URL}/notifications/${encodeURIComponent(nid)}/read`, { method: 'PUT', keepalive: true }).catch(() => {});
    }));
    panel.querySelector('.notif-mark')?.addEventListener('click', () => {
      markSeen(session.user.id);
      items.forEach(n => { n.read = true; });
      fetch(`${BASE_URL}/notifications/read-all`, { method: 'PUT' }).catch(() => {});
      updateBadge(); render();
    });
  };

  const updateBadge = () => {
    if (!session) return;
    const seen = seenAt(session.user.id);
    const n = items.filter(x => isNew(x, seen)).length;
    badge.hidden = n === 0;
    badge.textContent = n > 9 ? '9+' : n;
    btn.setAttribute('aria-label', n ? `Notifikasi, ${n} baru` : 'Notifikasi');
  };

  const load = async () => {
    if (!session) return;
    try {
      const res = await fetch(`${BASE_URL}/notifications`);
      const d = await res.json();
      if (res.ok) {
        const list = Array.isArray(d.data) ? d.data : ((d.data && d.data.notifications) || []);
        items = list.map(toItem).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 30);
        updateBadge(); if (!panel.hidden) render();
      }
    } catch { /* coba lagi nanti */ }
  };

  const close = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!panel.hidden) { close(); return; }
    render();
    position();
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  });
  document.addEventListener('click', (e) => { if (!panel.hidden && !panel.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  window.addEventListener('resize', () => { if (!panel.hidden) position(); });
  window.addEventListener('scroll', () => { if (!panel.hidden) position(); }, { passive: true });

  load();
  setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);
}

/** Menu HP (tombol ☰): akun, kategori lengkap, bantuan. */
export function initMobileMenu() {
  const btn = document.getElementById('nav-mobile-menu-btn');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  const session = getActiveSession();
  const u = session && session.user;

  const drawer = document.createElement('div');
  drawer.className = 'mnav';
  drawer.hidden = true;
  drawer.innerHTML = `
    <div class="mnav-backdrop" data-close></div>
    <nav class="mnav-panel" aria-label="Menu utama" role="dialog" aria-modal="true">
      <div class="mnav-head">
        ${u ? `<div class="mnav-user"><span class="nav-avatar" aria-hidden="true">${esc((u.name || 'U').charAt(0).toUpperCase())}</span><div><b>${esc(u.name || 'Akun')}</b><small>${esc(u.email || '')}</small></div></div>`
            : '<div class="mnav-auth"><a href="login.html" class="btn-line btn-line--sm">Masuk</a><a href="login.html?tab=daftar" class="btn-ink btn-ink--sm">Daftar</a></div>'}
        <button type="button" class="mnav-close" data-close aria-label="Tutup menu"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="mnav-body">
        <div class="mnav-group">
          <a href="index.html">Beranda</a>
          ${u && u.role !== 'admin' ? '<a href="pesanan.html">Pesanan saya</a>' : (!u ? '<a href="pesanan.html">Lacak pesanan</a>' : '')}
          ${u ? '<a href="akun.html">Pengaturan akun</a>' : ''}
          ${u && u.role === 'seller' ? '<a href="seller.html">Toko saya</a>' : ''}
          ${u && u.role === 'admin' ? '<a href="admin.html">Konsol admin</a>' : ''}
        </div>
        <p class="mnav-label">Kategori</p>
        <div class="mnav-cats">
          ${CATEGORIES.map(c => `
            <details>
              <summary>${esc(c.label)}</summary>
              <a href="index.html?cat=${encodeURIComponent(c.key)}">Semua ${esc(c.label.toLowerCase())}</a>
              ${c.subs.map(sub => `<a href="index.html?cat=${encodeURIComponent(`sub:${c.key}|${sub}`)}">${esc(sub)}</a>`).join('')}
            </details>`).join('')}
        </div>
        <p class="mnav-label">Bantuan</p>
        <div class="mnav-group">
          <a href="bantuan.html">Pusat bantuan</a>
          <a href="bantuan.html#pengembalian">Pengembalian</a>
          <a href="tentang.html">Tentang Vendora</a>
        </div>
      </div>
      <div class="mnav-foot">
        ${u ? '<button type="button" class="btn-line" data-logout>Keluar</button>' : ''}
        ${!u || u.role === 'buyer' ? '<a href="login.html?tab=daftar&amp;role=seller" class="btn-ink" data-open-shop>Buka toko</a>' : ''}
      </div>
    </nav>`;
  document.body.appendChild(drawer);

  const open = () => {
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add('is-open'));
    document.body.style.overflow = 'hidden';
    btn.setAttribute('aria-expanded', 'true');
    drawer.querySelector('.mnav-close').focus();
  };
  const close = () => {
    drawer.classList.remove('is-open');
    document.body.style.overflow = '';
    btn.setAttribute('aria-expanded', 'false');
    setTimeout(() => { drawer.hidden = true; }, 260);
  };
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', open);
  drawer.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) close(); });
  drawer.querySelector('[data-logout]')?.addEventListener('click', async () => { await logout(); location.href = 'index.html'; });
}
