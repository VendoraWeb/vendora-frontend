import { BASE_URL, getActiveSession, authHeaders } from "../config/api.js?v=105";
import { esc } from "../ui.js?v=102";
import { loadCatalogProducts }         from "./product.js?v=146";

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
  try {
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    // Produk contoh lama (m1, m2, …) sudah diganti produk asli toko Apple
    return Array.isArray(items) ? items.filter(i => i && !/^m\d+$/.test(String(i.id))) : [];
  } catch (e) {
    return [];
  }
}

let cart = loadCart();

function saveCart() {
  const key = getCartKey();
  if (!key) return; // admin tidak bisa save cart
  try {
    localStorage.setItem(key, JSON.stringify(cart));
  } catch (e) {}
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

// Kunci baris keranjang: ID produk + variasi
export function cartKeyOf(item) {
  if (item.key) return item.key;
  return item.variant ? `${item.id}::${item.variant}` : item.id;
}

// ─── Public: add item ────────────────────────────────────────────────────────
export function addToCart(product, qty = 1) {
  qty = Math.max(1, parseInt(qty, 10) || 1);
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

  // Variasi berbeda (mis. Burgundy 256 GB vs Silver 512 GB) = baris keranjang berbeda
  const key = cartKeyOf(product);
  const existing = cart.find(item => cartKeyOf(item) === key);
  if (existing) {
    existing.quantity += qty;
    existing.selected = true;
  } else {
    cart.push({
      key,
      id:       product.id,
      name:     product.name,
      variant:  product.variant || '',
      options:  product.options || null,
      price:    product.price,
      image:    product.image  || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=120&q=80',
      shopName: product.shopName || '',
      shopId:   product.shopId   || '',
      quantity: qty,
      selected: true
    });
  }
  saveCart();
  updateCartUI();
  return true;
}

// ─── Public: beli sekarang (checkout hanya barang ini) ──────────────────────
export async function buyNow(product, qty = 1) {
  if (!addToCart(product, qty)) return false;
  // Seperti "Beli Sekarang" di marketplace: hanya barang ini yang dicheckout,
  // barang lain di keranjang tetap tersimpan (tidak terpilih).
  const key = cartKeyOf(product);
  cart.forEach(item => { item.selected = cartKeyOf(item) === key; });
  saveCart();
  updateCartUI();
  await executeCheckout();
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
      <div class="cart-item${item.selected ? '' : ' is-unselected'}" data-cart-id="${esc(cartKeyOf(item))}">
        <input type="checkbox" class="cart-item-checkbox" data-id="${esc(cartKeyOf(item))}" ${checkedHtml} aria-label="Pilih ${esc(item.name)} untuk checkout">
        <img class="cart-item-img" src="${esc(item.image)}" alt="" loading="lazy"
             onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=120&q=80'">
        <div class="cart-item-info">
          <div class="cart-item-name" title="${esc(item.name)}">${esc(item.name)}</div>
          ${item.variant ? `<div class="cart-item-variant">Variasi: ${esc(item.variant)}</div>` : ''}
          ${item.shopName ? `<div class="cart-item-shop">${esc(item.shopName)}</div>` : ''}
          <div class="cart-item-row">
            <div class="cart-item-qty" role="group" aria-label="Jumlah">
              <button class="qty-btn btn-qty-minus" data-id="${esc(cartKeyOf(item))}" type="button" aria-label="Kurangi">−</button>
              <span class="qty-value">${item.quantity}</span>
              <button class="qty-btn btn-qty-plus"  data-id="${esc(cartKeyOf(item))}" type="button" aria-label="Tambah">+</button>
            </div>
            <div class="cart-item-price"><strong>${fmt(itemTotal)}</strong></div>
          </div>
        </div>
        <button class="cart-item-remove btn-cart-remove" data-id="${esc(cartKeyOf(item))}" type="button" title="Hapus" aria-label="Hapus ${esc(item.name)}">
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
      const item = cart.find(i => cartKeyOf(i) === id);
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
      const item = cart.find(i => cartKeyOf(i) === id);
      if (!item) return;
      if (item.quantity > 1) { item.quantity--; } else { cart = cart.filter(i => cartKeyOf(i) !== id); }
      saveCart();
      updateCartUI();
    });
  });

  // Qty plus buttons
  cartItemsEl.querySelectorAll('.btn-qty-plus').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = cart.find(i => cartKeyOf(i) === id);
      if (item) { item.quantity++; saveCart(); updateCartUI(); }
    });
  });

  // Remove buttons
  cartItemsEl.querySelectorAll('.btn-cart-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      cart = cart.filter(i => cartKeyOf(i) !== id);
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
      const itemEl = cartItemsEl.querySelector(`.cart-item[data-cart-id="${CSS.escape(cartKeyOf(item))}"]`);
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

    // Ringkasan barang yang dipilih
    const itemsEl = document.getElementById('checkout-items');
    if (itemsEl) {
      itemsEl.innerHTML = selectedCart.map(item => `
        <li>
          <img src="${esc(item.image)}" alt="" onerror="this.style.visibility='hidden'">
          <div><b>${esc(item.name)}</b>${item.variant ? `<small>Variasi: ${esc(item.variant)}</small>` : ''}<small>${item.quantity} × Rp ${Number(item.price).toLocaleString('id-ID')}</small></div>
          <span>Rp ${(item.price * item.quantity).toLocaleString('id-ID')}</span>
        </li>`).join('');
    }
    const subEl = document.getElementById('checkout-subtotal');
    if (subEl) subEl.textContent = 'Rp ' + totalAmount.toLocaleString('id-ID');

    const courierSelect = document.getElementById('checkout-courier-select');
    const shipCostEl = document.getElementById('checkout-shipping-cost');
    const refreshGrandTotal = () => {
      const opt = courierSelect ? courierSelect.options[courierSelect.selectedIndex] : null;
      const shipCost = opt ? (parseFloat(opt.dataset.cost || '18000') || 18000) : 18000;
      if (shipCostEl) shipCostEl.textContent = 'Rp ' + shipCost.toLocaleString('id-ID');
      snapAmountDisplay.textContent = 'Rp ' + (totalAmount + shipCost).toLocaleString('id-ID');
    };
    if (courierSelect) {
      courierSelect.onchange = refreshGrandTotal;
      refreshGrandTotal();
    }
    
    // Define global snapProcess callback for cart checkout
    window.snapProcess = async (method) => {
      const recName = nameInput ? nameInput.value.trim() : '';
      const recAddr = addressInput ? addressInput.value.trim() : '';
      const chosenCourier = courierSelect ? courierSelect.value : 'JNE';
      if (!recName || !recAddr) {
        showAlert('Lengkapi nama penerima dan alamat pengiriman dulu.', 'error');
        (recName ? addressInput : nameInput)?.focus();
        return;
      }
      const payloadItems = selectedCart.map(item => ({
        product_id: item.id,
        shop_id: item.shopId || '',
        quantity: item.quantity,
        ...(item.options ? { options: item.options } : {}),
      }));
      
      
      try {
        const res  = await fetch(`${BASE_URL}/checkout`, {
          method:  'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body:    JSON.stringify({ 
            buyer_id: session.user.id, 
            recipient_name: recName,
            shipping_address: recAddr,
            courier_code: chosenCourier,
            payment_method: method || 'QRIS',
            items: payloadItems 
          })
        });
        const data = await res.json();
        
        if (data.status === 201) {
          const tx = data.data || {};
          let methodName = method === 'QRIS' ? 'GoPay/OVO/Dana' : method === 'VA_BCA' ? 'BCA Virtual Account' : method === 'CARD' ? 'Kartu Kredit' : 'Indomaret/Alfamart';
          showAlert(`Pembayaran via ${methodName} terverifikasi! Dana diamankan di Escrow Admin · Resi ${tx.tracking_number || chosenCourier}.`, 'success');
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
