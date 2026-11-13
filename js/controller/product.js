import { BASE_URL, authHeaders, getActiveSession } from "../config/api.js?v=105";
import { esc } from "../ui.js?v=102";
import { addToCart, updateCartUI, buyNow } from "./transaction.js?v=146";
import { CATEGORIES, CATEGORY_BY_KEY, categoryOf, categoryLabel, matchesSub, SEARCH_SYNONYMS } from "../categories.js?v=101";

// ─── Alert helper ──────────────────────────────────────────────────────────
function showAlert(message, type) {
  if (window.showAlert) { window.showAlert(message, type); return; }
  const container = document.getElementById('alert-container');
  if (!container) return;
  const div = document.createElement('div');
  div.className = `alert alert-${type}`;
  div.textContent = message;
  container.prepend(div);
  setTimeout(() => div.remove(), 3500);
}

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80';
const fmtRp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;

// ─── Cache data (dipakai katalog, halaman toko, dan modal detail) ───────────
let shopCache = {};                 // id -> nama
export let shopDetailCache = {};    // id -> objek toko
let soldMap = {};                   // product_id -> jumlah terjual (tanpa dibatalkan)
let allProducts = [];               // katalog lengkap terakhir
let state = { filter: 'all', shop: null, sort: 'relevan', q: '' };

/** Kategori spesifik produk untuk etalase toko: sub-kategori, atau tag "[Kategori: X]" lama. */
export function parseCategories(p) {
  if (p.subcategory) return [p.subcategory];
  const m = /\[kategori:\s*([^\]]+)\]/i.exec(p.description || '');
  if (!m) return [];
  return m[1].split(',').map(s => s.trim()).filter(Boolean);
}

/** Deskripsi tanpa tag "[Kategori: …]" untuk ditampilkan ke pembeli. */
function cleanDesc(text) {
  return String(text || '').replace(/\s*\[kategori:[^\]]*\]\s*/ig, ' ').trim();
}

// Pesanan lama produk contoh tersimpan sebagai "Produk Mockup (m1)". Listing itu
// sekarang produk asli toko Apple, jadi diarahkan ke ID produk yang sama.
const LEGACY_MOCK = {
  m1: '6a48a951bc1d7146da66d384', // dulu iPhone 15 Pro Max → iPhone 18 Pro
  m2: '6a48a951bc1d7146da66d385', // MacBook Pro
  m3: '6a48a951bc1d7146da66d386', // iPad Pro
  m4: '6a48a951bc1d7146da66d387', // AirPods Pro
};
export function mockIdFromName(name) {
  const m = /^Produk Mockup \((m\d+)\)$/i.exec(String(name || '').trim());
  return m ? (LEGACY_MOCK[m[1].toLowerCase()] || m[1]) : null;
}

const shopNameOf = (p) => p.shop_name || shopCache[p.shop_id] || '';
const imageOf = (p) => (p.images && p.images[0]) ? p.images[0] : FALLBACK_IMG;
const soldOf = (p) => soldMap[p.id] || 0;
const soldText = (n) => n >= 1000 ? `${(n / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} rb terjual` : `${n} terjual`;
const hasOptions = (p) => Array.isArray(p.options) && p.options.length > 0;

const basePriceOf = (p) => (p.promo_price && p.promo_price > 0 && p.promo_price < p.price) ? Number(p.promo_price) : (Number(p.price) || 0);
const isPromo = (p) => Boolean(p.promo_price && p.promo_price > 0 && p.promo_price < p.price);

/** Harga termurah & termahal dari kombinasi variasi. */
function priceRange(p) {
  let min = basePriceOf(p), max = min;
  (p.options || []).forEach(g => {
    const deltas = (g.values || []).map(v => Number(v.price_delta) || 0);
    if (!deltas.length) return;
    min += Math.min(...deltas);
    max += Math.max(...deltas);
  });
  return { min, max };
}

const colorGroup = (p) => (p.options || []).find(g => (g.values || []).some(v => v.swatch));

// ─── Kartu produk ───────────────────────────────────────────────────────────
function renderCard(p) {
  const shopName = shopNameOf(p);
  const image = imageOf(p);
  const inStock = p.stock > 0;
  const sold = soldOf(p);
  const { min, max } = priceRange(p);
  const colors = colorGroup(p);
  const promo = isPromo(p);

  let badge = '';
  if (p.stock === 0)     badge = '<span class="pc-badge pc-badge--out">Habis</span>';
  else if (promo)        badge = `<span class="pc-badge" style="background:#DC2626;color:#fff;">${esc(p.promo_label || `-${p.discount_percent || 0}%`)}</span>`;
  else if (p.stock <= 5) badge = `<span class="pc-badge">Sisa ${p.stock}</span>`;

  const swatches = colors ? `
        <div class="pc-swatches" aria-label="${colors.values.length} pilihan ${esc(colors.name.toLowerCase())}">
          ${colors.values.slice(0, 5).map(v => `<span class="pc-swatch" style="background:${esc(v.swatch || '#ddd')}" title="${esc(v.label)}"></span>`).join('')}
          ${colors.values.length > 5 ? `<span class="pc-swatch-more">+${colors.values.length - 5}</span>` : ''}
        </div>` : '<div class="pc-swatches" aria-hidden="true"></div>';

  const data = `data-id="${esc(p.id)}"`;
  return `
    <article class="product-card" data-product-id="${esc(p.id)}" tabindex="0" aria-label="${esc(p.name)}, ${fmtRp(min)}">
      <div class="product-img-wrapper">
        <img class="product-img" src="${esc(image)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
        ${badge}
      </div>
      <div class="product-body">
        <h3 class="product-name">${esc(p.name)}</h3>
        ${swatches}
        <div class="product-price-row">
          <span class="product-price" ${promo ? 'style="color:#DC2626;"' : ''}>${max > min ? '<small class="pc-from">mulai</small>' : ''}${fmtRp(min)}${promo ? ` <small style="text-decoration:line-through;color:var(--mute);font-weight:400;font-size:11px;">${fmtRp(p.price)}</small>` : ''}</span>
          ${sold ? `<span class="pc-sold">${soldText(sold)}</span>` : ''}
        </div>
        ${shopName ? `
        <button type="button" class="product-shop-tag shop-clickable" data-shop="${esc(shopName)}" aria-label="Kunjungi toko ${esc(shopName)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v2a3 3 0 01-6 0 3 3 0 01-6 0 3 3 0 01-6 0z"/><path d="M5 13v8h14v-8"/></svg>
          <span>${esc(shopName)}</span>
        </button>` : ''}
        <div class="pc-actions">
          <button class="pc-cart btn-add-cart" type="button" ${data} ${inStock ? '' : 'disabled'} aria-label="Tambah ${esc(p.name)} ke keranjang">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          </button>
          <button class="pc-buy btn-buy-now" type="button" ${data} ${inStock ? '' : 'disabled'}>${inStock ? 'Beli sekarang' : 'Stok habis'}</button>
        </div>
      </div>
    </article>`;
}

