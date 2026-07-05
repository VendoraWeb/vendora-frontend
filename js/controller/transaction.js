import { BASE_URL, getActiveSession } from "../config/api.js";
import { loadCatalogProducts }         from "./product.js";

// ─── Alert helper ──────────────────────────────────────────────────────────
function showAlert(message, type) {
  const container = document.getElementById('alert-container') || document.body;
  const div = document.createElement('div');
  div.className = `alert alert-${type}`;
  div.textContent = message;
  container.prepend(div);
  setTimeout(() => div.remove(), 4000);
}

// ─── Cart key per-user (buyer dan seller) ──────────────────────────────────
function getCartKey() {
  const session = getActiveSession();
  if (!session || !session.user || (session.user.role !== 'buyer' && session.user.role !== 'seller')) return null;
  return `vendora_cart_${session.user.id}`;
}

function loadCart() {
  const key = getCartKey();
  if (!key) return [];
  return JSON.parse(localStorage.getItem(key) || '[]');
}

let cart = loadCart();

function saveCart() {
  const key = getCartKey();
  if (!key) return; // admin tidak bisa save cart
  localStorage.setItem(key, JSON.stringify(cart));
}


// ─── Public: init (attaches checkout button) ────────────────────────────────
export function initCart() {
  // Reload cart dari key yang benar sesuai user yang sedang login
  cart = loadCart();
  updateCartUI();

  const checkoutBtn = document.getElementById('checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', executeCheckout);
  }
}

// ─── Public: add item ────────────────────────────────────────────────────────
export function addToCart(product) {
  const session = getActiveSession();
  if (!session || !session.user) {
    showAlert('Silakan login terlebih dahulu untuk belanja.', 'error');
    return false;
  }

  // Hanya buyer dan seller yang bisa tambah ke keranjang
  if (session.user.role !== 'buyer' && session.user.role !== 'seller') {
    showAlert('Role Anda tidak memiliki akses untuk berbelanja.', 'error');
    return false;
  }

  // Jika seller, tidak boleh membeli produk dari toko sendiri
  if (session.user.role === 'seller' && session.user.shop_id) {
    if (product.shopId && product.shopId === session.user.shop_id) {
      showAlert('Anda tidak dapat membeli produk dari toko Anda sendiri.', 'error');
      return false;
    }
  }

  const existing = cart.find(item => item.id === product.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      id:       product.id,
      name:     product.name,
      price:    product.price,
      image:    product.image  || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=120&q=80',
      shopName: product.shopName || '',
      shopId:   product.shopId   || '',
      quantity: 1,
      selected: true
    });
  }
  saveCart();
  updateCartUI();
  return true;
}

