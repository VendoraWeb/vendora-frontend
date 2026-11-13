// ─── Halaman "Pesanan saya" (pesanan.html) ───────────────────────────────────
import { BASE_URL, getActiveSession, authHeaders } from "../config/api.js?v=105";
import { esc, fmtRp, fmtDateTime, shortId, TX_STATUS, normStatus, txStatusHTML } from "../ui.js?v=102";
import { loadCatalogData, mockIdFromName, cartItemFor } from "./product.js?v=146";
import { addToCart } from "./transaction.js?v=146";

const $ = (id) => document.getElementById(id);
const STEPS = [
  { key: 'pending', label: 'Dipesan' },
  { key: 'paid',    label: 'Dikemas' },
  { key: 'shipped', label: 'Dikirim' },
  { key: 'success', label: 'Selesai' },
];
const STEP_INDEX = { pending: 0, paid: 1, shipped: 2, disputed: 2, success: 3 };
const NOTE = {
  pending:   'Menunggu penjual mengonfirmasi pesananmu.',
  paid:      'Penjual sedang mengemas pesananmu.',
  shipped:   'Paket sedang dalam perjalanan ke alamatmu.',
  success:   'Paket sudah diterima. Terima kasih sudah berbelanja!',
  disputed:  'Komplain sedang ditinjau admin. Dana kamu tetap aman di Escrow sampai ada keputusan.',
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
        <p class="order-note">
          ${NOTE[o.status] || ''}
          ${o.status === 'shipped' && t.auto_complete_at ? ` Jika tidak ada konfirmasi atau komplain, pesanan selesai otomatis pada <b>${fmtDateTime(t.auto_complete_at)}</b>.` : ''}
          ${t.auto_completed ? ' (Diselesaikan otomatis oleh sistem.)' : ''}
          ${t.courier_service ? ` Kurir: <b>${esc(t.courier_service)}</b>.` : ''}
          ${t.tracking_number ? ` Resi: <b>${esc(t.tracking_number)}</b>.` : (o.status === 'shipped' || o.status === 'success') ? ` Resi: <b>JNE-${esc((t.id || '').slice(-8).toUpperCase())}</b>.` : ''}
          <span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:${o.status === 'success' ? '#DCFCE7;color:#166534' : o.status === 'cancelled' ? '#FEE2E2;color:#991B1B' : '#FEF3C7;color:#92400E'};">
            ${o.status === 'success' ? 'Escrow Cair ke Penjual' : o.status === 'cancelled' ? 'Dana Escrow Dikembalikan' : o.status === 'disputed' ? 'Dana Dibekukan — Menunggu Keputusan Admin' : 'Uang Dijamin di Escrow Admin'}
          </span>
        </p>

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
            ${o.status !== 'cancelled' ? `<button type="button" class="btn-line btn-line--sm" data-track="${esc(t.id)}">Lacak Peta & Resi</button>` : ''}
            ${o.status === 'shipped' ? `<button type="button" class="btn-ink btn-ink--sm" data-confirm-received="${esc(t.id)}">Pesanan Diterima</button><button type="button" class="btn-line btn-line--sm" data-dispute="${esc(t.id)}">Ajukan Komplain</button>` : ''}
            ${canBuyAgain ? `<button type="button" class="btn-line btn-line--sm" data-again="${esc(t.id)}">Beli lagi</button>` : ''}
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
  if (session.user.role === 'admin') {
    window.location.replace('admin.html');
    return;
  }
  $('orders-app').hidden = false;

  async function reloadOrders() {
    const [txRes, cat] = await Promise.all([
      fetch(`${BASE_URL}/transactions?buyer_id=${encodeURIComponent(session.user.id)}`, { headers: authHeaders() }).then(r => r.json()),
      loadCatalogData(),
    ]);
    catalog = cat;
    orders = (txRes.data || [])
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(enrich);
    renderTabs();
    renderList();
  }

  try {
    await reloadOrders();
  } catch (e) {
    $('orders-list').innerHTML = `<div class="orders-empty"><h3>Gagal memuat pesanan</h3><p>Periksa koneksi lalu muat ulang halaman.</p></div>`;
    return;
  }

  // Tab dari hash (#dikirim) supaya bisa dibagikan
  const fromHash = location.hash.slice(1);
  if (fromHash && (fromHash === 'all' || TX_STATUS[fromHash])) { filter = fromHash; renderTabs(); renderList(); }

  document.querySelectorAll('#order-tabs [data-status]').forEach(tab => tab.addEventListener('click', () => {
    filter = tab.dataset.status;
    history.replaceState(null, '', filter === 'all' ? location.pathname : `#${filter}`);
    renderTabs();
    renderList();
  }));
  $('orders-search').addEventListener('input', (e) => { query = e.target.value; renderList(); });

  // Form komplain / retur
  const disputeModal = $('dispute-modal');
  const closeDispute = () => disputeModal?.classList.remove('active');
  $('dispute-close')?.addEventListener('click', closeDispute);
  $('dispute-cancel')?.addEventListener('click', closeDispute);
  disputeModal?.addEventListener('click', (e) => { if (e.target === disputeModal) closeDispute(); });
  $('dispute-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = $('dispute-submit');
    const evidence = ($('dispute-evidence').value || '').split('\n').map(s => s.trim()).filter(Boolean);
    submit.disabled = true;
    try {
      const res = await fetch(`${BASE_URL}/disputes`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          transaction_id: $('dispute-tx-id').value,
          reason: $('dispute-reason').value,
          description: $('dispute-desc').value,
          evidence,
        }),
      }).then(r => r.json());
      if (res.status === 201) {
        closeDispute();
        await reloadOrders();
        alert('Komplain terkirim. Dana kamu ditahan aman di Escrow sampai admin memutuskan.');
      } else {
        alert(res.message || 'Gagal mengirim komplain.');
      }
    } catch (err) {
      alert('Gagal terhubung ke server.');
    } finally {
      submit.disabled = false;
    }
  });

  // Beli lagi, Lacak Peta, & Konfirmasi Pesanan Diterima
  let leafletMap = null;
  const closeTrackModal = () => $('track-map-modal')?.classList.remove('active');
  $('track-modal-close')?.addEventListener('click', closeTrackModal);
  $('track-map-modal')?.addEventListener('click', (e) => { if (e.target.id === 'track-map-modal') closeTrackModal(); });

  $('orders-list').addEventListener('click', async (e) => {
    const trackBtn = e.target.closest('[data-track]');
    if (trackBtn) {
      const txId = trackBtn.dataset.track;
      const modal = $('track-map-modal');
      if (modal) modal.classList.add('active');
      $('track-meta-box').innerHTML = '<span>Memuat data kurir & peta…</span>';
      $('track-history-list').innerHTML = '';
      try {
        const res = await fetch(`${BASE_URL}/transaction/${encodeURIComponent(txId)}/track`, { headers: authHeaders() }).then(r => r.json());
        const d = res.data || {};
        $('track-meta-box').innerHTML = `
          <div><small style="color:var(--mute);display:block;">Kurir Ekspedisi</small><b>${esc(d.courier_service || 'JNE Reguler')}</b></div>
          <div><small style="color:var(--mute);display:block;">Nomor Resi</small><b style="font-family:monospace;">${esc(d.tracking_number || '-')}</b></div>
          <div><small style="color:var(--mute);display:block;">Posisi Paket Saat Ini</small><b>${esc(d.current_location?.label || 'Gudang Penjual')}</b></div>
        `;
        const hist = d.tracking_history || [];
        $('track-history-list').innerHTML = hist.slice().reverse().map((ev, idx) => `
          <li style="display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:8px;background:${idx === 0 ? 'rgba(16,185,129,0.09)' : 'transparent'};border-left:3px solid ${idx === 0 ? '#10B981' : '#D1D5DB'};">
            <div style="flex:1;">
              <div style="font-weight:700;font-size:13px;">${esc(ev.title)}</div>
              <div style="font-size:12px;color:var(--mute);margin-top:2px;">${esc(ev.description)}</div>
              <div style="font-size:11px;color:var(--mute);margin-top:3px;">${esc(ev.city || '')} · ${fmtDateTime(ev.timestamp)}</div>
            </div>
          </li>
        `).join('');

        // Render Leaflet Map
        if (window.L && d.route_origin && d.route_destination) {
          setTimeout(() => {
            const mapEl = $('order-leaflet-map');
            if (!mapEl) return;
            if (leafletMap) { leafletMap.remove(); leafletMap = null; }
            const orig = [d.route_origin.lat, d.route_origin.lng];
            const dest = [d.route_destination.lat, d.route_destination.lng];
            const curr = d.current_location ? [d.current_location.lat, d.current_location.lng] : orig;
            leafletMap = window.L.map('order-leaflet-map').fitBounds([orig, dest], { padding: [35, 35] });
            window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '&copy; OpenStreetMap'
            }).addTo(leafletMap);
            window.L.polyline([orig, curr, dest], { color: '#111827', weight: 3, dashArray: '6, 6' }).addTo(leafletMap);
            window.L.marker(orig).addTo(leafletMap).bindPopup(`<b>Asal Ruko:</b><br>${esc(d.route_origin.label)}`);
            window.L.marker(dest).addTo(leafletMap).bindPopup(`<b>Tujuan Pembeli:</b><br>${esc(d.route_destination.label)}`);
            window.L.circleMarker(curr, { radius: 9, color: '#059669', fillColor: '#10B981', fillOpacity: 0.9 })
              .addTo(leafletMap)
              .bindPopup(`<b>Posisi Kurir (${esc(d.courier_code || 'JNE')}):</b><br>${esc(d.current_location?.label || '')}`)
              .openPopup();
          }, 120);
        }
      } catch (err) {
        $('track-meta-box').innerHTML = '<span>Gagal memuat informasi pelacakan.</span>';
      }
      return;
    }

    const confirmBtn = e.target.closest('[data-confirm-received]');
    if (confirmBtn) {
      const txId = confirmBtn.dataset.confirmReceived;
      if (!confirm('Konfirmasi bahwa pesanan sudah kamu terima dengan baik? Dana di Escrow Admin akan dicairkan ke Penjual.')) return;
      confirmBtn.disabled = true;
      try {
        const res = await fetch(`${BASE_URL}/transaction/${encodeURIComponent(txId)}/confirm-received`, { method: 'POST', headers: authHeaders() }).then(r => r.json());
        if (res.status === 200) {
          await reloadOrders();
        } else {
          alert(res.message || 'Gagal mengonfirmasi pesanan.');
          confirmBtn.disabled = false;
        }
      } catch (err) {
        alert('Gagal terhubung ke server.');
        confirmBtn.disabled = false;
      }
      return;
    }

    const disputeBtn = e.target.closest('[data-dispute]');
    if (disputeBtn) {
      $('dispute-tx-id').value = disputeBtn.dataset.dispute;
      $('dispute-form').reset();
      $('dispute-tx-id').value = disputeBtn.dataset.dispute;
      $('dispute-modal').classList.add('active');
      return;
    }

    const btn = e.target.closest('[data-again]');
    if (!btn) return;
    const o = orders.find(x => x.tx.id === btn.dataset.again);
    if (!o) return;
    let added = 0;
    o.items.forEach(i => {
      if (!i.product || i.product.stock <= 0) return;
      const labels = String(i.variant || '').split(',').map(x => x.trim()).filter(Boolean);
      const sel = {};
      (i.product.options || []).forEach((g, gi) => {
        const hit = g.values.find(v => v.label === labels[gi]);
        if (hit) sel[g.name] = hit.label;
      });
      const complete = (i.product.options || []).every(g => sel[g.name]);
      if (!complete) return;
      const ok = addToCart(cartItemFor(i.product, sel), i.quantity);
      if (ok) added += 1;
    });
    if (added) window.location.href = 'index.html?cart=1';
  });
}