/** Data barang untuk keranjang, termasuk variasi terpilih. */
function cartPayload(p, sel = {}) {
  let price = basePriceOf(p);
  let image = imageOf(p);
  const labels = [];
  (p.options || []).forEach(g => {
    const v = (g.values || []).find(x => x.label === sel[g.name]);
    if (!v) return;
    price += Number(v.price_delta) || 0;
    if (v.image) image = v.image;
    labels.push(v.label);
  });
  return { id: p.id, name: p.name, price, image, shopName: shopNameOf(p), shopId: p.shop_id || '',
           options: hasOptions(p) ? { ...sel } : null, variant: labels.join(', ') };
}

function goToShop(name) {
  if (!name) return;
  window.location.href = `index.html?shop=${encodeURIComponent(name)}`;
}

/** Delegasi klik untuk grid kartu katalog. */
function bindGrid(grid, list) {
  grid._list = list;
  if (grid.dataset.bound) return;
  grid.dataset.bound = '1';
  const find = (id) => (grid._list || []).find(p => p.id === id);

  grid.addEventListener('click', async (e) => {
    const shopBtn = e.target.closest('.shop-clickable');
    const cartBtn = e.target.closest('.btn-add-cart');
    const buyBtn  = e.target.closest('.btn-buy-now');
    const card    = e.target.closest('.product-card');
    if (shopBtn) { e.stopPropagation(); goToShop(shopBtn.dataset.shop); return; }
    if (cartBtn) {
      e.stopPropagation();
      const p = find(cartBtn.dataset.id);
      if (!p) return;
      // Produk bervariasi: pilih warna/ukuran dulu di detail produk (seperti Shopee)
      if (hasOptions(p)) { showProductDetailModal(p, { pickFor: 'cart' }); return; }
      if (addToCart(cartPayload(p))) {
        updateCartUI();
        showAlert(`"${p.name}" masuk keranjang.`, 'success');
        cartBtn.classList.add('is-added');
        setTimeout(() => cartBtn.classList.remove('is-added'), 1200);
      }
      return;
    }
    if (buyBtn) {
      e.stopPropagation();
      const p = find(buyBtn.dataset.id);
      if (!p) return;
      if (hasOptions(p)) { showProductDetailModal(p, { pickFor: 'buy' }); return; }
      await buyNow(cartPayload(p), 1);
      return;
    }
    if (card) {
      const p = find(card.dataset.productId);
      if (p) showProductDetailModal(p);
    }
  });
  grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const card = e.target.closest('.product-card');
    if (card && e.target === card) {
      const p = find(card.dataset.productId);
      if (p) showProductDetailModal(p);
    }
  });
}

// ─── Data katalog ───────────────────────────────────────────────────────────
function isShopEffectivelyActive(s) {
  if (!s) return false;
  if (s.effective_status) return s.effective_status === 'active';
  if (s.status !== 'active') return false;
  if (!s.rental_expires) return true;
  return new Date(s.rental_expires).getTime() >= Date.now();
}

async function fetchCatalog() {
  const [prodRes, shopRes, txRes] = await Promise.all([
    fetch(`${BASE_URL}/products`).then(r => r.json()),
    fetch(`${BASE_URL}/shops`).then(r => r.json()).catch(() => ({ data: [] })),
    fetch(`${BASE_URL}/transactions`).then(r => r.json()).catch(() => ({ data: [] })),
  ]);

  (shopRes.data || []).forEach(s => { shopCache[s.id] = s.name; shopDetailCache[s.id] = s; });

  // Jumlah terjual dari transaksi asli (pesanan dibatalkan tidak dihitung)
  soldMap = {};
  (txRes.data || []).forEach(t => {
    if (t.status === 'cancelled') return;
    (t.items || []).forEach(i => {
      const key = mockIdFromName(i.name) || i.product_id;
      soldMap[key] = (soldMap[key] || 0) + (i.quantity || 0);
    });
  });

  // Hanya tampilkan produk yang tidak disembunyikan admin dan dari ruko yang aktif (belum jatuh tempo)
  allProducts = (prodRes.data || [])
    .filter(p => {
      if (p.hidden) return false;
      const shop = shopDetailCache[p.shop_id];
      return !shop || isShopEffectivelyActive(shop);
    })
    .filter((v, i, a) => a.findIndex(t => t.name.toLowerCase() === v.name.toLowerCase()) === i);
  return allProducts;
}

