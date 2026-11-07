// ─── Halaman "Pesanan saya" (pesanan.html) ───────────────────────────────────
import { BASE_URL, getActiveSession } from "../config/api.js?v=5";
import { esc, fmtRp, fmtDateTime, shortId, TX_STATUS, normStatus, txStatusHTML } from "../ui.js?v=2";
import { loadCatalogData, mockIdFromName, cartItemFor } from "./product.js?v=15";
import { addToCart } from "./transaction.js?v=12";

const $ = (id) => document.getElementById(id);
const STEPS = [
  { key: 'pending', label: 'Dipesan' },
  { key: 'paid',    label: 'Dikemas' },
  { key: 'shipped', label: 'Dikirim' },
  { key: 'success', label: 'Selesai' },
];
const STEP_INDEX = { pending: 0, paid: 1, shipped: 2, success: 3 };
const NOTE = {
  pending:   'Menunggu penjual mengonfirmasi pesananmu.',
  paid:      'Penjual sedang mengemas pesananmu.',
  shipped:   'Paket sedang dalam perjalanan ke alamatmu.',
  success:   'Paket sudah diterima. Terima kasih sudah berbelanja!',
  cancelled: 'Pesanan ini dibatalkan.',
};

let orders = [];
let filter = 'all';
let query = '';
let catalog = { products: [], shops: {} };

function enrich(t) {
  const items = (t.items || []).map(i => {
    const mockId = mockIdFromName(i.name);
    const p = catalog.products.find(x => x.id === i.product_id || (mockId && x.id === mockId));
    const shop = catalog.shops[i.shop_id] || (p && catalog.shops[p.shop_id]);
    return {
      ...i,
      // nama/foto dari katalog bila produk masih ada; kalau tidak, pakai data di pesanan
      displayName: p ? p.name : i.name,
      // foto variasi yang dibeli (disimpan saat checkout), lalu foto katalog
      image: i.image || (p ? catalog.imageOf(p) : ''),
      shopName: (shop && shop.name) || (p && catalog.shopNameOf(p)) || '',
      shopGone: !(shop || p),
      product: p || null,
    };
  });
  // kelompokkan item per toko, seperti marketplace pada umumnya
  const groups = [];
  items.forEach(i => {
    let g = groups.find(x => x.shopName === i.shopName);
    if (!g) { g = { shopName: i.shopName, items: [] }; groups.push(g); }
    g.items.push(i);
  });
  return { tx: t, status: normStatus(t.status), items, groups };
}

function renderTabs() {
  const counts = { all: orders.length };
  orders.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
  document.querySelectorAll('#order-tabs [data-status]').forEach(tab => {
    const n = counts[tab.dataset.status] || 0;
    tab.querySelector('.tab-count').textContent = n;
    tab.classList.toggle('active', tab.dataset.status === filter);
    tab.setAttribute('aria-selected', tab.dataset.status === filter);
  });
}

