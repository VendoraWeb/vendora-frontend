import { initAuth }                                from "./controller/auth.js?v=20261114";
import { loadCatalogProducts, initSearch, setCatalogSort, clearSearch, openProductById } from "./controller/product.js?v=20261114";
import { initCart, updateCartUI }                   from "./controller/transaction.js?v=20261114";
import { CATEGORIES, CATEGORY_BY_KEY, categoryImage } from "./categories.js?v=20261114";
import { initChatDock }                           from "./controller/chat.js?v=20261114";
import { initSellerDashboard, initAdminDashboard }  from "./controller/dashboard.js?v=20261114";
import { getActiveSession, BASE_URL, logout }                  from "./config/api.js?v=20261114";
import { esc } from "./ui.js?v=20261114";
import { initAdminTickets }                       from "./controller/ticket.js?v=20261114";
import { initAccountPage }                        from "./controller/account.js?v=20261114";
import { initOrdersPage }                         from "./controller/orders.js?v=20261114";
import { initAboutPage, initHelpPage }            from "./controller/pages.js?v=20261114";
import { initNotifications, initMobileMenu }      from "./controller/navkit.js?v=20261114";

// ─── Utilities ───────────────────────────────────────────────────────────────
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

window.showAlert = function(message, type) {
  const container = document.getElementById('alert-container') || document.body;
  const div = document.createElement('div');
  div.className = `alert alert-${type}`;
  div.textContent = message;
  container.prepend(div);
  setTimeout(() => div.remove(), 3000);
};
const showAlert = window.showAlert;

// ─── Navbar session UI ────────────────────────────────────────────────────────
function paintNavAvatar(el, user) {
  if (!el) return;
  if (user.avatar) {
    el.style.backgroundImage = `url("${String(user.avatar).replace(/"/g, '%22')}")`;
    el.textContent = '';
    el.classList.add('has-photo');
  } else {
    el.style.backgroundImage = '';
    el.textContent = (user.name || 'U').trim().charAt(0).toUpperCase();
    el.classList.remove('has-photo');
  }
}

function initNavbarSession() {
  const session  = getActiveSession();
  const guestEl  = $('#nav-auth-guest');
  const userEl   = $('#nav-auth-user');
  const logoutBtn = $('#nav-logout-btn');
  document.body.classList.toggle('is-signed-in', !!(session && session.user));

  if (session && session.user) {
    const u = session.user;
    if (guestEl) guestEl.style.display = 'none';
    if (userEl)  userEl.style.display  = 'flex';
    paintNavAvatar($('#nav-avatar-text'), u);
    paintNavAvatar($('#nav-avatar-lg'), u);
    const first = (u.name || 'Akun').trim().split(/\s+/)[0];
    if ($('#nav-user-name')) $('#nav-user-name').textContent = first;
    if ($('#nav-dd-name'))   $('#nav-dd-name').textContent = u.name || 'Akun';
    if ($('#nav-dd-email'))  $('#nav-dd-email').textContent = u.email || '';

    const shopAction = $('#dropdown-shop-action');
    const historyBtn = $('#nav-history-btn');
    const cartToggleBtn = $('#cart-toggle-btn');

    // Untuk akun role admin: sembunyikan menu "Pesanan saya" dan ikon keranjang di dropdown profil & navbar.
    // Tampilkan "Konsol admin" hanya untuk admin.
    if (u.role === 'admin') {
      if (historyBtn) historyBtn.style.display = 'none';
      if (cartToggleBtn) cartToggleBtn.style.display = 'none';
    } else {
      if (historyBtn) historyBtn.style.display = '';
      if (cartToggleBtn) cartToggleBtn.style.display = '';
    }

    if (shopAction) {
      const label = shopAction.querySelector('span');
      if (u.role === 'admin') {
        shopAction.style.display = 'flex';
        shopAction.href = 'admin.html';
        if (label) label.textContent = 'Konsol admin';
      } else if (u.role === 'seller') {
        shopAction.style.display = 'flex';
        shopAction.href = 'seller.html';
        if (label) label.textContent = u.has_shop ? 'Toko saya' : 'Buka ruko';
      } else {
        shopAction.style.display = 'none';
      }
    }

    // Dropdown: hover (desktop) + klik (sentuh / keyboard)
    const dd = $('#nav-profile-dropdown');
    const trigger = $('#nav-user-panel');
    if (dd && trigger) {
      const setOpen = (open) => { dd.classList.toggle('open', open); trigger.setAttribute('aria-expanded', open); };
      trigger.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!dd.classList.contains('open')); });
      document.addEventListener('click', (e) => { if (!dd.contains(e.target)) setOpen(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    }
  } else {
    if (guestEl) guestEl.style.display = 'flex';
    if (userEl)  userEl.style.display  = 'none';
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await logout();
      window.location.href = 'index.html';
    });
  }
}