// ─── Public: update UI ──────────────────────────────────────────────────────
export async function updateCartUI() {
  const cartItemsEl   = document.getElementById('cart-items');
  const cartEmptyEl   = document.getElementById('cart-empty-state');
  const cartCountEl   = document.getElementById('cart-count');
  const cartPillEl    = document.getElementById('cart-pill-count');
  const cartSubEl     = document.getElementById('cart-subtotal');
  const cartTotalEl   = document.getElementById('cart-total');
  const checkoutBtn   = document.getElementById('checkout-btn');

  // Calculate totals
  let total      = 0;
  let totalItems = 0;
  cart.forEach(item => {
    if (item.selected === undefined) item.selected = true; // default if old data
    if (item.selected) {
      total      += item.price * item.quantity;
      totalItems += item.quantity;
    }
  });

  // Update badge (nav)
  if (cartCountEl) {
    cartCountEl.textContent = totalItems > 99 ? '99+' : totalItems;
    cartCountEl.classList.toggle('visible', totalItems > 0);
  }
  if (cartPillEl) cartPillEl.textContent = `${totalItems} item`;

  // Update totals
  const fmt = n => `Rp ${n.toLocaleString('id-ID')}`;
  if (cartSubEl)   cartSubEl.textContent  = fmt(total);
  if (cartTotalEl) cartTotalEl.textContent = fmt(total);
  if (checkoutBtn) checkoutBtn.disabled   = totalItems === 0;

  // Render items
  if (!cartItemsEl) return;

  if (cart.length === 0) {
    // Show empty state
    if (cartEmptyEl) cartEmptyEl.style.display = '';
    // Clear any old items (keep empty state node)
    Array.from(cartItemsEl.children).forEach(child => {
      if (child.id !== 'cart-empty-state') child.remove();
    });
    return;
  }

  // Hide empty state
  if (cartEmptyEl) cartEmptyEl.style.display = 'none';

  // Build items HTML
  let html = '';
  cart.forEach(item => {
    const itemTotal = item.price * item.quantity;
    const checkedHtml = item.selected ? 'checked' : '';
    html += `
      <div class="cart-item" data-cart-id="${item.id}" style="${!item.selected ? 'opacity: 0.6;' : ''}">
        <input type="checkbox" class="cart-item-checkbox" data-id="${item.id}" ${checkedHtml} style="margin-right: 12px; transform: scale(1.2); accent-color: var(--gold); cursor: pointer;">
        <img class="cart-item-img" src="${item.image}" alt="${item.name}" loading="lazy"
             onerror="this.src='https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=120&q=80'">
        <div class="cart-item-info">
          <div class="cart-item-name" title="${item.name}">${item.name}</div>
          <div class="cart-item-price">
            ${fmt(item.price)} &times; ${item.quantity} =
            <strong>${fmt(itemTotal)}</strong>
          </div>
          <div class="cart-item-qty">
            <button class="qty-btn btn-qty-minus" data-id="${item.id}" type="button">−</button>
            <span class="qty-value">${item.quantity}</span>
            <button class="qty-btn btn-qty-plus"  data-id="${item.id}" type="button">+</button>
          </div>
        </div>
        <button class="cart-item-remove btn-cart-remove" data-id="${item.id}" type="button" title="Hapus">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    `;
  });

  // Replace rendered items (keep cart-empty-state node)
  Array.from(cartItemsEl.children).forEach(child => {
    if (child.id !== 'cart-empty-state') child.remove();
  });
  cartItemsEl.insertAdjacentHTML('afterbegin', html);

  // Checkbox listeners
  cartItemsEl.querySelectorAll('.cart-item-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      const item = cart.find(i => i.id === id);
      if (item) {
        item.selected = e.target.checked;
        saveCart();
        updateCartUI();
      }
    });
  });

  // Qty minus buttons
  cartItemsEl.querySelectorAll('.btn-qty-minus').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = cart.find(i => i.id === id);
      if (!item) return;
      if (item.quantity > 1) { item.quantity--; } else { cart = cart.filter(i => i.id !== id); }
      saveCart();
      updateCartUI();
    });
  });

  // Qty plus buttons
  cartItemsEl.querySelectorAll('.btn-qty-plus').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = cart.find(i => i.id === id);
      if (item) { item.quantity++; saveCart(); updateCartUI(); }
    });
  });

  // Remove buttons
  cartItemsEl.querySelectorAll('.btn-cart-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      cart = cart.filter(i => i.id !== id);
      saveCart();
      updateCartUI();
    });
  });

  // ─── Real-time Stock Validation ──────────────────────────────────────────
  if (cart.length === 0) return;

  try {
    const res = await fetch(`${BASE_URL}/products`);
    const data = await res.json();
    const products = data.data || [];
    const stockMap = {};
    products.forEach(p => stockMap[p.id] = p.stock);

    let hasOutOfStock = false;
    let hasInvalidQuantity = false;

    cart.forEach(item => {
      // Abaikan cek stok real-time untuk item mockup
      if (typeof item.id === 'string' && item.id.startsWith('m')) {
        return;
      }

      const itemEl = cartItemsEl.querySelector(`.cart-item[data-cart-id="${item.id}"]`);
      if (!itemEl) return;

      const stock = stockMap[item.id];
      // Jika produk tidak ada di database (dihapus) atau stoknya 0
      if (stock === undefined || stock === 0) {
        if (item.selected) hasOutOfStock = true;
        itemEl.style.opacity = '0.6';
        itemEl.style.border = '1.5px solid #F87171';
        
        let badge = itemEl.querySelector('.stock-warning-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'stock-warning-badge';
          badge.style = 'background:#EF4444; color:white; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; margin-top:4px; display:inline-block;';
          badge.textContent = 'Stok Habis';
          itemEl.querySelector('.cart-item-info').appendChild(badge);
        }
      } else if (stock < item.quantity) {
        if (item.selected) hasInvalidQuantity = true;
        itemEl.style.border = '1.5px solid #FBBF24';
        
        let badge = itemEl.querySelector('.stock-warning-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'stock-warning-badge';
          badge.style = 'background:#F59E0B; color:white; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; margin-top:4px; display:inline-block;';
          itemEl.querySelector('.cart-item-info').appendChild(badge);
        }
        badge.textContent = `Hanya sisa ${stock}!`;
      } else {
        itemEl.style.opacity = '1';
        itemEl.style.border = '';
        const badge = itemEl.querySelector('.stock-warning-badge');
        if (badge) badge.remove();
      }
    });

    if (checkoutBtn) {
      if (hasOutOfStock) {
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = 'Ada Barang Habis';
      } else if (hasInvalidQuantity) {
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = 'Stok Tidak Cukup';
      } else {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = 'Lanjut ke Pembayaran';
      }
    }

  } catch (err) {
    console.warn('Real-time stock validation failed:', err);
  }
}

