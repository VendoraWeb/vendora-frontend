import { getValue, setInner } from "https://cdn.jsdelivr.net/gh/jscroot/element@0.1.5/croot.js";
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
  setInner('user-display', `Seller: ${session.user.name}`);
  document.getElementById('seller-auth-callout').style.display = 'none';

  // Check if seller already has an active shop lease
  checkSellerShop(session.user.id);

  // Setup form listener for renting a shop space
  const rentForm = document.getElementById('rent-shop-form');
  if (rentForm) {
    rentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = getValue('shop-name');
      const description = getValue('shop-desc');
      const rentalDays = parseInt(getValue('rental-days'), 10);

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
          showAlert("Shop space successfully leased! Setting up ruko.", "success");
          setTimeout(() => checkSellerShop(session.user.id), 1500);
        } else {
          showAlert(data.message || "Failed to lease shop space.", "error");
        }
      })
      .catch(err => {
        console.error(err);
        showAlert("Failed to lease shop. Connection error.", "error");
      });
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

      const name = getValue('prod-name');
      const price = parseFloat(getValue('prod-price'));
      const stock = parseInt(getValue('prod-stock'), 10);
      const image = getValue('prod-image');
      const description = getValue('prod-desc');

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
      const name = getValue('edit-prod-name');
      const price = parseFloat(getValue('edit-prod-price'));
      const stock = parseInt(getValue('edit-prod-stock'), 10);
      const image = getValue('edit-prod-image');
      const description = getValue('edit-prod-desc');
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
        
        document.getElementById('rent-shop-section').style.display = 'none';
        document.getElementById('active-shop-dashboard').style.display = 'block';

        // Render dashboard values
        setInner('dashboard-shop-name', myShop.name);
        setInner('dashboard-shop-desc', myShop.description || 'No description provided.');
        setInner('shop-status-badge', myShop.status.toUpperCase());
        
        const expiresDate = new Date(myShop.rental_expires);
        setInner('shop-expires-badge', expiresDate.toLocaleDateString());
        setInner('shop-price-badge', `Rp ${myShop.rental_price.toLocaleString()}`);

        const statusBadge = document.getElementById('shop-status-badge');
        if (myShop.status === 'active') {
          statusBadge.style.color = 'var(--accent)';
        } else {
          statusBadge.style.color = 'var(--danger)';
        }

        // Load catalog
        loadSellerProducts(myShop.id);
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

function loadSellerProducts(shopId) {
  const listContainer = document.getElementById('seller-products');
  if (!listContainer) return;

  fetch(`${BASE_URL}/products?shop_id=${shopId}`)
    .then(res => res.json())
    .then(data => {
      const products = data.data || [];
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
    setInner('stat-shops', shops.length);
    setInner('stat-transactions', transactions.length);

    let salesTotal = 0;
    transactions.forEach(t => {
      // Sum total orders
      salesTotal += t.total_amount;
    });

    let rentalTotal = 0;
    shops.forEach(s => {
      rentalTotal += s.rental_price;
    });

    setInner('stat-revenue', `Rp ${(salesTotal + rentalTotal).toLocaleString()}`);

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
      const actionBtn = s.status === 'active' 
        ? `<button class="btn btn-outline btn-toggle-status" data-id="${s.id}" data-status="suspended" style="padding: 6px 10px; font-size: 12px; color: var(--danger); border-color: rgba(239, 68, 68, 0.4);">Suspend</button>`
        : `<button class="btn btn-accent btn-toggle-status" data-id="${s.id}" data-status="active" style="padding: 6px 10px; font-size: 12px;">Activate</button>`;

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

    // Table Actions
    document.querySelectorAll('.btn-toggle-status').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const shopId = e.currentTarget.getAttribute('data-id');
        const nextStatus = e.currentTarget.getAttribute('data-status');

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
      });
    });
  })
  .catch(err => {
    console.error(err);
    showAlert("Failed to load administration dataset.", "error");
  });
}
