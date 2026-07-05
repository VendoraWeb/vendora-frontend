import { BASE_URL, getActiveSession } from "../config/api.js";

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

// -----------------------------------------------------------------
// SELLER DASHBOARD LOGIC
// -----------------------------------------------------------------
export function initSellerDashboard() {
  const session = getActiveSession();
  if (!session || session.user.role !== 'seller') {
    document.getElementById('seller-auth-callout').style.display = 'block';
    document.getElementById('active-shop-dashboard').style.display = 'none';
    document.getElementById('rent-shop-section').style.display = 'none';
    return;
  }

  // Display user details
  document.getElementById('user-display').innerHTML = `Seller: ${session.user.name}`;
  document.getElementById('seller-auth-callout').style.display = 'none';

  // Check if seller already has an active shop lease
  checkSellerShop(session.user.id);

  // Setup form listener for renting a shop space (requires virtual payment first)
  const rentForm = document.getElementById('rent-shop-form');
  const shopNameInput = document.getElementById('shop-name');
  if (shopNameInput && session.user.shop_name) {
    shopNameInput.value = session.user.shop_name;
  }
  
  if (rentForm) {
    rentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('shop-name').value;
      const description = document.getElementById('shop-desc').value;
      const rentalDays = parseInt(document.getElementById('rental-days').value, 10);
      const totalCost = rentalDays * 15000;

      // Show Snap Modal
      const snapModal = document.getElementById('snap-modal');
      const snapAmountDisplay = document.getElementById('snap-amount-display');

      if (snapModal && snapAmountDisplay) {
        snapAmountDisplay.textContent = 'Rp ' + totalCost.toLocaleString('id-ID');
        snapModal.classList.add('active');

        // Close button handler
        const closeBtn = document.getElementById('snap-close-btn');
        if (closeBtn) {
          closeBtn.onclick = () => {
            snapModal.classList.remove('active');
            showAlert("Pembayaran biaya sewa ruko dibatalkan.", "error");
          };
        }

        // Define global snapProcess callback for shop space lease
        window.snapProcess = (method) => {
          showAlert(`Pembayaran sewa ruko via ${method} Sukses! Memproses aktivasi ruko...`, "success");
          snapModal.classList.remove('active');

          fetch(`${BASE_URL}/shop/rent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              description,
              owner_id: session.user.id,
              rental_days: rentalDays
            })
          })
          .then(res => res.json())
          .then(data => {
            if (data.status === 201) {
              showAlert("Ruko berhasil disewa! Membuka Seller Hub...", "success");
              setTimeout(() => {
                checkSellerShop(session.user.id);
                // Sinkronisasi session lokal baru agar menu profil menyadari has_shop = true
                const updatedSession = getActiveSession();
                if (updatedSession && updatedSession.user) {
                  updatedSession.user.has_shop = true;
                  updatedSession.user.shop_id = data.data.id;
                  localStorage.setItem('vendora_session', JSON.stringify(updatedSession));
                }
              }, 1500);
            } else {
              showAlert(data.message || "Gagal menyewa ruko.", "error");
            }
          })
          .catch(err => {
            console.error(err);
            showAlert("Gagal melakukan transaksi sewa ruko. Koneksi error.", "error");
          });
        };
      } else {
        // Fallback if modal elements aren't found
        showAlert("Jalur pembayaran aman tidak termuat.", "error");
      }
    });
  }

  // Setup form listener for adding products
  const addProductForm = document.getElementById('add-product-form');
  if (addProductForm) {
    addProductForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const shopId = localStorage.getItem('vendora_active_shop_id');
      if (!shopId) {
        showAlert("Active shop space not loaded. Reload page.", "error");
        return;
      }

      const name = document.getElementById('prod-name').value;
      const price = parseFloat(document.getElementById('prod-price').value);
      const stock = parseInt(document.getElementById('prod-stock').value, 10);
      const image = document.getElementById('prod-image').value;
      const description = document.getElementById('prod-desc').value;

      fetch(`${BASE_URL}/product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_id: shopId,
          name,
          price,
          stock,
          images: [image],
          description
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.status === 201) {
          showAlert("Product listed successfully!", "success");
          addProductForm.reset();
          loadSellerProducts(shopId);
        } else {
          showAlert(data.message || "Failed to list product.", "error");
        }
      })
      .catch(err => {
        console.error(err);
        showAlert("Failed to add product. Connection error.", "error");
      });
    });
  }

  // Edit Product Modal close/cancel bindings
  const editModal = document.getElementById('edit-product-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const cancelModalBtn = document.getElementById('cancel-modal-btn');
  
  const hideModal = () => {
    if (editModal) editModal.classList.remove('active');
  };

  if (closeModalBtn) closeModalBtn.addEventListener('click', hideModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', hideModal);

  // Edit Product Form submit handler
  const editProductForm = document.getElementById('edit-product-form');
  if (editProductForm) {
    editProductForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const id = document.getElementById('edit-prod-id').value;
      const name = document.getElementById('edit-prod-name').value;
      const price = parseFloat(document.getElementById('edit-prod-price').value);
      const stock = parseInt(document.getElementById('edit-prod-stock').value, 10);
      const image = document.getElementById('edit-prod-image').value;
      const description = document.getElementById('edit-prod-desc').value;
      const shopId = localStorage.getItem('vendora_active_shop_id');

      fetch(`${BASE_URL}/product/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          price,
          stock,
          images: [image],
          description
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.status === 200) {
          showAlert("Product updated successfully!", "success");
          hideModal();
          if (shopId) loadSellerProducts(shopId);
        } else {
          showAlert(data.message || "Failed to update product.", "error");
        }
      })
      .catch(err => {
        console.error(err);
        showAlert("Failed to update product. Connection error.", "error");
      });
    });
  }
}

function checkSellerShop(ownerId) {
  fetch(`${BASE_URL}/shops`)
    .then(res => res.json())
    .then(data => {
      const shops = data.data || [];
      const myShop = shops.find(s => s.owner_id === ownerId);

      if (myShop) {
        // Save active shop id
        localStorage.setItem('vendora_active_shop_id', myShop.id);
        
        // Sinkronisasi status ruko user di session localStorage
        const session = getActiveSession();
        if (session && session.user) {
          session.user.has_shop = true;
          session.user.shop_id = myShop.id;
          localStorage.setItem('vendora_session', JSON.stringify(session));
        }
        
        document.getElementById('rent-shop-section').style.display = 'none';
        document.getElementById('active-shop-dashboard').style.display = 'block';

        // Render dashboard values
        document.getElementById('dashboard-shop-name').innerHTML = myShop.name;
        document.getElementById('dashboard-shop-desc').innerHTML = myShop.description || 'No description provided.';
        document.getElementById('shop-status-badge').innerHTML = myShop.status.toUpperCase();
        
        const expiresDate = new Date(myShop.rental_expires);
        document.getElementById('shop-expires-badge').innerHTML = expiresDate.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
        document.getElementById('shop-price-badge').innerHTML = `Rp ${myShop.rental_price.toLocaleString()}`;

        // Countdown hari sewa
        const daysLeft = Math.ceil((expiresDate - new Date()) / (1000 * 60 * 60 * 24));
        const daysEl = document.getElementById('seller-stat-days');
        if (daysEl) {
          daysEl.textContent = daysLeft > 0 ? `${daysLeft} hari` : 'Sudah habis';
          daysEl.style.color = daysLeft <= 7 ? 'var(--danger)' : '#FBBF24';
        }

        const statusBadge = document.getElementById('shop-status-badge');
        const suspendedBanner = document.getElementById('shop-suspended-banner');
        const addProductForm = document.getElementById('add-product-form');

        if (myShop.status === 'active') {
          statusBadge.style.color = 'var(--accent)';
          if (suspendedBanner) suspendedBanner.style.display = 'none';
          if (addProductForm) {
            Array.from(addProductForm.elements).forEach(el => el.disabled = false);
          }
        } else {
          statusBadge.style.color = 'var(--danger)';
          if (suspendedBanner) suspendedBanner.style.display = 'flex';
          if (addProductForm) {
            Array.from(addProductForm.elements).forEach(el => el.disabled = true);
          }
        }

        // Load catalog
        loadSellerProducts(myShop.id);

        // Load seller stats (order masuk + pendapatan)
        loadSellerStats(myShop.id);

        // Bind tombol perpanjang sewa
        const renewBtn = document.getElementById('btn-renew-shop');
        if (renewBtn) {
          renewBtn.addEventListener('click', () => {
            const renewDays = parseInt(document.getElementById('renew-days').value, 10);
            const totalCost = renewDays * 15000;

            const snapModal = document.getElementById('snap-modal');
            const snapAmountDisplay = document.getElementById('snap-amount-display');

            if (snapModal && snapAmountDisplay) {
              snapAmountDisplay.textContent = 'Rp ' + totalCost.toLocaleString('id-ID');
              snapModal.classList.add('active');

              const closeBtn = document.getElementById('snap-close-btn');
              if (closeBtn) {
                closeBtn.onclick = () => {
                  snapModal.classList.remove('active');
                  showAlert('Perpanjangan sewa dibatalkan.', 'error');
                };
              }

              window.snapProcess = (method) => {
                showAlert(`Pembayaran via ${method} sukses! Memproses perpanjangan...`, 'success');
                snapModal.classList.remove('active');

                fetch(`${BASE_URL}/shop/${myShop.id}/renew`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ rental_days: renewDays })
                })
                .then(res => res.json())
                .then(result => {
                  if (result.status === 200) {
                    showAlert(`Ruko berhasil diperpanjang! Berlaku hingga ${result.data.new_expiry}.`, 'success');
                    setTimeout(() => checkSellerShop(ownerId), 1500);
                  } else {
                    showAlert(result.message || 'Gagal perpanjang sewa.', 'error');
                  }
                })
                .catch(() => showAlert('Koneksi error saat perpanjang sewa.', 'error'));
              };
            }
          });
        }

      } else {
        document.getElementById('rent-shop-section').style.display = 'block';
        document.getElementById('active-shop-dashboard').style.display = 'none';
      }
    })
    .catch(err => {
      console.error(err);
      showAlert("Error loading store information. Backend offline?", "error");
    });
}

function loadSellerStats(shopId) {
  // Step 1: Ambil semua produk milik shop ini dulu
  fetch(`${BASE_URL}/products?shop_id=${shopId}`)
    .then(res => res.json())
    .then(prodData => {
      const myProducts = prodData.data || [];
      // Buat Set dari product IDs milik shop ini untuk lookup cepat
      const myProductIds = new Set(myProducts.map(p => p.id));

      // Step 2: Ambil transaksi yang mengandung produk dari shop ini
      return fetch(`${BASE_URL}/transactions?shop_id=${shopId}`)
        .then(res => res.json())
        .then(txData => {
          const txs = txData.data || [];

          let revenue = 0;
          let orderCount = 0;
          const tbody = document.getElementById('seller-orders-tbody');

          const statusColors = {
            'pending_payment': '#FBBF24', 'paid': '#60A5FA',
            'success': '#34D399', 'cancelled': '#F87171'
          };
          const statusLabels = {
            'pending_payment': 'Pending', 'paid': 'Paid',
            'success': 'Selesai', 'cancelled': 'Dibatalkan'
          };

          let html = '';

          // Sort transactions by date descending
          txs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

          txs.forEach(t => {
            // Filter hanya item yang milik shop ini
            const myItems = (t.items || []).filter(i => myProductIds.has(i.product_id));
            if (myItems.length === 0) return; // transaksi ini tidak ada produk kita

            // Hitung revenue hanya dari item milik shop ini
            const myRevenue = myItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
            revenue += myRevenue;
            orderCount++;

            const date = t.created_at ? new Date(t.created_at).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '-';
            const itemsText = myItems.map(i => `${i.name} ×${i.quantity}`).join(', ');
            const sc = statusColors[t.status] || '#94A3B8';
            const sl = statusLabels[t.status] || t.status;
            const shortId = t.id ? t.id.toString().slice(-8).toUpperCase() : '-';

            const recName = t.recipient_name || 'Pembeli';
            const recAddr = t.shipping_address || '-';

            html += `
              <tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:12px 10px;font-family:monospace;font-size:12px;color:var(--text-secondary);">...${shortId}</td>
                <td style="padding:12px 10px;">
                  <div style="font-weight:600; color:var(--text-main); font-size:13px;">${recName}</div>
                  <div style="font-size:11px; color:var(--text-secondary); max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${recAddr}">${recAddr}</div>
                </td>
                <td style="padding:12px 10px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${itemsText}">${itemsText}</td>
                <td style="padding:12px 10px;font-weight:700;">Rp ${myRevenue.toLocaleString('id-ID')}</td>
                <td style="padding:12px 10px;"><span style="padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;background:${sc}22;color:${sc};">${sl}</span></td>
                <td style="padding:12px 10px;color:var(--text-secondary);">${date}</td>
                <td style="padding:12px 10px;">
                  <select onchange="window.updateOrderStatus('${t.id}', this.value)" style="padding:4px 8px; border-radius:4px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-main); font-size:12px; cursor:pointer;">
                    <option value="pending" ${t.status === 'pending_payment' ? 'selected' : ''}>Menunggu</option>
                    <option value="paid" ${t.status === 'paid' ? 'selected' : ''}>Diproses</option>
                    <option value="success" ${t.status === 'success' ? 'selected' : ''}>Selesai</option>
                    <option value="cancelled" ${t.status === 'cancelled' ? 'selected' : ''}>Dibatalkan</option>
                  </select>
                </td>
              </tr>`;
          });

          // Update stat cards
          const orderEl = document.getElementById('seller-stat-orders');
          const revenueEl = document.getElementById('seller-stat-revenue');
          if (orderEl) orderEl.textContent = orderCount;
          if (revenueEl) revenueEl.textContent = `Rp ${revenue.toLocaleString('id-ID')}`;

          // Populate order history table
          if (tbody) {
            tbody.innerHTML = html || `<tr><td colspan="7" style="padding:20px 10px;text-align:center;color:var(--text-secondary);">Belum ada order masuk.</td></tr>`;
          }
        });
    })
    .catch(() => {
      const tbody = document.getElementById('seller-orders-tbody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="padding:20px 10px;text-align:center;color:var(--danger);">Gagal memuat order.</td></tr>`;
    });
}




function loadSellerProducts(shopId) {
  const listContainer = document.getElementById('seller-products');
  if (!listContainer) return;

  fetch(`${BASE_URL}/products?shop_id=${shopId}`)
    .then(res => res.json())
    .then(data => {
      const products = data.data || [];

      // Update stat card
      const statProd = document.getElementById('seller-stat-products');
      if (statProd) statProd.textContent = products.length;

      if (products.length === 0) {
        setInner('seller-products', `
          <div class="glass-panel" style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 40px 10px;">
            Your product catalog is empty. List your first product above!
          </div>
        `);
        return;
      }

      let html = '';
      products.forEach(p => {
        const image = (p.images && p.images[0]) ? p.images[0] : 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800';
        html += `
          <div class="glass-panel product-card">
            <div class="product-img-wrapper">
              <img class="product-img" src="${image}" alt="${p.name}" loading="lazy">
            </div>
            <div class="product-body">
              <div class="product-name">${p.name}</div>
              <div class="product-desc">${p.description || ''}</div>
              <div class="stock-badge">Stock: <strong>${p.stock}</strong></div>
              <div class="product-footer">
                <span class="product-price">Rp ${p.price.toLocaleString()}</span>
                <div style="display: flex; gap: 8px;">
                  <button class="btn btn-outline btn-edit-prod" 
                    data-id="${p.id}" 
                    data-name="${p.name}" 
                    data-price="${p.price}" 
                    data-stock="${p.stock}" 
                    data-desc="${p.description || ''}" 
                    data-image="${image}" 
                    style="padding: 6px 12px; font-size: 12px;">Edit</button>
                  <button class="btn btn-danger btn-delete-prod" data-id="${p.id}" style="padding: 6px 12px; font-size: 12px;">Delete</button>
                </div>
              </div>
            </div>
          </div>
        `;
      });
      listContainer.innerHTML = html;

      // Add Edit modal trigger listeners
      document.querySelectorAll('.btn-edit-prod').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          const name = e.currentTarget.getAttribute('data-name');
          const price = e.currentTarget.getAttribute('data-price');
          const stock = e.currentTarget.getAttribute('data-stock');
          const desc = e.currentTarget.getAttribute('data-desc');
          const image = e.currentTarget.getAttribute('data-image');

          // Populate inputs
          document.getElementById('edit-prod-id').value = id;
          document.getElementById('edit-prod-name').value = name;
          document.getElementById('edit-prod-price').value = price;
          document.getElementById('edit-prod-stock').value = stock;
          document.getElementById('edit-prod-desc').value = desc;
          document.getElementById('edit-prod-image').value = image;

          // Open modal
          const modal = document.getElementById('edit-product-modal');
          if (modal) modal.classList.add('active');
        });
      });

      // Add delete product listeners
      document.querySelectorAll('.btn-delete-prod').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const prodId = e.target.getAttribute('data-id');
          if (confirm("Delete this product from your shop?")) {
            fetch(`${BASE_URL}/product/${prodId}`, {
              method: 'DELETE'
            })
            .then(res => res.json())
            .then(resData => {
              if (resData.status === 200) {
                showAlert("Product removed from catalog.", "success");
                loadSellerProducts(shopId);
              } else {
                showAlert(resData.message || "Failed to delete product.", "error");
              }
            })
            .catch(err => {
              console.error(err);
              showAlert("Delete action failed. Connection error.", "error");
            });
          }
        });
      });
    });
}

