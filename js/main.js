import { initAuth }                                from "./controller/auth.js";
import { loadCatalogProducts }                      from "./controller/product.js";
import { initCart, updateCartUI }                   from "./controller/transaction.js";
import { initSellerDashboard, initAdminDashboard }  from "./controller/dashboard.js";
import { getActiveSession, clearActiveSession, BASE_URL }      from "./config/api.js";
import { initSellerCSWidget, initAdminTickets }     from "./controller/ticket.js";

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
function initNavbarSession() {
  const session     = getActiveSession();
  const guestEl     = $('#nav-auth-guest');
  const userEl      = $('#nav-auth-user');
  const avatarEl    = $('#nav-avatar-text');
  const roleBadgeEl = $('#nav-role-badge');
  const logoutBtn   = $('#nav-logout-btn');

  if (session) {
    if (guestEl)   guestEl.style.display  = 'none';
    if (userEl)    userEl.style.display   = 'flex';
    if (avatarEl)  avatarEl.textContent   = (session.user.name || 'U')[0].toUpperCase();
    if (roleBadgeEl) {
      roleBadgeEl.textContent  = session.user.role;
      roleBadgeEl.className    = `nav-role-badge ${session.user.role}`;
    }

    const profileBtn = $('#nav-profile-btn');
    const shopActionBtn = $('#dropdown-shop-action');

    if (session.user.role === 'admin') {
      if (profileBtn) profileBtn.style.display = 'none'; // Sembunyikan pengaturan profil untuk admin
      if (shopActionBtn) {
        shopActionBtn.style.display = 'flex';
        shopActionBtn.querySelector('span').textContent = 'Masuk ke Konsol Admin';
        shopActionBtn.href = 'admin.html';
      }
    } else {
      if (profileBtn) profileBtn.style.display = 'flex';
      if (shopActionBtn) {
        if (session.user.role === 'seller') {
          shopActionBtn.style.display = 'flex';
          if (session.user.has_shop) {
            shopActionBtn.querySelector('span').textContent = 'Switch ke Hub Penjual';
            shopActionBtn.href = 'seller.html';
          } else {
            shopActionBtn.querySelector('span').textContent = 'Buka Ruko Vendora';
            shopActionBtn.href = 'seller.html';
          }
        } else {
          shopActionBtn.style.display = 'none'; // Sembunyikan untuk pembeli (buyer) biasa
        }
      }
    }
  } else {
    if (guestEl) guestEl.style.display = 'flex';
    if (userEl)  userEl.style.display  = 'none';
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearActiveSession();
      window.location.href = 'index.html';
    });
  }

  initProfileModal();
  initOrderHistoryModal();
}

