import { BASE_URL, getActiveSession } from "../config/api.js?v=5";
import { esc, fmtRp, fmtDate, fmtDateTime, shortId, TX_STATUS, normStatus, txStatusHTML } from "../ui.js?v=2";
import { CATEGORIES, categoryOf } from "../categories.js?v=1";

// ─── Kategori & variasi di form produk ──────────────────────────────────────
function fillCategorySelects() {
  document.querySelectorAll('[data-category-select]').forEach(sel => {
    if (sel.options.length) return;
    sel.innerHTML = '<option value="">Pilih kategori</option>' + CATEGORIES.map(c => `
      <optgroup label="${esc(c.label)}">
        ${c.subs.map(sub => `<option value="${esc(`${c.key}|${sub}`)}">${esc(sub)}</option>`).join('')}
      </optgroup>`).join('');
  });
}

/** "Warna: Hitam, Putih (+10000)" per baris → [{name, values:[{label, price_delta}]}].
 *  Pilihan yang sudah ada (foto/warna bulatan) dipertahankan bila labelnya sama. */
function parseOptions(text, existing = []) {
  return String(text || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const idx = line.indexOf(':');
    if (idx < 1) return null;
    const name = line.slice(0, idx).trim();
    const old = existing.find(g => g.name.toLowerCase() === name.toLowerCase());
    const values = line.slice(idx + 1).split(',').map(v => v.trim()).filter(Boolean).map(raw => {
      const m = /^(.*?)\s*\(\s*([+-]?)\s*(?:rp\s*)?([\d.]+)\s*\)$/i.exec(raw);
      const label = (m ? m[1] : raw).trim();
      const delta = m ? Number(m[3].replace(/\./g, '')) * (m[2] === '-' ? -1 : 1) : 0;
      const prev = old ? old.values.find(v => v.label.toLowerCase() === label.toLowerCase()) : null;
      const out = { label };
      if (prev && prev.swatch) out.swatch = prev.swatch;
      if (prev && prev.image) out.image = prev.image;
      if (delta) out.price_delta = delta;
      return out;
    });
    return values.length ? { name, values } : null;
  }).filter(Boolean);
}

function optionsToText(options = []) {
  return options.map(g => `${g.name}: ${g.values.map(v => v.price_delta ? `${v.label} (${v.price_delta > 0 ? '+' : '-'}${Math.abs(v.price_delta)})` : v.label).join(', ')}`).join('\n');
}

function readCategory(id) {
  const [category = '', subcategory = ''] = String(document.getElementById(id)?.value || '').split('|');
  return { category, subcategory };
}
let editingProduct = null;

// Helper to show alert banner
function showAlert(message, type) {
  const container = document.getElementById('alert-container');
  if (!container) return;
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type}`;
  alertDiv.textContent = message;
  container.prepend(alertDiv);
  setTimeout(() => alertDiv.remove(), 4000);
}

const $id = (id) => document.getElementById(id);
const setHTML = (id, html) => { const el = $id(id); if (el) el.innerHTML = html; };
const DAY_PRICE = 15000;
const FALLBACK_IMG = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80';

function leaseInfo(expires) {
  if (!expires) return { text: 'Tanpa masa berlaku', tone: '', days: null };
  const days = Math.ceil((new Date(expires) - new Date()) / 86400000);
  if (days < 0)   return { text: `Lewat ${Math.abs(days)} hari`, tone: 'bad', days };
  if (days <= 14) return { text: `Sisa ${days} hari`, tone: 'warn', days };
  return { text: `Sisa ${days} hari`, tone: 'good', days };
}
const statusDot = (text, tone) => `<span class="v-status${tone ? ` v-status--${tone}` : ''}">${esc(text)}</span>`;

/**
 * Grafik batang satu seri (6 bulan terakhir).
 * rows: [{ date, value, tip }]
 */
function renderBarChart(el, rows, { format = (v) => v, ariaTitle = '' } = {}) {
  const max = Math.max(...rows.map(r => r.value));
  if (max === 0) {
    el.innerHTML = `<div class="chart-empty">Belum ada data dalam 6 bulan terakhir.</div>`;
    return;
  }
  // 4 garis bantu dengan langkah "bagus" (1, 2, 5 × 10ⁿ), minimal 1
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const tick = Math.max(1, [1, 2, 5, 10].map(s => s * pow).find(s => s >= raw));
  const top = tick * 4;
  const monthShort = (d) => d.toLocaleDateString('id-ID', { month: 'short' });
  const monthLong = (d) => d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const grid = [4, 3, 2, 1, 0].map(i => `<span><em>${i === 0 ? '0' : esc(format(tick * i))}</em></span>`).join('');
  const cols = rows.map((r, i) => {
    const h = r.value === 0 ? 0 : Math.max(2, (r.value / top) * 100);
    return `
      <div class="bar-col" tabindex="0" aria-label="${esc(monthLong(r.date))}: ${esc(r.tip)}">
        <div class="bar-anchor" style="height:${h}%">
          <div class="bar" style="height:100%;animation-delay:${i * 40}ms"></div>
          <div class="bar-tip"><b>${esc(r.tip)}</b>${esc(monthLong(r.date))}</div>
        </div>
      </div>`;
  }).join('');
  el.setAttribute('aria-label', `${ariaTitle}: ` + rows.map(r => `${monthLong(r.date)} ${r.tip}`).join('; '));
  el.innerHTML = `
    <div class="bar-plot">
      <div class="bar-grid" aria-hidden="true">${grid}</div>
      ${cols}
    </div>
    <div class="bar-labels" aria-hidden="true">${rows.map(r => `<span>${esc(monthShort(r.date))}</span>`).join('')}</div>`;
}

function lastSixMonths() {
  const now = new Date();
  const out = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, date: d });
  }
  return out;
}
const monthKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}`; };