// -----------------------------------------------------------------
// ADMIN DASHBOARD LOGIC
// -----------------------------------------------------------------
export function initAdminDashboard() {
  const session = getActiveSession();
  if (!session || session.user.role !== 'admin') {
    document.getElementById('admin-auth-callout').style.display = 'block';
    document.getElementById('admin-dashboard-section').style.display = 'none';
    return;
  }

  document.getElementById('admin-auth-callout').style.display = 'none';
  document.getElementById('admin-dashboard-section').style.display = 'block';

  // Fetch admin dashboards metrics and shops lists
  loadAdminEcosystem();

  // Load new panels
  loadAdminTransactions('');
  loadAdminUsers('');

  // Filter: Transaksi by status
  const txFilter = document.getElementById('tx-filter-status');
  if (txFilter) {
    txFilter.addEventListener('change', () => loadAdminTransactions(txFilter.value));
  }

  // Filter: User by role
  const userFilter = document.getElementById('user-filter-role');
  if (userFilter) {
    userFilter.addEventListener('change', () => loadAdminUsers(userFilter.value));
  }
}

function loadAdminTransactions(statusFilter) {
  const tbody = document.getElementById('tx-list-tbody');
  const countBadge = document.getElementById('tx-count-badge');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="padding:20px 10px;text-align:center;color:var(--text-secondary);">Memuat...</td></tr>`;

  fetch(`${BASE_URL}/transactions`)
    .then(res => res.json())
    .then(data => {
      let txs = data.data || [];

      // Filter by status if selected
      if (statusFilter) {
        txs = txs.filter(t => t.status === statusFilter);
      }

      if (countBadge) countBadge.textContent = `${txs.length} transaksi`;

      if (txs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:20px 10px;text-align:center;color:var(--text-secondary);">Tidak ada transaksi ditemukan.</td></tr>`;
        return;
      }

      // Sort descending by date
      txs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      const statusColors = {
        'pending_payment': '#FBBF24',
        'paid': '#60A5FA',
        'success': '#34D399',
        'cancelled': '#F87171'
      };
      const statusLabels = {
        'pending_payment': 'Pending',
        'paid': 'Paid',
        'success': 'Success',
        'cancelled': 'Cancelled'
      };

      let html = '';
      txs.forEach(t => {
        const date = t.created_at ? new Date(t.created_at).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) : '-';
        const itemSummary = (t.items || []).map(i => `${i.name} ×${i.quantity}`).join(', ') || '-';
        const statusColor = statusColors[t.status] || '#94A3B8';
        const statusLabel = statusLabels[t.status] || t.status;
        const shortId = t.id ? t.id.toString().slice(-8).toUpperCase() : '-';
        const shortBuyer = t.buyer_id ? t.buyer_id.toString().slice(-8) : '-';

        html += `
          <tr style="border-bottom:1px solid var(--border-color);">
            <td style="padding:12px 10px; font-family:monospace; font-size:12px; color:var(--text-secondary);">...${shortId}</td>
            <td style="padding:12px 10px; font-family:monospace; font-size:12px; color:var(--text-secondary);">...${shortBuyer}</td>
            <td style="padding:12px 10px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-secondary);" title="${itemSummary}">${itemSummary}</td>
            <td style="padding:12px 10px; font-weight:700;">Rp ${t.total_amount.toLocaleString('id-ID')}</td>
            <td style="padding:12px 10px;">
              <span style="padding:3px 10px; border-radius:20px; font-size:12px; font-weight:700; background:${statusColor}22; color:${statusColor};">${statusLabel}</span>
            </td>
            <td style="padding:12px 10px; color:var(--text-secondary);">${date}</td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    })
    .catch(err => {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="6" style="padding:20px 10px;text-align:center;color:var(--danger);">Gagal memuat transaksi.</td></tr>`;
    });
}

