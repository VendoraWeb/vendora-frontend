/* ============================================================
   VENDORA STOREFRONT — hero slider, navbar overlay, scroll reveal
   - Slider full-bleed ala Aimeos: autoplay, panah, titik, swipe,
     keyboard, pause saat hover/fokus.
   - Scroll reveal ala innoshop: naik 40px + fade, expo-out, sekali.
   Tanpa library.
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;
  var nav = document.getElementById('main-navbar');
  var hero = document.getElementById('hero-section');

  // Halaman profil toko (index.html?shop=...) tidak memakai tile kategori/promo
  if (new URLSearchParams(window.location.search).get('shop')) root.classList.add('sf-shop-page');

  /* ── 1. Hero slider ───────────────────────────────────────── */
  function initSlider(el) {
    var slides = [].slice.call(el.querySelectorAll('.sf-slide'));
    var dots = [].slice.call(el.querySelectorAll('.sf-dot'));
    var counter = el.querySelector('.sf-slide-count b');
    var current = 0;
    if (slides.length < 2) return;

    function go(index) {
      var next = (index + slides.length) % slides.length;
      if (next === current) return;
      slides[current].classList.remove('is-active');
      slides[current].setAttribute('aria-hidden', 'true');
      dots[current].classList.remove('is-active');
      dots[current].setAttribute('aria-selected', 'false');
      current = next;
      slides[current].classList.add('is-active');
      slides[current].removeAttribute('aria-hidden');
      dots[current].classList.add('is-active');
      dots[current].setAttribute('aria-selected', 'true');
      if (counter) counter.textContent = ('0' + (current + 1)).slice(-2);
    }

    // Autoplay digerakkan oleh animasi progress di titik aktif:
    // saat animasinya selesai → slide berikutnya. Pause = jeda animasi.
    if (!reduceMotion) {
      dots.forEach(function (dot) {
        dot.querySelector('.sf-dot-fill').addEventListener('animationend', function () {
          if (dot.classList.contains('is-active')) go(current + 1);
        });
      });
    } else {
      el.classList.add('is-static');
    }

    el.querySelector('.sf-slider-nav--prev').addEventListener('click', function () { go(current - 1); });
    el.querySelector('.sf-slider-nav--next').addEventListener('click', function () { go(current + 1); });
    dots.forEach(function (dot, i) { dot.addEventListener('click', function () { go(i); }); });

    // Pause saat kursor/fokus di dalam hero
    el.addEventListener('mouseenter', function () { el.classList.add('is-paused'); });
    el.addEventListener('mouseleave', function () { el.classList.remove('is-paused'); });
    el.addEventListener('focusin', function () { el.classList.add('is-paused'); });
    el.addEventListener('focusout', function (e) {
      if (!el.contains(e.relatedTarget)) el.classList.remove('is-paused');
    });

    // Keyboard
    el.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { go(current - 1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { go(current + 1); e.preventDefault(); }
    });

    // Swipe / drag (geser)
    var startX = null, startY = 0;
    el.addEventListener('pointerdown', function (e) {
      if (e.target.closest('a, button')) return;
      startX = e.clientX; startY = e.clientY;
    });
    el.addEventListener('pointerup', function (e) {
      if (startX === null) return;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      startX = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(current + (dx < 0 ? 1 : -1));
    });
    el.addEventListener('pointercancel', function () { startX = null; });
  }
  if (hero) initSlider(hero);

  /* ── 2. Navbar transparan di atas hero ────────────────────── */
  function heroVisible() {
    return hero && hero.offsetParent !== null; // disembunyikan main.js di halaman toko
  }
  function measureNav() {
    if (nav) root.style.setProperty('--sf-nav-h', nav.offsetHeight + 'px');
  }
  measureNav();
  window.addEventListener('resize', measureNav);

  /* ── 3. Scroll reveal ─────────────────────────────────────── */
  var STAGGER_MS = 40, STAGGER_MAX = 280;
  var io = null;
  if (!reduceMotion && 'IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      entries.filter(function (e) { return e.isIntersecting; }).forEach(function (entry, i) {
        var el = entry.target;
        el.style.transitionDelay = Math.min(i * STAGGER_MS, STAGGER_MAX) + 'ms';
        el.classList.add('is-revealed');
        io.unobserve(el);
        setTimeout(function () { el.style.transitionDelay = ''; }, 1200);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -12% 0px' });
  }
  function watch(el) {
    if (!el || el.dataset.revealBound) return;
    el.dataset.revealBound = '1';
    if (!io) { el.classList.add('is-revealed'); return; }
    el.setAttribute('data-reveal', '');
    io.observe(el);
  }
  document.querySelectorAll('[data-reveal]').forEach(watch);

  var grid = document.getElementById('product-list');
  if (grid) {
    var bindCards = function () {
      grid.querySelectorAll('.product-card:not(.is-skeleton)').forEach(watch);
    };
    new MutationObserver(bindCards).observe(grid, { childList: true });
    bindCards();
  }

  /* ── 4. Link kategori (slide, tile, footer) ditangani main.js (pickCategory) ─ */

  /* ── 5. Scroll: status navbar + parallax pita penjual ────── */
  var band = document.querySelector('[data-parallax]');
  var ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.scrollY;
    if (nav) {
      var overlay = heroVisible() && y < hero.offsetHeight - nav.offsetHeight - 8;
      nav.classList.toggle('is-overlay', overlay);
      nav.classList.toggle('is-scrolled', !overlay && y > 8);
    }
    if (band && !reduceMotion) {
      var r = band.parentElement.getBoundingClientRect();
      var vh = window.innerHeight;
      if (r.bottom > 0 && r.top < vh) {
        var progress = (r.top + r.height / 2 - vh / 2) / vh; // -1 … 1
        band.style.transform = 'translate3d(0,' + (progress * -60).toFixed(1) + 'px,0)';
      }
    }
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
  // main.js menyembunyikan hero di halaman toko (?shop=) → navbar harus solid
  if (hero) new MutationObserver(function () { measureNav(); onScroll(); })
    .observe(hero, { attributes: true, attributeFilter: ['style'] });

  // Mulai animasi masuk setelah frame pertama dirender
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { root.classList.add('sf-loaded'); });
  });
})();