// ─── Tombol "Bayar sekarang" (checkout & sewa ruko) ──────────────────────────
// Metode dipilih dulu, baru dibayar — sebelumnya satu klik di metode langsung
// membuat pesanan dan klik ganda bisa membuat pesanan dobel.
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('#pay-now-btn');
  if (!btn || btn.disabled) return;
  const picked = document.querySelector('input[name="pay-method"]:checked');
  if (!picked) { showAlert('Pilih metode pembayaran dulu.', 'error'); return; }
  if (typeof window.snapProcess !== 'function') return;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Memproses…';
  try {
    await window.snapProcess(picked.value);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

// ─── Filter Chips ─────────────────────────────────────────────────────────────
function scrollToCatalog() {
  const anchor = document.getElementById('catalog-anchor');
  if (anchor) window.scrollTo({ top: anchor.getBoundingClientRect().top + window.scrollY - 72, behavior: 'smooth' });
}

function syncChips(filter) {
  const bar = document.getElementById('catalog-filter-bar');
  if (!bar) return;
  filter = filter || 'all';
  const key = filter.startsWith('sub:') ? filter.slice(4).split('|')[0] : filter;
  bar.querySelectorAll('.filter-chip').forEach(c => {
    const on = c.dataset.filter === filter || c.dataset.filter === key;
    c.classList.toggle('active', on);
    c.setAttribute('aria-pressed', String(on));
  });
  const active = bar.querySelector('.filter-chip.active');
  if (active) bar.scrollTo({ left: active.offsetLeft - bar.clientWidth / 2 + active.clientWidth / 2, behavior: 'smooth' });
}

/** Pilih kategori dari mana saja (menu, carousel, saran pencarian, footer). */
function pickCategory(filter, { scroll = true } = {}) {
  if (!document.getElementById('product-list') || new URLSearchParams(window.location.search).get('shop')) {
    window.location.href = `index.html?cat=${encodeURIComponent(filter)}`;
    return;
  }
  clearSearch();
  syncChips(filter);
  loadCatalogProducts(filter, null, { refetch: false });
  if (scroll) scrollToCatalog();
}

function initFilterChips() {
  const bar = document.getElementById('catalog-filter-bar') || document.querySelector('.catalog-filter-bar');
  if (!bar) return;
  const isShopPage = new URLSearchParams(window.location.search).get('shop');
  if (!isShopPage) {
    bar.innerHTML = `<button class="filter-chip active" data-filter="all" type="button" aria-pressed="true">Semua</button>` +
      CATEGORIES.map(c => `<button class="filter-chip" data-filter="${c.key}" type="button" aria-pressed="false">${esc(c.label)}</button>`).join('');
  }
  bar.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    if (isShopPage) {
      // Etalase toko: filter di dalam toko ini saja
      bar.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c === chip));
      loadCatalogProducts(chip.dataset.filter, isShopPage, { refetch: false });
      return;
    }
    pickCategory(chip.dataset.filter, { scroll: false });
  });
  document.addEventListener('vendora:filter-changed', (e) => { if (!isShopPage) syncChips(e.detail.filter); });
  document.addEventListener('vendora:pick-category', (e) => pickCategory(e.detail.filter));

  // Tautan kategori lama (hero, footer) memakai data-cat
  document.querySelectorAll('a[data-cat]').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    pickCategory(a.dataset.cat);
  }));
}