function loadAdminUsers(roleFilter) {
  const tbody = document.getElementById('users-list-tbody');
  const countBadge = document.getElementById('user-count-badge');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="padding:20px 10px;text-align:center;color:var(--text-secondary);">Memuat...</td></tr>`;

  const url = roleFilter ? `${BASE_URL}/users?role=${roleFilter}` : `${BASE_URL}/users`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      const users = data.data || [];

      if (countBadge) countBadge.textContent = `${users.length} user`;

      if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:20px 10px;text-align:center;color:var(--text-secondary);">Tidak ada user ditemukan.</td></tr>`;
        return;
      }

      const roleColors = { admin: '#F472B6', seller: '#60A5FA', buyer: '#34D399' };

      let html = '';
      users.forEach(u => {
        const joinDate = u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) : '-';
        const roleColor = roleColors[u.role] || '#94A3B8';
        const isBanned = u.banned === true;
        const statusBadge = isBanned
          ? `<span style="padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;background:rgba(248,113,113,0.15);color:#F87171;">Banned</span>`
          : `<span style="padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;background:rgba(52,211,153,0.15);color:#34D399;">Aktif</span>`;
        const actionBtn = isBanned
          ? `<button class="btn btn-accent btn-ban-user" data-id="${u.id}" data-banned="false" style="padding:5px 12px;font-size:12px;">Unban</button>`
          : `<button class="btn btn-outline btn-ban-user" data-id="${u.id}" data-banned="true" style="padding:5px 12px;font-size:12px;color:var(--danger);border-color:rgba(239,68,68,0.4);">Ban</button>`;

        // Don't show ban button for admins
        const actionCell = u.role === 'admin' ? `<span style="color:var(--text-secondary);font-size:12px;">—</span>` : actionBtn;

        html += `
          <tr style="border-bottom:1px solid var(--border-color);">
            <td style="padding:12px 10px; font-weight:600;">${u.name || '-'}</td>
            <td style="padding:12px 10px; color:var(--text-secondary); font-size:12px;">${u.email || '-'}</td>
            <td style="padding:12px 10px;">
              <span style="padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;background:${roleColor}22;color:${roleColor};">${u.role}</span>
            </td>
            <td style="padding:12px 10px;">${statusBadge}</td>
            <td style="padding:12px 10px; color:var(--text-secondary);">${joinDate}</td>
            <td style="padding:12px 10px;">${actionCell}</td>
          </tr>
        `;
      });
      tbody.innerHTML = html;

      // Bind ban/unban buttons
      document.querySelectorAll('.btn-ban-user').forEach(btn => {
        btn.addEventListener('click', e => {
          const userId = e.currentTarget.getAttribute('data-id');
          const shouldBan = e.currentTarget.getAttribute('data-banned') === 'true';
          const confirmMsg = shouldBan
            ? 'Ban user ini? Mereka tidak bisa login.'
            : 'Unban user ini?';

          if (!confirm(confirmMsg)) return;

          fetch(`${BASE_URL}/user/${userId}/ban`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ banned: shouldBan })
          })
          .then(res => res.json())
          .then(result => {
            if (result.status === 200) {
              showAlert(shouldBan ? 'User berhasil di-ban.' : 'User berhasil di-unban.', 'success');
              loadAdminUsers(document.getElementById('user-filter-role')?.value || '');
            } else {
              showAlert(result.message || 'Gagal update status user.', 'error');
            }
          })
          .catch(err => {
            console.error(err);
            showAlert('Koneksi error saat update status user.', 'error');
          });
        });
      });
    })
    .catch(err => {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="6" style="padding:20px 10px;text-align:center;color:var(--danger);">Gagal memuat data user.</td></tr>`;
    });
}


function loadAdminEcosystem() {
  Promise.all([
    fetch(`${BASE_URL}/shops`).then(res => res.json()),
    fetch(`${BASE_URL}/transactions`).then(res => res.json())
  ])
  .then(([shopRes, txRes]) => {
    const shops = shopRes.data || [];
    const transactions = txRes.data || [];

    // Calculate metrics
    const statShops = document.getElementById('stat-shops');
    const statTransactions = document.getElementById('stat-transactions');
    if (statShops) statShops.innerHTML = shops.length;
    if (statTransactions) statTransactions.innerHTML = transactions.length;

    let salesTotal = 0;
    transactions.forEach(t => {
      salesTotal += t.total_amount;
    });

    let rentalTotal = 0;
    shops.forEach(s => {
      rentalTotal += s.rental_price;
    });

    const statRental = document.getElementById('stat-rental-revenue');
    const statSales = document.getElementById('stat-sales-volume');
    if (statRental) statRental.innerHTML = `Rp ${rentalTotal.toLocaleString('id-ID')}`;
    if (statSales) statSales.innerHTML = `Rp ${salesTotal.toLocaleString('id-ID')}`;

    // Populate Shops Lease table
    const tbody = document.getElementById('shops-list-tbody');
    if (!tbody) return;

    if (shops.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="padding: 20px 10px; text-align: center; color: var(--text-secondary);">
            No rented shop space leases active.
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    shops.forEach(s => {
      const expiry = new Date(s.rental_expires).toLocaleDateString();
      const statusText = s.status === 'active' ? 'Active' : 'Suspended';
      const statusColor = s.status === 'active' ? 'var(--accent)' : 'var(--danger)';
      const statusBtn = s.status === 'active' 
        ? `<button class="btn btn-outline btn-toggle-status" data-id="${s.id}" data-status="suspended" style="padding: 6px 10px; font-size: 12px; color: var(--danger); border-color: rgba(239, 68, 68, 0.4);">Suspend</button>`
        : `<button class="btn btn-accent btn-toggle-status" data-id="${s.id}" data-status="active" style="padding: 6px 10px; font-size: 12px;">Activate</button>`;
      
      const actionBtn = `<div style="display:flex; gap:6px;">${statusBtn}<button class="btn btn-danger btn-delete-shop" onclick="window.deleteShop('${s.id}')" style="padding: 6px 10px; font-size: 12px;">Hapus</button></div>`;

      html += `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: 14px 10px; font-weight: 600;">${s.name}</td>
          <td style="padding: 14px 10px; color: var(--text-secondary); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${s.description || '-'}</td>
          <td style="padding: 14px 10px; font-family: monospace; font-size: 12px;">${s.owner_id}</td>
          <td style="padding: 14px 10px;">Rp ${s.rental_price.toLocaleString()}</td>
          <td style="padding: 14px 10px;">${expiry}</td>
          <td style="padding: 14px 10px; font-weight: 700; color: ${statusColor};">${statusText}</td>
          <td style="padding: 14px 10px;">${actionBtn}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;

    // Table Actions (using event delegation for reliability)
    tbody.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('.btn-toggle-status');
      const deleteBtn = e.target.closest('.btn-delete-shop');

      if (toggleBtn) {
        const shopId = toggleBtn.getAttribute('data-id');
        const nextStatus = toggleBtn.getAttribute('data-status');

        fetch(`${BASE_URL}/shop/${shopId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus })
        })
        .then(res => res.json())
        .then(result => {
          if (result.status === 200) {
            showAlert(`Shop status updated to ${nextStatus}.`, "success");
            loadAdminEcosystem();
          } else {
            showAlert(result.message || "Failed to update shop.", "error");
          }
        })
        .catch(err => {
          console.error(err);
          showAlert("Connection error changing status.", "error");
        });
      }
    });
  })
  .catch(err => {
    console.error(err);
    showAlert("Failed to load administration dataset.", "error");
  });
}

window.deleteShop = function(shopId) {
  fetch(`${BASE_URL}/shop/${shopId}`, {
    method: 'DELETE',
  })
  .then(res => res.json())
  .then(result => {
    if (result.status === 200) {
      showAlert("Ruko berhasil dihapus permanen.", "success");
      const tbody = document.getElementById('shops-list-tbody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="padding: 20px; text-align: center;">Memuat ulang...</td></tr>`;
      loadAdminEcosystem();
    } else {
      showAlert(result.message || "Gagal menghapus ruko.", "error");
    }
  })
  .catch(err => {
    console.error(err);
    showAlert("Koneksi error saat menghapus ruko.", "error");
  });
};