/** Data katalog untuk halaman lain (mis. Pesanan saya): produk, toko, jumlah terjual. */
export async function loadCatalogData() {
  if (!allProducts.length) await fetchCatalog();
  return { products: allProducts, shops: shopDetailCache, soldOf, imageOf, shopNameOf };
}

function sortProducts(list, sort) {
  const out = [...list];
  const low = (p) => priceRange(p).min;
  if (sort === 'terlaris') out.sort((a, b) => soldOf(b) - soldOf(a));
  if (sort === 'termurah') out.sort((a, b) => low(a) - low(b));
  if (sort === 'termahal') out.sort((a, b) => low(b) - low(a));
  if (sort === 'terbaru')  out.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return out;
}

export function setCatalogSort(sort) {
  state.sort = sort;
  return loadCatalogProducts(state.filter, state.shop, { refetch: false });
}

function applyFilter(products, filter) {
  if (!filter || filter === 'all') return products;
  if (filter.startsWith('kat:')) {
    const cat = filter.slice(4).toLowerCase();
    return products.filter(p => parseCategories(p).some(c => c.toLowerCase() === cat));
  }
  if (filter.startsWith('sub:')) {
    const [catKey, sub] = filter.slice(4).split('|');
    return products.filter(p => categoryOf(p) === catKey && matchesSub(p, sub));
  }
  return products.filter(p => categoryOf(p) === filter);
}

function filterLabel(filter) {
  if (!filter || filter === 'all') return '';
  if (filter.startsWith('kat:')) return filter.slice(4);
  if (filter.startsWith('sub:')) return filter.slice(4).split('|')[1];
  return categoryLabel(filter);
}

/**
 * Muat & render katalog.
 * filter: 'all' | kunci kategori ('fashion', 'dapur', …) | 'sub:<kategori>|<sub>' | 'kat:<etalase toko>'
 * Tanpa argumen → pakai filter/toko terakhir (mis. setelah checkout).
 */
export async function loadCatalogProducts(filter, shopQuery, { refetch = true } = {}) {
  const grid = document.getElementById('product-list');
  if (!grid) return;
  if (filter !== undefined) state.filter = filter || 'all';
  if (shopQuery !== undefined) state.shop = shopQuery || null;

  if (!allProducts.length) {
    grid.innerHTML = Array(10).fill(0).map(() => `
      <div class="product-card is-skeleton" aria-hidden="true">
        <div class="product-img-wrapper sk-block"></div>
        <div class="product-body"><div class="sk-line" style="width:85%"></div><div class="sk-line" style="width:55%"></div><div class="sk-line" style="width:35%"></div></div>
      </div>`).join('');
  }

  try {
    if (refetch || !allProducts.length) await fetchCatalog();

    let products = allProducts;
    if (state.shop) {
      const q = state.shop.toLowerCase();
      products = products.filter(p => shopNameOf(p).toLowerCase() === q);
    }
    const shopProducts = products;

    products = applyFilter(products, state.filter);
    if (state.q) {
      const ranked = searchProducts(state.q, products);
      products = state.sort === 'relevan' ? ranked : sortProducts(ranked, state.sort);
    } else {
      products = sortProducts(products, state.sort);
    }

    // Beri tahu halaman (header toko, etalase kategori, jumlah hasil)
    document.dispatchEvent(new CustomEvent('vendora:catalog-loaded', {
      detail: { shopProducts, shown: products.length, soldOf, parseCategories, shop: state.shop, shopDetailCache,
                q: state.q, filter: state.filter, filterLabel: filterLabel(state.filter) }
    }));

    if (!products.length) {
      const what = state.q ? `untuk "${esc(state.q)}"` : (state.filter !== 'all' ? `di ${esc(filterLabel(state.filter))}` : 'di sini');
      grid.innerHTML = `
        <div class="catalog-empty">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <h3>Belum ada produk ${what}</h3>
          <p>${state.q ? 'Coba kata kunci lain, misalnya nama merek atau jenis barang.' : 'Penjual belum menambahkan produk di kategori ini. Coba kategori lain.'}</p>
          <button type="button" class="btn-line" data-reset-catalog>Lihat semua produk</button>
        </div>`;
      grid.querySelector('[data-reset-catalog]')?.addEventListener('click', () => {
        clearSearch();
        document.dispatchEvent(new CustomEvent('vendora:filter-changed', { detail: { filter: 'all' } }));
        loadCatalogProducts('all', state.shop, { refetch: false });
      });
      return;
    }

    grid.innerHTML = products.map(renderCard).join('');
    bindGrid(grid, products);
  } catch (err) {
    console.error('Failed to load products:', err);
    grid.innerHTML = `
      <div class="catalog-empty">
        <h3>Gagal memuat produk</h3>
        <p>Periksa koneksi lalu muat ulang halaman.</p>
      </div>`;
  }
}

/** Buka detail produk berdasarkan ID (dipakai pencarian & tautan ?p=). */
export async function openProductById(id) {
  if (!allProducts.length) await fetchCatalog();
  const p = allProducts.find(x => x.id === id);
  if (p) showProductDetailModal(p);
}

// ─── Chat penjual (dari modal detail) ───────────────────────────────────────
function openChat(shop, name) {
  if (!shop) { showAlert('Chat belum tersedia untuk toko ini.', 'error'); return; }
  document.getElementById('product-detail-modal')?.classList.remove('active');
  if (window.openShopChat) window.openShopChat(shop, name);
}