// ─── Mega Menu Kategori ─────────────────────────────────────────────────────
function initMegaMenuLinks() {
  const menu = document.querySelector('.mega-dropdown');
  if (!menu) return;
  menu.innerHTML = CATEGORIES.map(c => `
    <div class="mega-item">
      <a href="index.html?cat=${c.key}" class="mega-title" data-filter="${c.key}">${esc(c.label)}</a>
      ${c.subs.map(sub => `<a href="index.html?cat=${encodeURIComponent(`sub:${c.key}|${sub}`)}" class="mega-link" data-filter="${esc(`sub:${c.key}|${sub}`)}">${esc(sub)}</a>`).join('')}
    </div>`).join('');

  const wrapper = menu.closest('.mega-menu-wrapper');
  const btn = document.getElementById('nav-cat-btn');
  const setOpen = (open) => {
    wrapper.classList.toggle('is-open', open);
    btn?.setAttribute('aria-expanded', String(open));
  };
  btn?.setAttribute('aria-haspopup', 'true');
  btn?.setAttribute('aria-expanded', 'false');
  btn?.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!wrapper.classList.contains('is-open')); });
  document.addEventListener('click', (e) => { if (!wrapper.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  menu.addEventListener('click', (e) => {
    const link = e.target.closest('[data-filter]');
    if (!link) return;
    e.preventDefault();
    setOpen(false);
    link.blur();
    pickCategory(link.dataset.filter);
  });
}

// ─── Carousel kategori (bisa digeser kiri/kanan) ────────────────────────────
function initCategoryCarousel() {
  const root = document.getElementById('cat-carousel');
  if (!root) return;
  if (new URLSearchParams(window.location.search).get('shop')) { root.hidden = true; return; }
  const track = root.querySelector('.cc-track');
  track.innerHTML = CATEGORIES.map(c => `
    <a href="index.html?cat=${c.key}" class="cc-card" data-filter="${c.key}" draggable="false">
      <img src="${categoryImage(c, 1000)}" alt="" loading="lazy" draggable="false">
      <span class="cc-copy">
        <small>${esc(c.label)}</small>
        <b>${esc(c.tagline)}</b>
        <em>Belanja sekarang</em>
      </span>
    </a>`).join('');

  const prev = root.querySelector('.cc-prev');
  const next = root.querySelector('.cc-next');
  const step = () => (track.querySelector('.cc-card')?.getBoundingClientRect().width || 300) + 16;
  const update = () => {
    const max = track.scrollWidth - track.clientWidth - 2;
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= max;
  };
  prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
  track.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
  window.addEventListener('resize', update);
  update();

  // Geser dengan mouse (sentuh/trackpad sudah bawaan browser)
  let down = false, startX = 0, startLeft = 0, moved = false;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    down = true; moved = false; startX = e.clientX; startLeft = track.scrollLeft;
  });
  window.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 5) { moved = true; track.classList.add('is-dragging'); }
    if (moved) track.scrollLeft = startLeft - dx;
  });
  window.addEventListener('pointerup', () => {
    if (!down) return;
    down = false;
    if (!moved) return;
    track.classList.remove('is-dragging');
    // Menempel ke kartu terdekat setelah dilepas
    const w = step();
    track.scrollTo({ left: Math.round(track.scrollLeft / w) * w, behavior: 'smooth' });
  });
  track.addEventListener('click', (e) => {
    const card = e.target.closest('.cc-card');
    if (!card) return;
    e.preventDefault();
    if (moved) { moved = false; return; } // hasil seret, bukan klik
    pickCategory(card.dataset.filter);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev.click(); }
  });
}