function renderList() {
  const list = $('orders-list');
  const q = query.trim().toLowerCase();
  const shown = orders.filter(o =>
    (filter === 'all' || o.status === filter) &&
    (!q || shortId(o.tx.id).toLowerCase().includes(q) ||
      o.items.some(i => i.displayName.toLowerCase().includes(q) || i.shopName.toLowerCase().includes(q))));

  if (!shown.length) {
    list.innerHTML = `
      <div class="orders-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
        <h3>${orders.length ? 'Tidak ada pesanan di sini' : 'Belum ada pesanan'}</h3>
        <p>${orders.length ? 'Coba tab lain atau kata kunci lain.' : 'Yuk mulai belanja dari merchant terverifikasi.'}</p>
        <a href="index.html#catalog-anchor" class="btn-ink">Belanja sekarang</a>
      </div>`;
    return;
  }

  list.innerHTML = shown.map(o => {
    const t = o.tx;
    const step = STEP_INDEX[o.status];
    const canBuyAgain = o.items.some(i => i.product && i.product.stock > 0);
    return `
      <article class="order" data-id="${esc(t.id)}">
        <header class="order-top">
          <div class="order-top-left">
            <span class="order-no">${esc(shortId(t.id))}</span>
            <span class="order-date">${fmtDateTime(t.created_at)}</span>
          </div>
          ${txStatusHTML(o.status, { long: true })}
        </header>

        ${o.groups.map(g => `
          <div class="order-shop">
            <div class="order-shop-head">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v2a3 3 0 01-6 0 3 3 0 01-6 0 3 3 0 01-6 0z"/><path d="M5 13v8h14v-8"/></svg>
              <b>${esc(g.shopName || 'Toko tidak tersedia')}</b>
              ${g.shopName ? `<a href="index.html?shop=${encodeURIComponent(g.shopName)}" class="order-shop-link">Kunjungi toko</a>` : ''}
            </div>
            <ul class="order-items">
              ${g.items.map(i => `
                <li>
                  <span class="order-thumb"${i.image ? ` style="background-image:url('${esc(i.image)}')"` : ''} aria-hidden="true"></span>
                  <div class="order-item-text">
                    <span class="order-item-name">${esc(i.displayName)}</span>
                    ${i.variant ? `<span class="order-item-variant">Variasi: ${esc(i.variant)}</span>` : ''}
                    <span class="order-item-qty">×${i.quantity}</span>
                  </div>
                  <span class="order-item-price">${fmtRp(i.price * i.quantity)}</span>
                </li>`).join('')}
            </ul>
          </div>`).join('')}

        ${o.status !== 'cancelled' ? `
        <ol class="order-track" aria-label="Status pengiriman">
          ${STEPS.map((s, i) => `<li class="${i <= step ? 'done' : ''}${i === step ? ' current' : ''}"><span>${s.label}</span></li>`).join('')}
        </ol>` : ''}
        <p class="order-note">${NOTE[o.status] || ''}${(o.status === 'shipped' || o.status === 'success') ? ` Resi <b>VDR-EXP-${esc((t.id || '').slice(-8).toUpperCase())}</b>.` : ''}</p>

        <footer class="order-bottom">
          <div class="order-ship">
            <span>Dikirim ke <b>${esc(t.recipient_name || 'Pembeli')}</b></span>
            ${t.shipping_address ? `<small>${esc(t.shipping_address)}</small>` : ''}
          </div>
          <div class="order-sum">
            <span>Total pesanan</span>
            <b>${fmtRp(t.total_amount)}</b>
          </div>
          <div class="order-actions">
            ${canBuyAgain ? `<button type="button" class="btn-ink btn-ink--sm" data-again="${esc(t.id)}">Beli lagi</button>` : ''}
            ${o.groups[0] && o.groups[0].shopName ? `<a class="btn-line btn-line--sm" href="index.html?shop=${encodeURIComponent(o.groups[0].shopName)}">Lihat toko</a>` : ''}
          </div>
        </footer>
      </article>`;
  }).join('');
}

export async function initOrdersPage() {
  const session = getActiveSession();
  if (!session || !session.user) {
    $('orders-locked').hidden = false;
    $('orders-app').hidden = true;
    return;
  }
  $('orders-app').hidden = false;

  try {
    const [txRes, cat] = await Promise.all([
      fetch(`${BASE_URL}/transactions?buyer_id=${encodeURIComponent(session.user.id)}`).then(r => r.json()),
      loadCatalogData(),
    ]);
    catalog = cat;
    orders = (txRes.data || [])
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(enrich);
  } catch (e) {
    $('orders-list').innerHTML = `<div class="orders-empty"><h3>Gagal memuat pesanan</h3><p>Periksa koneksi lalu muat ulang halaman.</p></div>`;
    return;
  }

  // Tab dari hash (#dikirim) supaya bisa dibagikan
  const fromHash = location.hash.slice(1);
  if (fromHash && (fromHash === 'all' || TX_STATUS[fromHash])) filter = fromHash;

  renderTabs();
  renderList();

  document.querySelectorAll('#order-tabs [data-status]').forEach(tab => tab.addEventListener('click', () => {
    filter = tab.dataset.status;
    history.replaceState(null, '', filter === 'all' ? location.pathname : `#${filter}`);
    renderTabs();
    renderList();
  }));
  $('orders-search').addEventListener('input', (e) => { query = e.target.value; renderList(); });

  // Beli lagi → masukkan item yang masih tersedia ke keranjang
  $('orders-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-again]');
    if (!btn) return;
    const o = orders.find(x => x.tx.id === btn.dataset.again);
    if (!o) return;
    let added = 0;
    o.items.forEach(i => {
      if (!i.product || i.product.stock <= 0) return;
      // Variasi yang sama seperti pesanan sebelumnya ("Burgundy, 512 GB" → {Warna, Kapasitas})
      const labels = String(i.variant || '').split(',').map(x => x.trim()).filter(Boolean);
      const sel = {};
      (i.product.options || []).forEach((g, gi) => {
        const hit = g.values.find(v => v.label === labels[gi]);
        if (hit) sel[g.name] = hit.label;
      });
      const complete = (i.product.options || []).every(g => sel[g.name]);
      if (!complete) return; // variasi lama sudah tidak dijual
      const ok = addToCart(cartItemFor(i.product, sel), i.quantity);
      if (ok) added += 1;
    });
    if (added) window.location.href = 'index.html?cart=1';
  });
}