// ─── Modal detail produk ────────────────────────────────────────────────────
function sizeGuideTable(g) {
  return `
    <div class="pd-guide-table-wrap">
      <table class="pd-guide-table">
        <thead><tr>${g.columns.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${g.rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
    ${g.note ? `<p class="pd-guide-note">${esc(g.note)}</p>` : ''}`;
}

function showProductDetailModal(p, { pickFor = null } = {}) {
  const modal = document.getElementById('product-detail-modal');
  const body = modal ? modal.querySelector('.product-detail-modal-body') : null;
  if (!modal || !body) return;

  const shopName = shopNameOf(p);
  const shop = shopDetailCache[p.shop_id];
  const inStock = p.stock > 0;
  const sold = soldOf(p);
  const images = p.images && p.images.length ? p.images : [imageOf(p)];
  const desc = cleanDesc(p.description) || 'Penjual belum menulis deskripsi.';
  const catKey = categoryOf(p);
  const sub = p.subcategory || parseCategories(p)[0] || '';
  const shopList = allProducts.filter(x => shopNameOf(x) === shopName);
  const others = shopList.filter(x => x.id !== p.id).slice(0, 6);
  const shopSold = shopList.reduce((s, x) => s + soldOf(x), 0);
  const since = shop && shop.created_at
    ? new Date(shop.created_at).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }) : '';
  const groups = p.options || [];
  const sel = {};
  // Pilihan tunggal langsung terpilih
  groups.forEach(g => { if ((g.values || []).length === 1) sel[g.name] = g.values[0].label; });

  const specRows = [
    ['Kategori', [catKey ? categoryLabel(catKey) : '', sub].filter((v, i, a) => v && a.indexOf(v) === i).join(' › ')],
    ...(p.specs || []).map(s => [s.label, s.value]),
    ['Stok', inStock ? `${p.stock} unit` : 'Habis'],
    ['Dikirim dari', shop && shop.owner_address ? shop.owner_address : ''],
  ].filter(r => r[1]);

  const optionHTML = groups.map((g, gi) => {
    const isSize = /ukuran|size/i.test(g.name);
    return `
      <div class="pd-opt" data-group="${gi}">
        <div class="pd-opt-head">
          <span class="pd-opt-name">${esc(g.name)}${groups.length ? `<b class="pd-opt-picked" data-picked="${gi}"></b>` : ''}</span>
          ${isSize && p.size_guide ? `<button type="button" class="pd-guide-link" data-open-guide>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21.3 8.7 8.7 21.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L15.3 2.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4z"/><path d="m7.5 10.5 2 2"/><path d="m10.5 7.5 2 2"/><path d="m13.5 4.5 2 2"/><path d="m4.5 13.5 2 2"/></svg>
            Panduan ukuran</button>` : ''}
        </div>
        <div class="pd-opt-values" role="radiogroup" aria-label="${esc(g.name)}">
          ${(g.values || []).map((v, vi) => `
            <button type="button" class="pd-chip${v.swatch ? ' pd-chip--color' : ''}" role="radio" aria-checked="false"
                    data-g="${gi}" data-v="${vi}">
              ${v.swatch ? `<span class="pd-chip-swatch" style="background:${esc(v.swatch)}"></span>` : ''}
              <span>${esc(v.label)}</span>
            </button>`).join('')}
        </div>
        <p class="pd-opt-error" data-error="${gi}" hidden>Pilih ${esc(g.name.toLowerCase())} dulu.</p>
      </div>`;
  }).join('');

  body.innerHTML = `
    <div class="pd">
      <div class="pd-top">
        <div class="pd-gallery">
          <div class="pd-main"><img id="p-main-img" src="${esc(images[0])}" alt="${esc(p.name)}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}'"></div>
          ${images.length > 1 ? `<div class="pd-thumbs">${images.map((src, i) => `
            <button type="button" class="pd-thumb ${i === 0 ? 'active' : ''}" data-src="${esc(src)}" aria-label="Foto ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
        </div>

        <div class="pd-info">
          <h1 class="pd-name">${esc(p.name)}</h1>
          <div class="pd-meta">
            <span>${sold ? soldText(sold) : 'Belum ada penjualan'}</span>
            <span class="pd-dot" aria-hidden="true"></span>
            <span>${esc(catKey ? categoryLabel(catKey) : 'Lainnya')}</span>
          </div>
          <div class="pd-price" id="pd-price"></div>

          ${groups.length ? `<div class="pd-options" id="pd-options">${optionHTML}</div>` : ''}

          <dl class="pd-rows">
            <div><dt>Pengiriman</dt><dd><b>Gratis ongkir</b>${shop && shop.owner_address ? `<small>Dikirim dari ${esc(shop.owner_address)}</small>` : ''}</dd></div>
            <div><dt>Kuantitas</dt><dd class="pd-qty-row">
              <div class="qty-selector">
                <button class="qty-btn" id="qty-minus" type="button" aria-label="Kurangi" ${inStock ? '' : 'disabled'}>−</button>
                <input type="number" id="qty-input" value="1" min="1" max="${p.stock}" aria-label="Jumlah" ${inStock ? '' : 'disabled'}>
                <button class="qty-btn" id="qty-plus" type="button" aria-label="Tambah" ${inStock ? '' : 'disabled'}>+</button>
              </div>
              ${inStock ? `<span class="pd-stock${p.stock <= 5 ? ' is-low' : ''}">Tersisa ${p.stock} unit</span>` : '<span class="v-status v-status--bad">Stok habis</span>'}
            </dd></div>
          </dl>

          <div class="pd-actions">
            <button class="btn-p-add-cart" id="modal-add-cart-btn" type="button" ${inStock ? '' : 'disabled'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
              Masukkan keranjang
            </button>
            <button class="btn-p-buy-now" id="modal-buy-now-btn" type="button" ${inStock ? '' : 'disabled'}>Beli sekarang</button>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:10px;">
            <p class="pd-assure" style="margin:0;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 11 11 13 15 9"/></svg>
              Dijual oleh merchant terverifikasi Vendora
            </p>
            <button type="button" id="pd-report-btn" class="link-plain" style="font-size:12px;color:#B91C1C;display:inline-flex;align-items:center;gap:4px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
              Laporkan produk / toko
            </button>
          </div>
        </div>
      </div>

      ${shopName ? `
      <section class="pd-shop">
        <span class="pd-shop-avatar" aria-hidden="true">${esc(shopName.charAt(0).toUpperCase())}</span>
        <div class="pd-shop-id">
          <b>${esc(shopName)}</b>
          <span class="v-status v-status--good">Merchant terverifikasi</span>
        </div>
        <dl class="pd-shop-stats">
          <div><dt>Produk</dt><dd>${shopList.length}</dd></div>
          <div><dt>Terjual</dt><dd>${shopSold.toLocaleString('id-ID')}</dd></div>
          ${since ? `<div><dt>Bergabung</dt><dd>${esc(since)}</dd></div>` : ''}
        </dl>
        <div class="pd-shop-actions">
          ${shop ? `<button type="button" class="btn-line btn-line--sm" id="pd-chat">Chat</button>` : ''}
          <button type="button" class="btn-ink btn-ink--sm" id="pd-visit">Kunjungi toko</button>
        </div>
      </section>` : ''}

      <div class="pd-details">
        <section>
          <h2>Spesifikasi produk</h2>
          <dl class="pd-spec">${specRows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        </section>
        <section>
          <h2>Deskripsi produk</h2>
          <p class="pd-desc">${esc(desc)}</p>
          ${p.size_guide ? `<h2 class="pd-guide-title" id="pd-guide-section">Panduan ukuran</h2>${sizeGuideTable(p.size_guide)}` : ''}
        </section>
      </div>

      ${others.length ? `
      <section class="pd-more">
        <div class="pd-more-head">
          <h2>Produk lain dari ${esc(shopName)}</h2>
          <button type="button" class="link-plain" id="pd-more-all">Lihat semua</button>
        </div>
        <div class="pd-more-grid">${others.map(o => `
          <button type="button" class="pd-mini" data-id="${esc(o.id)}">
            <img src="${esc(imageOf(o))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
            <span class="pd-mini-name">${esc(o.name)}</span>
            <span class="pd-mini-price">${fmtRp(priceRange(o).min)}</span>
          </button>`).join('')}</div>
      </section>` : ''}

      ${p.size_guide ? `
      <div class="pd-guide-sheet" id="pd-guide-sheet" hidden>
        <div class="pd-guide-card" role="dialog" aria-modal="true" aria-labelledby="pd-guide-h">
          <div class="pd-guide-head">
            <h3 id="pd-guide-h">Panduan ukuran</h3>
            <button type="button" class="modal-close" data-close-guide aria-label="Tutup">&times;</button>
          </div>
          ${sizeGuideTable(p.size_guide)}
        </div>
      </div>` : ''}
    </div>`;

  // Galeri
  const mainImg = body.querySelector('#p-main-img');
  const setMain = (src) => {
    if (!src) return;
    mainImg.src = src;
    body.querySelectorAll('.pd-thumb').forEach(x => x.classList.toggle('active', x.dataset.src === src));
  };
  body.querySelectorAll('.pd-thumb').forEach(t => t.addEventListener('click', () => setMain(t.dataset.src)));

  // Harga mengikuti variasi
  const priceEl = body.querySelector('#pd-price');
  const renderPrice = () => {
    const allPicked = groups.every(g => sel[g.name]);
    const { min, max } = priceRange(p);
    if (allPicked || max === min) {
      priceEl.textContent = fmtRp(cartPayload(p, sel).price);
    } else {
      priceEl.innerHTML = `${fmtRp(min)} <span class="pd-price-sep">–</span> ${fmtRp(max)}`;
    }
  };

  // Variasi
  const syncOptions = () => {
    groups.forEach((g, gi) => {
      body.querySelectorAll(`.pd-chip[data-g="${gi}"]`).forEach(btn => {
        const on = g.values[+btn.dataset.v].label === sel[g.name];
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-checked', String(on));
      });
      const picked = body.querySelector(`[data-picked="${gi}"]`);
      if (picked) picked.textContent = sel[g.name] ? `: ${sel[g.name]}` : '';
    });
    renderPrice();
  };
  body.querySelectorAll('.pd-chip').forEach(btn => btn.addEventListener('click', () => {
    const g = groups[+btn.dataset.g];
    const v = g.values[+btn.dataset.v];
    sel[g.name] = v.label;
    body.querySelector(`[data-error="${btn.dataset.g}"]`).hidden = true;
    btn.closest('.pd-opt').classList.remove('is-missing');
    if (v.image) setMain(v.image);
    syncOptions();
  }));
  syncOptions();

  const missingGroup = () => {
    const gi = groups.findIndex(g => !sel[g.name]);
    if (gi < 0) return false;
    const opt = body.querySelector(`.pd-opt[data-group="${gi}"]`);
    body.querySelector(`[data-error="${gi}"]`).hidden = false;
    opt.classList.remove('is-missing'); void opt.offsetWidth; opt.classList.add('is-missing');
    opt.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  };

  // Panduan ukuran
  const sheet = body.querySelector('#pd-guide-sheet');
  body.querySelector('[data-open-guide]')?.addEventListener('click', () => { sheet.hidden = false; sheet.querySelector('[data-close-guide]').focus(); });
  sheet?.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-close-guide]')) sheet.hidden = true; });

  // Kuantitas
  const qtyInput = body.querySelector('#qty-input');
  const clampQty = () => {
    let v = parseInt(qtyInput.value, 10) || 1;
    v = Math.min(Math.max(1, v), Math.max(1, p.stock));
    qtyInput.value = v;
    return v;
  };
  body.querySelector('#qty-minus')?.addEventListener('click', () => { qtyInput.value = clampQty() - 1; clampQty(); });
  body.querySelector('#qty-plus')?.addEventListener('click', () => { qtyInput.value = clampQty() + 1; clampQty(); });
  qtyInput?.addEventListener('change', clampQty);

  // Aksi
  body.querySelector('#modal-add-cart-btn')?.addEventListener('click', () => {
    if (missingGroup()) return;
    const qty = clampQty();
    const item = cartPayload(p, sel);
    if (!addToCart(item, qty)) return;
    updateCartUI();
    showAlert(`${qty} × "${p.name}${item.variant ? ` (${item.variant})` : ''}" masuk keranjang.`, 'success');
  });
  body.querySelector('#modal-buy-now-btn')?.addEventListener('click', async () => {
    if (missingGroup()) return;
    const qty = clampQty();
    modal.classList.remove('active');
    await buyNow(cartPayload(p, sel), qty);
  });
  body.querySelector('#pd-visit')?.addEventListener('click', () => goToShop(shopName));
  body.querySelector('#pd-more-all')?.addEventListener('click', () => goToShop(shopName));
  body.querySelector('#pd-chat')?.addEventListener('click', () => openChat(shop, shopName));
  body.querySelector('#pd-report-btn')?.addEventListener('click', () => {
    const session = getActiveSession();
    const targetChoice = prompt(
      `Apa yang ingin Anda laporkan?\nKetik 1 untuk Produk ("${p.name}")\nKetik 2 untuk Toko ("${shopName || 'Toko penjual'}")`,
      '1'
    );
    if (!targetChoice) return;
    const isShopReport = targetChoice.trim() === '2';
    const reasonChoice = prompt(
      `Pilih alasan laporan:\n` +
      `1 = Barang palsu / tiruan\n` +
      `2 = Barang terlarang / melanggar hukum\n` +
      `3 = Deskripsi atau harga menyesatkan\n` +
      `4 = Indikasi penipuan toko\n` +
      `5 = Konten tidak pantas`,
      '1'
    );
    if (!reasonChoice) return;
    const reasonMap = {
      '1': 'counterfeit',
      '2': 'prohibited',
      '3': 'misleading',
      '4': 'scam',
      '5': 'inappropriate'
    };
    const reason = reasonMap[reasonChoice.trim()] || 'other';
    const description = prompt('Jelaskan detail pelanggaran yang Anda temukan (wajib diisi):', '');
    if (!description || !description.trim()) {
      showAlert('Keterangan laporan wajib diisi.', 'error');
      return;
    }

    fetch(`${BASE_URL}/reports`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        reporter_id: session?.user?.id || '',
        reporter_name: session?.user?.name || 'Pengguna Katalog',
        target_type: isShopReport ? 'shop' : 'product',
        target_id: isShopReport ? (p.shop_id || '') : p.id,
        target_name: isShopReport ? (shopName || 'Toko') : p.name,
        shop_id: p.shop_id || '',
        shop_name: shopName || '',
        reason,
        description: description.trim()
      })
    })
      .then(r => r.json())
      .then(res => {
        if (res.status === 200 || res.status === 201) {
          showAlert(res.message || 'Laporan berhasil dikirim ke tim moderasi Vendora.', 'success');
        } else {
          showAlert(res.message || 'Gagal mengirim laporan.', 'error');
        }
      })
      .catch(() => showAlert('Koneksi bermasalah saat mengirim laporan.', 'error'));
  });
  body.querySelectorAll('.pd-mini').forEach(btn => btn.addEventListener('click', () => {
    const next = allProducts.find(x => x.id === btn.dataset.id);
    if (next) showProductDetailModal(next);
  }));

  body.scrollTop = 0;
  modal.classList.add('active');

  // Dibuka dari tombol kartu: arahkan langsung ke pilihan variasi
  if (pickFor && groups.length) {
    const opts = body.querySelector('#pd-options');
    opts?.classList.add('is-prompt');
    const actionBtn = body.querySelector(pickFor === 'buy' ? '#modal-buy-now-btn' : '#modal-add-cart-btn');
    actionBtn?.classList.add('is-primary-pick');
    setTimeout(() => opts?.querySelector('.pd-chip')?.focus({ preventScroll: true }), 250);
  }
}

