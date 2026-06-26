import { BASE_URL, getActiveSession } from "../config/api.js";

// Helper to show alert inside widget
function showCSAlert(message, type) {
  const alertDiv = document.createElement('div');
  alertDiv.style.cssText = `
    padding: 8px 12px;
    margin-bottom: 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.4;
    transition: all 0.3s ease;
  `;
  if (type === 'success') {
    alertDiv.style.background = 'rgba(16, 185, 129, 0.12)';
    alertDiv.style.color = '#059669';
    alertDiv.style.border = '1px solid rgba(16, 185, 129, 0.2)';
  } else {
    alertDiv.style.background = 'rgba(239, 68, 68, 0.1)';
    alertDiv.style.color = '#EF4444';
    alertDiv.style.border = '1px solid rgba(239, 68, 68, 0.2)';
  }
  alertDiv.textContent = message;

  const container = document.getElementById('cs-alert-container');
  if (container) {
    container.prepend(alertDiv);
    setTimeout(() => alertDiv.remove(), 3500);
  }
}

// ─── SELLER CUSTOMER SERVICE WIDGET ──────────────────────────────────────────
export function initSellerCSWidget() {
  const session = getActiveSession();
  if (!session || session.user.role !== 'seller') return;

  // Prevent multiple widgets
  if (document.getElementById('seller-cs-container')) return;

  // 1. Inject Styles
  const style = document.createElement('style');
  style.textContent = `
    #cs-toggle-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--primary);
      color: white;
      border: none;
      box-shadow: 0 4px 16px rgba(59, 130, 246, 0.45);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      transition: transform 0.25s var(--ease), background 0.25s var(--ease);
    }
    #cs-toggle-btn:hover {
      transform: scale(1.08) translateY(-2px);
      background: var(--primary-hover);
    }
    #cs-panel {
      position: fixed;
      bottom: 92px;
      right: 24px;
      width: 380px;
      height: 500px;
      max-width: calc(100vw - 48px);
      max-height: calc(100vh - 120px);
      z-index: 9999;
      display: none;
      flex-direction: column;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: var(--r-xl);
      box-shadow: var(--shadow-xl);
      overflow: hidden;
      font-family: var(--font);
      animation: csFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes csFadeIn {
      from { opacity: 0; transform: translateY(15px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .cs-header {
      background: var(--primary);
      color: white;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .cs-header h3 {
      font-size: 15px;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.2px;
    }
    .cs-close-btn {
      background: transparent;
      border: none;
      color: rgba(255,255,255,0.8);
      font-size: 20px;
      cursor: pointer;
      line-height: 1;
    }
    .cs-close-btn:hover { color: white; }
    
    .chat-messages-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #F8FAFC;
    }
    .chat-message-row {
      display: flex;
      width: 100%;
    }
    .chat-message-row.right {
      justify-content: flex-end;
    }
    .chat-message-row.left {
      justify-content: flex-start;
    }
    .chat-bubble {
      max-width: 80%;
      padding: 10px 14px;
      font-size: 13px;
      line-height: 1.4;
      position: relative;
    }
    .chat-bubble.seller {
      background: var(--primary);
      color: white;
      border-radius: 16px 16px 2px 16px;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
    }
    .chat-bubble.admin {
      background: white;
      color: var(--text-main);
      border: 1px solid var(--border);
      border-radius: 16px 16px 16px 2px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
    }
    .chat-name {
      display: block;
      font-size: 10px;
      font-weight: 700;
      color: var(--primary);
      margin-bottom: 3px;
    }
    .chat-time {
      display: block;
      font-size: 9px;
      color: rgba(0,0,0,0.3);
      text-align: right;
      margin-top: 4px;
    }
    .chat-bubble.seller .chat-time {
      color: rgba(255,255,255,0.7);
    }
    .chat-footer {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      background: white;
      border-top: 1px solid var(--border);
      align-items: center;
    }
    .chat-input {
      flex: 1;
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 8px 16px;
      font-family: var(--font);
      font-size: 13px;
      outline: none;
      background: #F8FAFC;
      transition: all 0.2s;
    }
    .chat-input:focus {
      background: white;
      border-color: var(--primary);
    }
    .chat-send-btn {
      background: var(--primary);
      color: white;
      border: none;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.2s, background 0.2s;
      flex-shrink: 0;
    }
    .chat-send-btn:hover {
      background: var(--primary-hover);
      transform: scale(1.05);
    }
  `;
  document.head.appendChild(style);

  // 2. Inject HTML Container
  const container = document.createElement('div');
  container.id = 'seller-cs-container';
  container.innerHTML = `
    <!-- Floating Chat Button -->
    <button id="cs-toggle-btn" title="Chat Pengaduan CS Seller">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </button>

    <!-- Chat Panel -->
    <div id="cs-panel">
      <div class="cs-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:8px; height:8px; border-radius:50%; background:#10B981; animation: pulse 2s infinite;"></div>
          <h3>Pusat Bantuan CS Seller</h3>
        </div>
        <button class="cs-close-btn" id="cs-panel-close">&times;</button>
      </div>

      <div class="cs-body" style="padding: 0; display: flex; flex-direction: column;">
        <div id="cs-alert-container" style="position: absolute; top: 60px; left: 16px; right: 16px; z-index: 10;"></div>
        
        <!-- Chat History List / Chatroom bubbles -->
        <div id="cs-chat-messages" class="chat-messages-container">
          <p style="text-align:center; color:var(--text-muted); font-size:12px; margin-top:40px;">Memuat percakapan...</p>
        </div>

        <!-- Chat Input Footer -->
        <div class="chat-footer">
          <input type="text" id="cs-chat-text" class="chat-input" placeholder="Tulis pengaduan atau pesan ke admin..." autocomplete="off">
          <button type="button" id="cs-chat-send" class="chat-send-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transform: rotate(45deg); margin-left: -2px; margin-top: 1px;"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  // 3. Event Listeners
  const toggleBtn = document.getElementById('cs-toggle-btn');
  const panel = document.getElementById('cs-panel');
  const closeBtn = document.getElementById('cs-panel-close');
  const chatInput = document.getElementById('cs-chat-text');
  const sendBtn = document.getElementById('cs-chat-send');

  let pollingInterval = null;

  const openPanel = () => {
    panel.style.display = 'flex';
    toggleBtn.style.display = 'none';
    startPolling();
  };

  const closePanel = () => {
    panel.style.display = 'none';
    toggleBtn.style.display = 'flex';
    stopPolling();
  };

  toggleBtn.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);

  // 4. Send Message Logic
  const sendMessage = () => {
    const text = chatInput.value.trim();
    if (!text) return;

    // Send support ticket with Subject: "Pengaduan Seller"
    fetch(`${BASE_URL}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seller_id: session.user.id,
        subject: "Pengaduan Seller",
        message: text
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 201) {
        chatInput.value = '';
        loadChatMessages(); // Refresh chat room instantly
      } else {
        showCSAlert(data.message || "Gagal mengirim pesan.", "error");
      }
    })
    .catch(err => {
      console.error(err);
      showCSAlert("Gagal terhubung ke server.", "error");
    });
  };

  sendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  // 5. Polling and Rendering Logic
  function startPolling() {
    stopPolling();
    loadChatMessages();
    pollingInterval = setInterval(loadChatMessages, 3500);
  }

  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  let lastMsgCount = 0;

  function loadChatMessages() {
    const listContainer = document.getElementById('cs-chat-messages');
    if (!listContainer) return;

    fetch(`${BASE_URL}/tickets?seller_id=${session.user.id}`)
      .then(res => res.json())
      .then(data => {
        const tickets = data.data || [];
        if (tickets.length === 0) {
          listContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:12px; margin-top:40px;">Belum ada pesan. Ketik pesan di bawah untuk memulai pengaduan.</p>';
          return;
        }

        // Sort ascending by created_at to form a chatroom stream
        tickets.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        let html = '';
        tickets.forEach(t => {
          const dateStr = new Date(t.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          
          // Render Seller Question
          html += `
            <div class="chat-message-row right">
              <div class="chat-bubble seller">
                <div>${t.message}</div>
                <span class="chat-time">${dateStr}</span>
              </div>
            </div>
          `;

          // Render Admin Reply (if exists)
          if (t.reply) {
            // Assume reply timestamp is updatedAt
            const replyDateStr = new Date(t.updated_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            html += `
              <div class="chat-message-row left">
                <div class="chat-bubble admin">
                  <span class="chat-name">CS Admin</span>
                  <div>${t.reply}</div>
                  <span class="chat-time">${replyDateStr}</span>
                </div>
              </div>
            `;
          }
        });

        listContainer.innerHTML = html;

        // Autoscroll to bottom if new messages arrived
        const currentCount = tickets.length + tickets.filter(t => t.reply).length;
        if (currentCount > lastMsgCount) {
          lastMsgCount = currentCount;
          listContainer.scrollTop = listContainer.scrollHeight;
        }
      })
      .catch(err => {
        console.error(err);
        // Do not spam alerts if it's passive polling failure, only show error if list is empty
        if (listContainer.children.length <= 1) {
          listContainer.innerHTML = '<p style="text-align:center; color:var(--danger); font-size:12px; margin-top:40px;">Gagal terhubung ke server.</p>';
        }
      });
  }
}

// ─── ADMIN CS TICKETS LIST & REPLY FLOW ──────────────────────────────────────
export function initAdminTickets() {
  const session = getActiveSession();
  if (!session || session.user.role !== 'admin') return;

  loadAdminTicketsTable();

  // Bind Reply Form Submit Listener
  const replyForm = document.getElementById('reply-ticket-form');
  if (replyForm) {
    replyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const ticketId = document.getElementById('reply-ticket-id').value;
      const reply = document.getElementById('reply-ticket-text').value.trim();

      fetch(`${BASE_URL}/ticket/${ticketId}/reply`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply })
      })
      .then(res => res.json())
      .then(result => {
        if (result.status === 200) {
          showAlert("Balasan tiket berhasil dikirim!", "success");
          
          // Close modal
          const modal = document.getElementById('reply-ticket-modal');
          if (modal) modal.classList.remove('active');
          replyForm.reset();

          // Refresh table
          loadAdminTicketsTable();
        } else {
          showAlert(result.message || "Gagal membalas tiket.", "error");
        }
      })
      .catch(err => {
        console.error(err);
        showAlert("Koneksi gagal saat membalas tiket.", "error");
      });
    });
  }

  // Bind Close Reply Modal Buttons
  const closeBtn = document.getElementById('close-reply-modal-btn');
  const cancelBtn = document.getElementById('cancel-reply-modal-btn');
  const modal = document.getElementById('reply-ticket-modal');
  if (closeBtn && modal) closeBtn.addEventListener('click', () => modal.classList.remove('active'));
  if (cancelBtn && modal) cancelBtn.addEventListener('click', () => modal.classList.remove('active'));
}

