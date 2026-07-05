import { BASE_URL, getActiveSession } from "../config/api.js";

export function initSellerInboxWidget() {
  const session = getActiveSession();
  if (!session || session.user.role !== 'seller') return;

  if (document.getElementById('seller-inbox-container')) return;

  const style = document.createElement('style');
  style.textContent = `
    #inbox-toggle-btn {
      position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px; border-radius: 50%;
      background: var(--primary); color: white; border: none; box-shadow: 0 4px 16px rgba(59, 130, 246, 0.45);
      cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 9999;
      transition: transform 0.25s, background 0.25s;
    }
    #inbox-toggle-btn:hover { transform: scale(1.08) translateY(-2px); background: var(--primary-hover); }
    #inbox-panel {
      position: fixed; bottom: 92px; right: 24px; width: 380px; height: 500px;
      max-width: calc(100vw - 48px); max-height: calc(100vh - 120px); z-index: 9999;
      display: none; flex-direction: column; background: var(--bg-1);
      border: 1px solid var(--border); border-radius: var(--r-xl); box-shadow: var(--shadow-xl); overflow: hidden;
      font-family: var(--font); animation: fadeIn 0.3s forwards;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(15px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .inbox-header { background: var(--primary); color: white; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; }
    .inbox-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
    .inbox-list-item { padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer; display: flex; flex-direction: column; }
    .inbox-list-item:hover { background: var(--bg-2); }
    .inbox-list-name { font-weight: 700; color: var(--text-main); font-size: 14px; }
    .inbox-list-msg { font-size: 12px; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; margin-top: 4px; }
    #chat-thread { display: none; flex-direction: column; height: 100%; background: var(--bg-1); }
    .thread-header { padding: 12px 16px; background: var(--bg-2); display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--border); cursor: pointer; font-weight: 600; color: var(--text-main); }
    #thread-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .thread-input-area { padding: 12px; border-top: 1px solid var(--border); display: flex; gap: 8px; background: var(--bg-1); }
  `;
  document.head.appendChild(style);

  const container = document.createElement('div');
  container.id = 'seller-inbox-container';
  container.innerHTML = `
    <button id="inbox-toggle-btn">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
    </button>
    <div id="inbox-panel">
      <div id="inbox-list-view" style="display: flex; flex-direction: column; height: 100%;">
        <div class="inbox-header">
          <h3 style="font-size:15px; margin:0;">Inbox Pesan Pembeli</h3>
          <button id="inbox-close-btn" style="background:transparent; border:none; color:white; cursor:pointer;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="inbox-body" id="inbox-list-body">
          <div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Memuat pesan...</div>
        </div>
      </div>

      <div id="chat-thread">
        <div class="thread-header" id="thread-back-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          <span id="thread-buyer-name">Pembeli</span>
        </div>
        <div id="thread-messages"></div>
        <div class="thread-input-area">
          <input type="text" id="thread-input" placeholder="Balas pesan..." style="flex:1; background:var(--bg-2); border:1px solid var(--border); border-radius:20px; padding:8px 12px; color:var(--text-main); font-size:13px; outline:none;">
          <button id="thread-send-btn" style="background:var(--primary); color:white; border:none; border-radius:50%; width:36px; height:36px; cursor:pointer; display:flex; align-items:center; justify-content:center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  const toggleBtn = document.getElementById('inbox-toggle-btn');
  const panel = document.getElementById('inbox-panel');
  const closeBtn = document.getElementById('inbox-close-btn');
  const listView = document.getElementById('inbox-list-view');
  const chatThread = document.getElementById('chat-thread');
  const backBtn = document.getElementById('thread-back-btn');
  const listBody = document.getElementById('inbox-list-body');
  
  const threadMessages = document.getElementById('thread-messages');
  const threadInput = document.getElementById('thread-input');
  const threadSendBtn = document.getElementById('thread-send-btn');
  const threadBuyerName = document.getElementById('thread-buyer-name');

  let pollInterval = null;
  let activeBuyerId = null;
  let currentShopId = session.user.shop_id;

  toggleBtn.addEventListener('click', () => {
    const isVisible = panel.style.display === 'flex';
    if (!isVisible) {
      panel.style.display = 'flex';
      loadInbox();
      pollInterval = setInterval(pollActiveView, 3000);
    } else {
      panel.style.display = 'none';
      if (pollInterval) clearInterval(pollInterval);
    }
  });

  closeBtn.addEventListener('click', () => {
    panel.style.display = 'none';
    if (pollInterval) clearInterval(pollInterval);
  });

  backBtn.addEventListener('click', () => {
    chatThread.style.display = 'none';
    listView.style.display = 'flex';
    activeBuyerId = null;
    loadInbox();
  });

  function pollActiveView() {
    if (activeBuyerId) {
      loadChatHistory(activeBuyerId);
    } else {
      loadInbox();
    }
  }

  async function loadInbox() {
    const s = getActiveSession();
    if (s && s.user && s.user.shop_id) currentShopId = s.user.shop_id;
    if (!currentShopId) return;
    try {
      const res = await fetch(`${BASE_URL}/chat/inbox?shop_id=${currentShopId}`);
      const data = await res.json();
      if (res.ok) {
        if (!data.data || data.data.length === 0) {
          listBody.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Belum ada pesan masuk.</div>';
          return;
        }
        listBody.innerHTML = '';
        data.data.forEach(item => {
          const div = document.createElement('div');
          div.className = 'inbox-list-item';
          const time = new Date(item.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
          
          let avatarHtml = `<div style="width:36px; height:36px; border-radius:50%; background:var(--bg-2); color:var(--text-secondary); display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:16px; border:1px solid var(--border); flex-shrink:0;">${item.buyer_name.charAt(0).toUpperCase()}</div>`;
          if (item.buyer_avatar && item.buyer_avatar.trim() !== '') {
            avatarHtml = `<img src="${item.buyer_avatar}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:1px solid var(--border); flex-shrink:0;">`;
          }

          div.innerHTML = `
            <div style="display:flex; gap:12px; align-items:center;">
              ${avatarHtml}
              <div style="flex:1; overflow:hidden;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <div class="inbox-list-name">${item.buyer_name}</div>
                  <div style="font-size:10px; color:var(--text-muted);">${time}</div>
                </div>
                <div class="inbox-list-msg">${item.last_message}</div>
              </div>
            </div>
          `;
          div.addEventListener('click', () => {
            activeBuyerId = item.buyer_id;
            threadBuyerName.textContent = item.buyer_name;
            listView.style.display = 'none';
            chatThread.style.display = 'flex';
            threadMessages.innerHTML = '<div style="text-align:center; padding:20px; font-size:12px; color:var(--text-muted);">Memuat percakapan...</div>';
            loadChatHistory(activeBuyerId);
          });
          listBody.appendChild(div);
        });
      }
    } catch (e) { console.error(e); }
  }

  async function loadChatHistory(buyerId) {
    const s = getActiveSession();
    if (s && s.user && s.user.shop_id) currentShopId = s.user.shop_id;
    if (!currentShopId) return;
    try {
      const res = await fetch(`${BASE_URL}/chat/history?buyer_id=${buyerId}&shop_id=${currentShopId}`);
      const data = await res.json();
      if (res.ok) {
        threadMessages.innerHTML = '';
        (data.data || []).forEach(msg => {
          const isMe = msg.sender_id === session.user.id;
          const msgDiv = document.createElement('div');
          const timeStr = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
          if (isMe) {
            msgDiv.style = "align-self: flex-end; background: var(--primary); padding: 8px 12px; border-radius: 12px 12px 0 12px; max-width: 80%; font-size: 13px; color: white; line-height: 1.4;";
            msgDiv.innerHTML = `${msg.text}<div style="font-size: 9px; color: rgba(255,255,255,0.7); text-align: right; margin-top: 4px;">${timeStr}</div>`;
          } else {
            msgDiv.style = "align-self: flex-start; background: var(--bg-2); padding: 8px 12px; border-radius: 12px 12px 12px 0; max-width: 80%; font-size: 13px; color: var(--text-main); line-height: 1.4; border: 1px solid var(--border);";
            msgDiv.innerHTML = `${msg.text}<div style="font-size: 9px; color: var(--text-muted); text-align: right; margin-top: 4px;">${timeStr}</div>`;
          }
          threadMessages.appendChild(msgDiv);
        });
        threadMessages.scrollTop = threadMessages.scrollHeight;
      }
    } catch(e) { console.error(e); }
  }

  async function sendReply() {
    const s = getActiveSession();
    if (s && s.user && s.user.shop_id) currentShopId = s.user.shop_id;
    const text = threadInput.value.trim();
    if (!text || !activeBuyerId || !currentShopId) return;

    const payload = {
      sender_id: session.user.id,
      receiver_id: activeBuyerId,
      shop_id: currentShopId,
      text: text
    };

    try {
      const res = await fetch(`${BASE_URL}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        threadInput.value = '';
        loadChatHistory(activeBuyerId);
      }
    } catch (e) { console.error(e); }
  }

  threadSendBtn.addEventListener('click', sendReply);
  threadInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendReply();
  });
}
