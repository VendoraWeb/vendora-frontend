// ─── Chat Vendora (gaya WhatsApp) ───────────────────────────────────────────
// Satu dock chat di pojok kanan bawah untuk pembeli dan penjual:
// daftar percakapan → utas pesan, kirim teks & foto, centang terkirim/dibaca.
// "Real-time" lewat polling 2 detik (backend Vercel tidak mendukung WebSocket),
// berhenti otomatis saat tab tidak aktif agar hemat kuota.
import { BASE_URL, getActiveSession, authHeaders } from "../config/api.js?v=105";
import { esc } from "../ui.js?v=102";

const POLL_THREAD = 2000;
const POLL_LIST = 5000;
const POLL_BADGE = 15000;
const MAX_DIM = 1600;

const ICON = {
  chat: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.4-4.6A8.4 8.4 0 0 1 3 11.5a8.5 8.5 0 0 1 9-8.4 8.5 8.5 0 0 1 9 8.4z"/></svg>',
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  clip: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>',
  send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>',
  camera: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  tick: '<svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 6 4.5 9.5 11 2"/></svg>',
  ticks: '<svg width="18" height="11" viewBox="0 0 18 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 6 4.5 9.5 11 2"/><polyline points="7.5 9.5 14 2"/></svg>',
  clock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
};

export const mediaUrl = (id) => `${BASE_URL}/chat/media/${encodeURIComponent(id)}`;

