import { initAuth }                                from "./controller/auth.js";
import { loadCatalogProducts }                      from "./controller/product.js";
import { initCart, updateCartUI }                   from "./controller/transaction.js";
import { initSellerDashboard, initAdminDashboard }  from "./controller/dashboard.js";
import { getActiveSession, clearActiveSession, BASE_URL }      from "./config/api.js";

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

    const shopActionBtn = $('#dropdown-shop-action');
    if (shopActionBtn) {
      if (session.user.has_shop) {
        shopActionBtn.querySelector('span').textContent = 'Switch ke Hub Penjual';
        shopActionBtn.href = 'seller.html';
      } else {
        shopActionBtn.querySelector('span').textContent = 'Buka Ruko Vendora';
        shopActionBtn.href = 'seller.html'; // In a real app this would go to a shop creation page
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
  }
});