// ─── Info hasil pencarian / kategori di atas katalog ─────────────────────────
function initResultsBar() {
  const bar = document.getElementById('catalog-results');
  if (!bar) return;
  document.addEventListener('vendora:catalog-loaded', (e) => {
    const d = e.detail;
    if (d.shop || (!d.q && (!d.filter || d.filter === 'all'))) { bar.hidden = true; return; }
    const parts = [];
    if (d.q) parts.push(`Hasil pencarian <b>"${esc(d.q)}"</b>`);
    if (d.filterLabel) parts.push(`${d.q ? 'di' : 'Kategori'} <b>${esc(d.filterLabel)}</b>`);
    bar.innerHTML = `
      <span>${parts.join(' ')} <span class="cr-count">· ${d.shown} produk</span></span>
      <button type="button" class="cr-clear">${d.q ? 'Hapus pencarian' : 'Lihat semua kategori'}</button>`;
    bar.hidden = false;
    bar.querySelector('.cr-clear').addEventListener('click', () => pickCategory('all', { scroll: false }));
  });
}

// ─── Tombol "Buka toko" → daftar sebagai penjual ────────────────────────────
function initOpenShopLinks() {
  document.querySelectorAll('[data-open-shop]').forEach(a => {
    a.setAttribute('href', 'login.html?tab=daftar&role=seller');
    a.addEventListener('click', (e) => {
      const session = getActiveSession();
      if (session && session.user && session.user.role === 'seller') {
        e.preventDefault();
        window.location.href = 'seller.html';
      }
    });
  });
}

// ─── Cart Drawer ──────────────────────────────────────────────────────────────
export function openCartDrawer() {
  const drawer  = $('#cart-drawer');
  const overlay = $('#cart-overlay');
  if (drawer)  drawer.classList.add('active');
  if (overlay) overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  // Mark cart icon active
  const cartBtn = $('#cart-toggle-btn');
  if (cartBtn) cartBtn.classList.add('active-cart');
}

export function closeCartDrawer() {
  const drawer  = $('#cart-drawer');
  const overlay = $('#cart-overlay');
  if (drawer)  drawer.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
  const cartBtn = $('#cart-toggle-btn');
  if (cartBtn) cartBtn.classList.remove('active-cart');
}

function initCartDrawer() {
  const cartToggleBtn = $('#cart-toggle-btn');
  const cartCloseBtn  = $('#cart-close-btn');
  const overlay       = $('#cart-overlay');

  if (cartToggleBtn) {
    cartToggleBtn.addEventListener('click', () => {
      const drawer = $('#cart-drawer');
      const isOpen = drawer && drawer.classList.contains('active');
      if (isOpen) closeCartDrawer(); else openCartDrawer();
    });
  }

  if (cartCloseBtn)  cartCloseBtn.addEventListener('click', closeCartDrawer);
  if (overlay)       overlay.addEventListener('click', closeCartDrawer);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeCartDrawer();
  });

  // Listen for cart-open/close events from modules (avoid circular import)
  document.addEventListener('vendora:open-cart',  openCartDrawer);
  document.addEventListener('vendora:close-cart', closeCartDrawer);
}

/** Halaman tanpa laci keranjang: tombol keranjang membuka keranjang di beranda. */
function initCartLink() {
  const btn = $('#cart-toggle-btn');
  if (!btn) return;
  updateCartUI(); // angka di lencana keranjang
  btn.addEventListener('click', () => { window.location.href = 'index.html?cart=1'; });
}

