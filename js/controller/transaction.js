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

// ─── Cart state (localStorage persisted) ────────────────────────────────────
let cart = JSON.parse(localStorage.getItem('vendora_cart') || '[]');

function saveCart() {
  localStorage.setItem('vendora_cart', JSON.stringify(cart));
}

// ─── Public: init (attaches checkout button) ────────────────────────────────
export function initCart() {
  updateCartUI();

  const checkoutBtn = document.getElementById('checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', executeCheckout);
  }
}

// ─── Public: add item ────────────────────────────────────────────────────────
export function addToCart(product) {
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
      quantity: 1
    });
  }
  saveCart();
  updateCartUI();
}

// ─── Public: update UI ──────────────────────────────────────────────────────
export function updateCartUI() {
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
    total      += item.price * item.quantity;
    totalItems += item.quantity;
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
    html += `
      <div class="cart-item" data-cart-id="${item.id}">
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
}

// ─── Checkout ────────────────────────────────────────────────────────────────
async function executeCheckout() {
  const session = getActiveSession();
  if (!session) {
    showAlert("Silakan login terlebih dahulu untuk melanjutkan checkout.", "error");
    setTimeout(() => { window.location.href = 'login.html'; }, 1800);
    return;
  }

  const checkoutBtn = document.getElementById('checkout-btn');
  if (checkoutBtn) { checkoutBtn.disabled = true; checkoutBtn.textContent = 'Memproses...'; }

  const payloadItems = cart.map(item => ({ product_id: item.id, quantity: item.quantity }));

  try {
    const res  = await fetch(`${BASE_URL}/checkout`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ buyer_id: session.user.id, items: payloadItems })
    });
    const data = await res.json();

    if (data.status === 201) {
      // Tampilkan Snap Payment Mockup
      const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const snapModal = document.getElementById('snap-modal');
      const snapAmountDisplay = document.getElementById('snap-amount-display');
      
      if(snapModal && snapAmountDisplay) {
        snapAmountDisplay.textContent = 'Rp ' + totalAmount.toLocaleString('id-ID');
        snapModal.classList.add('active');
        
        const closeBtn = document.getElementById('snap-close-btn');
        if(closeBtn) {
          closeBtn.addEventListener('click', () => {
            snapModal.classList.remove('active');
            cart = []; saveCart(); updateCartUI(); loadCatalogProducts();
            document.dispatchEvent(new CustomEvent('vendora:close-cart'));
          }, { once: true });
        }
        
        if (!window.snapProcess) {
          window.snapProcess = function(method) {
            showAlert('Pembayaran ' + method + ' Berhasil diproses!', 'success');
            snapModal.classList.remove('active');
            cart = []; saveCart(); updateCartUI(); loadCatalogProducts();
            document.dispatchEvent(new CustomEvent('vendora:close-cart'));
          };
        }
      } else {
        cart = []; saveCart(); updateCartUI(); loadCatalogProducts();
        document.dispatchEvent(new CustomEvent('vendora:close-cart'));
      }
    } else {
      showAlert(data.message || "Checkout gagal. Cek kembali stok produk.", "error");
    }
  } catch (err) {
    console.error(err);
    showAlert("Gagal terhubung ke server. Coba lagi.", "error");
  } finally {
    const checkoutBtn2 = document.getElementById('checkout-btn');
    if (checkoutBtn2) { checkoutBtn2.disabled = false; checkoutBtn2.textContent = 'Lanjut ke Pembayaran'; }
  }
}