// ─── Profile Update Modal ──────────────────────────────────────────────────
function initProfileModal() {
  const profileBtn = $('#nav-profile-btn');
  const modal = $('#profile-modal');
  const closeBtn = $('#profile-close-btn');
  const saveBtn = $('#profile-save-btn');
  const phoneInput = $('#profile-phone');
  const addressInput = $('#profile-address');

  if (!profileBtn || !modal) return;

  profileBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const session = getActiveSession();
    if(session && session.user) {
      phoneInput.value = session.user.phone || '';
      addressInput.value = session.user.address || '';

      // Teks dinamis berdasarkan role pembeli/penjual
      const phoneLabelEl = $('#profile-phone-label');
      const phoneHelpEl = $('#profile-phone-help');
      const addressLabelEl = $('#profile-address-label');
      const addressHelpEl = $('#profile-address-help');

      if (session.user.role === 'seller') {
        if (phoneLabelEl) phoneLabelEl.textContent = 'Nomor WhatsApp Toko';
        if (phoneHelpEl) phoneHelpEl.textContent = '* Kontak resmi toko Anda untuk dihubungi pembeli & admin.';
        if (addressLabelEl) addressLabelEl.textContent = 'Alamat Toko / Ruko Fisik';
        if (addressHelpEl) addressHelpEl.textContent = '* Lokasi toko/gudang fisik ruko Anda. Juga digunakan sebagai alamat pengiriman jika Anda belanja dari toko lain.';
      } else {
        if (phoneLabelEl) phoneLabelEl.textContent = 'Nomor WhatsApp Penerima';
        if (phoneHelpEl) phoneHelpEl.textContent = '* Digunakan kurir untuk menghubungi Anda saat pengiriman barang.';
        if (addressLabelEl) addressLabelEl.textContent = 'Alamat Pengiriman Belanja';
        if (addressHelpEl) addressHelpEl.textContent = '* Alamat utama pengiriman barang hasil belanja Anda.';
      }
    }
    modal.classList.add('active');
  });

  closeBtn.addEventListener('click', () => modal.classList.remove('active'));

  if(saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const session = getActiveSession();
      if(!session) return;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Menyimpan...';

      try {
        const res = await fetch(`${BASE_URL}/user/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: session.user.id,
            phone: phoneInput.value,
            address: addressInput.value
          })
        });
        const data = await res.json();
        if(res.ok) {
          session.user.phone = data.data.phone;
          session.user.address = data.data.address;
          localStorage.setItem('vendora_session', JSON.stringify(session));
          showAlert('Profil berhasil diperbarui', 'success');
          modal.classList.remove('active');
        } else {
          showAlert(data.error || 'Gagal memperbarui', 'error');
        }
      } catch(err) {
        showAlert('Terjadi kesalahan jaringan', 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Simpan Perubahan';
      }
    });
  }
}

// ─── Hero Carousel ────────────────────────────────────────────────────────────
function initHeroCarousel() {
  const track   = $('#hero-track');
  const dots    = $$('.hero-dot');
  const prevBtn = $('#hero-prev');
  const nextBtn = $('#hero-next');
  if (!track) return;

  const total = track.children.length;
  let current = 0;
  let autoTimer;

  function goTo(idx) {
    current = (idx + total) % total;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  }

  function startAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(() => goTo(current + 1), 5000);
  }

  if (prevBtn) prevBtn.addEventListener('click', () => { goTo(current - 1); startAuto(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { goTo(current + 1); startAuto(); });
  dots.forEach(d => d.addEventListener('click', () => { goTo(+d.dataset.idx); startAuto(); }));

  // Touch swipe
  let touchX = 0;
  track.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend',   e => {
    const dx = touchX - e.changedTouches[0].clientX;
    if (Math.abs(dx) > 40) { goTo(dx > 0 ? current + 1 : current - 1); startAuto(); }
  });

  startAuto();
}

// ─── Flash Sale Countdown ─────────────────────────────────────────────────────
function initFlashSaleCountdown() {
  const hoursEl   = $('#cd-hours');
  const minutesEl = $('#cd-minutes');
  const secondsEl = $('#cd-seconds');
  if (!hoursEl) return;

  // Set target: next midnight (or fixed duration)
  const now    = new Date();
  const target = new Date(now);
  target.setHours(23, 59, 59, 0);
  if (now >= target) target.setDate(target.getDate() + 1);

  function pad(n) { return String(n).padStart(2, '0'); }

  function tick() {
    const diff  = target - new Date();
    if (diff <= 0) { hoursEl.textContent = '00'; minutesEl.textContent = '00'; secondsEl.textContent = '00'; return; }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);

    const prev = { h: hoursEl.textContent, m: minutesEl.textContent, s: secondsEl.textContent };
    hoursEl.textContent   = pad(h);
    minutesEl.textContent = pad(m);
    secondsEl.textContent = pad(s);

    // Flip animation on change
    if (pad(s) !== prev.s) { secondsEl.classList.add('flip'); setTimeout(() => secondsEl.classList.remove('flip'), 350); }
    if (pad(m) !== prev.m) { minutesEl.classList.add('flip'); setTimeout(() => minutesEl.classList.remove('flip'), 350); }
    if (pad(h) !== prev.h) { hoursEl.classList.add('flip');   setTimeout(() => hoursEl.classList.remove('flip'), 350); }
  }

  tick();
  setInterval(tick, 1000);
}

// ─── Filter Chips ─────────────────────────────────────────────────────────────
function initFilterChips() {
  const chips = $$('.filter-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const filterVal = chip.dataset.filter;
      loadCatalogProducts(filterVal);
    });
  });
}

// ─── Mega Menu Links ────────────────────────────────────────────────────────
function initMegaMenuLinks() {
  const megaLinks = $$('.mega-link');
  megaLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      // Dropdown closes via CSS :hover or JS depending on implementation, but filtering happens here
      let filterVal = link.textContent.trim().toLowerCase();
      
      // Simplify filterVal to match our mockup product descriptions
      if (filterVal.includes('kemeja')) filterVal = 'kemeja';
      else if (filterVal.includes('sepatu')) filterVal = 'sepatu';
      else if (filterVal.includes('gaun')) filterVal = 'gaun';
      else if (filterVal.includes('tas')) filterVal = 'tas';
      else if (filterVal.includes('smartphone')) filterVal = 'smartphone';
      else if (filterVal.includes('headphone')) filterVal = 'headphone';
      else if (filterVal.includes('laptop')) filterVal = 'laptop';
      else if (filterVal.includes('jaket')) filterVal = 'jaket';
      else if (filterVal.includes('serum')) filterVal = 'serum';
      else filterVal = filterVal.split(' ')[0]; // fallback to first word

      const targetEl = $('#product-list');
      if (targetEl) {
        const offsetTop = targetEl.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: offsetTop, behavior: 'smooth' });
      }
      loadCatalogProducts(filterVal);
    });
  });
}

// ─── Smooth Scroll ────────────────────────────────────────────────────────────
function initSmoothScroll() {
  const lihatSemuaBtn = $('#link-lihat-semua');
  if (lihatSemuaBtn) {
    lihatSemuaBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = lihatSemuaBtn.getAttribute('href'); // '#product-list'
      const targetEl = $(targetId);
      if (targetEl) {
        const offsetTop = targetEl.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: offsetTop, behavior: 'smooth' });
      }
    });
  }
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

// ─── Hero YouTube Video Cycler ────────────────────────────────────────────────
let heroPlayer;
const videoList = ['iWI_uBH6R1g', '_4ilEa5ywCE'];
let currentVideoIdx = 0;
let cycleInterval;

function initHeroVideoCycler() {
  const container = document.getElementById('hero-yt-player');
  if (!container) return;

  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

  window.onYouTubeIframeAPIReady = function() {
    heroPlayer = new YT.Player('hero-yt-player', {
      height: '100%',
      width: '100%',
      videoId: videoList[0],
      playerVars: {
        'autoplay': 1, 'controls': 0, 'disablekb': 1, 'fs': 0,
        'modestbranding': 1, 'playsinline': 1, 'mute': 1, 'rel': 0, 'showinfo': 0
      },
      events: {
        'onReady': onPlayerReady,
        'onStateChange': onPlayerStateChange
      }
    });
  };
}

function onPlayerReady(event) {
  event.target.playVideo();
  startCycler();
}

function startCycler() {
  clearInterval(cycleInterval);
  cycleInterval = setInterval(() => {
    if (heroPlayer && heroPlayer.getCurrentTime) {
      const time = heroPlayer.getCurrentTime();
      if (time >= 20) {
        currentVideoIdx = (currentVideoIdx + 1) % videoList.length;
        heroPlayer.loadVideoById({
          videoId: videoList[currentVideoIdx],
          startSeconds: 0
        });
      }
    }
  }, 1000);
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    currentVideoIdx = (currentVideoIdx + 1) % videoList.length;
    heroPlayer.loadVideoById({
      videoId: videoList[currentVideoIdx],
      startSeconds: 0
    });
  }
}

// ─── Route init ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;

  initNavbarSession();

  // Dynamically load support chat widget for logged in sellers
  const session = getActiveSession();
  if (session && session.user && session.user.role === 'seller') {
    initSellerCSWidget();
  }

  // ── Homepage ─────────────────────────────────────────────────────────────
  if (path.endsWith('index.html') || path === '/' || path.endsWith('/')) {
    initHeroVideoCycler();
    initFlashSaleCountdown();
    initFilterChips();
    initMegaMenuLinks();
    initSmoothScroll();
    initCartDrawer();
    loadCatalogProducts('all');
    initCart();
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  else if (path.endsWith('login.html')) {
    const session = getActiveSession();
    if (session) {
      const routes = { admin: 'admin.html', seller: 'seller.html', buyer: 'index.html' };
      window.location.href = routes[session.user.role] || 'index.html';
    } else {
      initAuth();
    }
  }

  // ── Seller Hub ────────────────────────────────────────────────────────────
  else if (path.endsWith('seller.html')) {
    initSellerDashboard();
  }

  // ── Admin Console ─────────────────────────────────────────────────────────
  else if (path.endsWith('admin.html')) {
    initAdminDashboard();
    initAdminTickets();
  }
});

// ─── Shop Detail Modal Helper ──────────────────────────────────────────────
window.showShopDetailModal = function(shop) {
  const modal = document.getElementById('shop-detail-modal');
  const nameEl = document.getElementById('shop-modal-name');
  const descEl = document.getElementById('shop-modal-desc');
  const addressEl = document.getElementById('shop-modal-address');
  const waBtn = document.getElementById('shop-modal-wa-btn');

  if (!modal) return;

  if (nameEl) nameEl.textContent = shop.name || 'Detail Toko';
  if (descEl) descEl.textContent = shop.description || 'Tidak ada deskripsi toko.';
  if (addressEl) addressEl.textContent = shop.owner_address || 'Tidak ada alamat toko.';
  
  if (waBtn) {
    const phone = shop.owner_phone || '';
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.slice(1);
    }
    if (cleanPhone) {
      waBtn.href = `https://wa.me/${cleanPhone}`;
      waBtn.style.display = 'flex';
    } else {
      waBtn.href = '#';
      waBtn.style.display = 'none';
    }
  }

  modal.classList.add('active');
};

