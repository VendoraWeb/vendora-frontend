import { initAuth }                                from "./controller/auth.js?v=3";
import { loadCatalogProducts }                      from "./controller/product.js?v=3";
import { initCart, updateCartUI }                   from "./controller/transaction.js?v=3";
import { initSellerDashboard, initAdminDashboard }  from "./controller/dashboard.js?v=3";
import { getActiveSession, clearActiveSession, BASE_URL }      from "./config/api.js?v=3";
import { initSellerInboxWidget }                  from "./controller/inbox.js?v=3";
import { initAdminTickets }                       from "./controller/ticket.js?v=3";

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
  const emailInput = $('#profile-email');
  const avatarInput = $('#profile-avatar');

  if (!profileBtn || !modal) return;

  profileBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const session = getActiveSession();
    if(session && session.user) {
      phoneInput.value = session.user.phone || '';
      addressInput.value = session.user.address || '';
      if(emailInput) emailInput.value = session.user.email || '';
      if(avatarInput) avatarInput.value = session.user.avatar || '';

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
            email: emailInput ? emailInput.value : session.user.email,
            phone: phoneInput.value,
            address: addressInput.value,
            avatar: avatarInput ? avatarInput.value : session.user.avatar
          })
        });
        const data = await res.json();
        if(res.ok) {
          session.user.email = data.data.email;
          session.user.phone = data.data.phone;
          session.user.address = data.data.address;
          session.user.avatar = data.data.avatar;
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

// ─── Hero YouTube Video Cycler (DISABLED) ────────────────────────────────────────────────
function initHeroVideoCycler() {
  // Disabled in favor of direct iframe embed for reliability
}

// ─── Route init ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;

  initNavbarSession();

  // Dynamically load support chat widget for logged in sellers
  const session = getActiveSession();
  if (session && session.user && session.user.role === 'seller') {
    initSellerInboxWidget();
  }

  // ── Homepage ─────────────────────────────────────────────────────────────
  if (path.endsWith('index.html') || path === '/' || path.endsWith('/')) {
    initHeroVideoCycler();
    initFlashSaleCountdown();
    initFilterChips();
    initMegaMenuLinks();
    initSmoothScroll();
    initCartDrawer();
    initCart();

    const urlParams = new URLSearchParams(window.location.search);
    const shopQuery = urlParams.get('shop');

    if (shopQuery) {
      const heroSection = document.getElementById('hero-section');
      if (heroSection) heroSection.style.display = 'none';

      const bannerContainer = document.getElementById('shop-banner-container');
      if (bannerContainer) {
        bannerContainer.style.display = 'block';
        bannerContainer.innerHTML = `
          <div style="position: relative; border-radius: 20px; display: flex; align-items: center; gap: 24px; color: #fff; overflow: hidden; min-height: 240px; padding: 40px; box-shadow: var(--shadow-lg);">
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none;">
              <iframe width="100%" height="150%" style="position:absolute; top:-25%; left:0; scale: 1.2; opacity: 0.85;" src="https://www.youtube.com/embed/PBrYMBacnyM?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&loop=1&playlist=PBrYMBacnyM" frameborder="0" allow="autoplay; encrypted-media"></iframe>
            </div>
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(20,20,20,0.4) 100%); z-index: 1;"></div>
            
            <div style="position: relative; z-index: 2; width: 100px; height: 100px; background: var(--bg-1); color: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 40px; font-weight: bold; border: 4px solid rgba(255,255,255,0.2); flex-shrink: 0;">
              ${shopQuery.charAt(0).toUpperCase()}
            </div>
            <div style="position: relative; z-index: 2; flex: 1;">
              <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">${shopQuery}</h1>
              <div style="display: flex; gap: 16px; font-size: 14px; opacity: 0.9;">
                <span style="display: flex; align-items: center; gap: 6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg> Verified Merchant</span>
                <span style="display: flex; align-items: center; gap: 6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> 4.9 Rating</span>
              </div>
            </div>
            
            <button id="banner-chat-btn" style="position: relative; z-index: 2; background: var(--gold); color: var(--bg-1); border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(212,175,55,0.3);" onmouseover="this.style.opacity='0.9'; this.style.transform='translateY(-2px)';" onmouseout="this.style.opacity='1'; this.style.transform='translateY(0)';">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
              </svg>
              Chat Penjual
            </button>
          </div>
        `;
        
        // Setup banner chat button event listener
        setTimeout(() => {
          const bannerChatBtn = document.getElementById('banner-chat-btn');
          if (bannerChatBtn) {
            bannerChatBtn.addEventListener('click', () => {
              const chatModal = document.getElementById('chat-modal');
              if (chatModal) {
                document.getElementById('chat-shop-name').textContent = shopQuery;
                document.getElementById('chat-shop-initial').textContent = shopQuery.charAt(0).toUpperCase();
                document.getElementById('chat-welcome-shop').textContent = shopQuery;
                chatModal.classList.add('active');
              }
            });
          }
        }, 100);
      }

      const filterBar = document.querySelector('.catalog-filter-bar');
      if (filterBar && shopQuery.toLowerCase() === 'apple') {
        filterBar.innerHTML = `
          <button class="filter-chip active" data-filter="all" type="button">Semua</button>
          <button class="filter-chip" data-filter="smartphone" type="button">Smartphone</button>
          <button class="filter-chip" data-filter="laptop" type="button">Laptop</button>
          <button class="filter-chip" data-filter="tablet" type="button">Tablet</button>
          <button class="filter-chip" data-filter="audio" type="button">Audio</button>
          <button class="filter-chip" data-filter="aksesoris" type="button">Aksesoris</button>
        `;
        // Re-initialize filter chips
        setTimeout(() => initFilterChips(), 100);
      }
      
      loadCatalogProducts('all');
    } else {
      // Auto-load products on the homepage if no shopQuery is present
      loadCatalogProducts('all');
    }

    // --- CACHE BUSTER DOM FIX ---
    // If the old green WhatsApp button is still there, replace it dynamically
    const oldWaBtn = document.getElementById('shop-modal-wa-btn');
    if (oldWaBtn) {
      const parent = oldWaBtn.parentNode;
      const newChatBtn = document.createElement('button');
      newChatBtn.id = 'shop-modal-chat-btn';
      newChatBtn.style = "flex:1; text-align:center; padding:12px; background:var(--gold); color:var(--bg-1); border:none; border-radius:8px; font-weight:600; font-size:14px; display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer;";
      newChatBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> Chat Penjual`;
      parent.replaceChild(newChatBtn, oldWaBtn);
    }
    const viewBtn = document.getElementById('shop-modal-view-btn');
    if (viewBtn) {
       // override the old inline onclick
       viewBtn.removeAttribute('onclick');
    }
    const shopDetailClose = document.getElementById('shop-detail-close-btn');
    if (shopDetailClose) {
       shopDetailClose.addEventListener('click', () => {
         const shopModal = document.getElementById('shop-detail-modal');
         if (shopModal) shopModal.classList.remove('active');
       });
    }
    
    // Auto-inject Chat Modal if missing
    if (!document.getElementById('chat-modal')) {
      const chatModalHTML = `
      <div class="modal-overlay" id="chat-modal">
        <div class="modal-content" style="max-width: 400px; padding: 0; display: flex; flex-direction: column; height: 500px; max-height: 90vh;">
          <div style="background: var(--gold); color: var(--bg-1); padding: 16px; display: flex; align-items: center; justify-content: space-between; border-radius: 12px 12px 0 0;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 40px; height: 40px; background: var(--bg-1); color: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px;" id="chat-shop-initial">T</div>
              <div>
                <div style="font-weight: 700; font-size: 16px;" id="chat-shop-name">Nama Toko</div>
                <div style="font-size: 12px; opacity: 0.8; display: flex; align-items: center; gap: 4px;">
                  <div style="width: 8px; height: 8px; background: #34D399; border-radius: 50%;"></div>
                  Online
                </div>
              </div>
            </div>
            <button class="modal-close" id="chat-close-btn" style="background: transparent; border: none; color: var(--bg-1); cursor: pointer; padding: 4px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          
          <div id="chat-messages" style="flex: 1; background: var(--bg-1); overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
            <div style="align-self: center; background: var(--bg-2); padding: 6px 12px; border-radius: 16px; font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">
              Pesan diamankan dengan enkripsi end-to-end.
            </div>
            <div style="align-self: flex-start; background: var(--bg-2); padding: 12px 16px; border-radius: 16px 16px 16px 0; max-width: 80%; font-size: 14px; color: var(--text-main); line-height: 1.5; border: 1px solid var(--border);">
              Halo! Ada yang bisa kami bantu seputar produk dari <strong id="chat-welcome-shop">Toko</strong>?
              <div style="font-size: 10px; color: var(--text-muted); text-align: right; margin-top: 4px;">12:00</div>
            </div>
          </div>

          <div style="padding: 16px; background: var(--bg-1); border-top: 1px solid var(--border); border-radius: 0 0 12px 12px; display: flex; gap: 8px;">
            <input type="text" id="chat-input" placeholder="Tulis pesan..." style="flex: 1; background: var(--bg-2); border: 1px solid var(--border); border-radius: 20px; padding: 10px 16px; color: var(--text-main); font-size: 14px; outline: none;">
            <button id="chat-send-btn" style="background: var(--gold); color: var(--bg-1); border: none; border-radius: 50%; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 2px; margin-top: 2px;"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>`;
      document.body.insertAdjacentHTML('beforeend', chatModalHTML);
      // REAL BUYER CHAT LOGIC
      let chatPollInterval = null;
      
      const chatModal = document.getElementById('chat-modal');
      const chatCloseBtn = document.getElementById('chat-close-btn');
      const chatSendBtn = document.getElementById('chat-send-btn');
      const chatInput = document.getElementById('chat-input');
      const chatMessages = document.getElementById('chat-messages');

      if (chatCloseBtn) {
        chatCloseBtn.addEventListener('click', () => {
          chatModal.classList.remove('active');
          if (chatPollInterval) clearInterval(chatPollInterval);
        });
      }
      
      async function loadChatHistory() {
        const session = getActiveSession();
        if (!session) return;
        const buyerId = session.user.id;
        const shopId = window.currentChatShopId;
        if (!shopId) return;

        try {
          const res = await fetch(`${BASE_URL}/chat/history?buyer_id=${buyerId}&shop_id=${shopId}`);
          const data = await res.json();
          if (res.ok) {
            chatMessages.innerHTML = '';
            const encNotice = document.createElement('div');
            encNotice.style = "align-self: center; background: var(--bg-2); padding: 6px 12px; border-radius: 16px; font-size: 11px; color: var(--text-muted); margin-bottom: 8px;";
            encNotice.textContent = "Pesan terhubung langsung dengan penjual.";
            chatMessages.appendChild(encNotice);

            (data.data || []).forEach(msg => {
              const isMe = msg.sender_id === buyerId;
              const msgDiv = document.createElement('div');
              const timeStr = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
              if (isMe) {
                msgDiv.style = "align-self: flex-end; background: var(--gold); padding: 12px 16px; border-radius: 16px 16px 0 16px; max-width: 80%; font-size: 14px; color: var(--bg-1); line-height: 1.5;";
                msgDiv.innerHTML = `${msg.text}<div style="font-size: 10px; color: rgba(255,255,255,0.7); text-align: right; margin-top: 4px;">${timeStr}</div>`;
              } else {
                msgDiv.style = "align-self: flex-start; background: var(--bg-2); padding: 12px 16px; border-radius: 16px 16px 16px 0; max-width: 80%; font-size: 14px; color: var(--text-main); line-height: 1.5; border: 1px solid var(--border);";
                msgDiv.innerHTML = `${msg.text}<div style="font-size: 10px; color: var(--text-muted); text-align: right; margin-top: 4px;">${timeStr}</div>`;
              }
              chatMessages.appendChild(msgDiv);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
        } catch (e) { console.error(e); }
      }

      window.startChatPolling = function() {
        if (chatPollInterval) clearInterval(chatPollInterval);
        loadChatHistory();
        chatPollInterval = setInterval(loadChatHistory, 3000);
      };
      
      async function sendChatMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        const session = getActiveSession();
        if (!session) {
          showAlert("Silakan Sign In terlebih dahulu", "error");
          return;
        }

        const payload = {
          sender_id: session.user.id,
          shop_id: window.currentChatShopId,
          text: text
        };

        try {
          const res = await fetch(`${BASE_URL}/chat/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            chatInput.value = '';
            loadChatHistory();
          } else {
            showAlert("Gagal mengirim pesan", "error");
          }
        } catch (e) {
          showAlert("Error jaringan", "error");
        }
      }

      if (chatSendBtn) chatSendBtn.addEventListener('click', sendChatMessage);
      if (chatInput) chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
      });
    }
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
  const initialEl = document.getElementById('shop-modal-initial');

  if (!modal) return;

  const shopName = shop.name || 'Detail Toko';
  if (nameEl) nameEl.textContent = shopName;
  if (initialEl) initialEl.textContent = shopName.charAt(0).toUpperCase();

  const logoEl = document.getElementById('shop-modal-logo');
  if (logoEl) {
    if (shop.owner_avatar && shop.owner_avatar.trim() !== '') {
      logoEl.src = shop.owner_avatar;
      logoEl.style.display = 'block';
      if (initialEl) initialEl.style.display = 'none';
    } else {
      logoEl.style.display = 'none';
      if (initialEl) initialEl.style.display = 'block';
    }
  }
  if (descEl) descEl.textContent = shop.description || 'Tidak ada deskripsi toko.';
  if (addressEl) addressEl.textContent = shop.owner_address || 'Tidak ada alamat toko.';
  
  const viewBtn = document.getElementById('shop-modal-view-btn');

  if (viewBtn) {
    viewBtn.onclick = function() {
      window.location.href = 'index.html?shop=' + encodeURIComponent(shopName);
    };
  }

  modal.classList.add('active');
};

