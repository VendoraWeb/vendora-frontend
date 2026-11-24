import { BASE_URL, getActiveSession, authHeaders } from "../config/api.js?v=20261114";
import { esc, fmtDateTime } from "../ui.js?v=20261114";

const notify = (msg, type) => { if (window.showAlert) window.showAlert(msg, type); };

// ─── ADMIN CS TICKETS LIST & REPLY FLOW ──────────────────────────────────────
export function initAdminTickets() {
  const session = getActiveSession();
  if (!session || !session.user || session.user.role !== 'admin') return;

  loadAdminTicketsTable();

  const modal = document.getElementById('reply-ticket-modal');
  const closeModal = () => { if (modal) modal.classList.remove('active'); };

  const replyForm = document.getElementById('reply-ticket-form');
  if (replyForm && !replyForm.dataset.bound) {
    replyForm.dataset.bound = '1';
    replyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ticketId = document.getElementById('reply-ticket-id').value;
      const reply = document.getElementById('reply-ticket-text').value.trim();
      if (!reply) {
        notify('Balasan tidak boleh kosong.', 'error');
        return;
      }

      const submitBtn = replyForm.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const res = await fetch(`${BASE_URL}/ticket/${encodeURIComponent(ticketId)}/reply`, {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ reply })
        });
        const result = await res.json().catch(() => ({}));
        if (res.ok && result.status === 200) {
          notify('Balasan tiket berhasil dikirim.', 'success');
          closeModal();
          replyForm.reset();
          loadAdminTicketsTable();
        } else {
          notify(result.message || 'Gagal membalas tiket.', 'error');
        }
      } catch {
        notify('Koneksi gagal saat membalas tiket.', 'error');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  const closeBtn = document.getElementById('close-reply-modal-btn');
  const cancelBtn = document.getElementById('cancel-reply-modal-btn');
  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = '1';
    closeBtn.addEventListener('click', closeModal);
  }
  if (cancelBtn && !cancelBtn.dataset.bound) {
    cancelBtn.dataset.bound = '1';
    cancelBtn.addEventListener('click', closeModal);
  }
  if (modal && !modal.dataset.bound) {
    modal.dataset.bound = '1';
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
    });
  }
}

function loadAdminTicketsTable() {
  const tbody = document.getElementById('tickets-list-tbody');
  if (!tbody) return;

  fetch(`${BASE_URL}/tickets`, { headers: authHeaders() })
    .then(res => res.json())
    .then(data => {
      const tickets = Array.isArray(data.data) ? data.data : [];
      const openCount = tickets.filter(t => t.status === 'open').length;
      const badge = document.getElementById('sidebar-tickets-badge');
      if (badge) {
        badge.textContent = openCount;
        badge.style.display = openCount > 0 ? 'inline-block' : 'none';
      }

      if (tickets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Belum ada tiket bantuan masuk.</td></tr>';
        return;
      }

      tickets.sort((a, b) => {
        if (a.status === b.status) return new Date(b.created_at) - new Date(a.created_at);
        return a.status === 'open' ? -1 : 1;
      });

      const byId = new Map();
      tbody.innerHTML = tickets.map(t => {
        byId.set(t.id, t);
        const isOpen = t.status === 'open';
        const statusHTML = isOpen
          ? '<span class="v-status v-status--warn">Menunggu</span>'
          : '<span class="v-status v-status--good">Dijawab</span>';
        const replyHTML = t.reply
          ? esc(t.reply)
          : '<span class="muted" style="font-style:italic;">Belum ada balasan</span>';
        const actionBtn = isOpen
          ? `<button type="button" class="btn-sm btn-sm--ink btn-reply-ticket" data-id="${esc(t.id)}">Balas</button>`
          : `<button type="button" class="btn-sm btn-reply-ticket" data-id="${esc(t.id)}">Ubah Balasan</button>`;

        return `
          <tr>
            <td>
              <span class="strong">${esc(t.seller_name || 'Pengguna')}</span>
              <span class="sub">${esc(fmtDateTime(t.created_at))}</span>
            </td>
            <td><span class="strong">${esc(t.subject || '-')}</span></td>
            <td style="max-width:260px;white-space:normal;">${esc(t.message || '')}</td>
            <td style="max-width:220px;white-space:normal;">${replyHTML}</td>
            <td>${statusHTML}</td>
            <td class="actions">${actionBtn}</td>
          </tr>`;
      }).join('');

      tbody.querySelectorAll('.btn-reply-ticket').forEach(btn => {
        btn.addEventListener('click', () => {
          const t = byId.get(btn.dataset.id);
          if (!t) return;
          document.getElementById('reply-ticket-id').value = t.id || '';
          document.getElementById('reply-ticket-seller').textContent = t.seller_name || 'Pengguna';
          document.getElementById('reply-ticket-subject').textContent = t.subject || '-';
          document.getElementById('reply-ticket-message').textContent = t.message || '';
          document.getElementById('reply-ticket-text').value = t.reply || '';

          const modal = document.getElementById('reply-ticket-modal');
          if (modal) modal.classList.add('active');
        });
      });
    })
    .catch(() => {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Gagal memuat daftar tiket bantuan.</td></tr>';
    });
}