// Tutup modal detail
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('product-detail-close-btn');
  const modal = document.getElementById('product-detail-modal');
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const sheet = document.getElementById('pd-guide-sheet');
      if (sheet && !sheet.hidden) { sheet.hidden = true; return; }
      modal.classList.remove('active');
    });
  }
});

// ─── Pencarian ──────────────────────────────────────────────────────────────
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

function expandTerms(q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  return words.map(w => [w, ...(SEARCH_SYNONYMS[w] || [])]);
}

/** Cari produk: setiap kata harus cocok (atau sinonimnya). Hasil diurutkan menurut skor. */
export function searchProducts(q, list = allProducts) {
  const groups = expandTerms(q);
  if (!groups.length) return [];
  const scored = [];
  list.forEach(p => {
    const name = norm(p.name);
    const shop = norm(shopNameOf(p));
    const cat = categoryOf(p);
    const catText = norm(`${cat ? categoryLabel(cat) : ''} ${p.subcategory || ''} ${parseCategories(p).join(' ')}`);
    const desc = norm(cleanDesc(p.description));
    const opts = norm((p.options || []).flatMap(g => g.values.map(v => v.label)).join(' '));
    let score = 0;
    for (const alts of groups) {
      let best = 0;
      for (const w of alts) {
        if (name.startsWith(w)) best = Math.max(best, 12);
        else if (new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(name)) best = Math.max(best, 10);
        else if (name.includes(w)) best = Math.max(best, 7);
        else if (shop.includes(w)) best = Math.max(best, 6);
        else if (catText.includes(w)) best = Math.max(best, 5);
        else if (opts.includes(w)) best = Math.max(best, 4);
        else if (desc.includes(w)) best = Math.max(best, 2);
      }
      if (!best) return; // satu kata tidak cocok → produk tidak tampil
      score += best;
    }
    scored.push({ p, score: score + Math.min(soldOf(p), 50) / 100 });
  });
  return scored.sort((a, b) => b.score - a.score).map(x => x.p);
}

