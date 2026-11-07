// ─── Halaman konten: Tentang kami & Pusat bantuan ───────────────────────────
import { BASE_URL, getActiveSession } from "../config/api.js?v=5";
import { esc, fmtDateTime } from "../ui.js?v=2";

const $ = (id) => document.getElementById(id);
const alertMsg = (msg, type) => window.showAlert && window.showAlert(msg, type);

// ── Tentang kami: angka langsung dari katalog ───────────────────────────────
export async function initAboutPage() {
  try {
    const [shops, products] = await Promise.all([
      fetch(`${BASE_URL}/shops`).then(r => r.json()),
      fetch(`${BASE_URL}/products`).then(r => r.json()),
    ]);
    const active = (shops.data || []).filter(s => s.status === 'active').length;
    if ($('ab-shops')) $('ab-shops').textContent = active.toLocaleString('id-ID');
    if ($('ab-products')) $('ab-products').textContent = (products.data || []).length.toLocaleString('id-ID');
  } catch {
    // angka tetap "–" bila server tidak terjangkau
  }
}

// ── Pusat bantuan ───────────────────────────────────────────────────────────
const TOPICS = [
  'Pesanan & pengiriman',
  'Pengembalian & refund',
  'Pembayaran',
  'Akun & keamanan',
  'Berjualan di Vendora',
  'Lainnya',
];
const SECTION_TOPIC = {
  pembayaran: 'Pembayaran', pengiriman: 'Pesanan & pengiriman', pengembalian: 'Pengembalian & refund',
  akun: 'Akun & keamanan', penjual: 'Berjualan di Vendora',
};

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

function initFaqSearch() {
  const input = $('hp-search-input');
  const note = $('hp-search-note');
  const empty = $('hp-empty');
  const sections = [...document.querySelectorAll('.hp-section')];
  const items = [...document.querySelectorAll('.hp-faq details')].map(d => ({ el: d, text: norm(d.textContent) }));
  let timer = null;

  const run = () => {
    const words = norm(input.value).split(/\s+/).filter(w => w.length > 1);
    let hits = 0;
    items.forEach(({ el, text }) => {
      const match = !words.length || words.every(w => text.includes(w));
      el.hidden = !match;
      if (words.length) el.open = match;
      if (match) hits++;
    });
    sections.forEach(sec => { sec.hidden = ![...sec.querySelectorAll('details')].some(d => !d.hidden); });
    if (!words.length) items.forEach(({ el }) => { el.open = false; });
    empty.hidden = !words.length || hits > 0;
    note.textContent = words.length ? (hits ? `${hits} jawaban ditemukan` : '') : '';
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = items.find(i => !i.el.hidden);
      first?.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (e.key === 'Escape') { input.value = ''; run(); }
  });
}

/** Buka bagian sesuai hash (#pengembalian dari footer) dan tandai daftar isi. */
function initSectionLinks() {
  const openFromHash = () => {
    const id = location.hash.slice(1);
    const sec = id && document.getElementById(id);
    if (!sec || !sec.classList.contains('hp-section')) return;
    const first = sec.querySelector('details');
    if (first) first.open = true;
    requestAnimationFrame(() => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  openFromHash();
  window.addEventListener('hashchange', openFromHash);

  const links = [...document.querySelectorAll('.hp-toc a')];
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      links.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === `#${en.target.id}`));
    });
  }, { rootMargin: '-30% 0px -60% 0px' });
  document.querySelectorAll('.hp-section, #hubungi').forEach(s => io.observe(s));

  // Tautan "Hubungi kami" di dalam sebuah topik → pilih topik itu di formulir
  document.querySelectorAll('.hp-section a[href="#hubungi"]').forEach(a => a.addEventListener('click', () => {
    const topic = SECTION_TOPIC[a.closest('.hp-section').id];
    const sel = $('hp-topic');
    if (topic && sel) sel.value = topic;
    setTimeout(() => $('hp-message')?.focus({ preventScroll: true }), 400);
  }));
}