function loadAdminTicketsTable() {
  const tbody = document.getElementById('tickets-list-tbody');
  if (!tbody) return;

  fetch(`${BASE_URL}/tickets`)
    .then(res => res.json())
    .then(data => {
      const tickets = data.data || [];
      if (tickets.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="padding: 20px 10px; text-align: center; color: var(--text-secondary);">
              Belum ada pengaduan seller masuk.
            </td>
          </tr>
        `;
        return;
      }

      // Sort open tickets to the top, resolved to the bottom. Within groups, sort by CreatedAt desc
      tickets.sort((a, b) => {
        if (a.status === b.status) {
          return new Date(b.created_at) - new Date(a.created_at);
        }
        return a.status === 'open' ? -1 : 1;
      });

      let html = '';
      tickets.forEach(t => {
        const dateStr = new Date(t.created_at).toLocaleDateString('id-ID', { dateStyle: 'short' });
        const statusText = t.status === 'open' ? 'Antri (Open)' : 'Selesai';
        const statusColor = t.status === 'open' ? 'var(--warning)' : 'var(--success)';
        
        const replyText = t.reply ? t.reply : `<span style="color:var(--text-placeholder); font-style:italic;">Belum ada balasan</span>`;

        let actionBtn = '';
        if (t.status === 'open') {
          actionBtn = `<button class="btn btn-primary btn-reply-ticket" 
            data-id="${t.id}" 
            data-seller="${t.seller_name} (${t.seller_id})" 
            data-subject="${t.subject}" 
            data-message="${t.message}" 
            style="padding: 6px 12px; font-size: 12px;">Balas</button>`;
        } else {
          actionBtn = `<button class="btn btn-outline btn-reply-ticket" 
            data-id="${t.id}" 
            data-seller="${t.seller_name} (${t.seller_id})" 
            data-subject="${t.subject}" 
            data-message="${t.message}" 
            data-reply="${t.reply}"
            style="padding: 6px 12px; font-size: 12px; border-color:var(--border);">Ubah Balasan</button>`;
        }

        html += `
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 14px 10px; font-weight: 600;">
              <div>${t.seller_name}</div>
              <div style="font-size:11px; color:var(--text-muted); font-family:monospace;">${t.seller_id}</div>
            </td>
            <td style="padding: 14px 10px; font-weight: 600;">${t.subject}</td>
            <td style="padding: 14px 10px; color: var(--text-secondary); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${t.message}">${t.message}</td>
            <td style="padding: 14px 10px; color: var(--text-secondary); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${t.reply || ''}">${replyText}</td>
            <td style="padding: 14px 10px; font-weight: 700; color: ${statusColor};">${statusText}</td>
            <td style="padding: 14px 10px;">${actionBtn}</td>
          </tr>
        `;
      });
      tbody.innerHTML = html;

      // Bind actions
      tbody.querySelectorAll('.btn-reply-ticket').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const { id, seller, subject, message, reply } = btn.dataset;
          
          document.getElementById('reply-ticket-id').value = id;
          document.getElementById('reply-ticket-seller').textContent = seller;
          document.getElementById('reply-ticket-subject').textContent = subject;
          document.getElementById('reply-ticket-message').textContent = message;
          document.getElementById('reply-ticket-text').value = reply || '';

          const modal = document.getElementById('reply-ticket-modal');
          if (modal) modal.classList.add('active');
        });
      });

    })
    .catch(err => {
      console.error(err);
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 20px 10px; text-align: center; color: var(--danger);">
            Gagal memuat daftar pengaduan.
          </td>
        </tr>
      `;
    });
}
