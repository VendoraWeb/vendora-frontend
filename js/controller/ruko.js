// ─── Sewa ruko (seller.html): sewa baru & perpanjangan ──────────────────────
import { BASE_URL, updateSessionUser } from "../config/api.js?v=20261114";
import { fmtRp, fmtDate } from "../ui.js?v=20261114";

const $id = (id) => document.getElementById(id);
const alertMsg = (msg, type) => window.showAlert && window.showAlert(msg, type);

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Permintaan gagal');
  return data.data;
}

/** Ruko milik pengguna yang sedang masuk, atau null. */
export async function loadMyShop() {
  try { return await api('/shop/mine'); } catch { return null; }
}

// ── Pembayaran simulasi (sewa baru & perpanjangan) ──
export function openPayment(amount, title, onPaid) {
  const modal = $id('snap-modal');
  const amountEl = $id('snap-amount-display');
  if (!modal || !amountEl) { alertMsg('Jalur pembayaran tidak termuat. Muat ulang halaman.', 'error'); return; }
  const titleEl = $id('snap-title');
  if (titleEl) titleEl.textContent = title || 'Pembayaran';
  amountEl.textContent = fmtRp(amount);
  modal.classList.add('active');
  const closeBtn = $id('snap-close-btn');
  if (closeBtn) closeBtn.onclick = () => { modal.classList.remove('active'); alertMsg('Pembayaran dibatalkan.', 'error'); };
  window.snapProcess = async (method) => {
    const ok = await onPaid(method);
    if (ok !== false) modal.classList.remove('active');
  };
}

const daysLeft = (iso) => Math.ceil((new Date(iso) - new Date()) / 86400000);

/** Kartu "Sewa ruko": masa berlaku, total dibayar, dan perpanjangan. */
export function renderLeaseCard(shop, { onChange }) {
  const el = $id('lease-card');
  if (!el) return;
  const left = daysLeft(shop.rental_expires);

  el.innerHTML = `
    <div class="card-head">
      <div><h2 class="card-title">Sewa ruko</h2><p class="card-sub">Rp 15.000 per hari. Produkmu tampil di katalog selama masa sewa berjalan.</p></div>
    </div>
    <dl class="info-rows">
      <div><dt>Berlaku sampai</dt><dd>${fmtDate(shop.rental_expires)} <span class="v-status v-status--${left < 0 ? 'bad' : left <= 7 ? 'warn' : 'good'}">${left < 0 ? `Lewat ${-left} hari` : `Sisa ${left} hari`}</span></dd></div>
      <div><dt>Total sewa dibayar</dt><dd>${fmtRp(shop.rental_price || 0)}</dd></div>
    </dl>
    <div class="renew-box">
      <label for="renew-days">Perpanjang sewa</label>
      <div class="renew-row">
        <select id="renew-days">
          <option value="30">30 hari</option><option value="90">90 hari</option><option value="365">365 hari</option>
        </select>
        <button id="btn-renew-shop" type="button" class="btn-ink">Perpanjang</button>
      </div>
      <p class="renew-total">Total bayar <b id="renew-total">${fmtRp(15000 * 30)}</b></p>
    </div>`;

  const days = () => parseInt($id('renew-days').value, 10);
  $id('renew-days').addEventListener('change', () => { $id('renew-total').textContent = fmtRp(15000 * days()); });
  $id('btn-renew-shop').addEventListener('click', async () => {
    let quote;
    try { quote = await api(`/rent/quote?days=${days()}`); } catch (e) { alertMsg(e.message, 'error'); return; }
    openPayment(quote.total, `Perpanjang sewa ${quote.days} hari`, async () => {
      try {
        await api(`/shop/${shop.id}/renew`, { method: 'PUT', body: { rental_days: quote.days } });
        alertMsg(`Sewa diperpanjang ${quote.days} hari.`, 'success');
        onChange();
        return true;
      } catch (e) { alertMsg(e.message, 'error'); return false; }
    });
  });
}

/** Formulir sewa ruko baru (penjual yang belum punya ruko). */
export function initRentOnboarding({ onDone }) {
  const form = $id('rent-shop-form');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';
  let quote = null;
  const daysEl = () => parseInt((form.querySelector('input[name="rent-plan"]:checked') || {}).value || '30', 10);

  const updateQuote = async () => {
    const total = $id('rent-total');
    try {
      quote = await api(`/rent/quote?days=${daysEl()}`);
      total.textContent = fmtRp(quote.total);
      form.querySelectorAll('input[name="rent-plan"]').forEach(r => {
        const small = r.closest('label').querySelector('small');
        if (small) small.textContent = fmtRp(quote.daily_rate * parseInt(r.value, 10));
      });
    } catch (e) { total.textContent = '–'; alertMsg(e.message, 'error'); }
  };
  updateQuote();
  form.querySelectorAll('input[name="rent-plan"]').forEach(r => r.addEventListener('change', updateQuote));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $id('shop-name').value.trim();
    const description = $id('shop-desc').value.trim();
    if (!name || !description) { alertMsg('Isi nama dan deskripsi toko dulu.', 'error'); return; }
    if (!quote) { alertMsg('Harga sewa belum termuat. Coba lagi.', 'error'); return; }
    openPayment(quote.total, `Sewa ruko ${daysEl()} hari`, async (method) => {
      try {
        const r = await api('/shop/rent', { method: 'POST', body: { name, description, rental_days: daysEl() } });
        updateSessionUser({ has_shop: true, shop_id: r.shop.id, shop_name: r.shop.name });
        alertMsg(`Pembayaran via ${method} berhasil. Ruko menunggu verifikasi admin.`, 'success');
        onDone();
        return true;
      } catch (err) { alertMsg(err.message, 'error'); return false; }
    });
  });
}
