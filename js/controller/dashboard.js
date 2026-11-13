import { BASE_URL, getActiveSession, authHeaders } from "../config/api.js?v=105";
import { esc, fmtRp, fmtRpShort, fmtDate, fmtDateTime, shortId, TX_STATUS, normStatus, txStatusHTML } from "../ui.js?v=102";
import { CATEGORIES, categoryOf } from "../categories.js?v=101";

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

// Hitung status efektif toko saat dibaca (effective_status) tanpa mengubah field status di database
function effectiveShopStatus(s) {
  if (!s) return 'suspended';
  if (s.effective_status) return s.effective_status;
  if (s.status === 'suspended' || s.status !== 'active') return 'suspended';
  const lease = leaseInfo(s.rental_expires);
  if (lease.days !== null && lease.days < 0) return 'expired';
  return 'active';
}

function shopStatusBadge(s) {
  const eff = effectiveShopStatus(s);
  if (eff === 'active') return statusDot('Aktif', 'good');
  if (eff === 'expired') return statusDot('Jatuh tempo', 'warn');
  return statusDot('Ditangguhkan', 'bad');
}

// Hitung subtotal barang TANPA ongkir: subtotal_amount -> sum(items[].price * qty) -> max(0, total_amount - shipping_cost)
function computeOrderSubtotal(t) {
  const sub = Number(t.subtotal_amount || 0);
  if (sub > 0) return sub;
  const itemSum = (t.items || []).reduce((acc, it) => acc + (Number(it.price || 0) * Number(it.quantity || 0)), 0);
  if (itemSum > 0) return itemSum;
  return Math.max(0, Number(t.total_amount || 0) - Number(t.shipping_cost || 0));
}

function isStalePendingOrder(t, hours = 24) {
  if (normStatus(t.status) !== 'pending') return false;
  if (!t.created_at) return false;
  const ageMs = Date.now() - new Date(t.created_at).getTime();
  return ageMs > hours * 3600 * 1000;
}

function waitingDaysLabel(t) {
  if (!t.created_at) return 'Menunggu > 1 hari';
  const days = Math.max(1, Math.floor((Date.now() - new Date(t.created_at).getTime()) / 86400000));
  return `Menunggu ${days} hari`;
}