// Chat Modal logic
document.addEventListener('DOMContentLoaded', () => {
  const chatModal = document.getElementById('chat-modal');
  const chatCloseBtn = document.getElementById('chat-close-btn');
  const chatSendBtn = document.getElementById('chat-send-btn');
  const chatInput = document.getElementById('chat-input');
  const chatMessages = document.getElementById('chat-messages');

  if (chatCloseBtn) {
    chatCloseBtn.addEventListener('click', () => {
      chatModal.classList.remove('active');
    });
  }

  function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    // Add User Message
    const msgDiv = document.createElement('div');
    msgDiv.style = "align-self: flex-end; background: var(--gold); padding: 12px 16px; border-radius: 16px 16px 0 16px; max-width: 80%; font-size: 14px; color: var(--bg-1); line-height: 1.5;";
    msgDiv.innerHTML = `${text}<div style="font-size: 10px; color: rgba(255,255,255,0.7); text-align: right; margin-top: 4px;">${timeStr}</div>`;
    chatMessages.appendChild(msgDiv);
    chatInput.value = '';
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Simulate Reply
    setTimeout(() => {
      const replyDiv = document.createElement('div');
      replyDiv.style = "align-self: flex-start; background: var(--bg-2); padding: 12px 16px; border-radius: 16px 16px 16px 0; max-width: 80%; font-size: 14px; color: var(--text-main); line-height: 1.5; border: 1px solid var(--border);";
      replyDiv.innerHTML = `Terima kasih! Pesan Anda sudah kami terima dan akan segera dibalas oleh admin toko.<div style="font-size: 10px; color: var(--text-muted); text-align: right; margin-top: 4px;">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>`;
      chatMessages.appendChild(replyDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 1500);
  }

  if (chatSendBtn) chatSendBtn.addEventListener('click', sendChatMessage);
  if (chatInput) chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
});

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