function highlight(text, q) {
  const safe = esc(text);
  const words = norm(q).split(/\s+/).filter(w => w.length > 1);
  if (!words.length) return safe;
  const re = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  return safe.replace(re, '<mark>$1</mark>');
}

const RECENT_KEY = 'vendora_recent_search';
const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } };
const pushRecent = (q) => {
  try {
    const list = [q, ...readRecent().filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch { /* penyimpanan tidak tersedia */ }
};

export function clearSearch() {
  state.q = '';
  const input = document.getElementById('nav-search-input');
  if (input) { input.value = ''; input.closest('.nav-search')?.classList.remove('has-value'); }
}

/** Jalankan pencarian penuh: filter katalog di beranda, atau pindah ke beranda dari halaman lain. */
export function applySearch(q) {
  q = String(q || '').trim();
  if (!q) return;
  pushRecent(q);
  const grid = document.getElementById('product-list');
  const onHome = grid && !new URLSearchParams(location.search).get('shop');
  if (!onHome) { window.location.href = `index.html?q=${encodeURIComponent(q)}#catalog-anchor`; return; }
  state.q = q;
  state.filter = 'all';
  document.dispatchEvent(new CustomEvent('vendora:filter-changed', { detail: { filter: 'all' } }));
  loadCatalogProducts('all', state.shop, { refetch: !allProducts.length }).then(() => {
    const anchor = document.getElementById('catalog-anchor');
    if (anchor) window.scrollTo({ top: anchor.getBoundingClientRect().top + window.scrollY - 72, behavior: 'smooth' });
  });
}

export function initSearch() {
  const input = document.getElementById('nav-search-input');
  if (!input || input.dataset.bound) return;
  input.dataset.bound = '1';
  const wrap = input.closest('.nav-search');
  wrap.setAttribute('role', 'search');

  // Tombol hapus sendiri (tombol bawaan browser berwarna biru & tidak serasi)
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'nav-search-clear';
  clearBtn.setAttribute('aria-label', 'Hapus kata kunci');
  clearBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  wrap.appendChild(clearBtn);

  const panel = document.createElement('div');
  panel.className = 'search-suggest';
  panel.id = 'search-suggest';
  panel.setAttribute('role', 'listbox');
  panel.hidden = true;
  wrap.appendChild(panel);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-controls', 'search-suggest');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-autocomplete', 'list');

  let active = -1;
  let timer = null;
  const items = () => [...panel.querySelectorAll('[data-sg]')];
  const open = () => { panel.hidden = false; input.setAttribute('aria-expanded', 'true'); wrap.classList.add('is-open'); };
  const close = () => { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); wrap.classList.remove('is-open'); active = -1; };
  const setActive = (i) => {
    const list = items();
    active = list.length ? (i + list.length) % list.length : -1;
    list.forEach((el, idx) => el.classList.toggle('is-active', idx === active));
    if (active >= 0) { list[active].scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', list[active].id); }
  };

  const renderEmpty = () => {
    const recent = readRecent();
    panel.innerHTML = `
      ${recent.length ? `
      <div class="sg-section">
        <div class="sg-head"><span>Pencarian terakhir</span><button type="button" class="sg-clear-recent">Hapus</button></div>
        <div class="sg-chips">${recent.map((r, i) => `<button type="button" class="sg-chip" id="sg-r${i}" data-sg="query" data-q="${esc(r)}">${esc(r)}</button>`).join('')}</div>
      </div>` : ''}
      <div class="sg-section">
        <div class="sg-head"><span>Kategori populer</span></div>
        <div class="sg-chips">${CATEGORIES.slice(0, 8).map((c, i) => `<button type="button" class="sg-chip" id="sg-c${i}" data-sg="cat" data-cat="${c.key}">${esc(c.label)}</button>`).join('')}</div>
      </div>`;
    panel.querySelector('.sg-clear-recent')?.addEventListener('click', (e) => {
      e.stopPropagation();
      try { localStorage.removeItem(RECENT_KEY); } catch { /* abaikan */ }
      renderEmpty();
    });
    active = -1;
    open();
  };

  const render = async (q) => {
    if (!allProducts.length) {
      panel.innerHTML = '<div class="sg-loading">Mencari…</div>';
      open();
      try { await fetchCatalog(); } catch { panel.innerHTML = '<div class="sg-loading">Gagal memuat produk.</div>'; return; }
      if (input.value.trim() !== q) return;
    }
    const prods = searchProducts(q).slice(0, 6);
    const nq = norm(q);
    const shops = Object.values(shopDetailCache)
      .filter(s => isShopEffectivelyActive(s) && norm(s.name).includes(nq)).slice(0, 3);
    const cats = [];
    CATEGORIES.forEach(c => {
      if (norm(c.label).includes(nq)) cats.push({ filter: c.key, label: c.label, parent: '' });
      c.subs.forEach(s => { if (norm(s).includes(nq)) cats.push({ filter: `sub:${c.key}|${s}`, label: s, parent: c.label }); });
    });

    if (!prods.length && !shops.length && !cats.length) {
      panel.innerHTML = `
        <div class="sg-none">
          <b>Tidak ada hasil untuk "${esc(q)}"</b>
          <span>Coba kata lain, misalnya nama merek atau jenis barang.</span>
        </div>`;
      open();
      return;
    }

    panel.innerHTML = `
      ${cats.length ? `<div class="sg-section"><div class="sg-head"><span>Kategori</span></div>
        <div class="sg-chips">${cats.slice(0, 5).map((c, i) => `<button type="button" class="sg-chip" id="sg-k${i}" data-sg="filter" data-filter="${esc(c.filter)}">${c.parent ? `<small>${esc(c.parent)} ›</small> ` : ''}${highlight(c.label, q)}</button>`).join('')}</div></div>` : ''}
      ${prods.length ? `<div class="sg-section"><div class="sg-head"><span>Produk</span></div>
        ${prods.map((p, i) => `
        <button type="button" class="sg-product" id="sg-p${i}" data-sg="product" data-id="${esc(p.id)}" role="option">
          <img src="${esc(imageOf(p))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          <span class="sg-product-text">
            <span class="sg-product-name">${highlight(p.name, q)}</span>
            <span class="sg-product-meta">${esc(shopNameOf(p))}</span>
          </span>
          <span class="sg-product-price">${fmtRp(priceRange(p).min)}</span>
        </button>`).join('')}</div>` : ''}
      ${shops.length ? `<div class="sg-section"><div class="sg-head"><span>Toko</span></div>
        ${shops.map((s, i) => `
        <button type="button" class="sg-shop" id="sg-s${i}" data-sg="shop" data-shop="${esc(s.name)}" role="option">
          <span class="sg-shop-avatar" aria-hidden="true">${esc(s.name.charAt(0).toUpperCase())}</span>
          <span>${highlight(s.name, q)}</span>
          <small>Kunjungi toko ›</small>
        </button>`).join('')}</div>` : ''}
      <button type="button" class="sg-all" id="sg-all" data-sg="query" data-q="${esc(q)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <span>Lihat semua hasil untuk <b>"${esc(q)}"</b></span>
      </button>`;
    active = -1;
    open();
  };

  const choose = (el) => {
    if (!el) return;
    const kind = el.dataset.sg;
    close();
    if (kind === 'product') {
      pushRecent(input.value.trim() || '');
      if (document.getElementById('product-detail-modal')) openProductById(el.dataset.id);
      else window.location.href = `index.html?p=${encodeURIComponent(el.dataset.id)}`;
    } else if (kind === 'shop') {
      goToShop(el.dataset.shop);
    } else if (kind === 'query') {
      input.value = el.dataset.q;
      wrap.classList.add('has-value');
      applySearch(el.dataset.q);
    } else if (kind === 'cat' || kind === 'filter') {
      const filter = kind === 'cat' ? el.dataset.cat : el.dataset.filter;
      clearSearch();
      document.dispatchEvent(new CustomEvent('vendora:pick-category', { detail: { filter } }));
    }
  };

  panel.addEventListener('mousedown', (e) => e.preventDefault()); // fokus tetap di input
  panel.addEventListener('click', (e) => choose(e.target.closest('[data-sg]')));

  input.addEventListener('focus', () => {
    const q = input.value.trim();
    if (q) render(q); else renderEmpty();
  });
  input.addEventListener('input', () => {
    const q = input.value.trim();
    wrap.classList.toggle('has-value', !!input.value);
    clearTimeout(timer);
    if (!q) {
      renderEmpty();
      if (state.q) { state.q = ''; loadCatalogProducts(state.filter, state.shop, { refetch: false }); }
      return;
    }
    timer = setTimeout(() => render(q), 90);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (panel.hidden) input.dispatchEvent(new Event('focus')); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) choose(items()[active]);
      else if (input.value.trim()) { close(); applySearch(input.value); input.blur(); }
    } else if (e.key === 'Escape') { close(); input.blur(); }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
  clearBtn.addEventListener('click', () => {
    input.value = '';
    wrap.classList.remove('has-value');
    input.focus();
    renderEmpty();
    if (state.q) { state.q = ''; loadCatalogProducts(state.filter, state.shop, { refetch: false }); }
  });
  // Ikon kaca pembesar ikut menjalankan pencarian
  wrap.querySelector('.nav-search-icon')?.addEventListener('click', () => { if (input.value.trim()) applySearch(input.value); });

  // ?q= dari halaman lain
  const q = new URLSearchParams(location.search).get('q');
  if (q) { input.value = q; wrap.classList.add('has-value'); state.q = q.trim(); }
}

export const currentSearch = () => state.q;
export const cartItemFor = cartPayload;
export { CATEGORIES, CATEGORY_BY_KEY };