// ─── Checkout ────────────────────────────────────────────────────────────────
export async function executeCheckout() {
  const session = getActiveSession();
  if (!session) {
    showAlert("Silakan login terlebih dahulu untuk melanjutkan checkout.", "error");
    setTimeout(() => { window.location.href = 'login.html'; }, 1800);
    return;
  }

  // Buka Checkout Confirmation Modal (sebelumnya snap-modal)
  const selectedCart = cart.filter(item => item.selected);
  if (selectedCart.length === 0) {
    showAlert("Pilih minimal satu barang untuk di-checkout.", "error");
    return;
  }
  
  const totalAmount = selectedCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const snapModal = document.getElementById('snap-modal');
  const snapAmountDisplay = document.getElementById('snap-amount-display');
  const nameInput = document.getElementById('checkout-recipient-name');
  const addressInput = document.getElementById('checkout-address-input');
  
  if (snapModal && snapAmountDisplay) {
    snapAmountDisplay.textContent = 'Rp ' + totalAmount.toLocaleString('id-ID');
    
    if (nameInput) {
      nameInput.value = session.user.name || session.user.email || 'Pembeli';
    }
    if (addressInput) {
      addressInput.value = session.user.address || '';
    }
    
    // Define global snapProcess callback for cart checkout
    window.snapProcess = async (method) => {
      let defaultShopId = '';
      try {
        const shopRes = await fetch(`${BASE_URL}/shops`);
        const shopData = await shopRes.json();
        const appleShop = (shopData.data || []).find(s => s.name === 'Apple');
        if (appleShop) defaultShopId = appleShop.id;
      } catch(e){}

      const payloadItems = selectedCart.map(item => ({ 
        product_id: item.id, 
        shop_id: item.shopId || defaultShopId,
        quantity: item.quantity 
      }));
      
      const recName = nameInput ? nameInput.value.trim() : '';
      const recAddr = addressInput ? addressInput.value.trim() : '';
      
      try {
        const res  = await fetch(`${BASE_URL}/checkout`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ 
            buyer_id: session.user.id, 
            recipient_name: recName,
            shipping_address: recAddr,
            items: payloadItems 
          })
        });
        const data = await res.json();
        
        if (data.status === 201) {
          let methodName = method === 'QRIS' ? 'GoPay/OVO/Dana' : method === 'VA_BCA' ? 'BCA Virtual Account' : method === 'CARD' ? 'Kartu Kredit' : 'Indomaret/Alfamart';
          showAlert(`Pembayaran via ${methodName} Berhasil! Pesanan langsung diteruskan ke Penjual.`, 'success');
          snapModal.classList.remove('active');
          cart = cart.filter(item => !item.selected);
          saveCart(); updateCartUI(); loadCatalogProducts();
          document.dispatchEvent(new CustomEvent('vendora:close-cart'));
        } else {
          showAlert(data.message || "Checkout gagal. Cek kembali stok produk.", "error");
        }
      } catch (err) {
        console.error(err);
        showAlert("Gagal terhubung ke server. Coba lagi.", "error");
      }
    };
    
    snapModal.classList.add('active');
    
    const closeBtn = document.getElementById('snap-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        snapModal.classList.remove('active');
      }, { once: true });
    }
  }
}