// ─── Route init ───────────────────────────────────────────────────────────────
function initApp() {
  const path = window.location.pathname;
  const isPage = (page) => path.endsWith(page) || path.endsWith(page.replace('.html', ''));

  initNavbarSession();

  // Dock chat (pembeli & penjual) di semua halaman
  if (!isPage('login.html') && !isPage('admin.html')) initChatDock();
  initMobileMenu();
  initNotifications();
  initOpenShopLinks();
  // Header lengkap (kategori, pencarian, keranjang) juga ada di halaman Tentang & Bantuan
  initMegaMenuLinks();
  initSearch();
  if (!document.getElementById('cart-drawer')) initCartLink();

  // ── Homepage ─────────────────────────────────────────────────────────────
  if (isPage('index.html') || path === '/' || path.endsWith('/')) {
    initFilterChips();
    initCategoryCarousel();
    initResultsBar();
    initCartDrawer();
    initCart();

    const urlParams = new URLSearchParams(window.location.search);
    const shopQuery = urlParams.get('shop');
    if (urlParams.get('cart') === '1') {
      setTimeout(() => document.dispatchEvent(new CustomEvent('vendora:open-cart')), 300);
      history.replaceState(null, '', window.location.pathname + (shopQuery ? `?shop=${encodeURIComponent(shopQuery)}` : ''));
    }

    // Urutkan katalog
    const sortSel = document.getElementById('catalog-sort');
    if (sortSel) sortSel.addEventListener('change', () => setCatalogSort(sortSel.value));

    if (shopQuery) {
      // ── Halaman toko (index.html?shop=Nama) ──
      const heroSection = document.getElementById('hero-section');
      if (heroSection) heroSection.style.display = 'none';
      const titleEl = document.querySelector('#catalog-anchor .sf-title-caps');
      const subEl = document.querySelector('#catalog-anchor .catalog-sub');
      if (titleEl) titleEl.textContent = 'Semua produk';
      if (subEl) subEl.textContent = `Etalase ${shopQuery}`;

      const banner = document.getElementById('shop-banner-container');
      if (banner) {
        banner.style.display = 'block';
        banner.innerHTML = `
          <nav class="crumbs" aria-label="Lokasi"><a href="index.html">Beranda</a><span aria-hidden="true">›</span><span>${esc(shopQuery)}</span></nav>
          <section class="shop-head">
            <div class="shop-head-main">
              <span class="shop-head-avatar" aria-hidden="true">${esc(shopQuery.charAt(0).toUpperCase())}</span>
              <div class="shop-head-id">
                <h1>${esc(shopQuery)}</h1>
                <span class="shop-head-badges" id="sh-badges"><span class="v-status v-status--good">Diverifikasi admin</span></span>
                <p class="shop-head-desc" id="sh-desc"></p>
              </div>
              <div class="shop-head-actions">
                <button type="button" class="btn-line" id="banner-chat-btn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
                  Chat penjual
                </button>
                <button type="button" class="btn-line" id="shop-share-btn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  Bagikan
                </button>
              </div>
            </div>
            <dl class="shop-head-stats">
              <div><dt>Produk</dt><dd id="sh-products">–</dd></div>
              <div><dt>Terjual</dt><dd id="sh-sold">–</dd></div>
              <div><dt>Bergabung</dt><dd id="sh-since">–</dd></div>
              <div><dt>Dikirim dari</dt><dd id="sh-addr">–</dd></div>
            </dl>
          </section>`;

        let shopInfo = null;
        // Isi header + etalase kategori setelah katalog toko termuat (sekali)
        document.addEventListener('vendora:catalog-loaded', (e) => {
          const d = e.detail;
          if (!d.shop || banner.dataset.filled) return;
          banner.dataset.filled = '1';
          shopInfo = Object.values(d.shopDetailCache || {}).find(x => x.name.toLowerCase() === shopQuery.toLowerCase()) || null;
          const sold = d.shopProducts.reduce((sum, p) => sum + d.soldOf(p), 0);
          document.getElementById('sh-products').textContent = d.shopProducts.length;
          document.getElementById('sh-sold').textContent = sold.toLocaleString('id-ID');
          document.getElementById('sh-since').textContent = shopInfo && shopInfo.created_at
            ? new Date(shopInfo.created_at).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : '–';
          document.getElementById('sh-addr').textContent = (shopInfo && shopInfo.ship_from) || '–';
          document.getElementById('sh-desc').textContent = (shopInfo && shopInfo.description) || '';
          if (!shopInfo) document.getElementById('banner-chat-btn').hidden = true;

          // Etalase: kategori dari produk toko ini
          const counts = {};
          d.shopProducts.forEach(p => d.parseCategories(p).forEach(c => { counts[c] = (counts[c] || 0) + 1; }));
          const bar = document.getElementById('catalog-filter-bar');
          if (bar) {
            bar.innerHTML = `<button class="filter-chip active" data-filter="all" type="button">Semua <span class="chip-count">${d.shopProducts.length}</span></button>` +
              Object.entries(counts).sort((x, y) => y[1] - x[1]).map(([c, n]) =>
                `<button class="filter-chip" data-filter="kat:${esc(c)}" type="button">${esc(c)} <span class="chip-count">${n}</span></button>`).join('');
          }
        });

        document.getElementById('banner-chat-btn').addEventListener('click', () => {
          if (!shopInfo) { showAlert('Chat belum tersedia untuk toko ini.', 'error'); return; }
          if (window.openShopChat) window.openShopChat(shopInfo, shopInfo.name);
        });
        document.getElementById('shop-share-btn').addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            showAlert('Tautan toko disalin.', 'success');
          } catch {
            showAlert('Salin tautan dari address bar browser.', 'error');
          }
        });
      }

      loadCatalogProducts('all', shopQuery);
    } else {
      // Beranda: dukung tautan ?cat= (menu/kategori), ?q= (pencarian), ?p= (produk)
      const cat = urlParams.get('cat');
      const validCat = cat && (cat === 'all' || CATEGORY_BY_KEY[cat] || (cat.startsWith('sub:') && CATEGORY_BY_KEY[cat.slice(4).split('|')[0]]));
      if (validCat) syncChips(cat);
      loadCatalogProducts(validCat ? cat : 'all', null).then(() => {
        if (validCat || urlParams.get('q')) setTimeout(scrollToCatalog, 150);
        const pid = urlParams.get('p');
        if (pid) openProductById(pid);
      });
    }
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  else if (isPage('login.html')) {
    const session = getActiveSession();
    // Sudah masuk → arahkan ke beranda, kecuali sedang ganti kata sandi (login.html?reset=1)
    const qs = new URLSearchParams(window.location.search);
    const wantsReset = qs.get('reset') === '1';
    // Pembeli yang menekan "Buka toko" tetap boleh membuat akun penjual
    const wantsSellerSignup = qs.get('tab') === 'daftar' && qs.get('role') === 'seller' && session && session.user.role === 'buyer';
    if (session && !wantsReset && !wantsSellerSignup) {
      const routes = { admin: 'admin.html', seller: 'seller.html', buyer: 'index.html' };
      window.location.href = routes[session.user.role] || 'index.html';
    } else {
      initAuth();
    }
  }

  // ── Seller Hub ────────────────────────────────────────────────────────────
  else if (isPage('pesanan.html')) {
    initOrdersPage();
  }

  else if (isPage('akun.html')) {
    initAccountPage();
  }

  else if (isPage('seller.html')) {
    initSellerDashboard();
  }

  // ── Halaman konten (footer) ───────────────────────────────────────────────
  else if (isPage('bantuan.html')) {
    initHelpPage();
  }
  else if (isPage('tentang.html')) {
    initAboutPage();
  }

  // ── Admin Console ─────────────────────────────────────────────────────────
  else if (isPage('admin.html')) {
    initAdminDashboard();
    initAdminTickets();
  }
}

// Ensure initApp runs even if DOMContentLoaded already fired (common with type="module")
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