async function loadMyTickets(user) {
  const box = $('hp-tickets');
  if (!box) return;
  try {
    const res = await fetch(`${BASE_URL}/tickets?seller_id=${encodeURIComponent(user.id)}`);
    const data = await res.json();
    const list = (data.data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <h3>Pertanyaanmu</h3>
      ${list.map(t => `
        <article class="hp-ticket">
          <div class="hp-ticket-head">
            <div><b>${esc(t.subject)}</b><time datetime="${esc(t.created_at)}">${esc(fmtDateTime(t.created_at))}</time></div>
            ${t.reply ? '<span class="v-status v-status--good">Dijawab</span>' : '<span class="v-status v-status--warn">Menunggu jawaban</span>'}
          </div>
          <p>${esc(t.message)}</p>
          ${t.reply ? `<div class="hp-reply"><small>Jawaban tim Vendora</small>${esc(t.reply)}</div>` : ''}
        </article>`).join('')}`;
  } catch {
    box.innerHTML = '';
  }
}

function renderContact() {
  const body = $('hp-contact-body');
  if (!body) return;
  const session = getActiveSession();
  if (!session || !session.user) {
    body.innerHTML = `
      <div class="hp-locked">
        <span>Masuk dulu supaya kami bisa membalas pertanyaanmu dan mengaitkannya dengan pesananmu.</span>
        <a href="login.html" class="btn-ink btn-ink--sm">Masuk</a>
      </div>`;
    return;
  }
  const user = session.user;
  body.innerHTML = `
    <form class="hp-form" id="hp-form" novalidate>
      <div>
        <label for="hp-topic">Topik</label>
        <select id="hp-topic" required>${TOPICS.map(t => `<option>${esc(t)}</option>`).join('')}</select>
      </div>
      <div>
        <label for="hp-order">Nomor pesanan <span class="label-opt">(opsional)</span></label>
        <input type="text" id="hp-order" placeholder="Contoh: #A1B2C3D4" autocomplete="off" maxlength="40">
      </div>
      <div>
        <label for="hp-message">Pesan</label>
        <textarea id="hp-message" required maxlength="2000" placeholder="Ceritakan kendalamu. Untuk pengembalian, sebutkan barang yang bermasalah dan kondisinya."></textarea>
        <span class="hp-form-hint">Dikirim sebagai ${esc(user.name || user.email || 'akunmu')}.</span>
      </div>
      <button type="submit" class="btn-ink">Kirim pertanyaan</button>
    </form>
    <div class="hp-tickets" id="hp-tickets"></div>`;

  // Topik mengikuti bagian yang dibuka dari footer (#pengembalian → Pengembalian & refund)
  const fromHash = SECTION_TOPIC[location.hash.slice(1)];
  if (fromHash) $('hp-topic').value = fromHash;

  $('hp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = $('hp-topic').value;
    const order = $('hp-order').value.trim();
    const message = $('hp-message').value.trim();
    if (message.length < 10) {
      alertMsg('Tulis pesan minimal 10 karakter supaya kami paham kendalamu.', 'error');
      $('hp-message').focus();
      return;
    }
    const btn = e.submitter || $('hp-form').querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Mengirim…';
    try {
      const res = await fetch(`${BASE_URL}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seller_id: user.id, subject: order ? `${topic} · ${order}` : topic, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Gagal mengirim pertanyaan');
      $('hp-message').value = '';
      $('hp-order').value = '';
      alertMsg('Pertanyaan terkirim. Jawaban tim Vendora akan muncul di bawah formulir.', 'success');
      loadMyTickets(user);
    } catch (err) {
      alertMsg(err.message || 'Koneksi bermasalah. Coba lagi.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Kirim pertanyaan';
    }
  });
  loadMyTickets(user);
}

export function initHelpPage() {
  initFaqSearch();
  renderContact();
  initSectionLinks();
  $('hp-open-chat')?.addEventListener('click', () => {
    const fab = document.querySelector('.cdock-fab');
    if (fab) { if (fab.getAttribute('aria-expanded') !== 'true') fab.click(); return; }
    alertMsg('Masuk dulu untuk chat dengan penjual.', 'error');
  });
}