function renderPagination(elId, totalItems, currentPage, pageSize, onPageChange) {
  const el = $id(elId);
  if (!el) return;
  if (totalItems <= 0) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  el.style.display = 'flex';
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(totalItems, currentPage * pageSize);

  const pageBtns = [];
  for (let p = 1; p <= totalPages; p++) {
    if (totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1) {
      const isCurr = p === currentPage;
      pageBtns.push(`<button type="button" class="btn-sm${isCurr ? ' btn-sm--ink' : ''}" data-page-num="${p}" ${isCurr ? 'aria-current="page"' : ''}>${p}</button>`);
    } else if (pageBtns[pageBtns.length - 1] !== '<span style="padding:0 4px;">…</span>') {
      pageBtns.push('<span style="padding:0 4px;">…</span>');
    }
  }

  el.innerHTML = `
    <span>Menampilkan <b>${start}–${end}</b> dari <b>${totalItems}</b> data (Halaman ${currentPage} dari ${totalPages})</span>
    <div style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;">
      <button type="button" class="btn-sm" data-page-prev ${currentPage <= 1 ? 'disabled' : ''}>← Sebelumnya</button>
      ${pageBtns.join('')}
      <button type="button" class="btn-sm" data-page-next ${currentPage >= totalPages ? 'disabled' : ''}>Berikutnya →</button>
    </div>
  `;
  const prev = el.querySelector('[data-page-prev]');
  const next = el.querySelector('[data-page-next]');
  if (prev) prev.onclick = () => { if (currentPage > 1) onPageChange(currentPage - 1); };
  if (next) next.onclick = () => { if (currentPage < totalPages) onPageChange(currentPage + 1); };
  el.querySelectorAll('[data-page-num]').forEach(btn => {
    btn.onclick = () => {
      const targetPage = parseInt(btn.dataset.pageNum, 10);
      if (targetPage && targetPage !== currentPage) onPageChange(targetPage);
    };
  });
}

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
          headers: authHeaders({ 'Content-Type': 'application/json' }),
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

      const promoVal = parseFloat($id('prod-promo-price')?.value || '0') || 0;
      const promoLabelVal = ($id('prod-promo-label')?.value || '').trim();

      fetch(`${BASE_URL}/product`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          shop_id: shopId,
          name: $id('prod-name').value.trim(),
          price: parseFloat($id('prod-price').value),
          promo_price: promoVal,
          promo_label: promoLabelVal,
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
      const editPromoVal = parseFloat($id('edit-prod-promo-price')?.value || '0') || 0;
      const editPromoLbl = ($id('edit-prod-promo-label')?.value || '').trim();
      fetch(`${BASE_URL}/product/${id}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: $id('edit-prod-name').value.trim(),
          price: parseFloat($id('edit-prod-price').value),
          promo_price: editPromoVal,
          promo_label: editPromoLbl,
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
              headers: authHeaders({ 'Content-Type': 'application/json' }),
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
      return fetch(`${BASE_URL}/transactions?shop_id=${shopId}`, { headers: authHeaders() })
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
          loadSellerWallet(shopId);
        });
    })
    .catch(() => {
      setHTML('seller-orders-tbody', `<tr><td colspan="6" class="table-error">Gagal memuat pesanan.</td></tr>`);
    });
}

function loadSellerWallet(shopId) {
  loadSellerDisputes();
  fetch(`${BASE_URL}/wallet/summary?shop_id=${encodeURIComponent(shopId)}`, { headers: authHeaders() })
    .then(res => res.json())
    .then(res => {
      const w = res.data || {};
      setHTML('seller-escrow-held', fmtRp(w.escrow_held_balance || 0));
      setHTML('seller-balance-avail', fmtRp(w.available_balance || 0));
      setHTML('seller-tax-paid', fmtRp(w.total_tax_paid || 0));

      const withdrawBtn = $id('btn-withdraw-balance');
      if (withdrawBtn) {
        withdrawBtn.dataset.avail = String(w.available_balance || 0);
      }
      if (withdrawBtn && !withdrawBtn.dataset.bound) {
        withdrawBtn.dataset.bound = '1';
        withdrawBtn.addEventListener('click', () => {
          const avail = Number(withdrawBtn.dataset.avail || 0);
          if (avail < 10000) {
            showAlert('Saldo aktif minimal Rp 10.000 untuk ditarik (Dana di Escrow baru cair setelah pembeli klik Pesanan Diterima).', 'error');
            return;
          }
          const bank = prompt('Masukkan Nama Bank / E-Wallet tujuan (mis. BCA / Mandiri / GoPay):', 'BCA');
          if (!bank) return;
          const acc = prompt('Masukkan Nomor Rekening / HP tujuan:', '1234567890');
          if (!acc) return;
          const amtStr = prompt(`Masukkan nominal penarikan (Maksimal ${fmtRp(avail)}):`, String(avail));
          const amount = parseFloat(amtStr || '0');
          if (!amount || amount <= 0) return;

          fetch(`${BASE_URL}/wallet/withdraw`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ shop_id: shopId, amount, bank_name: bank, account_number: acc })
          })
            .then(r => r.json())
            .then(out => {
              if (out.status === 200) {
                showAlert(`Penarikan ${fmtRp(amount)} ke ${bank} berhasil diproses!`, 'success');
                loadSellerWallet(shopId);
              } else {
                showAlert(out.message || 'Gagal menarik saldo.', 'error');
              }
            })
            .catch(() => showAlert('Gagal menghubungi server.', 'error'));
        });
      }

      const promoBtn = $id('btn-broadcast-promo');
      if (promoBtn && !promoBtn.dataset.bound) {
        promoBtn.dataset.bound = '1';
        promoBtn.addEventListener('click', () => {
          const title = prompt('Judul Notifikasi Promo ke Pembeli:', 'Flash Sale Ruko Hari Ini!');
          if (!title) return;
          const msg = prompt('Isi Pesan Promo:', 'Nikmati potongan harga spesial di ruko kami hari ini. Stok terbatas!');
          if (!msg) return;
          fetch(`${BASE_URL}/notifications`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ target_role: 'buyer', type: 'promo', title, message: msg, link: 'index.html#catalog-anchor' })
          })
            .then(r => r.json())
            .then(out => {
              if (out.status === 201) showAlert('Notifikasi promo berhasil dikirim ke seluruh pembeli!', 'success');
              else showAlert(out.message || 'Gagal mengirim notifikasi.', 'error');
            });
        });
      }
    })
    .catch(() => {});
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
  // Penjual hanya boleh memajukan pesanan satu langkah. "Selesai" hanya dari pembeli
  // (atau otomatis), jadi tidak ada di sini — dana Escrow tidak bisa dicairkan sepihak.
  const NEXT = { pending: ['pending', 'paid', 'cancelled'], paid: ['paid', 'shipped', 'cancelled'] };
  const opts = (current) => (NEXT[current] || [current])
    .map((value) => `<option value="${value}" ${value === current ? 'selected' : ''}>${esc((TX_STATUS[value] || { label: value }).label)}</option>`).join('');
  const lockedNote = {
    shipped: 'Menunggu pembeli konfirmasi',
    success: 'Dana sudah cair',
    cancelled: 'Dibatalkan',
    disputed: 'Menunggu keputusan admin',
  };
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
          ${NEXT[o.status]
            ? `<label class="select-wrap select-wrap--sm">
                <span class="visually-hidden">Ubah status ${esc(shortId(t.id))}</span>
                <select data-order-id="${esc(t.id)}" data-current="${esc(o.status)}">${opts(o.status)}</select>
              </label>`
            : `<span class="muted" style="font-size:12px;">${esc(lockedNote[o.status] || '–')}</span>`}
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
    headers: authHeaders({ 'Content-Type': 'application/json' }),
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
              const hasPromo = p.promo_price && p.promo_price > 0 && p.promo_price < p.price;
              const priceCell = hasPromo
                ? `<div style="display:flex;flex-direction:column;align-items:flex-end;">
                     <span style="color:#DC2626;font-weight:700;">${fmtRp(p.promo_price)}</span>
                     <small style="text-decoration:line-through;color:var(--mute);font-size:11px;">${fmtRp(p.price)}</small>
                     <span style="background:#FEE2E2;color:#B91C1C;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;margin-top:2px;">${esc(p.promo_label || `-${p.discount_percent || 0}%`)}</span>
                   </div>`
                : fmtRp(p.price);
              return `
                <tr>
                  <td>
                    <div class="prod-cell">
                      <img src="${esc(image)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
                      <div><span class="strong">${esc(p.name)}</span><span class="sub truncate">${esc(p.description || '')}</span></div>
                    </div>
                  </td>
                  <td class="num">${priceCell}</td>
                  <td class="num">${stockHTML(p.stock)}</td>
                  <td class="actions">
                    <div class="row-actions">
                      <button class="btn-sm" type="button" data-edit="${esc(p.id)}">Edit / Promo</button>
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
          if ($id('edit-prod-promo-price')) $id('edit-prod-promo-price').value = p.promo_price || '';
          if ($id('edit-prod-promo-label')) $id('edit-prod-promo-label').value = p.promo_label || '';
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
          fetch(`${BASE_URL}/product/${delBtn.dataset.delete}`, { method: 'DELETE', headers: authHeaders() })
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
let adminTxPage = 1;
const ADMIN_TX_PAGE_SIZE = 10;
let adminUserPage = 1;
const ADMIN_USER_PAGE_SIZE = 5;
let adminModPage = 1;
const ADMIN_MOD_PAGE_SIZE = 8;
let adminDisputeFilter = 'open';
let cachedAdminUsers = [];
let cachedAdminShops = [];
let cachedAdminTxs = [];
let cachedAdminDisputes = [];
let cachedAdminModProducts = [];
let cachedAdminReports = [];

export function initAdminDashboard() {
  const session = getActiveSession();
  const lockAdminView = (msg, headTitle = 'Akses ditolak') => {
    document.body.classList.add('is-locked');
    const title = $id('admin-page-title');
    const sub = $id('admin-page-sub');
    const calloutTitle = $id('admin-callout-title');
    const calloutDesc = $id('admin-callout-desc');
    if (title) title.textContent = headTitle;
    if (sub) sub.textContent = msg || 'Halaman ini hanya dapat diakses oleh Administrator.';
    if (calloutTitle) calloutTitle.textContent = headTitle;
    if (calloutDesc) calloutDesc.textContent = msg || 'Halaman ini hanya dapat diakses oleh akun administrator Vendora.';
    const callout = $id('admin-auth-callout');
    if (callout) callout.style.display = 'block';
    const section = $id('admin-dashboard-section');
    if (section) section.style.display = 'none';
  };

  if (!session || !session.user) {
    window.location.replace('login.html');
    return;
  }

  // Sembunyikan kontainer data admin sampai verifikasi server /api/admin/verify lulus (200 OK)
  if ($id('admin-dashboard-section')) $id('admin-dashboard-section').style.display = 'none';

  // Verifikasi sesi & role admin langsung ke server (/api/admin/verify) sebelum render data apa pun
  fetch(`${BASE_URL}/admin/verify`, { headers: authHeaders() })
    .then(async res => {
      if (res.status === 401) {
        sessionStorage.removeItem('vendora_session');
        localStorage.removeItem('vendora_session');
        window.location.replace('login.html');
        return null;
      }
      if (res.status === 403 || !res.ok) {
        let serverMsg = 'Akun kamu bukan administrator. Halaman ini khusus untuk pengelola platform Vendora.';
        try {
          const errBody = await res.json();
          if (errBody && errBody.message) serverMsg = errBody.message;
        } catch {}
        lockAdminView(serverMsg, 'Akses ditolak (403 Forbidden)');
        return null;
      }
      return res.json();
    })
    .then(verified => {
      if (!verified) return;
      $id('admin-auth-callout').style.display = 'none';
      $id('admin-dashboard-section').style.display = 'block';

      const name = (verified.data && verified.data.name) || session.user.name || 'Admin';
      setHTML('user-display', `<span class="console-avatar" aria-hidden="true">${esc(name.trim().charAt(0).toUpperCase())}</span>${esc(name)}`);

      loadAdminEcosystem();
      loadAdminTransactions('');
      loadAdminUsers('');
      loadAdminDisputes();
      loadAdminModeration();

      // Tombol Ekspor CSV di halaman Transaksi
      const exportCsvBtn = $id('btn-export-tx-csv');
      if (exportCsvBtn && !exportCsvBtn.dataset.bound) {
        exportCsvBtn.dataset.bound = '1';
        exportCsvBtn.addEventListener('click', () => exportAdminTransactionsCSV(exportCsvBtn));
      }

      // Filter & Pencarian Moderasi Produk
      const modSearch = $id('mod-search-input');
      if (modSearch && !modSearch.dataset.bound) {
        modSearch.dataset.bound = '1';
        modSearch.addEventListener('input', () => {
          adminModPage = 1;
          renderAdminModerationProducts();
        });
      }
      const modFilter = $id('mod-filter-status');
      if (modFilter && !modFilter.dataset.bound) {
        modFilter.dataset.bound = '1';
        modFilter.addEventListener('change', () => {
          adminModPage = 1;
          renderAdminModerationProducts();
        });
      }

      // Tombol pintas di panel "Perlu tindakan" (mis. langsung filter status transaksi pending)
      document.querySelectorAll('[data-filter-tx]').forEach(btn => {
        if (btn.dataset.boundFilterTx) return;
        btn.dataset.boundFilterTx = '1';
        btn.addEventListener('click', () => {
          const want = btn.dataset.filterTx || '';
          const sel = $id('tx-filter-status');
          if (sel) sel.value = want;
          adminTxPage = 1;
          renderAdminTransactionsTable();
        });
      });

      const txFilter = $id('tx-filter-status');
      if (txFilter && !txFilter.dataset.bound) {
        txFilter.dataset.bound = '1';
        txFilter.addEventListener('change', () => {
          adminTxPage = 1;
          renderAdminTransactionsTable();
        });
      }
      const txSearch = $id('tx-search-input');
      if (txSearch && !txSearch.dataset.bound) {
        txSearch.dataset.bound = '1';
        txSearch.addEventListener('input', () => {
          adminTxPage = 1;
          renderAdminTransactionsTable();
        });
      }

      const userFilter = $id('user-filter-role');
      if (userFilter && !userFilter.dataset.bound) {
        userFilter.dataset.bound = '1';
        userFilter.addEventListener('change', () => {
          adminUserPage = 1;
          loadAdminUsers(userFilter.value);
        });
      }
      const userSearch = $id('user-search-input');
      if (userSearch && !userSearch.dataset.bound) {
        userSearch.dataset.bound = '1';
        userSearch.addEventListener('input', () => {
          adminUserPage = 1;
          renderAdminUsersTable();
        });
      }

      // Tab Komplain (Terbuka / Selesai / Semua)
      const disputeTabs = $id('admin-dispute-tabs');
      if (disputeTabs && !disputeTabs.dataset.bound) {
        disputeTabs.dataset.bound = '1';
        disputeTabs.querySelectorAll('[data-dispute-tab]').forEach(btn => {
          btn.addEventListener('click', () => {
            adminDisputeFilter = btn.dataset.disputeTab;
            disputeTabs.querySelectorAll('[data-dispute-tab]').forEach(t => {
              const active = t === btn;
              t.classList.toggle('active', active);
              t.classList.toggle('btn-sm--ink', active);
              t.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            renderAdminDisputesList();
          });
        });
      }
    })
    .catch(() => {
      lockAdminView('Gagal memverifikasi sesi administrator ke server.');
    });
}

// ─── Transaksi (pengawasan, tabel lengkap) ───────────────────────
function loadAdminTransactions(statusFilter) {
  const tbody = $id('tx-list-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Memuat…</td></tr>`;

  Promise.all([
    fetch(`${BASE_URL}/transactions`, { headers: authHeaders() }).then(r => r.json()),
    cachedAdminUsers.length
      ? Promise.resolve({ data: cachedAdminUsers })
      : fetch(`${BASE_URL}/users`, { headers: authHeaders() }).then(r => r.json()).catch(() => ({ data: [] })),
    cachedAdminShops.length
      ? Promise.resolve({ data: cachedAdminShops })
      : fetch(`${BASE_URL}/shops`).then(r => r.json()).catch(() => ({ data: [] }))
  ])
    .then(([txData, userData, shopData]) => {
      cachedAdminTxs = txData.data || [];
      if (userData && userData.data && userData.data.length) cachedAdminUsers = userData.data;
      if (shopData && shopData.data && shopData.data.length) cachedAdminShops = shopData.data;
      if (statusFilter !== undefined && $id('tx-filter-status')) {
        $id('tx-filter-status').value = statusFilter;
      }
      renderAdminTransactionsTable();
    })
    .catch(err => {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="7" class="table-error">Gagal memuat pesanan.</td></tr>`;
    });
}

function renderAdminTransactionsTable() {
  const tbody = $id('tx-list-tbody');
  const countBadge = $id('tx-count-badge');
  const staleBtn = $id('btn-cancel-stale-tx');
  if (!tbody) return;

  const allTxs = cachedAdminTxs || [];
  const usersMap = Object.fromEntries((cachedAdminUsers || []).map(u => [u.id, u.name]));
  const shopsMap = Object.fromEntries((cachedAdminShops || []).map(s => [s.id, s.name]));

  const staleAll = allTxs.filter(t => isStalePendingOrder(t, 24));
  if (staleBtn) {
    if (staleAll.length > 0) {
      staleBtn.style.display = 'inline-flex';
      staleBtn.textContent = `Batalkan ${staleAll.length} pesanan kedaluwarsa`;
      staleBtn.onclick = () => window.cancelStalePendingOrders(staleAll.length);
    } else {
      staleBtn.style.display = 'none';
    }
  }

  const statusFilter = $id('tx-filter-status')?.value || '';
  const searchQuery = ($id('tx-search-input')?.value || '').trim().toLowerCase();

  let txs = [...allTxs];
  if (statusFilter) {
    txs = txs.filter(t => normStatus(t.status) === statusFilter);
  }
  if (searchQuery) {
    txs = txs.filter(t => {
      const idStr = String(t.id || '').toLowerCase();
      const shortStr = shortId(t.id).toLowerCase();
      const buyerName = String(usersMap[t.buyer_id] || t.recipient_name || '').toLowerCase();
      const shopNames = [...new Set((t.items || []).map(i => shopsMap[i.shop_id] || ''))].join(' ').toLowerCase();
      const itemNames = (t.items || []).map(i => i.name || '').join(' ').toLowerCase();
      return idStr.includes(searchQuery) || shortStr.includes(searchQuery) ||
             buyerName.includes(searchQuery) || shopNames.includes(searchQuery) || itemNames.includes(searchQuery);
    });
  }

  txs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (countBadge) countBadge.textContent = `${txs.length} pesanan`;

  if (!txs.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Tidak ada pesanan yang cocok.</td></tr>`;
    renderPagination('tx-pagination', 0, 1, ADMIN_TX_PAGE_SIZE, () => {});
    return;
  }

  const totalPages = Math.max(1, Math.ceil(txs.length / ADMIN_TX_PAGE_SIZE));
  if (adminTxPage > totalPages) adminTxPage = totalPages;
  const pageItems = txs.slice((adminTxPage - 1) * ADMIN_TX_PAGE_SIZE, adminTxPage * ADMIN_TX_PAGE_SIZE);

  tbody.innerHTML = pageItems.map(t => {
    const items = (t.items || []).map(i => `${i.name} ×${i.quantity}`).join(', ') || '–';
    const buyerName = usersMap[t.buyer_id] || t.recipient_name || 'Pembeli';
    const buyerTooltip = t.buyer_id ? `ID Pembeli: ${t.buyer_id}` : '';
    const shopList = [...new Set((t.items || []).map(i => shopsMap[i.shop_id]).filter(Boolean))];
    const shopDisplay = shopList.length ? shopList.join(', ') : '–';

    const subtotal = computeOrderSubtotal(t);
    const shipping = Number(t.shipping_cost || 0);
    const total = Number(t.total_amount || (subtotal + shipping));

    // Hanya tampilkan sub-rincian jika ada ongkir (> 0) atau total berbeda dari subtotal, dan selalu sertakan nominalnya
    const amountSubHTML = (shipping > 0 || (subtotal > 0 && Math.abs(total - subtotal) > 1))
      ? `<span class="sub">Subtotal: ${fmtRp(subtotal)} · Ongkir: ${fmtRp(shipping)}</span>`
      : '';

    const staleBadge = isStalePendingOrder(t, 24)
      ? `<div style="margin-top:4px;">${statusDot(waitingDaysLabel(t), 'bad')}</div>`
      : '';

    return `
      <tr>
        <td class="mono" title="${esc(t.id)}">${esc(shortId(t.id))}</td>
        <td title="${esc(buyerTooltip)}"><span class="strong">${esc(buyerName)}</span></td>
        <td><span class="strong">${esc(shopDisplay)}</span></td>
        <td class="truncate" title="${esc(items)}">${esc(items)}</td>
        <td class="num">
          <span class="strong">${fmtRp(total)}</span>
          ${amountSubHTML}
        </td>
        <td>${txStatusHTML(t.status)}${staleBadge}</td>
        <td class="muted">${fmtDateTime(t.created_at)}</td>
      </tr>`;
  }).join('');

  renderPagination('tx-pagination', txs.length, adminTxPage, ADMIN_TX_PAGE_SIZE, (newPage) => {
    adminTxPage = newPage;
    renderAdminTransactionsTable();
  });
}

window.cancelStalePendingOrders = function (count) {
  const n = count || 'semua';
  const ok = confirm(
    `Batalkan ${n} pesanan kedaluwarsa (berstatus Menunggu lebih dari 24 jam tanpa konfirmasi penjual)?\n\n` +
    `• Status pesanan akan diubah menjadi Dibatalkan.\n` +
    `• Stok produk akan dikembalikan.\n` +
    `• Transaksi lama tanpa data Escrow tidak akan memicu refund Escrow.`
  );
  if (!ok) return;

  fetch(`${BASE_URL}/admin/transactions/cancel-stale`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ hours: 24 })
  })
    .then(async res => {
      if (res.status === 401) {
        sessionStorage.removeItem('vendora_session');
        localStorage.removeItem('vendora_session');
        window.location.href = 'login.html';
        return null;
      }
      return res.json();
    })
    .then(result => {
      if (!result) return;
      if (result.status === 200) {
        showAlert(result.message || 'Pesanan kedaluwarsa berhasil dibatalkan.', 'success');
        loadAdminEcosystem();
        loadAdminTransactions($id('tx-filter-status')?.value || '');
      } else {
        showAlert(result.message || 'Gagal membatalkan pesanan kedaluwarsa.', 'error');
      }
    })
    .catch(() => showAlert('Koneksi bermasalah saat membatalkan pesanan.', 'error'));
};

// ─── Pengguna ────────────────────────────────────────────────────
function loadAdminUsers(roleFilter) {
  const tbody = $id('users-list-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Memuat…</td></tr>`;
  const url = roleFilter ? `${BASE_URL}/users?role=${encodeURIComponent(roleFilter)}` : `${BASE_URL}/users`;

  fetch(url, { headers: authHeaders() })
    .then(async res => {
      if (res.status === 401) {
        sessionStorage.removeItem('vendora_session');
        localStorage.removeItem('vendora_session');
        window.location.href = 'login.html';
        return null;
      }
      if (res.status === 403 || !res.ok) {
        throw new Error('Forbidden');
      }
      return res.json();
    })
    .then(data => {
      if (!data) return;
      const users = data.data || [];
      if (!roleFilter) cachedAdminUsers = users;
      tbody.dataset.loadedUsers = JSON.stringify(users);
      renderAdminUsersTable(users);
    })
    .catch(err => {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="6" class="table-error">Gagal memuat data pengguna.</td></tr>`;
    });
}

function renderAdminUsersTable(usersArg) {
  const tbody = $id('users-list-tbody');
  const countBadge = $id('user-count-badge');
  if (!tbody) return;

  let allUsers = usersArg;
  if (!allUsers) {
    try { allUsers = JSON.parse(tbody.dataset.loadedUsers || '[]'); } catch { allUsers = []; }
  }

  const searchQuery = ($id('user-search-input')?.value || '').trim().toLowerCase();
  let users = [...allUsers];
  if (searchQuery) {
    users = users.filter(u => {
      const name = String(u.name || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      const role = String(ROLE_LABEL[u.role] || u.role || '').toLowerCase();
      return name.includes(searchQuery) || email.includes(searchQuery) || role.includes(searchQuery);
    });
  }

  if (countBadge) countBadge.textContent = `${users.length} pengguna`;
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Tidak ada pengguna yang cocok.</td></tr>`;
    renderPagination('user-pagination', 0, 1, ADMIN_USER_PAGE_SIZE, () => {});
    return;
  }

  const totalPages = Math.max(1, Math.ceil(users.length / ADMIN_USER_PAGE_SIZE));
  if (adminUserPage > totalPages) adminUserPage = totalPages;
  const pageUsers = users.slice((adminUserPage - 1) * ADMIN_USER_PAGE_SIZE, adminUserPage * ADMIN_USER_PAGE_SIZE);

  tbody.innerHTML = pageUsers.map(u => {
    const banned = u.banned === true;
    const action = u.role === 'admin'
      ? `<span class="muted">–</span>`
      : banned
        ? `<button class="btn-sm btn-sm--ink btn-ban-user" data-id="${esc(u.id)}" data-name="${esc(u.name)}" data-banned="false" type="button">Buka blokir</button>`
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
        headers: authHeaders({ 'Content-Type': 'application/json' }),
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

  renderPagination('user-pagination', users.length, adminUserPage, ADMIN_USER_PAGE_SIZE, (newPage) => {
    adminUserPage = newPage;
    renderAdminUsersTable(allUsers);
  });
}

// ─── Widget dashboard admin ──────────────────────────────────────
function renderMonthlyRevenueChart(transactions, shops) {
  const el = $id('chart-revenue');
  if (!el) return;
  const months = lastSixMonths().map(m => ({ ...m, tax: 0, rent: 0, total: 0 }));
  transactions.forEach(t => {
    const st = normStatus(t.status);
    if (st !== 'success' && t.escrow_status !== 'released') return;
    if (!t.created_at) return;
    const m = months.find(x => x.key === monthKey(t.created_at));
    if (!m) return;
    const sub = computeOrderSubtotal(t);
    const tax = Number(t.platform_fee || 0) > 0 ? Number(t.platform_fee) : Math.round(sub * 0.025);
    m.tax += tax;
    m.total += tax;
  });
  shops.forEach(s => {
    if (!s.created_at) return;
    const m = months.find(x => x.key === monthKey(s.created_at));
    if (!m) return;
    const rent = Number(s.rental_price || 0);
    m.rent += rent;
    m.total += rent;
  });
  renderBarChart(el, months.map(m => ({
    date: m.date,
    value: m.total,
    tip: `${fmtRp(m.total)} · Pajak: ${fmtRp(m.tax)}, Sewa: ${fmtRp(m.rent)}`
  })), { format: (v) => fmtRpShort(v), ariaTitle: 'Pendapatan platform per bulan' });
}

function renderMonthlyOrdersChart(transactions) {
  const el = $id('chart-orders');
  if (!el) return;
  const months = lastSixMonths().map(m => ({ ...m, total: 0, success: 0, pending: 0, cancelled: 0 }));
  transactions.forEach(t => {
    if (!t.created_at) return;
    const m = months.find(x => x.key === monthKey(t.created_at));
    if (!m) return;
    m.total += 1;
    const st = normStatus(t.status);
    if (st === 'success') m.success += 1;
    else if (st === 'cancelled') m.cancelled += 1;
    else m.pending += 1;
  });
  renderBarChart(el, months.map(m => ({
    date: m.date,
    value: m.total,
    tip: `${m.total} pesanan · ${m.success} selesai, ${m.pending} aktif, ${m.cancelled} batal`
  })), { format: (v) => Math.round(v).toLocaleString('id-ID'), ariaTitle: 'Jumlah pesanan per bulan' });
}

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
        <td><span class="strong">${esc(s.name)}</span><span class="sub" title="${esc('ID Pemilik: ' + (s.owner_id || ''))}">${esc(owners[s.owner_id] || 'Pemilik tidak diketahui')}</span></td>
        <td class="num">${fmtRp(s.rental_price)}</td>
        <td>${fmtDate(s.rental_expires)}<span class="sub">${statusDot(lease.text, lease.tone)}</span></td>
        <td>${shopStatusBadge(s)}</td>
      </tr>`;
  }).join('');
}

function renderRecentActivities(transactions, users, disputes) {
  const el = $id('recent-activities');
  if (!el) return;
  const usersMap = Object.fromEntries((users || []).map(u => [u.id, u.name]));
  const events = [];

  (transactions || []).forEach(t => {
    if (!t.created_at) return;
    const buyerName = usersMap[t.buyer_id] || t.recipient_name || 'Pembeli';
    events.push({
      date: new Date(t.created_at),
      badge: 'Transaksi',
      tone: normStatus(t.status) === 'cancelled' ? 'bad' : normStatus(t.status) === 'success' ? 'good' : 'warn',
      title: `Pesanan ${shortId(t.id)} oleh ${buyerName}`,
      meta: `${fmtRp(t.total_amount || computeOrderSubtotal(t))} · ${(TX_STATUS[normStatus(t.status)] || { label: t.status }).label} · ${fmtDateTime(t.created_at)}`
    });
  });

  (users || []).forEach(u => {
    if (!u.created_at) return;
    events.push({
      date: new Date(u.created_at),
      badge: 'Pendaftaran',
      tone: 'good',
      title: `${u.name || 'Pengguna baru'} mendaftar sebagai ${ROLE_LABEL[u.role] || u.role}`,
      meta: `${u.email || '–'} · ${fmtDateTime(u.created_at)}`
    });
  });

  (disputes || []).forEach(d => {
    if (!d.created_at) return;
    events.push({
      date: new Date(d.created_at),
      badge: 'Komplain',
      tone: d.status === 'open' ? 'bad' : 'warn',
      title: `Komplain pesanan ${shortId(d.transaction_id)} (${DISPUTE_REASON[d.reason] || d.reason})`,
      meta: `${fmtRp(d.total_amount || d.amount)} · ${(DISPUTE_STATUS[d.status] || { label: d.status }).label} · ${fmtDateTime(d.created_at)}`
    });
  });

  events.sort((a, b) => b.date - a.date);
  const top5 = events.slice(0, 5);
  if (!top5.length) {
    el.innerHTML = `<li class="chart-empty">Belum ada aktivitas.</li>`;
    return;
  }
  el.innerHTML = top5.map(ev => `
    <li>
      <div class="person" style="width:100%;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <span class="lease-name">${esc(ev.title)}</span>
          ${statusDot(ev.badge, ev.tone)}
        </div>
        <span class="lease-meta">${esc(ev.meta)}</span>
      </div>
    </li>`).join('');
}

function updateActionNeededPanel(shops, transactions, disputes, reports) {
  const openDisputes = (disputes || []).filter(d => d.status === 'open').length;
  const expiredShops = (shops || []).filter(s => effectiveShopStatus(s) === 'expired').length;
  const staleOrders = (transactions || []).filter(t => isStalePendingOrder(t, 24)).length;
  const openReports = (reports || cachedAdminReports || []).filter(r => r.status === 'open').length;

  setHTML('action-count-disputes', openDisputes);
  setHTML('action-desc-disputes', openDisputes > 0
    ? statusDot(`${openDisputes} sengketa menunggu keputusan`, 'bad')
    : statusDot('Semua komplain tertangani', 'good'));

  const sideDisputesBadge = $id('sidebar-disputes-badge');
  if (sideDisputesBadge) {
    sideDisputesBadge.textContent = openDisputes;
    sideDisputesBadge.style.display = 'inline-block';
    sideDisputesBadge.style.background = openDisputes > 0 ? '#DC2626' : 'rgba(17,17,17,0.08)';
    sideDisputesBadge.style.color = openDisputes > 0 ? '#fff' : 'var(--ink)';
  }

  setHTML('action-count-expired-shops', expiredShops);
  setHTML('action-desc-expired-shops', expiredShops > 0
    ? statusDot(`${expiredShops} ruko melewati masa sewa`, 'warn')
    : statusDot('Semua masa sewa ruko aktif', 'good'));

  setHTML('action-count-stale-orders', staleOrders);
  setHTML('action-desc-stale-orders', staleOrders > 0
    ? statusDot(`${staleOrders} pesanan belum dikonfirmasi > 24 jam`, 'bad')
    : statusDot('Tidak ada pesanan tertunda > 24 jam', 'good'));

  setHTML('action-count-reports', openReports);
  setHTML('action-desc-reports', openReports > 0
    ? statusDot(`${openReports} laporan menunggu moderasi`, 'bad')
    : statusDot('Tidak ada laporan terbuka', 'good'));

  const sideReportsBadge = $id('sidebar-reports-badge');
  if (sideReportsBadge) {
    if (openReports > 0) {
      sideReportsBadge.textContent = openReports;
      sideReportsBadge.style.display = 'inline-block';
    } else {
      sideReportsBadge.textContent = '';
      sideReportsBadge.style.display = 'none';
    }
  }
}

// ─── Data ekosistem: KPI, widget, tabel ruko ─────────────────────
function loadAdminEcosystem() {
  Promise.all([
    fetch(`${BASE_URL}/shops`).then(res => res.json()),
    fetch(`${BASE_URL}/transactions`, { headers: authHeaders() }).then(res => res.json()),
    fetch(`${BASE_URL}/users`, { headers: authHeaders() })
      .then(async res => {
        if (res.status === 401) return { __unauthorized: true };
        if (!res.ok) return { __error: true, status: res.status };
        return res.json();
      })
      .catch(() => ({ __error: true })),
    fetch(`${BASE_URL}/wallet/summary`, { headers: authHeaders() })
      .then(async res => {
        if (res.status === 401) {
          return { __unauthorized: true };
        }
        if (!res.ok) {
          return { __error: true, status: res.status };
        }
        return res.json();
      })
      .catch(() => ({ __error: true })),
    fetch(`${BASE_URL}/disputes`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { data: [] })
      .catch(() => ({ data: [] }))
  ])
    .then(([shopRes, txRes, userRes, walletRes, disputeRes]) => {
      if ((walletRes && walletRes.__unauthorized) || (userRes && userRes.__unauthorized)) {
        sessionStorage.removeItem('vendora_session');
        localStorage.removeItem('vendora_session');
        window.location.href = 'login.html';
        return;
      }

      const shops = shopRes.data || [];
      const transactions = txRes.data || [];
      const users = (userRes && !userRes.__error && userRes.data) ? userRes.data : [];
      const disputes = (disputeRes && disputeRes.data) ? disputeRes.data : cachedAdminDisputes;
      cachedAdminShops = shops;
      if (users.length) cachedAdminUsers = users;
      cachedAdminTxs = transactions;
      if (disputes && disputes.length) cachedAdminDisputes = disputes;

      updateActionNeededPanel(shops, transactions, cachedAdminDisputes);

      // Pisahkan status efektif toko saat dibaca (aktif, jatuh tempo, ditangguhkan) tanpa mengubah field status di DB
      const activeShops = shops.filter(s => effectiveShopStatus(s) === 'active').length;
      const expiredShops = shops.filter(s => effectiveShopStatus(s) === 'expired').length;
      const suspendedShops = shops.filter(s => effectiveShopStatus(s) === 'suspended').length;
      const rentalTotal = shops.reduce((sum, s) => sum + Number(s.rental_price || 0), 0);

      // Kartu 1: Pendapatan platform (Sewa ruko + Pajak 2.5%)
      // Kartu 2: Dana tertahan (escrow) (terpisah)
      // Format ringkas (fmtRpShort) bila >= Rp 100 juta agar tidak terpotong di kartu, dengan nilai penuh di atribut title (tooltip)
      const fmtKpiRp = (val) => val >= 1e8 ? fmtRpShort(val) : fmtRp(val);

      if (!walletRes || walletRes.__error || !walletRes.data) {
        setHTML('stat-rental-revenue', 'Gagal memuat');
        setHTML('stat-rental-sub', statusDot('Gagal memuat ringkasan pajak', 'bad'));
        setHTML('stat-escrow-held', 'Gagal memuat');
        setHTML('stat-escrow-sub', statusDot('Gagal memuat saldo escrow', 'bad'));
      } else {
        const wallet = walletRes.data;
        const taxEarned = Number(wallet.total_platform_tax_earned || 0);
        const escrowHeld = Number(wallet.total_escrow_held || 0);
        const platformTotal = rentalTotal + taxEarned;
        // Jumlah pesanan aktif yang dananya masih ditahan (belum selesai & belum dibatalkan)
        const activeEscrowOrders = Number(wallet.escrow_order_count || 0) ||
          transactions.filter(t => !['success', 'cancelled'].includes(normStatus(t.status)) && t.status !== 'pending_payment').length;

        const revEl = $id('stat-rental-revenue');
        if (revEl) {
          revEl.textContent = fmtKpiRp(platformTotal);
          revEl.title = `${fmtRp(platformTotal)} (Sewa ruko: ${fmtRp(rentalTotal)} + Pajak 2.5%: ${fmtRp(taxEarned)})`;
        }
        setHTML('stat-rental-sub', `Sewa: ${fmtRpShort(rentalTotal)} · Pajak 2.5%: ${fmtRpShort(taxEarned)}`);

        const escEl = $id('stat-escrow-held');
        if (escEl) {
          escEl.textContent = fmtKpiRp(escrowHeld);
          escEl.title = `${fmtRp(escrowHeld)} ditahan di Escrow dari ${activeEscrowOrders} pesanan aktif`;
        }
        setHTML('stat-escrow-sub', activeEscrowOrders > 0 ? `Dari ${activeEscrowOrders} pesanan aktif` : 'Tidak ada pesanan aktif');
      }

      const sellers = users.filter(u => u.role === 'seller').length;
      const buyers = users.filter(u => u.role === 'buyer').length;
      const pending = transactions.filter(t => normStatus(t.status) === 'pending').length;
      const stalePending = transactions.filter(t => isStalePendingOrder(t, 24)).length;

      setHTML('stat-shops', activeShops);
      setHTML('stat-shops-sub',
        `${activeShops} aktif · ` +
        (expiredShops ? statusDot(`${expiredShops} jatuh tempo`, 'warn') : '0 jatuh tempo') +
        ` · ${suspendedShops} ditangguhkan`
      );
      if (!userRes || userRes.__error) {
        setHTML('stat-users', 'Gagal memuat');
        setHTML('stat-users-sub', statusDot('Gagal memuat data pengguna', 'bad'));
      } else {
        setHTML('stat-users', users.length.toLocaleString('id-ID'));
        setHTML('stat-users-sub', `${sellers} penjual · ${buyers} pembeli`);
      }
      setHTML('stat-transactions', transactions.length.toLocaleString('id-ID'));
      if (pending) {
        const staleActionBtn = stalePending > 0
          ? `<div class="kpi-action-wrap"><button type="button" class="btn-sm btn-sm--danger" id="kpi-cancel-stale-btn">Batalkan ${stalePending} pesanan kedaluwarsa</button></div>`
          : '';
        setHTML('stat-transactions-sub',
          statusDot(`${pending} menunggu (${stalePending} kedaluwarsa)`, stalePending > 0 ? 'bad' : 'warn') +
          staleActionBtn
        );
        const kpiBtn = $id('kpi-cancel-stale-btn');
        if (kpiBtn) kpiBtn.onclick = () => window.cancelStalePendingOrders(stalePending);
      } else {
        setHTML('stat-transactions-sub', 'Tidak ada yang tertunda');
      }

      renderMonthlyRevenueChart(transactions, shops);
      renderMonthlyOrdersChart(transactions);
      renderUserGrowth(users);
      renderStatusBreakdown(transactions);
      renderLeaseTable(shops, users);
      renderRecentActivities(transactions, users, cachedAdminDisputes);

      // Tabel ruko (menu Sewa Ruko) — urutkan berdasarkan tanggal berakhir sewa (sama dengan dashboard)
      const tbody = $id('shops-list-tbody');
      if (!tbody) return;
      if (!shops.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Belum ada ruko yang disewa.</td></tr>`;
        return;
      }
      const owners = Object.fromEntries(users.map(u => [u.id, u.name]));
      const sortedShops = [...shops].sort((a, b) => new Date(a.rental_expires) - new Date(b.rental_expires));
      tbody.innerHTML = sortedShops.map(s => {
        const lease = leaseInfo(s.rental_expires);
        const eff = effectiveShopStatus(s);
        // Tombol aksi sesuai status efektif:
        // jatuh tempo -> Perpanjang, ditangguhkan -> Aktifkan, aktif -> Tangguhkan
        let statusBtn = '';
        if (eff === 'expired') {
          statusBtn = `<button class="btn-sm btn-sm--ink btn-renew-shop" data-id="${esc(s.id)}" data-name="${esc(s.name)}" type="button">Perpanjang</button>`;
        } else if (eff === 'suspended') {
          statusBtn = `<button class="btn-sm btn-sm--ink btn-toggle-status" data-id="${esc(s.id)}" data-status="active" type="button">Aktifkan</button>`;
        } else {
          statusBtn = `<button class="btn-sm btn-toggle-status" data-id="${esc(s.id)}" data-status="suspended" type="button">Tangguhkan</button>`;
        }
        const ownerTooltip = s.owner_id ? `ID Pemilik: ${s.owner_id}` : '';
        return `
          <tr>
            <td><span class="strong">${esc(s.name)}</span><span class="sub truncate">${esc(s.description || '–')}</span></td>
            <td title="${esc(ownerTooltip)}"><span class="strong">${esc(owners[s.owner_id] || '–')}</span></td>
            <td class="num">${fmtRp(s.rental_price)}</td>
            <td>${fmtDate(s.rental_expires)}<span class="sub">${statusDot(lease.text, lease.tone)}</span></td>
            <td>${shopStatusBadge(s)}</td>
            <td class="actions"><div class="row-actions">${statusBtn}<button class="btn-sm btn-sm--danger btn-delete-shop" data-id="${esc(s.id)}" data-name="${esc(s.name)}" type="button">Hapus</button></div></td>
          </tr>`;
      }).join('');

      // Delegasi event — dipasang sekali saja
      if (tbody.dataset.bound) return;
      tbody.dataset.bound = '1';
      tbody.addEventListener('click', (e) => {
        const renewBtn = e.target.closest('.btn-renew-shop');
        const toggleBtn = e.target.closest('.btn-toggle-status');
        const deleteBtn = e.target.closest('.btn-delete-shop');
        if (renewBtn) {
          const shopName = renewBtn.dataset.name || 'ruko ini';
          const daysStr = prompt(`Perpanjang masa sewa "${shopName}" berapa hari?`, '30');
          if (!daysStr) return;
          const rentalDays = parseInt(daysStr, 10);
          if (!rentalDays || rentalDays <= 0) {
            showAlert('Jumlah hari perpanjangan tidak valid.', 'error');
            return;
          }
          if (!confirm(`Perpanjang masa sewa "${shopName}" selama ${rentalDays} hari (${fmtRp(rentalDays * DAY_PRICE)})?`)) return;
          renewBtn.disabled = true;
          fetch(`${BASE_URL}/shop/${renewBtn.dataset.id}/renew`, {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ rental_days: rentalDays })
          })
            .then(res => res.json())
            .then(result => {
              if (result.status === 200) {
                showAlert(`Sewa "${shopName}" diperpanjang hingga ${result.data?.new_expiry || ''}.`, 'success');
                loadAdminEcosystem();
              } else {
                showAlert(result.message || 'Gagal memperpanjang sewa ruko.', 'error');
                renewBtn.disabled = false;
              }
            })
            .catch(() => { showAlert('Koneksi bermasalah saat memperpanjang sewa ruko.', 'error'); renewBtn.disabled = false; });
        }
        if (toggleBtn) {
          toggleBtn.disabled = true;
          const nextStatus = toggleBtn.dataset.status;
          fetch(`${BASE_URL}/shop/${toggleBtn.dataset.id}/status`, {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
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
          if (!confirm(`Hapus "${deleteBtn.dataset.name || 'ruko ini'}" secara permanen?\n\nCatatan: Ruko yang masih memiliki pesanan aktif tidak dapat dihapus.`)) return;
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
  fetch(`${BASE_URL}/shop/${shopId}`, { method: 'DELETE', headers: authHeaders() })
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

// =================================================================
// KOMPLAIN / SENGKETA (penjual menanggapi, admin memutuskan)
// =================================================================
const DISPUTE_REASON = {
  not_received: 'Barang tidak sampai',
  not_as_described: 'Barang tidak sesuai deskripsi',
  damaged: 'Barang rusak / cacat',
  other: 'Alasan lain',
};
const DISPUTE_STATUS = {
  open: { label: 'Menunggu keputusan', tone: 'warn' },
  resolved_refund: { label: 'Refund ke pembeli', tone: 'bad' },
  resolved_release: { label: 'Dana ke penjual', tone: 'good' },
};

function disputeCardHTML(d, role) {
  const st = DISPUTE_STATUS[d.status] || { label: d.status, tone: '' };
  const evidenceList = (d.evidence || []).filter(Boolean);
  const evidenceHTML = evidenceList.length
    ? `<div style="margin-top:8px;">
         <div style="font-size:11px;color:var(--mute);margin-bottom:4px;">Bukti foto dari pembeli (${evidenceList.length}):</div>
         <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
           ${evidenceList.map((u, idx) => `
             <a href="${esc(u)}" target="_blank" rel="noopener" title="Buka bukti foto ${idx + 1}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--line);border-radius:6px;background:#FAFAFA;font-size:12px;text-decoration:none;color:var(--ink);">
               <img src="${esc(u)}" alt="Bukti ${idx + 1}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid rgba(0,0,0,.08);" onerror="this.style.display='none'">
               <span>Foto #${idx + 1} ↗</span>
             </a>`).join('')}
         </div>
       </div>`
    : `<div style="margin-top:4px;font-size:12px;color:var(--mute);">Tidak ada lampiran foto bukti dari pembeli.</div>`;

  const subtotal = Number(d.subtotal_amount || d.amount || 0);
  const shipping = Number(d.shipping_cost || 0);
  const total = Number(d.total_amount || (subtotal + shipping));
  const amountLabel = total !== subtotal || shipping > 0
    ? `${fmtRp(total)} <span style="font-weight:400;color:var(--mute);font-size:12px;">(Total termasuk ongkir · Subtotal barang: ${fmtRp(subtotal)}${shipping > 0 ? ` + Ongkir: ${fmtRp(shipping)}` : ''})</span>`
    : `${fmtRp(total)} <span style="font-weight:400;color:var(--mute);font-size:12px;">(Subtotal barang)</span>`;

  let actions = '';
  if (d.status === 'open' && role === 'seller') {
    actions = `<button class="btn-sm" type="button" data-dispute-reply="${esc(d.id)}">${d.seller_response ? 'Ubah tanggapan' : 'Tanggapi'}</button>`;
  }
  if (d.status === 'open' && role === 'admin') {
    actions = `
      <button class="btn-sm btn-sm--danger" type="button" data-dispute-resolve="${esc(d.id)}" data-decision="refund">Refund ke pembeli</button>
      <button class="btn-sm btn-sm--ink" type="button" data-dispute-resolve="${esc(d.id)}" data-decision="release">Teruskan ke penjual</button>`;
  }
  return `
    <li style="padding:12px 0;border-bottom:1px solid rgba(0,0,0,.07);list-style:none;">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <b>Pesanan ${esc(shortId(d.transaction_id))} · ${amountLabel}</b>
        ${statusDot(st.label, st.tone)}
      </div>
      <div style="font-size:13px;margin-top:4px;"><b>${esc(DISPUTE_REASON[d.reason] || d.reason)}</b> — ${esc(d.description)}</div>
      ${evidenceHTML}
      ${d.seller_response ? `<div style="font-size:12px;margin-top:6px;padding:6px 8px;background:#F3F4F6;border-radius:6px;"><b>Tanggapan penjual:</b> ${esc(d.seller_response)}</div>` : ''}
      ${d.admin_note ? `<div style="font-size:12px;margin-top:6px;padding:6px 8px;background:#FEF3C7;border-radius:6px;"><b>Keputusan admin:</b> ${esc(d.admin_note)}</div>` : ''}
      <div style="font-size:11px;color:var(--mute);margin-top:4px;">${fmtDateTime(d.created_at)}</div>
      ${actions ? `<div class="row-actions" style="margin-top:8px;">${actions}</div>` : ''}
    </li>`;
}

function renderAdminDisputesList() {
  const el = $id('admin-disputes');
  if (!el) return;
  const list = cachedAdminDisputes || [];
  const openList = list.filter(d => d.status === 'open');
  const resolvedList = list.filter(d => d.status !== 'open');

  // Sinkronkan selalu state tombol tab aktif dengan filter komplain saat ini
  const disputeTabs = $id('admin-dispute-tabs');
  if (disputeTabs) {
    disputeTabs.querySelectorAll('[data-dispute-tab]').forEach(t => {
      const active = t.dataset.disputeTab === adminDisputeFilter;
      t.classList.toggle('active', active);
      t.classList.toggle('btn-sm--ink', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  setHTML('admin-disputes-count', openList.length ? `${openList.length} terbuka` : '0 terbuka');
  setHTML('dispute-count-open', openList.length);
  setHTML('dispute-count-resolved', resolvedList.length);
  setHTML('dispute-count-all', list.length);

  const sideBadge = $id('sidebar-disputes-badge');
  if (sideBadge) {
    sideBadge.textContent = openList.length;
    sideBadge.style.display = 'inline-block';
    sideBadge.style.background = openList.length > 0 ? '#DC2626' : 'rgba(17,17,17,0.08)';
    sideBadge.style.color = openList.length > 0 ? '#fff' : 'var(--ink)';
  }

  updateActionNeededPanel(cachedAdminShops, cachedAdminTxs, list, cachedAdminReports);

  let filtered = list;
  if (adminDisputeFilter === 'open') filtered = openList;
  else if (adminDisputeFilter === 'resolved') filtered = resolvedList;

  if (!filtered.length) {
    const emptyMsg = adminDisputeFilter === 'open'
      ? 'Tidak ada komplain terbuka saat ini.'
      : adminDisputeFilter === 'resolved'
        ? 'Belum ada komplain yang diselesaikan.'
        : 'Belum ada komplain.';
    el.innerHTML = `<li class="chart-empty" style="list-style:none;">${emptyMsg}</li>`;
    return;
  }
  el.innerHTML = filtered.map(d => disputeCardHTML(d, 'admin')).join('');
}

function loadDisputes(targetId, role, countId) {
  const el = $id(targetId);
  if (!el) return;
  fetch(`${BASE_URL}/disputes`, { headers: authHeaders() })
    .then(r => r.json())
    .then(res => {
      const list = res.data || [];
      if (role === 'admin') {
        cachedAdminDisputes = list;
        renderAdminDisputesList();
        return;
      }
      const open = list.filter(d => d.status === 'open').length;
      if (countId) setHTML(countId, open ? `${open} terbuka` : '');
      if (!list.length) { el.innerHTML = '<li class="chart-empty" style="list-style:none;">Belum ada komplain.</li>'; return; }
      el.innerHTML = list.map(d => disputeCardHTML(d, role)).join('');
    })
    .catch(() => { el.innerHTML = '<li class="chart-empty" style="list-style:none;">Gagal memuat komplain.</li>'; });

  if (el.dataset.bound) return;
  el.dataset.bound = '1';
  el.addEventListener('click', (e) => {
    const rep = e.target.closest('[data-dispute-reply]');
    const res = e.target.closest('[data-dispute-resolve]');
    if (rep) {
      const text = prompt('Tulis tanggapanmu untuk admin (jelaskan versi penjual, mis. resi & bukti kirim):');
      if (!text || !text.trim()) return;
      fetch(`${BASE_URL}/dispute/${rep.dataset.disputeReply}/reply`, {
        method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ response: text.trim() })
      }).then(r => r.json()).then(out => {
        showAlert(out.status === 200 ? 'Tanggapan terkirim ke admin.' : (out.message || 'Gagal mengirim tanggapan.'), out.status === 200 ? 'success' : 'error');
        loadDisputes(targetId, role, countId);
      });
    }
    if (res) {
      const decision = res.dataset.decision;
      const ask = decision === 'refund'
        ? 'Refund dana ke pembeli? Pesanan akan dibatalkan.'
        : 'Teruskan dana ke penjual? Pesanan akan dinyatakan selesai.';
      if (!confirm(ask)) return;
      const note = prompt('Alasan keputusan (dilihat pembeli & penjual):');
      if (!note || !note.trim()) { showAlert('Alasan keputusan wajib diisi.', 'error'); return; }
      res.disabled = true;
      fetch(`${BASE_URL}/dispute/${res.dataset.disputeResolve}/resolve`, {
        method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ decision, note: note.trim() })
      }).then(r => r.json()).then(out => {
        showAlert(out.status === 200 ? 'Keputusan tersimpan.' : (out.message || 'Gagal menyimpan keputusan.'), out.status === 200 ? 'success' : 'error');
        loadDisputes(targetId, role, countId);
        if (out.status === 200) { loadAdminEcosystem(); loadAdminTransactions($id('tx-filter-status')?.value || ''); }
      });
    }
  });
}

export function loadSellerDisputes() { loadDisputes('seller-disputes', 'seller', 'seller-disputes-count'); }
export function loadAdminDisputes() { loadDisputes('admin-disputes', 'admin', 'admin-disputes-count'); }

// =================================================================
// PRIORITAS 4: EKSPOR CSV, MODERASI PRODUK & LAPORAN
// =================================================================

function exportAdminTransactionsCSV(btnEl) {
  const statusFilter = $id('tx-filter-status')?.value || '';
  const searchQuery = ($id('tx-search-input')?.value || '').trim();
  const params = new URLSearchParams();
  if (statusFilter) params.set('status', statusFilter);
  if (searchQuery) params.set('q', searchQuery);

  const url = `${BASE_URL}/admin/transactions/export${params.toString() ? `?${params.toString()}` : ''}`;
  if (btnEl) btnEl.disabled = true;

  fetch(url, { headers: authHeaders() })
    .then(async res => {
      if (res.status === 401) {
        sessionStorage.removeItem('vendora_session');
        localStorage.removeItem('vendora_session');
        window.location.href = 'login.html';
        return null;
      }
      if (!res.ok) {
        throw new Error('Gagal mengunduh CSV');
      }
      return res.blob();
    })
    .then(blob => {
      if (!blob) return;
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = downloadUrl;
      a.download = `laporan_transaksi_vendora_${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);
      showAlert('Laporan transaksi CSV berhasil diunduh.', 'success');
    })
    .catch(() => {
      showAlert('Gagal mengekspor laporan transaksi CSV.', 'error');
    })
    .finally(() => {
      if (btnEl) btnEl.disabled = false;
    });
}

const REPORT_REASON_LABEL = {
  counterfeit: 'Barang palsu / tiruan',
  prohibited: 'Barang terlarang / melanggar hukum',
  misleading: 'Deskripsi atau harga menyesatkan',
  scam: 'Indikasi penipuan toko',
  inappropriate: 'Konten tidak pantas',
  other: 'Pelanggaran lainnya',
};

function loadAdminModeration() {
  const prodTbody = $id('mod-products-tbody');
  const repTbody = $id('reports-list-tbody');
  if (!prodTbody && !repTbody) return;

  Promise.all([
    fetch(`${BASE_URL}/admin/products`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { data: [] })
      .catch(() => ({ data: [] })),
    fetch(`${BASE_URL}/admin/reports`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { data: [] })
      .catch(() => ({ data: [] }))
  ]).then(([prodRes, repRes]) => {
    cachedAdminModProducts = prodRes.data || [];
    cachedAdminReports = repRes.data || [];
    updateActionNeededPanel(cachedAdminShops, cachedAdminTxs, cachedAdminDisputes, cachedAdminReports);
    renderAdminReportsTable();
    renderAdminModerationProducts();
  });
}

function renderAdminReportsTable() {
  const tbody = $id('reports-list-tbody');
  const badge = $id('reports-count-badge');
  if (!tbody) return;

  const list = cachedAdminReports || [];
  const openCount = list.filter(r => r.status === 'open').length;
  if (badge) badge.textContent = `${openCount} terbuka · ${list.length} total`;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Belum ada laporan produk atau toko dari pengguna.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(r => {
    const isOpen = r.status === 'open';
    const stBadge = isOpen
      ? statusDot('Menunggu tindak lanjut', 'bad')
      : r.status === 'resolved'
        ? statusDot('Ditindaklanjuti', 'good')
        : statusDot('Ditolak / Diabaikan', 'warn');

    const targetLabel = r.target_type === 'shop' ? 'Toko' : 'Produk';
    const reasonText = REPORT_REASON_LABEL[r.reason] || r.reason || 'Pelanggaran';
    const actionsHTML = isOpen
      ? `<div class="row-actions">
           <button type="button" class="btn-sm btn-sm--ink" data-report-resolve="${esc(r.id)}" data-report-status="resolved" data-target-name="${esc(r.target_name || '')}">Tindak lanjuti</button>
           <button type="button" class="btn-sm" data-report-resolve="${esc(r.id)}" data-report-status="dismissed" data-target-name="${esc(r.target_name || '')}">Abaikan</button>
         </div>`
      : `<span class="muted" style="font-size:12px;">${esc(r.admin_note || 'Selesai')}</span>`;

    return `
      <tr>
        <td class="muted">${fmtDateTime(r.created_at)}</td>
        <td><span class="strong">${esc(r.reporter_name || 'Pengguna')}</span></td>
        <td>
          <span class="role-tag">${esc(targetLabel)}</span>
          <span class="strong" style="margin-left:4px;">${esc(r.target_name || r.target_id)}</span>
          ${r.shop_name ? `<span class="sub">Toko: ${esc(r.shop_name)}</span>` : ''}
        </td>
        <td>
          <span class="strong">${esc(reasonText)}</span>
          ${r.description ? `<span class="sub">${esc(r.description)}</span>` : ''}
        </td>
        <td>${stBadge}</td>
        <td class="actions">${actionsHTML}</td>
      </tr>`;
  }).join('');

  if (tbody.dataset.bound) return;
  tbody.dataset.bound = '1';
  tbody.addEventListener('click', e => {
    const btn = e.target.closest('[data-report-resolve]');
    if (!btn) return;
    const reportId = btn.dataset.reportResolve;
    const nextStatus = btn.dataset.reportStatus;
    const targetName = btn.dataset.targetName || 'item ini';
    const promptLabel = nextStatus === 'resolved'
      ? `Catatan tindak lanjut untuk laporan "${targetName}":`
      : `Alasan menolak/mengabaikan laporan "${targetName}":`;
    const note = prompt(promptLabel, nextStatus === 'resolved' ? 'Produk/toko telah diperiksa dan ditindaklanjuti.' : 'Laporan tidak terbukti melanggar ketentuan.');
    if (note === null) return;
    btn.disabled = true;
    fetch(`${BASE_URL}/admin/report/${reportId}/resolve`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: nextStatus, admin_note: note.trim() })
    })
      .then(r => r.json())
      .then(res => {
        if (res.status === 200) {
          showAlert('Status laporan diperbarui.', 'success');
          loadAdminModeration();
        } else {
          showAlert(res.message || 'Gagal memperbarui laporan.', 'error');
          btn.disabled = false;
        }
      })
      .catch(() => {
        showAlert('Koneksi bermasalah saat memperbarui laporan.', 'error');
        btn.disabled = false;
      });
  });
}

function renderAdminModerationProducts() {
  const tbody = $id('mod-products-tbody');
  const badge = $id('mod-products-count-badge');
  if (!tbody) return;

  const searchQuery = ($id('mod-search-input')?.value || '').trim().toLowerCase();
  const statusFilter = $id('mod-filter-status')?.value || '';

  let list = [...(cachedAdminModProducts || [])];
  if (statusFilter === 'visible') {
    list = list.filter(p => !p.hidden && p.shop_status === 'active');
  } else if (statusFilter === 'hidden') {
    list = list.filter(p => p.hidden === true);
  } else if (statusFilter === 'inactive_shop') {
    list = list.filter(p => p.shop_status !== 'active');
  }

  if (searchQuery) {
    list = list.filter(p => {
      const name = String(p.name || '').toLowerCase();
      const cat = String(p.category || '').toLowerCase();
      const sub = String(p.subcategory || '').toLowerCase();
      const shop = String(p.shop_name || '').toLowerCase();
      return name.includes(searchQuery) || cat.includes(searchQuery) || sub.includes(searchQuery) || shop.includes(searchQuery);
    });
  }

  if (badge) badge.textContent = `${list.length} produk`;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Tidak ada produk yang cocok dengan filter.</td></tr>`;
    renderPagination('mod-pagination', 0, 1, ADMIN_MOD_PAGE_SIZE, () => {});
    return;
  }

  const totalPages = Math.max(1, Math.ceil(list.length / ADMIN_MOD_PAGE_SIZE));
  if (adminModPage > totalPages) adminModPage = totalPages;
  const pageItems = list.slice((adminModPage - 1) * ADMIN_MOD_PAGE_SIZE, adminModPage * ADMIN_MOD_PAGE_SIZE);

  tbody.innerHTML = pageItems.map(p => {
    const img = (p.images && p.images[0]) ? p.images[0] : FALLBACK_IMG;
    let statusHTML = statusDot('Tampil di katalog', 'good');
    if (p.hidden) {
      statusHTML = statusDot('Disembunyikan admin', 'bad') +
        (p.moderation_note ? `<span class="sub">Alasan: ${esc(p.moderation_note)}</span>` : '');
    } else if (p.shop_status === 'expired') {
      statusHTML = statusDot('Tersembunyi (Toko jatuh tempo)', 'warn');
    } else if (p.shop_status === 'suspended') {
      statusHTML = statusDot('Tersembunyi (Toko ditangguhkan)', 'bad');
    }

    const toggleBtn = p.hidden
      ? `<button type="button" class="btn-sm btn-sm--ink" data-mod-toggle="${esc(p.id)}" data-mod-name="${esc(p.name)}" data-mod-hidden="false">Tampilkan</button>`
      : `<button type="button" class="btn-sm" data-mod-toggle="${esc(p.id)}" data-mod-name="${esc(p.name)}" data-mod-hidden="true">Sembunyikan</button>`;

    return `
      <tr>
        <td>
          <div class="prod-cell">
            <img src="${esc(img)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
            <div>
              <span class="strong">${esc(p.name)}</span>
              <span class="sub truncate" title="${esc(p.description || '')}">${esc(p.description || '–')}</span>
            </div>
          </div>
        </td>
        <td><span class="strong">${esc(p.shop_name || '–')}</span></td>
        <td><span class="role-tag">${esc(p.category || 'Umum')}</span>${p.subcategory ? `<span class="sub">${esc(p.subcategory)}</span>` : ''}</td>
        <td class="num strong">${fmtRp(p.promo_price > 0 && p.promo_price < p.price ? p.promo_price : p.price)}</td>
        <td class="num">${stockHTML(Number(p.stock || 0))}</td>
        <td>${statusHTML}</td>
        <td class="actions">
          <div class="row-actions">
            ${toggleBtn}
            <button type="button" class="btn-sm btn-sm--danger" data-mod-delete="${esc(p.id)}" data-mod-name="${esc(p.name)}">Hapus</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  renderPagination('mod-pagination', list.length, adminModPage, ADMIN_MOD_PAGE_SIZE, newPage => {
    adminModPage = newPage;
    renderAdminModerationProducts();
  });

  if (tbody.dataset.bound) return;
  tbody.dataset.bound = '1';
  tbody.addEventListener('click', e => {
    const toggleBtn = e.target.closest('[data-mod-toggle]');
    const deleteBtn = e.target.closest('[data-mod-delete]');

    if (toggleBtn) {
      const prodId = toggleBtn.dataset.modToggle;
      const prodName = toggleBtn.dataset.modName || 'produk ini';
      const setHidden = toggleBtn.dataset.modHidden === 'true';

      if (setHidden) {
        if (!confirm(`Sembunyikan "${prodName}" dari katalog publik?`)) return;
        const reason = prompt(`Masukkan alasan menyembunyikan "${prodName}" (wajib diisi):`, 'Melanggar kebijakan produk Vendora');
        if (!reason || !reason.trim()) {
          showAlert('Alasan moderasi wajib diisi untuk menyembunyikan produk.', 'error');
          return;
        }
        toggleBtn.disabled = true;
        fetch(`${BASE_URL}/admin/product/${prodId}/visibility`, {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ hidden: true, reason: reason.trim() })
        })
          .then(r => r.json())
          .then(res => {
            if (res.status === 200) {
              showAlert(`Produk "${prodName}" disembunyikan dari katalog.`, 'success');
              loadAdminModeration();
            } else {
              showAlert(res.message || 'Gagal menyembunyikan produk.', 'error');
              toggleBtn.disabled = false;
            }
          })
          .catch(() => { showAlert('Koneksi bermasalah.', 'error'); toggleBtn.disabled = false; });
      } else {
        if (!confirm(`Tampilkan kembali "${prodName}" di katalog publik?`)) return;
        const reason = prompt(`Catatan menampilkan kembali "${prodName}" (opsional):`, 'Produk telah diperbaiki dan sesuai ketentuan') || '';
        toggleBtn.disabled = true;
        fetch(`${BASE_URL}/admin/product/${prodId}/visibility`, {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ hidden: false, reason: reason.trim() })
        })
          .then(r => r.json())
          .then(res => {
            if (res.status === 200) {
              showAlert(`Produk "${prodName}" ditampilkan kembali di katalog.`, 'success');
              loadAdminModeration();
            } else {
              showAlert(res.message || 'Gagal menampilkan produk.', 'error');
              toggleBtn.disabled = false;
            }
          })
          .catch(() => { showAlert('Koneksi bermasalah.', 'error'); toggleBtn.disabled = false; });
      }
    }

    if (deleteBtn) {
      const prodId = deleteBtn.dataset.modDelete;
      const prodName = deleteBtn.dataset.modName || 'produk ini';
      if (!confirm(`Hapus permanen produk "${prodName}" dari database?\n\nTindakan ini tidak dapat dibatalkan.`)) return;
      const reason = prompt(`Masukkan alasan penghapusan produk "${prodName}" (wajib diisi):`, 'Produk melanggar aturan berat / barang terlarang');
      if (!reason || !reason.trim()) {
        showAlert('Alasan penghapusan produk wajib diisi.', 'error');
        return;
      }
      deleteBtn.disabled = true;
      fetch(`${BASE_URL}/product/${prodId}?reason=${encodeURIComponent(reason.trim())}`, {
        method: 'DELETE',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ reason: reason.trim() })
      })
        .then(r => r.json())
        .then(res => {
          if (res.status === 200) {
            showAlert(`Produk "${prodName}" dihapus permanen.`, 'success');
            loadAdminModeration();
          } else {
            showAlert(res.message || 'Gagal menghapus produk.', 'error');
            deleteBtn.disabled = false;
          }
        })
        .catch(() => { showAlert('Koneksi bermasalah.', 'error'); deleteBtn.disabled = false; });
    }
  });
}
