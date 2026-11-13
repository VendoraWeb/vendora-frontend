// ─── Vendora UI helpers (dipakai admin, penjual, dan pembeli) ─────────────────

/** Escape teks dari pengguna sebelum dimasukkan ke innerHTML. */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export const fmtRp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;

export function fmtRpShort(n) {
  const v = Number(n || 0);
  if (v >= 1e9) return `Rp ${(v / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  if (v >= 1e6) return `Rp ${(v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (v >= 1e3) return `Rp ${(v / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`;
  return `Rp ${v}`;
}

export const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  : '–';

export const fmtDateTime = (d) => d
  ? new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '–';

export const shortId = (id) => id ? `#${id.toString().slice(-6).toUpperCase()}` : '–';

/**
 * Status pesanan. Database berisi: pending | paid | shipped | success | cancelled
 * (data lama: pending_payment, processing). "shipped" ditambahkan dari frontend —
 * endpoint PUT /transaction/:id/status menyimpan status apa pun yang dikirim.
 * Urutan objek = urutan alur pesanan.
 */
export const TX_STATUS = {
  pending:   { label: 'Menunggu',   long: 'Menunggu konfirmasi penjual', tone: 'warn' },
  paid:      { label: 'Dikemas',    long: 'Sedang dikemas penjual',      tone: '' },
  shipped:   { label: 'Dikirim',    long: 'Dalam pengiriman',            tone: '' },
  success:   { label: 'Selesai',    long: 'Pesanan selesai',             tone: 'good' },
  disputed:  { label: 'Komplain',   long: 'Dalam sengketa — dana ditahan', tone: 'warn' },
  cancelled: { label: 'Dibatalkan', long: 'Pesanan dibatalkan',          tone: 'bad' },
};

/** Satukan variasi status lama ke 4 status utama. */
export function normStatus(s) {
  if (s === 'pending_payment') return 'pending';
  if (s === 'processing') return 'paid';
  return s;
}

export function txStatusHTML(status, { long = false } = {}) {
  const s = TX_STATUS[normStatus(status)] || { label: status || '–', long: status || '–', tone: '' };
  return `<span class="v-status${s.tone ? ` v-status--${s.tone}` : ''}">${esc(long ? s.long : s.label)}</span>`;
}