// Pembayaran simulasi (dipakai sewa & perpanjang ruko)
function openPayment(amount, onCancelMsg, onPaid) {
  const snapModal = $id('snap-modal');
  const amountEl = $id('snap-amount-display');
  if (!snapModal || !amountEl) {
    showAlert('Jalur pembayaran tidak termuat. Muat ulang halaman.', 'error');
    return;
  }
  amountEl.textContent = fmtRp(amount);
  snapModal.classList.add('active');
  const closeBtn = $id('snap-close-btn');
  if (closeBtn) {
    closeBtn.onclick = () => {
      snapModal.classList.remove('active');
      showAlert(onCancelMsg, 'error');
    };
  }
  window.snapProcess = (method) => {
    snapModal.classList.remove('active');
    onPaid(method);
  };
}

// =================================================================
// PENJUAL (seller.html)
// =================================================================
let sellerOrders = [];          // [{ tx, items, revenue, status }]
let sellerOrderFilter = 'all';
let sellerProducts = [];

export function initSellerDashboard() {
  const session = getActiveSession();
  if (!session || session.user.role !== 'seller') {
    document.body.classList.add('is-locked');
    $id('seller-auth-callout').style.display = 'block';
    $id('active-shop-dashboard').style.display = 'none';
    $id('rent-shop-section').style.display = 'none';
    return;
  }

  const name = session.user.name || 'Penjual';
  setHTML('user-display', `<span class="console-avatar" aria-hidden="true">${esc(name.trim().charAt(0).toUpperCase())}</span>${esc(name)}`);
  $id('seller-auth-callout').style.display = 'none';

  checkSellerShop(session.user.id);

  // ── Sewa ruko (belum punya toko) ──
  const shopNameInput = $id('shop-name');
  if (shopNameInput && session.user.shop_name) shopNameInput.value = session.user.shop_name;

  const rentForm = $id('rent-shop-form');
  if (rentForm) {
    rentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $id('shop-name').value.trim();
      const description = $id('shop-desc').value.trim();
      const rentalDays = parseInt($id('rental-days').value, 10);
      if (!name || !description) { showAlert('Isi nama dan deskripsi toko dulu.', 'error'); return; }

      openPayment(rentalDays * DAY_PRICE, 'Pembayaran sewa ruko dibatalkan.', (method) => {
        showAlert(`Pembayaran via ${method} berhasil. Mengaktifkan ruko…`, 'success');
        fetch(`${BASE_URL}/shop/rent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, owner_id: session.user.id, rental_days: rentalDays })
        })
          .then(res => res.json())
          .then(data => {
            if (data.status === 201) {
              showAlert('Ruko aktif. Selamat berjualan!', 'success');
              setTimeout(() => {
                checkSellerShop(session.user.id);
                const updated = getActiveSession();
                if (updated && updated.user) {
                  updated.user.has_shop = true;
                  updated.user.shop_id = data.data.id;
                  localStorage.setItem('vendora_session', JSON.stringify(updated));
                }
              }, 1200);
            } else {
              showAlert(data.message || 'Gagal menyewa ruko.', 'error');
            }
          })
          .catch(err => { console.error(err); showAlert('Koneksi bermasalah saat menyewa ruko.', 'error'); });
      });
    });
  }

  // ── Tambah produk (modal) ──
  const addModal = $id('add-product-modal');
  const closeAdd = () => addModal && addModal.classList.remove('active');
  document.querySelectorAll('[data-open-add-product]').forEach(btn =>
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      fillCategorySelects();
      addModal && addModal.classList.add('active');
      setTimeout(() => $id('prod-name')?.focus(), 50);
    }));
  $id('close-add-modal-btn')?.addEventListener('click', closeAdd);
  $id('cancel-add-modal-btn')?.addEventListener('click', closeAdd);

  const addProductForm = $id('add-product-form');
  if (addProductForm) {
    addProductForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const shopId = localStorage.getItem('vendora_active_shop_id');
      if (!shopId) { showAlert('Data ruko belum termuat. Muat ulang halaman.', 'error'); return; }
      const submitBtn = addProductForm.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      fetch(`${BASE_URL}/product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_id: shopId,
          name: $id('prod-name').value.trim(),
          price: parseFloat($id('prod-price').value),
          stock: parseInt($id('prod-stock').value, 10),
          images: [$id('prod-image').value.trim() || FALLBACK_IMG],
          description: $id('prod-desc').value.trim(),
          ...readCategory('prod-category'),
          options: parseOptions($id('prod-options')?.value)
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data.status === 201) {
            showAlert('Produk ditambahkan ke katalog.', 'success');
            addProductForm.reset();
            closeAdd();
            loadSellerProducts(shopId);
          } else {
            showAlert(data.message || 'Gagal menambahkan produk.', 'error');
          }
        })
        .catch(err => { console.error(err); showAlert('Koneksi bermasalah saat menambahkan produk.', 'error'); })
        .finally(() => { if (submitBtn) submitBtn.disabled = false; });
    });
  }

  // ── Edit produk (modal) ──
  const editModal = $id('edit-product-modal');
  const hideEdit = () => editModal && editModal.classList.remove('active');
  $id('close-modal-btn')?.addEventListener('click', hideEdit);
  $id('cancel-modal-btn')?.addEventListener('click', hideEdit);

  const editProductForm = $id('edit-product-form');
  if (editProductForm) {
    editProductForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = $id('edit-prod-id').value;
      const shopId = localStorage.getItem('vendora_active_shop_id');
      // Foto tambahan (mis. foto per warna) tetap disimpan; hanya foto utama yang diganti
      const firstImg = $id('edit-prod-image').value.trim();
      const restImgs = ((editingProduct && editingProduct.images) || []).slice(1).filter(u => u && u !== firstImg);
      fetch(`${BASE_URL}/product/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: $id('edit-prod-name').value.trim(),
          price: parseFloat($id('edit-prod-price').value),
          stock: parseInt($id('edit-prod-stock').value, 10),
          images: [firstImg, ...restImgs],
          description: $id('edit-prod-desc').value.trim(),
          ...readCategory('edit-prod-category'),
          options: parseOptions($id('edit-prod-options')?.value, (editingProduct && editingProduct.options) || [])
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data.status === 200) {
            showAlert('Perubahan produk disimpan.', 'success');
            hideEdit();
            if (shopId) loadSellerProducts(shopId);
          } else {
            showAlert(data.message || 'Gagal menyimpan produk.', 'error');
          }
        })
        .catch(err => { console.error(err); showAlert('Koneksi bermasalah saat menyimpan produk.', 'error'); });
    });
  }

  // Tutup modal dengan Escape / klik latar
  [addModal, editModal].forEach(m => m && m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('active'); }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAdd(); hideEdit(); } });

  // ── Tab status pesanan ──
  document.querySelectorAll('#order-tabs [data-status]').forEach(tab => {
    tab.addEventListener('click', () => {
      sellerOrderFilter = tab.dataset.status;
      document.querySelectorAll('#order-tabs [data-status]').forEach(t => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab);
      });
      renderSellerOrders();
    });
  });
}

function checkSellerShop(ownerId) {
  fetch(`${BASE_URL}/shops`)
    .then(res => res.json())
    .then(data => {
      const myShop = (data.data || []).find(s => s.owner_id === ownerId);
      if (!myShop) {
        $id('rent-shop-section').style.display = 'block';
        $id('active-shop-dashboard').style.display = 'none';
        document.body.classList.add('is-onboarding');
        return;
      }
      document.body.classList.remove('is-onboarding');
      localStorage.setItem('vendora_active_shop_id', myShop.id);
      const session = getActiveSession();
      if (session && session.user) {
        session.user.has_shop = true;
        session.user.shop_id = myShop.id;
        localStorage.setItem('vendora_session', JSON.stringify(session));
      }

      $id('rent-shop-section').style.display = 'none';
      $id('active-shop-dashboard').style.display = 'block';

      // Kartu ruko
      const lease = leaseInfo(myShop.rental_expires);
      const active = myShop.status === 'active';
      setHTML('seller-shop-chip', esc(myShop.name));
      setHTML('dashboard-shop-name', esc(myShop.name));
      setHTML('dashboard-shop-desc', esc(myShop.description || 'Belum ada deskripsi toko.'));
      setHTML('shop-status-badge', active ? statusDot('Aktif', 'good') : statusDot('Ditangguhkan', 'bad'));
      setHTML('shop-expires-badge', `${fmtDate(myShop.rental_expires)} ${statusDot(lease.text, lease.tone)}`);
      setHTML('shop-price-badge', fmtRp(myShop.rental_price));

      // KPI sisa sewa
      setHTML('seller-stat-days', lease.days === null ? '–' : lease.days >= 0 ? `${lease.days} hari` : 'Habis');
      setHTML('seller-stat-days-sub', lease.days !== null && lease.days < 0
        ? statusDot(`Lewat sejak ${fmtDate(myShop.rental_expires)}`, 'bad')
        : lease.tone === 'warn'
          ? statusDot(`Berakhir ${fmtDate(myShop.rental_expires)}`, 'warn')
          : `Berakhir ${fmtDate(myShop.rental_expires)}`);

      // Ruko ditangguhkan
      const banner = $id('shop-suspended-banner');
      if (banner) banner.style.display = active ? 'none' : 'flex';
      document.querySelectorAll('[data-open-add-product]').forEach(b => { b.disabled = !active; });

      loadSellerProducts(myShop.id);
      loadSellerStats(myShop.id);

      // Perpanjang sewa — dipasang sekali (sebelumnya bertambah tiap reload)
      const renewBtn = $id('btn-renew-shop');
      if (renewBtn && !renewBtn.dataset.bound) {
        renewBtn.dataset.bound = '1';
        renewBtn.addEventListener('click', () => {
          const renewDays = parseInt($id('renew-days').value, 10);
          const shopId = localStorage.getItem('vendora_active_shop_id');
          openPayment(renewDays * DAY_PRICE, 'Perpanjangan sewa dibatalkan.', (method) => {
            showAlert(`Pembayaran via ${method} berhasil. Memperpanjang sewa…`, 'success');
            fetch(`${BASE_URL}/shop/${shopId}/renew`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rental_days: renewDays })
            })
              .then(res => res.json())
              .then(result => {
                if (result.status === 200) {
                  showAlert(`Sewa diperpanjang sampai ${result.data.new_expiry}.`, 'success');
                  setTimeout(() => checkSellerShop(ownerId), 1200);
                } else {
                  showAlert(result.message || 'Gagal memperpanjang sewa.', 'error');
                }
              })
              .catch(() => showAlert('Koneksi bermasalah saat memperpanjang sewa.', 'error'));
          });
        });
      }
    })
    .catch(err => {
      console.error(err);
      showAlert('Gagal memuat data ruko. Coba muat ulang.', 'error');
    });
}

function loadSellerStats(shopId) {
  fetch(`${BASE_URL}/products?shop_id=${shopId}`)
    .then(res => res.json())
    .then(prodData => {
      const myProductIds = new Set((prodData.data || []).map(p => p.id));
      return fetch(`${BASE_URL}/transactions?shop_id=${shopId}`)
        .then(res => res.json())
        .then(txData => {
          sellerOrders = (txData.data || [])
            .map(t => {
              // hanya item milik toko ini
              const items = (t.items || []).filter(i => i.shop_id === shopId || myProductIds.has(i.product_id));
              return { tx: t, items, status: normStatus(t.status),
                       revenue: items.reduce((s, i) => s + i.price * i.quantity, 0) };
            })
            .filter(o => o.items.length > 0)
            .sort((a, b) => new Date(b.tx.created_at) - new Date(a.tx.created_at));

          const live = sellerOrders.filter(o => o.status !== 'cancelled');
          const revenue = live.reduce((s, o) => s + o.revenue, 0);
          const pending = sellerOrders.filter(o => o.status === 'pending').length;
          const done = sellerOrders.filter(o => o.status === 'success').length;

          setHTML('seller-stat-orders', sellerOrders.length.toLocaleString('id-ID'));
          setHTML('seller-stat-orders-sub', pending
            ? statusDot(`${pending} perlu dikonfirmasi`, 'warn')
            : sellerOrders.length ? `${done} selesai` : 'Belum ada pesanan');
          setHTML('seller-stat-revenue', fmtRp(revenue));
          setHTML('seller-stat-revenue-sub', live.length
            ? `Dari ${live.length} pesanan, tanpa yang dibatalkan`
            : 'Belum ada pendapatan');

          // Tab: jumlah per status
          const counts = { all: sellerOrders.length };
          sellerOrders.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
          document.querySelectorAll('#order-tabs [data-status]').forEach(t => {
            const c = t.querySelector('.tab-count');
            if (c) c.textContent = counts[t.dataset.status] || 0;
          });
          const navBadge = $id('nav-pending-badge');
          if (navBadge) navBadge.textContent = pending || '';

          renderSellerRecent();
          renderSellerTopProducts();
          renderSellerOrders();
        });
    })
    .catch(() => {
      setHTML('seller-orders-tbody', `<tr><td colspan="6" class="table-error">Gagal memuat pesanan.</td></tr>`);
    });
}

function orderItemsText(o) {
  return o.items.map(i => `${i.name} ×${i.quantity}`).join(', ');
}

function renderSellerRecent() {
  const recent = sellerOrders.slice(0, 5);
  setHTML('seller-recent-tbody', recent.length ? recent.map(o => `
    <tr>
      <td><span class="mono">${esc(shortId(o.tx.id))}</span><span class="sub">${fmtDate(o.tx.created_at)}</span></td>
      <td class="truncate" title="${esc(orderItemsText(o))}">${esc(orderItemsText(o))}</td>
      <td class="num strong">${fmtRp(o.revenue)}</td>
      <td>${txStatusHTML(o.status)}</td>
    </tr>`).join('')
    : `<tr><td colspan="4" class="table-empty">Belum ada pesanan. Pesanan pembeli akan muncul di sini.</td></tr>`);
}

function renderSellerTopProducts() {
  const tally = {};
  sellerOrders.filter(o => o.status !== 'cancelled').forEach(o => o.items.forEach(i => {
    // kelompokkan per nama: ada produk yang pernah dibuat ulang dengan ID berbeda
    const key = (i.name || i.product_id || '').trim().toLowerCase();
    tally[key] = tally[key] || { name: i.name, qty: 0, revenue: 0 };
    tally[key].qty += i.quantity;
    tally[key].revenue += i.price * i.quantity;
  }));
  const top = Object.values(tally).sort((a, b) => b.qty - a.qty).slice(0, 5);
  const maxQty = top.length ? top[0].qty : 1;
  setHTML('seller-top-products', top.length ? top.map(t => `
    <li>
      <span class="top-name">${esc(t.name)}</span>
      <span class="breakdown-count">${t.qty}<small>terjual</small></span>
      <div class="breakdown-track"><div class="breakdown-fill" style="width:${Math.round((t.qty / maxQty) * 100)}%"></div></div>
    </li>`).join('')
    : `<li class="chart-empty">Belum ada produk terjual.</li>`);
}

function renderSellerOrders() {
  const tbody = $id('seller-orders-tbody');
  if (!tbody) return;
  const list = sellerOrderFilter === 'all' ? sellerOrders : sellerOrders.filter(o => o.status === sellerOrderFilter);
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">${sellerOrders.length ? 'Tidak ada pesanan dengan status ini.' : 'Belum ada pesanan masuk.'}</td></tr>`;
    return;
  }
  const opts = (current) => Object.entries(TX_STATUS)
    .map(([value, s]) => `<option value="${value}" ${value === current ? 'selected' : ''}>${esc(s.label)}</option>`).join('');
  tbody.innerHTML = list.map(o => {
    const t = o.tx;
    return `
      <tr>
        <td><span class="mono">${esc(shortId(t.id))}</span><span class="sub">${fmtDateTime(t.created_at)}</span></td>
        <td><span class="strong">${esc(t.recipient_name || 'Pembeli')}</span><span class="sub truncate" title="${esc(t.shipping_address || '')}">${esc(t.shipping_address || 'Alamat belum diisi')}</span></td>
        <td class="truncate" title="${esc(orderItemsText(o))}">${esc(orderItemsText(o))}</td>
        <td class="num strong">${fmtRp(o.revenue)}</td>
        <td>${txStatusHTML(o.status)}</td>
        <td class="actions">
          <label class="select-wrap select-wrap--sm">
            <span class="visually-hidden">Ubah status ${esc(shortId(t.id))}</span>
            <select data-order-id="${esc(t.id)}" data-current="${esc(o.status)}">${opts(o.status)}</select>
          </label>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('select[data-order-id]').forEach(sel => {
    sel.addEventListener('change', () => window.updateOrderStatus(sel.dataset.orderId, sel.value, sel));
  });
}

/**
 * Ubah status pesanan (dipanggil dari tabel pesanan penjual).
 * Fungsi ini sebelumnya dipanggil tapi tidak pernah didefinisikan.
 */
window.updateOrderStatus = function (orderId, status, selectEl) {
  const label = TX_STATUS[status]?.label || status;
  if (status === 'cancelled' && !confirm('Batalkan pesanan ini? Pembeli akan melihat status "Dibatalkan".')) {
    if (selectEl) selectEl.value = selectEl.dataset.current;
    return;
  }
  if (selectEl) selectEl.disabled = true;
  fetch(`${BASE_URL}/transaction/${orderId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  })
    .then(res => res.json())
    .then(result => {
      if (result.status === 200) {
        showAlert(`Status pesanan diubah menjadi "${label}".`, 'success');
        const shopId = localStorage.getItem('vendora_active_shop_id');
        if (shopId) loadSellerStats(shopId);
      } else {
        showAlert(result.message || 'Gagal mengubah status pesanan.', 'error');
        if (selectEl) { selectEl.value = selectEl.dataset.current; selectEl.disabled = false; }
      }
    })
    .catch(() => {
      showAlert('Koneksi bermasalah saat mengubah status pesanan.', 'error');
      if (selectEl) { selectEl.value = selectEl.dataset.current; selectEl.disabled = false; }
    });
};

function stockHTML(stock) {
  if (stock === 0) return statusDot('Habis', 'bad');
  if (stock <= 5) return statusDot(`Sisa ${stock}`, 'warn');
  return `<span class="num-plain">${stock.toLocaleString('id-ID')}</span>`;
}

function loadSellerProducts(shopId) {
  const container = $id('seller-products');
  if (!container) return;

  fetch(`${BASE_URL}/products?shop_id=${shopId}`)
    .then(res => res.json())
    .then(data => {
      sellerProducts = data.data || [];
      const low = sellerProducts.filter(p => p.stock <= 5).length;
      setHTML('seller-stat-products', sellerProducts.length.toLocaleString('id-ID'));
      setHTML('seller-stat-products-sub', !sellerProducts.length ? 'Belum ada produk'
        : low ? statusDot(`${low} stok menipis atau habis`, 'warn') : 'Stok aman');
      setHTML('prod-count-badge', sellerProducts.length ? `${sellerProducts.length} produk` : '');

      if (!sellerProducts.length) {
        container.innerHTML = `
          <div class="empty-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
            <h3>Katalog masih kosong</h3>
            <p>Tambahkan produk pertamamu supaya muncul di katalog Vendora.</p>
            <button type="button" class="btn-ink" data-open-add-product-inline>Tambah produk</button>
          </div>`;
        container.querySelector('[data-open-add-product-inline]')?.addEventListener('click', () =>
          document.querySelector('[data-open-add-product]')?.click());
        return;
      }

      container.innerHTML = `
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Produk</th><th class="num">Harga</th><th class="num">Stok</th><th class="actions">Aksi</th></tr></thead>
            <tbody>${sellerProducts.map(p => {
              const image = (p.images && p.images[0]) ? p.images[0] : FALLBACK_IMG;
              return `
                <tr>
                  <td>
                    <div class="prod-cell">
                      <img src="${esc(image)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
                      <div><span class="strong">${esc(p.name)}</span><span class="sub truncate">${esc(p.description || '')}</span></div>
                    </div>
                  </td>
                  <td class="num">${fmtRp(p.price)}</td>
                  <td class="num">${stockHTML(p.stock)}</td>
                  <td class="actions">
                    <div class="row-actions">
                      <button class="btn-sm" type="button" data-edit="${esc(p.id)}">Edit</button>
                      <button class="btn-sm btn-sm--danger" type="button" data-delete="${esc(p.id)}">Hapus</button>
                    </div>
                  </td>
                </tr>`;
            }).join('')}</tbody>
          </table>
        </div>`;

      // Delegasi event — dipasang sekali
      if (container.dataset.bound) return;
      container.dataset.bound = '1';
      container.addEventListener('click', (e) => {
        const editBtn = e.target.closest('[data-edit]');
        const delBtn = e.target.closest('[data-delete]');
        if (editBtn) {
          const p = sellerProducts.find(x => x.id === editBtn.dataset.edit);
          if (!p) return;
          editingProduct = p;
          fillCategorySelects();
          $id('edit-prod-id').value = p.id;
          const catKey = p.category || categoryOf(p);
          const catSel = $id('edit-prod-category');
          if (catSel) {
            const wanted = `${catKey}|${p.subcategory || ''}`;
            const fallback = [...catSel.options].find(o => o.value.startsWith(`${catKey}|`));
            catSel.value = [...catSel.options].some(o => o.value === wanted) ? wanted : (fallback ? fallback.value : '');
          }
          if ($id('edit-prod-options')) $id('edit-prod-options').value = optionsToText(p.options || []);
          $id('edit-prod-name').value = p.name;
          $id('edit-prod-price').value = p.price;
          $id('edit-prod-stock').value = p.stock;
          $id('edit-prod-desc').value = p.description || '';
          $id('edit-prod-image').value = (p.images && p.images[0]) || '';
          $id('edit-prod-image').dispatchEvent(new Event('input'));
          $id('edit-product-modal')?.classList.add('active');
        }
        if (delBtn) {
          const p = sellerProducts.find(x => x.id === delBtn.dataset.delete);
          if (!confirm(`Hapus "${p ? p.name : 'produk ini'}" dari katalog? Tindakan ini tidak bisa dibatalkan.`)) return;
          delBtn.disabled = true;
          fetch(`${BASE_URL}/product/${delBtn.dataset.delete}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(resData => {
              if (resData.status === 200) {
                showAlert('Produk dihapus dari katalog.', 'success');
                loadSellerProducts(localStorage.getItem('vendora_active_shop_id'));
              } else {
                showAlert(resData.message || 'Gagal menghapus produk.', 'error');
                delBtn.disabled = false;
              }
            })
            .catch(() => { showAlert('Koneksi bermasalah saat menghapus produk.', 'error'); delBtn.disabled = false; });
        }
      });
    })
    .catch(() => { container.innerHTML = `<div class="empty-state"><p>Gagal memuat produk.</p></div>`; });
}

// =================================================================
// ADMIN (admin.html)
// =================================================================
const ROLE_LABEL = { buyer: 'Pembeli', seller: 'Penjual', admin: 'Admin' };

export function initAdminDashboard() {
  const session = getActiveSession();
  if (!session || session.user.role !== 'admin') {
    document.body.classList.add('is-locked');
    const title = $id('admin-page-title');
    const sub = $id('admin-page-sub');
    if (title) title.textContent = 'Admin';
    if (sub) sub.textContent = '';
    $id('admin-auth-callout').style.display = 'block';
    $id('admin-dashboard-section').style.display = 'none';
    return;
  }

  $id('admin-auth-callout').style.display = 'none';
  $id('admin-dashboard-section').style.display = 'block';

  const name = session.user.name || 'Admin';
  setHTML('user-display', `<span class="console-avatar" aria-hidden="true">${esc(name.trim().charAt(0).toUpperCase())}</span>${esc(name)}`);

  loadAdminEcosystem();
  loadAdminTransactions('');
  loadAdminUsers('');

  const txFilter = $id('tx-filter-status');
  if (txFilter) txFilter.addEventListener('change', () => loadAdminTransactions(txFilter.value));
  const userFilter = $id('user-filter-role');
  if (userFilter) userFilter.addEventListener('change', () => loadAdminUsers(userFilter.value));
}

// ─── Transaksi (pengawasan, tabel lengkap) ───────────────────────
function loadAdminTransactions(statusFilter) {
  const tbody = $id('tx-list-tbody');
  const countBadge = $id('tx-count-badge');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Memuat…</td></tr>`;

  fetch(`${BASE_URL}/transactions`)
    .then(res => res.json())
    .then(data => {
      let txs = data.data || [];
      if (statusFilter) txs = txs.filter(t => normStatus(t.status) === statusFilter);
      if (countBadge) countBadge.textContent = `${txs.length} pesanan`;
      if (!txs.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Tidak ada pesanan.</td></tr>`;
        return;
      }
      txs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      tbody.innerHTML = txs.map(t => {
        const items = (t.items || []).map(i => `${i.name} ×${i.quantity}`).join(', ') || '–';
        return `
          <tr>
            <td class="mono" title="${esc(t.id)}">${esc(shortId(t.id))}</td>
            <td class="mono" title="${esc(t.buyer_id)}">${esc(t.buyer_id ? '…' + t.buyer_id.toString().slice(-8) : '–')}</td>
            <td class="truncate" title="${esc(items)}">${esc(items)}</td>
            <td class="num">${fmtRp(t.total_amount)}</td>
            <td>${txStatusHTML(t.status)}</td>
            <td class="muted">${fmtDate(t.created_at)}</td>
          </tr>`;
      }).join('');
    })
    .catch(err => {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="6" class="table-error">Gagal memuat pesanan.</td></tr>`;
    });
}

// ─── Pengguna ────────────────────────────────────────────────────
function loadAdminUsers(roleFilter) {
  const tbody = $id('users-list-tbody');
  const countBadge = $id('user-count-badge');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Memuat…</td></tr>`;
  const url = roleFilter ? `${BASE_URL}/users?role=${encodeURIComponent(roleFilter)}` : `${BASE_URL}/users`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      const users = data.data || [];
      if (countBadge) countBadge.textContent = `${users.length} pengguna`;
      if (!users.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Tidak ada pengguna.</td></tr>`;
        return;
      }
      tbody.innerHTML = users.map(u => {
        const banned = u.banned === true;
        const action = u.role === 'admin'
          ? `<span class="muted">–</span>`
          : banned
            ? `<button class="btn-sm btn-ban-user" data-id="${esc(u.id)}" data-name="${esc(u.name)}" data-banned="false" type="button">Buka blokir</button>`
            : `<button class="btn-sm btn-sm--danger btn-ban-user" data-id="${esc(u.id)}" data-name="${esc(u.name)}" data-banned="true" type="button">Blokir</button>`;
        return `
          <tr>
            <td class="strong">${esc(u.name || '–')}</td>
            <td class="muted">${esc(u.email || '–')}</td>
            <td><span class="role-tag${u.role === 'admin' ? ' role-tag--admin' : ''}">${esc(ROLE_LABEL[u.role] || u.role)}</span></td>
            <td>${banned ? statusDot('Diblokir', 'bad') : statusDot('Aktif', 'good')}</td>
            <td class="muted">${fmtDate(u.created_at)}</td>
            <td class="actions">${action}</td>
          </tr>`;
      }).join('');

      tbody.querySelectorAll('.btn-ban-user').forEach(btn => {
        btn.addEventListener('click', () => {
          const shouldBan = btn.dataset.banned === 'true';
          const who = btn.dataset.name || 'pengguna ini';
          if (!confirm(shouldBan ? `Blokir ${who}? Mereka tidak akan bisa masuk.` : `Buka blokir ${who}?`)) return;
          btn.disabled = true;
          fetch(`${BASE_URL}/user/${btn.dataset.id}/ban`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ banned: shouldBan })
          })
            .then(res => res.json())
            .then(result => {
              if (result.status === 200) {
                showAlert(shouldBan ? 'Pengguna diblokir.' : 'Blokir pengguna dibuka.', 'success');
                loadAdminUsers($id('user-filter-role')?.value || '');
              } else {
                showAlert(result.message || 'Gagal mengubah status pengguna.', 'error');
                btn.disabled = false;
              }
            })
            .catch(() => { showAlert('Koneksi bermasalah saat mengubah status pengguna.', 'error'); btn.disabled = false; });
        });
      });
    })
    .catch(err => {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="6" class="table-error">Gagal memuat data pengguna.</td></tr>`;
    });
}

// ─── Widget dashboard admin ──────────────────────────────────────
function renderUserGrowth(users) {
  const el = $id('chart-users');
  if (!el) return;
  const months = lastSixMonths().map(m => ({ ...m, total: 0, seller: 0, buyer: 0 }));
  users.forEach(u => {
    if (!u.created_at) return;
    const m = months.find(x => x.key === monthKey(u.created_at));
    if (!m) return;
    m.total += 1;
    if (u.role === 'seller') m.seller += 1;
    if (u.role === 'buyer') m.buyer += 1;
  });
  renderBarChart(el, months.map(m => ({
    date: m.date,
    value: m.total,
    tip: `${m.total} pengguna baru · ${m.seller} penjual, ${m.buyer} pembeli`
  })), { format: (v) => Math.round(v).toLocaleString('id-ID'), ariaTitle: 'Pengguna baru per bulan' });
}

function renderStatusBreakdown(transactions) {
  const el = $id('status-breakdown');
  if (!el) return;
  const total = transactions.length;
  if (!total) { el.innerHTML = `<li class="chart-empty">Belum ada pesanan.</li>`; return; }
  const counts = {};
  transactions.forEach(t => { const k = normStatus(t.status); counts[k] = (counts[k] || 0) + 1; });
  const keys = Object.keys(TX_STATUS).filter(k => counts[k])
    .concat(Object.keys(counts).filter(k => !TX_STATUS[k]));
  el.innerHTML = keys.map(k => {
    const pct = Math.round((counts[k] / total) * 100);
    return `
      <li>
        ${txStatusHTML(k)}
        <span class="breakdown-count">${counts[k]}<small>${pct}%</small></span>
        <div class="breakdown-track"><div class="breakdown-fill" style="width:${pct}%"></div></div>
      </li>`;
  }).join('') + `<li class="breakdown-total">${total} pesanan di seluruh toko</li>`;
}

function renderLeaseTable(shops, users) {
  const tbody = $id('lease-tbody');
  if (!tbody) return;
  if (!shops.length) { tbody.innerHTML = `<tr><td colspan="4" class="table-empty">Belum ada ruko disewa.</td></tr>`; return; }
  const owners = Object.fromEntries(users.map(u => [u.id, u.name]));
  const sorted = [...shops].sort((a, b) => new Date(a.rental_expires) - new Date(b.rental_expires));
  tbody.innerHTML = sorted.map(s => {
    const lease = leaseInfo(s.rental_expires);
    return `
      <tr>
        <td><span class="strong">${esc(s.name)}</span><span class="sub">${esc(owners[s.owner_id] || 'Pemilik tidak diketahui')}</span></td>
        <td class="num">${fmtRp(s.rental_price)}</td>
        <td>${fmtDate(s.rental_expires)}<span class="sub">${statusDot(lease.text, lease.tone)}</span></td>
        <td>${s.status === 'active' ? statusDot('Aktif', 'good') : statusDot('Ditangguhkan', 'bad')}</td>
      </tr>`;
  }).join('');
}

function renderRecentUsers(users) {
  const el = $id('recent-users');
  if (!el) return;
  const recent = [...users].filter(u => u.created_at)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);
  el.innerHTML = recent.length ? recent.map(u => `
    <li>
      <span class="console-avatar console-avatar--sm" aria-hidden="true">${esc((u.name || '?').trim().charAt(0).toUpperCase())}</span>
      <div class="person">
        <span class="lease-name">${esc(u.name || '–')}</span>
        <span class="lease-meta">${esc(ROLE_LABEL[u.role] || u.role)} · ${fmtDate(u.created_at)}</span>
      </div>
    </li>`).join('') : `<li class="chart-empty">Belum ada pengguna.</li>`;
}

// ─── Data ekosistem: KPI, widget, tabel ruko ─────────────────────
function loadAdminEcosystem() {
  Promise.all([
    fetch(`${BASE_URL}/shops`).then(res => res.json()),
    fetch(`${BASE_URL}/transactions`).then(res => res.json()),
    fetch(`${BASE_URL}/users`).then(res => res.json()).catch(() => ({ data: [] }))
  ])
    .then(([shopRes, txRes, userRes]) => {
      const shops = shopRes.data || [];
      const transactions = txRes.data || [];
      const users = userRes.data || [];

      // KPI — pendapatan Vendora hanya dari sewa ruko
      const activeShops = shops.filter(s => s.status === 'active').length;
      const expired = shops.filter(s => leaseInfo(s.rental_expires).tone === 'bad').length;
      const rentalTotal = shops.reduce((sum, s) => sum + Number(s.rental_price || 0), 0);
      const sellers = users.filter(u => u.role === 'seller').length;
      const buyers = users.filter(u => u.role === 'buyer').length;
      const pending = transactions.filter(t => normStatus(t.status) === 'pending').length;

      setHTML('stat-rental-revenue', fmtRp(rentalTotal));
      setHTML('stat-rental-sub', shops.length ? `Dari ${shops.length} ruko yang disewa` : 'Belum ada ruko disewa');
      setHTML('stat-shops', activeShops);
      setHTML('stat-shops-sub', expired
        ? statusDot(`${expired} masa sewa sudah lewat`, 'bad')
        : `dari ${shops.length} toko terdaftar`);
      setHTML('stat-users', users.length.toLocaleString('id-ID'));
      setHTML('stat-users-sub', `${sellers} penjual · ${buyers} pembeli`);
      setHTML('stat-transactions', transactions.length.toLocaleString('id-ID'));
      setHTML('stat-transactions-sub', pending
        ? statusDot(`${pending} menunggu konfirmasi penjual`, 'warn')
        : 'Tidak ada yang tertunda');

      renderUserGrowth(users);
      renderStatusBreakdown(transactions);
      renderLeaseTable(shops, users);
      renderRecentUsers(users);

      // Tabel ruko (menu Sewa Ruko)
      const tbody = $id('shops-list-tbody');
      if (!tbody) return;
      if (!shops.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Belum ada ruko yang disewa.</td></tr>`;
        return;
      }
      const owners = Object.fromEntries(users.map(u => [u.id, u.name]));
      tbody.innerHTML = shops.map(s => {
        const lease = leaseInfo(s.rental_expires);
        const active = s.status === 'active';
        const statusBtn = active
          ? `<button class="btn-sm btn-toggle-status" data-id="${esc(s.id)}" data-status="suspended" type="button">Tangguhkan</button>`
          : `<button class="btn-sm btn-sm--ink btn-toggle-status" data-id="${esc(s.id)}" data-status="active" type="button">Aktifkan</button>`;
        return `
          <tr>
            <td><span class="strong">${esc(s.name)}</span><span class="sub truncate">${esc(s.description || '–')}</span></td>
            <td><span>${esc(owners[s.owner_id] || '–')}</span><span class="sub mono" title="${esc(s.owner_id)}">…${esc(String(s.owner_id || '').slice(-8))}</span></td>
            <td class="num">${fmtRp(s.rental_price)}</td>
            <td>${fmtDate(s.rental_expires)}<span class="sub">${statusDot(lease.text, lease.tone)}</span></td>
            <td>${active ? statusDot('Aktif', 'good') : statusDot('Ditangguhkan', 'bad')}</td>
            <td class="actions"><div class="row-actions">${statusBtn}<button class="btn-sm btn-sm--danger btn-delete-shop" data-id="${esc(s.id)}" data-name="${esc(s.name)}" type="button">Hapus</button></div></td>
          </tr>`;
      }).join('');

      // Delegasi event — dipasang sekali saja
      if (tbody.dataset.bound) return;
      tbody.dataset.bound = '1';
      tbody.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.btn-toggle-status');
        const deleteBtn = e.target.closest('.btn-delete-shop');
        if (toggleBtn) {
          toggleBtn.disabled = true;
          const nextStatus = toggleBtn.dataset.status;
          fetch(`${BASE_URL}/shop/${toggleBtn.dataset.id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: nextStatus })
          })
            .then(res => res.json())
            .then(result => {
              if (result.status === 200) {
                showAlert(nextStatus === 'active' ? 'Ruko diaktifkan.' : 'Ruko ditangguhkan.', 'success');
                loadAdminEcosystem();
              } else {
                showAlert(result.message || 'Gagal mengubah status ruko.', 'error');
                toggleBtn.disabled = false;
              }
            })
            .catch(() => { showAlert('Koneksi bermasalah saat mengubah status ruko.', 'error'); toggleBtn.disabled = false; });
        }
        if (deleteBtn) {
          if (!confirm(`Hapus ${deleteBtn.dataset.name || 'ruko ini'} secara permanen? Tindakan ini tidak bisa dibatalkan.`)) return;
          window.deleteShop(deleteBtn.dataset.id);
        }
      });
    })
    .catch(err => {
      console.error(err);
      showAlert('Gagal memuat data administrasi.', 'error');
    });
}

window.deleteShop = function (shopId) {
  fetch(`${BASE_URL}/shop/${shopId}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(result => {
      if (result.status === 200) {
        showAlert('Ruko berhasil dihapus.', 'success');
        setHTML('shops-list-tbody', `<tr><td colspan="6" class="table-empty">Memuat ulang…</td></tr>`);
        loadAdminEcosystem();
      } else {
        showAlert(result.message || 'Gagal menghapus ruko.', 'error');
      }
    })
    .catch(() => showAlert('Koneksi bermasalah saat menghapus ruko.', 'error'));
};