// ─── Order History & Tracking Modal ──────────────────────────────────────────
function initOrderHistoryModal() {
  const historyBtn = document.getElementById('nav-history-btn');
  const modal = document.getElementById('order-history-modal');
  const closeBtn = document.getElementById('order-history-close-btn');
  const listEl = document.getElementById('order-history-list');

  if (!historyBtn || !modal || !listEl) return;

  historyBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const session = getActiveSession();
    if (!session || !session.user) {
      showAlert('Silakan login terlebih dahulu.', 'error');
      return;
    }

    listEl.innerHTML = `
      <div style="text-align: center; padding: 40px 0; color: var(--text-secondary);">
        <div style="font-size:14px; font-weight:600; margin-bottom:4px; animation: pulse 1.5s infinite;">Memuat riwayat belanja...</div>
      </div>`;
    modal.classList.add('active');

    try {
      const res = await fetch(`${BASE_URL}/transactions?buyer_id=${session.user.id}`);
      const data = await res.json();
      
      if (!res.ok || data.status !== 200) {
        listEl.innerHTML = `<div style="text-align:center; padding:30px 0; color:#EF4444;">Gagal memuat transaksi.</div>`;
        return;
      }

      const txs = data.data || [];
      if (txs.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 12px; opacity:0.4; display:block;">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <p style="font-weight:600; font-size:14px; margin-bottom:4px;">Belum ada riwayat belanja</p>
            <span style="font-size:12px; color:var(--text-muted);">Keranjang belanja Anda masih kosong. Mari mulai belanja!</span>
          </div>`;
        return;
      }

      // Sort transactions by date descending
      txs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      const statusColors = {
        'pending_payment': '#94A3B8',
        'paid': '#60A5FA',
        'success': '#34D399',
        'cancelled': '#F87171'
      };
      const statusLabels = {
        'pending_payment': 'Menunggu Pembayaran',
        'paid': 'Diproses Penjual',
        'success': 'Pesanan Selesai',
        'cancelled': 'Dibatalkan'
      };

      let html = '';
      txs.forEach(t => {
        const date = t.created_at ? new Date(t.created_at).toLocaleString('id-ID', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '-';
        const statusColor = statusColors[t.status] || '#94A3B8';
        const statusLabel = statusLabels[t.status] || t.status;
        const shortId = t.id ? t.id.slice(-8).toUpperCase() : '-';

        // Lacak barang simulation data
        let trackingHtml = '';
        if (t.status === 'success') {
          trackingHtml = `
            <div style="margin-top: 12px; padding: 12px; background: rgba(52, 211, 153, 0.08); border-radius: 8px; border: 1px dashed #34D399;">
              <div style="font-size:12px; font-weight:700; color:#059669; display:flex; justify-content:space-between; margin-bottom:6px;">
                <span>Lacak Pengiriman (Vendora Express)</span>
                <span style="font-family:monospace;">RESI: VDR-EXP-${shortId}</span>
              </div>
              <div style="font-size:13px; color:#047857; line-height:1.4;">
                <strong>Posisi Terakhir:</strong> Paket telah sampai di alamat tujuan dan diterima oleh pembeli. Transaksi Selesai.
              </div>
            </div>`;
        } else if (t.status === 'paid') {
          trackingHtml = `
            <div style="margin-top: 12px; padding: 12px; background: rgba(96, 165, 250, 0.08); border-radius: 8px; border: 1px dashed #3B82F6;">
              <div style="font-size:12px; font-weight:700; color:#2563EB; display:flex; justify-content:space-between; margin-bottom:6px;">
                <span>Lacak Pengiriman (Vendora Express)</span>
                <span style="font-family:monospace;">RESI: VDR-EXP-${shortId}</span>
              </div>
              <div style="font-size:13px; color:#1D4ED8; line-height:1.4;">
                <strong>Posisi Terakhir:</strong> Pembayaran dikonfirmasi. Pesanan sedang dipersiapkan dan dikemas oleh penjual.
              </div>
            </div>`;
        } else if (t.status === 'pending_payment') {
          trackingHtml = `
            <div style="margin-top: 12px; padding: 12px; background: #F1F5F9; border-radius: 8px; border: 1px solid var(--border);">
              <div style="font-size:13px; color:var(--text-secondary); line-height:1.4;">
                <strong>Posisi Terakhir:</strong> Menunggu pembayaran selesai sebelum barang diproses oleh pihak penjual.
              </div>
            </div>`;
        }

        let itemsHtml = (t.items || []).map(item => `
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; color:var(--text-main); margin-bottom:4px;">
            <span>${item.name} <span style="color:var(--text-secondary);">× ${item.quantity}</span></span>
            <span style="font-weight:600;">Rp ${(item.price * item.quantity).toLocaleString('id-ID')}</span>
          </div>
        `).join('');

        html += `
          <div style="border:1px solid var(--border); border-radius: var(--r-md); padding:16px; background:var(--surface); margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:10px;">
              <div>
                <span style="font-size:11px; color:var(--text-muted); display:block; text-transform:uppercase; font-weight:700; letter-spacing:0.5px;">No. Transaksi</span>
                <span style="font-family:monospace; font-weight:700; color:var(--text-main); font-size:13px;">...${shortId}</span>
              </div>
              <div style="text-align:right;">
                <span style="font-size:11px; color:var(--text-muted); display:block; text-transform:uppercase; font-weight:700; letter-spacing:0.5px;">Status</span>
                <span style="padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700; background:${statusColor}22; color:${statusColor};">${statusLabel}</span>
              </div>
            </div>
            
            <div style="margin-bottom:12px;">
              ${itemsHtml}
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:10px; margin-top:8px;">
              <span style="font-size:12px; color:var(--text-secondary);">${date}</span>
              <div>
                <span style="font-size:11px; color:var(--text-muted); margin-right:4px;">Total Belanja:</span>
                <strong style="font-size:15px; color:var(--text-main);">Rp ${t.total_amount.toLocaleString('id-ID')}</strong>
              </div>
            </div>

            ${trackingHtml}
          </div>
        `;
      });

      listEl.innerHTML = html;

    } catch (err) {
      console.error(err);
      listEl.innerHTML = `<div style="text-align:center; padding:30px 0; color:#EF4444;">Terjadi kesalahan koneksi jaringan.</div>`;
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }
}