// ─── Waktu ──────────────────────────────────────────────────────────────────
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
function dayLabel(d) {
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return 'Hari ini';
  if (dayKey(d) === dayKey(yest)) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
const clock = (d) => d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
function listTime(iso) {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(new Date())) return clock(d);
  const label = dayLabel(d);
  return label === 'Kemarin' ? label : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

/** Teks aman + tautan bisa diklik. */
function richText(t) {
  return esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

// ─── Foto: kompres di browser sebelum dikirim ────────────────────────────────
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { reject(new Error('Pilih file foto (JPG, PNG, WEBP, atau GIF).')); return; }
    if (file.size > 15 * 1024 * 1024) { reject(new Error('Foto terlalu besar (maksimal 15 MB).')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Foto tidak bisa dibaca.'));
    reader.onload = () => {
      // GIF kecil dikirim apa adanya agar animasinya tetap jalan
      if (file.type === 'image/gif' && file.size < 2.5 * 1024 * 1024) { resolve(reader.result); return; }
      const img = new Image();
      img.onerror = () => reject(new Error('Foto tidak bisa dibuka.'));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // PNG transparan → latar putih
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Lightbox foto ──────────────────────────────────────────────────────────
function openLightbox(src) {
  let box = document.getElementById('cm-lightbox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'cm-lightbox';
    box.className = 'cm-lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Foto');
    box.innerHTML = `<button type="button" class="cm-lightbox-x" aria-label="Tutup">${ICON.close}</button><img alt="">`;
    box.addEventListener('click', (e) => { if (e.target.tagName !== 'IMG') box.classList.remove('is-open'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.classList.remove('is-open'); });
    document.body.appendChild(box);
  }
  box.querySelector('img').src = src;
  box.classList.add('is-open');
  box.querySelector('.cm-lightbox-x').focus();
}

// ─── API ────────────────────────────────────────────────────────────────────
async function getJSON(url) {
  const res = await fetch(url, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Gagal memuat chat');
  return data.data;
}
async function postJSON(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Pesan gagal terkirim');
  return data.data;
}

// ─── Utas pesan ─────────────────────────────────────────────────────────────
/**
 * conv: { myId, buyerId, shopId, receiverId (kosong = pemilik toko), title, subtitle }
 */
function createThread(root, conv, { onActivity } = {}) {
  const box = root.querySelector('.cm-messages');
  const rendered = new Map();       // id pesan → elemen baris
  let lastDay = '';
  let timer = null;
  let stopped = false;
  let firstLoad = true;
  let loaded = false;
  let sending = 0;   // selama pesan dikirim, polling ditahan agar tidak muncul dobel
  let tempSeq = 0;

  box.innerHTML = '<div class="cm-loading">Memuat percakapan…</div>';

  const nearBottom = () => box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const toBottom = () => { box.scrollTop = box.scrollHeight; };

  function rowHTML(m, mine, pending = false) {
    const d = new Date(m.created_at);
    const status = pending ? `<span class="cm-tick is-pending" title="Mengirim">${ICON.clock}</span>`
      : mine ? `<span class="cm-tick${m.read_at ? ' is-read' : ''}" title="${m.read_at ? 'Dibaca' : 'Terkirim'}">${m.read_at ? ICON.ticks : ICON.tick}</span>` : '';
    const img = m.image || m._preview;
    return `
      <div class="cm-bubble${img ? ' has-photo' : ''}${img && !m.text ? ' photo-only' : ''}">
        ${img ? `<button type="button" class="cm-photo" data-full="${esc(m._preview || mediaUrl(m.image))}" aria-label="Lihat foto"><img src="${esc(m._preview || mediaUrl(m.image))}" alt="Foto" loading="lazy"></button>` : ''}
        ${m.text ? `<p class="cm-text">${richText(m.text)}</p>` : ''}
        <span class="cm-meta"><time datetime="${esc(m.created_at)}">${clock(d)}</time>${status}</span>
      </div>`;
  }

  function addDayIfNeeded(d) {
    const k = dayKey(d);
    if (k === lastDay) return;
    lastDay = k;
    const sep = document.createElement('div');
    sep.className = 'cm-day';
    sep.innerHTML = `<span>${esc(dayLabel(d))}</span>`;
    box.appendChild(sep);
  }

  function append(m, { pending = false } = {}) {
    const mine = m.sender_id === conv.myId;
    addDayIfNeeded(new Date(m.created_at));
    const row = document.createElement('div');
    row.className = `cm-row ${mine ? 'cm-row--me' : 'cm-row--them'}`;
    row.dataset.read = m.read_at ? '1' : '';
    row.innerHTML = rowHTML(m, mine, pending);
    box.appendChild(row);
    return row;
  }

  function renderAll(list) {
    const wasBottom = firstLoad || nearBottom();
    if (firstLoad) {
      box.innerHTML = list.length ? '' : `
        <div class="cm-empty">
          <span class="cm-empty-icon" aria-hidden="true">${ICON.chat}</span>
          <b>Mulai percakapan</b>
          <span>${esc(conv.emptyHint || 'Tanyakan stok, ukuran, atau warna sebelum membeli.')}</span>
        </div>`;
    }
    let incoming = false;
    list.forEach(m => {
      const existing = rendered.get(m.id);
      if (existing) {
        // Perbarui centang biru bila pesan kita sudah dibaca
        if (m.sender_id === conv.myId && m.read_at && !existing.dataset.read) {
          existing.dataset.read = '1';
          const tick = existing.querySelector('.cm-tick');
          if (tick) { tick.classList.add('is-read'); tick.innerHTML = ICON.ticks; tick.title = 'Dibaca'; }
        }
        return;
      }
      box.querySelector('.cm-empty')?.remove();
      rendered.set(m.id, append(m));
      if (m.sender_id !== conv.myId) incoming = true;
    });
    if (wasBottom) requestAnimationFrame(toBottom);
    if (incoming && !firstLoad && !wasBottom) root.querySelector('.cm-jump')?.removeAttribute('hidden');
    firstLoad = false;
    return incoming || list.some(m => m.sender_id !== conv.myId && !m.read_at);
  }

  async function refresh() {
    if (stopped || sending) return;
    try {
      const list = await getJSON(`${BASE_URL}/chat/history?buyer_id=${encodeURIComponent(conv.buyerId)}&shop_id=${encodeURIComponent(conv.shopId)}`);
      if (stopped || sending) return;
      const unreadIncoming = renderAll(list || []);
      loaded = true;
      if (unreadIncoming && document.visibilityState === 'visible') {
        postJSON('/chat/read', { reader_id: conv.myId, buyer_id: conv.buyerId, shop_id: conv.shopId })
          .then(() => onActivity && onActivity()).catch(() => {});
      }
    } catch (e) {
      if (firstLoad) box.innerHTML = `<div class="cm-loading">Gagal memuat chat. Mencoba lagi…</div>`;
    }
  }

  function loop() {
    clearTimeout(timer);
    if (stopped) return;
    timer = setTimeout(async () => {
      if (document.visibilityState === 'visible') await refresh();
      loop();
    }, POLL_THREAD);
  }

  async function send({ text, image }) {
    const now = new Date().toISOString();
    const temp = { id: `tmp${++tempSeq}`, sender_id: conv.myId, text, created_at: now, _preview: image || '' };
    box.querySelector('.cm-empty')?.remove();
    const row = append(temp, { pending: true });
    row.classList.add('is-pending');
    toBottom();
    sending++;
    try {
      const isFirst = loaded && rendered.size === 0;
      const msg = await postJSON('/chat/send', {
        sender_id: conv.myId, receiver_id: conv.receiverId || '', shop_id: conv.shopId, text, image: image || '',
      });
      row.classList.remove('is-pending');
      row.innerHTML = rowHTML({ ...msg, _preview: image || '' }, true);
      rendered.set(msg.id, row);
      onActivity && onActivity();
      if (isFirst && conv.autoReply) conv.autoReply();
      return true;
    } catch (e) {
      row.classList.add('is-failed');
      row.querySelector('.cm-meta').innerHTML = `<span class="cm-failed">Gagal terkirim</span>`;
      throw e;
    } finally {
      sending--;
    }
  }

  box.addEventListener('click', (e) => {
    const ph = e.target.closest('.cm-photo');
    if (ph) openLightbox(ph.dataset.full);
  });
  box.addEventListener('scroll', () => { if (nearBottom()) root.querySelector('.cm-jump')?.setAttribute('hidden', ''); });

  const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
  document.addEventListener('visibilitychange', onVisible);

  refresh().then(loop);

  return {
    send,
    refresh,
    toBottom,
    stop() { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); },
  };
}

// ─── Dock chat (daftar + utas) ──────────────────────────────────────────────
let dock = null;

function shopIdOfSeller(session) {
  try {
    const active = localStorage.getItem('vendora_active_shop_id');
    if (active && active !== '000000000000000000000000') return active;
  } catch { /* abaikan */ }
  const id = session.user.shop_id;
  return id && id !== '000000000000000000000000' ? id : '';
}

export function initChatDock() {
  const session = getActiveSession();
  if (!session || !session.user || !['buyer', 'seller'].includes(session.user.role)) {
    // Tamu: tombol chat di halaman produk mengarahkan ke halaman masuk
    window.openShopChat = () => {
      if (window.showAlert) window.showAlert('Masuk dulu untuk chat dengan penjual.', 'error');
      setTimeout(() => { window.location.href = 'login.html'; }, 1200);
    };
    return;
  }
  if (dock) return;
  const me = session.user;
  const isSeller = me.role === 'seller';

  const el = document.createElement('div');
  el.className = 'cdock';
  el.innerHTML = `
    <button type="button" class="cdock-fab" aria-label="Buka chat" aria-expanded="false">
      ${ICON.chat}<span class="cdock-badge" hidden>0</span>
    </button>
    <section class="cdock-panel" role="dialog" aria-label="Chat" hidden>
      <div class="cdock-view cdock-list-view">
        <header class="cdock-head">
          <div class="cdock-head-text"><b>Chat</b><small>${isSeller ? 'Pesan dari pembeli tokomu' : 'Percakapan dengan penjual'}</small></div>
          <button type="button" class="cdock-icon" data-close aria-label="Tutup">${ICON.close}</button>
        </header>
        <div class="cdock-search"><input type="search" placeholder="Cari nama" aria-label="Cari percakapan" autocomplete="off"></div>
        <div class="cdock-list" role="list"><div class="cm-loading">Memuat…</div></div>
      </div>
      <div class="cdock-view cdock-thread-view" hidden>
        <header class="cdock-head">
          <button type="button" class="cdock-icon" data-back aria-label="Kembali">${ICON.back}</button>
          <span class="cdock-avatar" aria-hidden="true"></span>
          <div class="cdock-head-text"><b class="cdock-title"></b><small class="cdock-sub"></small></div>
          <button type="button" class="cdock-icon" data-close aria-label="Tutup">${ICON.close}</button>
        </header>
        <div class="cm-messages" aria-live="polite"></div>
        <button type="button" class="cm-jump" hidden>Pesan baru ↓</button>
        <form class="cm-compose" novalidate>
          <div class="cm-preview" hidden>
            <img alt="Pratinjau foto">
            <span>Foto siap dikirim. Tambahkan keterangan bila perlu.</span>
            <button type="button" class="cdock-icon cm-preview-x" aria-label="Batalkan foto">${ICON.close}</button>
          </div>
          <div class="cm-compose-row">
            <button type="button" class="cm-attach" aria-label="Kirim foto" title="Kirim foto">${ICON.clip}</button>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
            <textarea rows="1" placeholder="Tulis pesan" aria-label="Tulis pesan" maxlength="2000"></textarea>
            <button type="submit" class="cm-send" aria-label="Kirim">${ICON.send}</button>
          </div>
        </form>
      </div>
    </section>`;
  document.body.appendChild(el);

  const fab = el.querySelector('.cdock-fab');
  const badge = el.querySelector('.cdock-badge');
  const panel = el.querySelector('.cdock-panel');
  const listView = el.querySelector('.cdock-list-view');
  const threadView = el.querySelector('.cdock-thread-view');
  const listEl = el.querySelector('.cdock-list');
  const search = el.querySelector('.cdock-search input');
  const form = el.querySelector('.cm-compose');
  const textarea = form.querySelector('textarea');
  const fileInput = form.querySelector('input[type=file]');
  const preview = form.querySelector('.cm-preview');
  let thread = null;
  let listTimer = null;
  let items = [];
  let pendingImage = '';

  const isOpen = () => !panel.hidden;

  // ── Badge belum dibaca ──
  async function refreshBadge() {
    try {
      const d = await getJSON(`${BASE_URL}/chat/unread?user_id=${encodeURIComponent(me.id)}`);
      const n = d && d.unread ? d.unread : 0;
      badge.hidden = n === 0;
      badge.textContent = n > 99 ? '99+' : n;
      fab.setAttribute('aria-label', n ? `Buka chat, ${n} pesan belum dibaca` : 'Buka chat');
    } catch { /* diam saja */ }
  }
  refreshBadge();
  setInterval(() => { if (document.visibilityState === 'visible' && !isOpen()) refreshBadge(); }, POLL_BADGE);

  // ── Daftar percakapan ──
  function renderList() {
    const q = search.value.trim().toLowerCase();
    const shown = items.filter(i => !q || i.name.toLowerCase().includes(q));
    if (!items.length) {
      listEl.innerHTML = `
        <div class="cm-empty">
          <span class="cm-empty-icon" aria-hidden="true">${ICON.chat}</span>
          <b>Belum ada chat</b>
          <span>${isSeller ? 'Pesan dari pembeli akan muncul di sini.' : 'Buka halaman produk lalu tekan “Chat” untuk bertanya ke penjual.'}</span>
        </div>`;
      return;
    }
    if (!shown.length) { listEl.innerHTML = '<div class="cm-loading">Tidak ada yang cocok.</div>'; return; }
    listEl.innerHTML = shown.map(i => `
      <button type="button" class="cdock-item${i.unread ? ' has-unread' : ''}" data-idx="${items.indexOf(i)}" role="listitem">
        ${i.avatar ? `<img class="cdock-avatar" src="${esc(i.avatar)}" alt="">` : `<span class="cdock-avatar" aria-hidden="true">${esc(i.name.charAt(0).toUpperCase())}</span>`}
        <span class="cdock-item-main">
          <span class="cdock-item-top"><b>${esc(i.name)}</b><time>${esc(listTime(i.updated_at))}</time></span>
          <span class="cdock-item-bottom">
            <span class="cdock-preview">${i.fromMe ? 'Kamu: ' : ''}${i.isImage ? `${ICON.camera} ${i.text ? esc(i.text) : 'Foto'}` : esc(i.text)}</span>
            ${i.unread ? `<span class="cdock-unread">${i.unread}</span>` : ''}
          </span>
        </span>
      </button>`).join('');
  }

  async function loadList() {
    try {
      let data;
      if (isSeller) {
        const shopId = shopIdOfSeller(getActiveSession() || session);
        if (!shopId) { items = []; listEl.innerHTML = '<div class="cm-loading">Buka ruko dulu untuk menerima chat pembeli.</div>'; return; }
        data = await getJSON(`${BASE_URL}/chat/inbox?shop_id=${encodeURIComponent(shopId)}`);
        items = (data || []).map(x => ({
          name: x.buyer_name || 'Pembeli', avatar: x.buyer_avatar || '', text: x.last_message || '', isImage: x.last_is_image,
          fromMe: x.last_from_me, unread: x.unread || 0, updated_at: x.updated_at,
          conv: { myId: me.id, buyerId: x.buyer_id, shopId, receiverId: x.buyer_id, title: x.buyer_name || 'Pembeli', subtitle: 'Pembeli', emptyHint: 'Balas pertanyaan pembeli di sini.' },
        }));
      } else {
        data = await getJSON(`${BASE_URL}/chat/inbox?buyer_id=${encodeURIComponent(me.id)}`);
        items = (data || []).map(x => ({
          name: x.shop_name || 'Toko', avatar: '', text: x.last_message || '', isImage: x.last_is_image,
          fromMe: x.last_from_me, unread: x.unread || 0, updated_at: x.updated_at,
          conv: { myId: me.id, buyerId: me.id, shopId: x.shop_id, receiverId: '', title: x.shop_name || 'Toko', subtitle: 'Penjual · Merchant terverifikasi' },
        }));
      }
      renderList();
      const total = items.reduce((s, i) => s + i.unread, 0);
      badge.hidden = total === 0;
      badge.textContent = total > 99 ? '99+' : total;
    } catch {
      if (!items.length) listEl.innerHTML = '<div class="cm-loading">Gagal memuat chat. Mencoba lagi…</div>';
    }
  }

  function startListPolling() {
    clearInterval(listTimer);
    loadList();
    listTimer = setInterval(() => { if (document.visibilityState === 'visible' && isOpen() && threadView.hidden) loadList(); }, POLL_LIST);
  }

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.cdock-item');
    if (!btn) return;
    const it = items[+btn.dataset.idx];
    if (it) openThread(it.conv);
  });
  search.addEventListener('input', renderList);

  // ── Buka / tutup ──
  function openPanel() {
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    el.classList.add('is-open');
    if (threadView.hidden) startListPolling();
  }
  function closePanel() {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    el.classList.remove('is-open');
    clearInterval(listTimer);
    if (thread) { thread.stop(); thread = null; }
    threadView.hidden = true;
    listView.hidden = false;
    refreshBadge();
  }
  function showList() {
    if (thread) { thread.stop(); thread = null; }
    threadView.hidden = true;
    listView.hidden = false;
    clearPending();
    startListPolling();
  }

  function openThread(conv) {
    clearInterval(listTimer);
    if (thread) thread.stop();
    listView.hidden = true;
    threadView.hidden = false;
    threadView.querySelector('.cdock-title').textContent = conv.title;
    threadView.querySelector('.cdock-sub').textContent = conv.subtitle || '';
    threadView.querySelector('.cdock-head .cdock-avatar').textContent = (conv.title || '?').charAt(0).toUpperCase();
    threadView.querySelector('.cm-jump').hidden = true;
    clearPending();
    textarea.value = '';
    autoGrow();
    thread = createThread(threadView, conv, { onActivity: refreshBadge });
    if (window.matchMedia('(pointer: fine)').matches) setTimeout(() => textarea.focus(), 50);
  }

  fab.addEventListener('click', () => (isOpen() ? closePanel() : openPanel()));
  el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closePanel));
  el.querySelector('[data-back]').addEventListener('click', showList);
  el.querySelector('.cm-jump').addEventListener('click', (e) => { e.currentTarget.hidden = true; thread && thread.toBottom(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    if (document.getElementById('cm-lightbox')?.classList.contains('is-open')) return;
    closePanel();
  });

  // ── Menulis & mengirim ──
  function autoGrow() {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }
  function clearPending() {
    pendingImage = '';
    preview.hidden = true;
    preview.querySelector('img').removeAttribute('src');
    fileInput.value = '';
  }
  async function attach(file) {
    try {
      pendingImage = await compressImage(file);
      preview.querySelector('img').src = pendingImage;
      preview.hidden = false;
      textarea.placeholder = 'Tambah keterangan (opsional)';
      textarea.focus();
    } catch (err) {
      if (window.showAlert) window.showAlert(err.message, 'error');
    }
  }

  textarea.addEventListener('input', autoGrow);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  textarea.addEventListener('paste', (e) => {
    const file = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
    if (file) { e.preventDefault(); attach(file); }
  });
  form.querySelector('.cm-attach').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) attach(fileInput.files[0]); });
  preview.querySelector('.cm-preview-x').addEventListener('click', () => { clearPending(); textarea.placeholder = 'Tulis pesan'; textarea.focus(); });

  const messages = threadView.querySelector('.cm-messages');
  messages.addEventListener('dragover', (e) => { e.preventDefault(); messages.classList.add('is-drop'); });
  messages.addEventListener('dragleave', () => messages.classList.remove('is-drop'));
  messages.addEventListener('drop', (e) => {
    e.preventDefault();
    messages.classList.remove('is-drop');
    const file = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
    if (file) attach(file);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!thread) return;
    const text = textarea.value.trim();
    const image = pendingImage;
    if (!text && !image) return;
    textarea.value = '';
    textarea.placeholder = 'Tulis pesan';
    autoGrow();
    clearPending();
    try {
      await thread.send({ text, image });
    } catch (err) {
      if (window.showAlert) window.showAlert(err.message || 'Pesan gagal terkirim.', 'error');
    }
  });

  // ── Dibuka dari halaman produk / toko ──
  window.openShopChat = (shop, name) => {
    if (!shop || !shop.id) return;
    if (isSeller && shopIdOfSeller(session) === shop.id) {
      if (window.showAlert) window.showAlert('Ini tokomu sendiri. Pesan pembeli ada di daftar chat.', 'error');
      openPanel();
      return;
    }
    openPanel();
    openThread({
      myId: me.id, buyerId: me.id, shopId: shop.id, receiverId: '',
      title: name || shop.name, subtitle: 'Penjual · Merchant terverifikasi',
      autoReply: () => sendGreeting(shop),
    });
  };

  // Salam otomatis toko untuk pesan pertama kini ditangani langsung oleh backend
  function sendGreeting() {
    setTimeout(() => {
      if (thread) thread.refresh();
    }, 600);
  }

  dock = { open: openPanel, close: closePanel };
}
