import { BASE_URL } from "../config/api.js";
import { addToCart, updateCartUI, executeCheckout } from "./transaction.js?v=6";

// ─── Alert helper ──────────────────────────────────────────────────────────
function showAlert(message, type) {
  const container = document.getElementById('alert-container');
  if (!container) return;
  const div = document.createElement('div');
  div.className = `alert alert-${type}`;
  div.textContent = message;
  container.prepend(div);
  setTimeout(() => div.remove(), 3500);
}

// ─── Shop cache (avoids repeated fetches) ────────────────────────────────────
let shopCache = {};
export let shopDetailCache = {};

async function getShopName(shopId) {
  if (!shopId) return '';
  if (shopCache[shopId]) return shopCache[shopId];
  try {
    const res  = await fetch(`${BASE_URL}/shops`);
    const data = await res.json();
    (data.data || []).forEach(s => { 
      shopCache[s.id] = s.name; 
      shopDetailCache[s.id] = s;
    });
    return shopCache[shopId] || '';
  } catch { return ''; }
}

// ─── Build stock badge HTML ───────────────────────────────────────────────────
function stockBadgeHTML(stock) {
  if (stock === 0) return '<span class="badge badge-red">Habis</span>';
  if (stock <= 5)  return `<span class="badge badge-yellow">Sisa ${stock}</span>`;
  return `<span class="badge badge-primary">Tersedia</span>`;
}

// ─── Render a single product card ─────────────────────────────────────────────
function renderCard(p, shopName) {
  const image    = (p.images && p.images[0]) ? p.images[0]
    : 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80';
  const inStock  = p.stock > 0;
  const priceStr = `Rp ${Number(p.price).toLocaleString('id-ID')}`;
  const stockStr = p.stock > 0 ? `Stok: ${p.stock}` : 'Stok habis';

  return `
    <div class="product-card" data-product-id="${p.id}">
      <div class="product-img-wrapper">
        <img class="product-img"
             src="${image}"
             alt="${p.name}"
             loading="lazy"
             onerror="this.src='https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80'">
        <div class="product-stock-overlay">${stockBadgeHTML(p.stock)}</div>
      </div>
      <div class="product-body">
        ${shopName ? `
          <div class="product-shop-tag shop-clickable" data-shop-id="${p.shop_id || ''}" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 20px; transition: all 0.25s ease; margin-bottom: 8px; width: fit-content;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2.5" style="flex-shrink: 0;">
               <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
               <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span style="color: var(--text-secondary); font-weight: 600; font-size: 11.5px; letter-spacing: 0.5px;">${shopName}</span>
          </div>` : ''}
        <div class="product-name">${p.name}</div>
        <div class="product-price">${priceStr}</div>
        <div class="product-stock-text">${stockStr}</div>
        <div class="product-actions" style="display: flex; gap: 8px; margin-top: 12px; width: 100%;">
          <button
            class="btn-add-cart"
            data-id="${p.id}"
            data-name="${p.name}"
            data-price="${p.price}"
            data-image="${image}"
            data-shop="${shopName || ''}"
            data-shop-id="${p.shop_id || ''}"
            ${inStock ? '' : 'disabled'}
            type="button"
            style="margin-top: 0; flex: 1; padding: 10px 4px; font-size: 11.5px; border-radius: 12px; justify-content: center; gap: 4px; font-family: 'Manrope', sans-serif;"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/>
            </svg>
            ${inStock ? 'Keranjang' : 'Stok Habis'}
          </button>
          <button
            class="btn-buy-now"
            data-id="${p.id}"
            data-name="${p.name}"
            data-price="${p.price}"
            data-image="${image}"
            data-shop="${shopName || ''}"
            data-shop-id="${p.shop_id || ''}"
            ${inStock ? '' : 'disabled'}
            type="button"
            style="flex: 1; padding: 10px 4px; background: ${inStock ? 'var(--button-primary)' : 'var(--bg-secondary)'}; color: ${inStock ? 'white' : 'var(--text-light)'}; border: 1.5px solid ${inStock ? 'var(--button-primary)' : 'var(--border)'}; border-radius: 12px; font-family: 'Manrope', sans-serif; font-size: 11.5px; font-weight: 600; cursor: ${inStock ? 'pointer' : 'not-allowed'}; pointer-events: ${inStock ? 'auto' : 'none'}; transition: all var(--dur-fast) var(--ease); display: flex; align-items: center; justify-content: center; gap: 4px;"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Beli Sekarang
          </button>
        </div>
      </div>
    </div>
  `;
}

// ─── Load and render all catalog products ────────────────────────────────────
export async function loadCatalogProducts(filter = 'all', shopQuery = null) {
  const grid = document.getElementById('product-list');
  if (!grid) return;

  // Loading state
  grid.innerHTML = Array(4).fill(0).map(() => `
    <div class="product-card" style="min-height:300px;">
      <div style="width:100%;aspect-ratio:1/1;background:var(--surface-2);animation:pulse 2s infinite;"></div>
      <div style="padding:16px;">
        <div style="height:14px;width:60%;background:var(--surface-2);margin-bottom:8px;border-radius:4px;"></div>
        <div style="height:20px;width:40%;background:var(--surface-2);border-radius:4px;"></div>
      </div>
    </div>
  `).join('');

  try {
    const res  = await fetch(`${BASE_URL}/products`);
    const data = await res.json();
    let dbProducts = data.data || [];

    // Fetch Apple shop ID to attribute mockup transactions to Apple Seller Hub
    let appleShopId = '';
    try {
      const shopRes = await fetch(`${BASE_URL}/shops`);
      const shopData = await shopRes.json();
      const appleShop = (shopData.data || []).find(s => s.name === 'Apple');
      if (appleShop) appleShopId = appleShop.id;
    } catch (e) {
      console.warn('Failed to fetch Apple shop ID', e);
    }

    // Fallback/Mockup products matching the mockup screenshot exactly (Apple)
    const mockProducts = [
      { id: 'm1', name: 'iPhone 15 Pro Max', price: 23999000, stock: 12, shop_name: 'Apple', shop_id: appleShopId, description: 'Titanium. Super tangguh. Super ringan. [Kategori: Smartphone]', images: ['https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400&q=80'] },
      { id: 'm2', name: 'MacBook Pro M3 Max', price: 62500000, stock: 5, shop_name: 'Apple', shop_id: appleShopId, description: 'Chip paling mutakhir yang pernah ada di pro laptop. [Kategori: Laptop]', images: ['https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=400&q=80'] },
      { id: 'm3', name: 'iPad Pro M4', price: 21500000, stock: 15, shop_name: 'Apple', shop_id: appleShopId, description: 'Desain menakjubkan, super tipis dengan layar OLED. [Kategori: Tablet]', images: ['https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400&q=80'] },
      { id: 'm4', name: 'AirPods Pro (Gen 2)', price: 4299000, stock: 25, shop_name: 'Apple', shop_id: appleShopId, description: 'Peredam bising aktif hingga 2x lebih baik. [Kategori: Audio, Aksesoris]', images: ['https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=400&q=80'] },
      { id: 'm5', name: 'Apple 20W USB-C Power Adapter', price: 449000, stock: 30, shop_name: 'Apple', shop_id: appleShopId, description: 'Pengisian daya cepat dan efisien. [Kategori: Aksesoris]', images: ['https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=400&q=80'] }
    ];

    // Include both mock products and real DB products for the presentation
    let products = [...mockProducts, ...dbProducts];

    // Remove duplicates from products list
    products = products.filter((v, i, a) => a.findIndex(t => t.name.toLowerCase() === v.name.toLowerCase()) === i);

    // Pre-fetch shop names for all unique shop IDs so we can filter them
    const shopIds = [...new Set(products.map(p => p.shop_id).filter(Boolean))];
    if (shopIds.length > 0) {
      try {
        const shopRes  = await fetch(`${BASE_URL}/shops`);
        const shopData = await shopRes.json();
        (shopData.data || []).forEach(s => { 
          shopCache[s.id] = s.name; 
          shopDetailCache[s.id] = s;
        });
      } catch { /* shop names are optional */ }
    }

    // Apply filtering by Shop Name if provided
    if (shopQuery) {
      products = products.filter(p => {
        const pShopName = (p.shop_name || shopCache[p.shop_id] || '').toLowerCase();
        return pShopName === shopQuery.toLowerCase();
      });
    }

    // Apply text filtering on client side
    if (filter !== 'all') {
      products = products.filter(p => {
        const desc = (p.description || '').toLowerCase();
        const name = (p.name || '').toLowerCase();
        return desc.includes(filter) || name.includes(filter);
      });
    }

    if (products.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:80px 20px;color:#64748B;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 16px;opacity:0.4;display:block;">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
          </svg>
          <p style="font-size:15px;font-weight:600;margin-bottom:6px;">Belum ada produk tersedia</p>
          <span style="font-size:13px;color:#94A3B8;">Seller belum menambahkan produk. Cek kembali nanti!</span>
        </div>`;
      return;
    }
    // Render all cards
    grid.innerHTML = products.map(p => renderCard(p, p.shop_name || shopCache[p.shop_id] || '')).join('');

    // Bind Add-to-cart buttons
    grid.querySelectorAll('.btn-add-cart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const { id, name, price, image, shop: shopName, shopId } = btn.dataset;
        const added = addToCart({ id, name, price: parseFloat(price), image, shopName, shopId });
        if (!added) return;

        updateCartUI();
        showAlert(`"${name}" ditambahkan ke keranjang!`, "success");

        // Brief button feedback
        btn.classList.add('pulse-add');
        btn.textContent = '✓ Dimasukkan';
        setTimeout(() => {
          btn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/>
            </svg>
            Keranjang
          `;
          btn.classList.remove('pulse-add');
        }, 1000);
      });
    });

    // Bind Buy Now buttons
    grid.querySelectorAll('.btn-buy-now').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const { id, name, price, image, shop: shopName, shopId } = btn.dataset;
        const added = addToCart({ id, name, price: parseFloat(price), image, shopName, shopId });
        if (!added) return;

        updateCartUI();
        
        // Open cart drawer
        document.dispatchEvent(new CustomEvent('vendora:open-cart'));
        
        // Directly trigger checkout process
        await executeCheckout();
      });
    });

    // Bind Shop click events to show shop details modal
    grid.querySelectorAll('.shop-clickable').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const { shopId } = el.dataset;
        const name = el.querySelector('span:not(.verified-dot)').textContent.trim();
        
        let shop = shopDetailCache[shopId];
        if (!shop) {
          // Fallback untuk mock shop
          shop = {
            name: name,
            description: `Toko mitra resmi ${name} yang menyediakan berbagai produk berkualitas premium untuk Anda.`,
            owner_phone: "08123456789",
            owner_address: "Kawasan Ruko Sentral Bisnis Blok A, Jakarta",
            owner_avatar: name.toLowerCase() === 'apple' ? 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg' : ''
          };
        } else {
          // If real shop but address/phone is empty (not updated yet by seller)
          if (!shop.owner_phone) shop.owner_phone = "08123456789";
          if (!shop.owner_address) shop.owner_address = "Kawasan Ruko Sentral Bisnis Blok A, Jakarta";
          if (!shop.owner_avatar && name.toLowerCase() === 'apple') shop.owner_avatar = 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg';
        }
        
        // Memanggil fungsi global showShopDetailModal di main.js
        if (typeof window.showShopDetailModal === 'function') {
          window.showShopDetailModal(shop);
        }
      });
    });

    // Bind Product Card click events to open product details modal
    grid.querySelectorAll('.product-card').forEach(card => {
      card.addEventListener('click', () => {
        const productId = card.dataset.productId;
        const product = products.find(p => p.id === productId);
        if (product) {
          showProductDetailModal(product, product.shop_name || shopCache[product.shop_id] || '');
        }
      });
    });

  } catch (err) {
    console.error('Failed to load products:', err);
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#64748B;">
        <p style="font-size:15px;font-weight:600;color:#EF4444;margin-bottom:6px;">Gagal memuat produk</p>
        <span style="font-size:13px;">Pastikan backend server berjalan di localhost:8080</span>
      </div>`;
  }
}

// ─── Show Product Detail Modal (2 Columns Luxury Layout) ──────────────────────
function showProductDetailModal(p, shopName) {
  const modal = document.getElementById('product-detail-modal');
  const body = modal ? modal.querySelector('.product-detail-modal-body') : null;
  if (!modal || !body) return;

  const mainImage = (p.images && p.images[0]) ? p.images[0] : 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80';
  const inStock = p.stock > 0;
  const priceStr = `Rp ${Number(p.price).toLocaleString('id-ID')}`;
  
  // Extract category and spec dynamic data
  const descLower = (p.description || '').toLowerCase();
  let category = 'Lain-lain';
  if (descLower.includes('elektronik')) category = 'Elektronik';
  else if (descLower.includes('fashion')) category = 'Fashion';
  else if (descLower.includes('kecantikan') || descLower.includes('skincare') || descLower.includes('perfume')) category = 'Kecantikan';
  else if (descLower.includes('olahraga')) category = 'Olahraga';
  else if (descLower.includes('rumah') || descLower.includes('taman') || descLower.includes('bento')) category = 'Rumah & Taman';

  let spec = {
    brand: 'Apple',
    category: category,
    warna: 'Space Black / Titanium',
    garansi: '1 Tahun Resmi iBox/Apple',
    material: 'Premium Apple Material'
  };

  const nameLower = p.name.toLowerCase();
  if (nameLower.includes('iphone')) {
    spec.warna = 'Natural Titanium';
    spec.material = 'Titanium & Ceramic Shield';
  } else if (nameLower.includes('macbook')) {
    spec.warna = 'Space Black';
    spec.material = '100% Recycled Aluminum';
  } else if (nameLower.includes('ipad')) {
    spec.warna = 'Space Black';
    spec.material = 'Aluminum & Tandem OLED';
  } else if (nameLower.includes('watch')) {
    spec.warna = 'Titanium';
    spec.material = 'Aerospace-grade Titanium';
  } else if (nameLower.includes('airpods')) {
    spec.warna = 'White';
    spec.material = 'Polycarbonate';
  } else if (nameLower.includes('vision')) {
    spec.warna = 'Silver';
    spec.material = 'Custom Aluminum Alloy & 3D Glass';
  }

  // Thumbnails render
  const allImages = p.images && p.images.length > 0 ? p.images : [mainImage];
  let galleryImages = [...allImages];
  if (galleryImages.length === 1) {
    // Generate context-aware additional images to populate the slider beautifully
    if (nameLower.includes('earbuds') || nameLower.includes('headphones') || nameLower.includes('senn')) {
      galleryImages.push('https://images.unsplash.com/photo-1608156639585-b3a032ef9689?w=400&q=80');
      galleryImages.push('https://images.unsplash.com/photo-1484704849700-f032a568e944?w=400&q=80');
    } else if (nameLower.includes('watch') || nameLower.includes('jam')) {
      galleryImages.push('https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400&q=80');
      galleryImages.push('https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=400&q=80');
    } else if (nameLower.includes('bottle') || nameLower.includes('botol')) {
      galleryImages.push('https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400&q=80');
      galleryImages.push('https://images.unsplash.com/photo-1523362628745-0c100150b504?w=400&q=80');
    } else if (nameLower.includes('perfume') || nameLower.includes('parfum')) {
      galleryImages.push('https://images.unsplash.com/photo-1541643600914-78b084683601?w=400&q=80');
      galleryImages.push('https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=400&q=80');
    } else if (nameLower.includes('shoes') || nameLower.includes('sepatu') || nameLower.includes('nike')) {
      galleryImages.push('https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80');
      galleryImages.push('https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=400&q=80');
    } else {
      galleryImages.push('https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80');
    }
  }

  const thumbnailsHtml = galleryImages.map((img, idx) => `
    <div class="p-thumb ${idx === 0 ? 'active' : ''}" data-idx="${idx}">
      <img src="${img}" alt="Thumbnail ${idx + 1}">
    </div>
  `).join('');

  // Short description extraction
  let shortDesc = p.description || 'Produk premium berkualitas tinggi untuk menyempurnakan gaya hidup modern Anda.';
  if (shortDesc.length > 150) {
    shortDesc = shortDesc.slice(0, 150) + '...';
  }

  // Get shop address fallback
  const shopDetail = shopDetailCache[p.shop_id];
  const shopAddress = shopDetail ? shopDetail.owner_address : 'Kawasan Ruko Sentral Bisnis Blok A, Jakarta';

  body.innerHTML = `
    <div class="p-detail-container">
      <!-- KIRI: Galeri -->
      <div class="p-detail-gallery">
        <div class="p-main-img-wrapper">
          <img id="p-main-img" src="${mainImage}" alt="${p.name}">
        </div>
        <div class="p-thumbnails">
          ${thumbnailsHtml}
        </div>
      </div>
      
      <!-- KANAN: Informasi -->
      <div class="p-detail-info">
        <div>
          <div class="p-info-category">${spec.category}</div>
          <h1 class="p-info-name">${p.name}</h1>
        </div>
        
        <div class="p-info-price">${priceStr}</div>
        
        <p class="p-info-desc-short">${shortDesc}</p>
        
        <div class="p-info-stock">
          Status: ${inStock ? `<strong>${p.stock} unit tersedia</strong>` : '<span style="color:var(--danger); font-weight:700;">Habis</span>'}
        </div>
        
        <div class="p-info-qty">
          <span>Jumlah:</span>
          <div class="qty-selector">
            <button class="qty-btn" id="qty-minus" type="button" ${inStock ? '' : 'disabled'}>-</button>
            <input type="number" id="qty-input" value="1" min="1" max="${p.stock}" readonly>
            <button class="qty-btn" id="qty-plus" type="button" ${inStock ? '' : 'disabled'}>+</button>
          </div>
        </div>
        
        <div class="p-info-actions">
          <button class="btn-p-add-cart" id="modal-add-cart-btn" data-id="${p.id}" data-name="${p.name}" data-price="${p.price}" data-image="${mainImage}" data-shop="${shopName}" data-shop-id="${p.shop_id || ''}" ${inStock ? '' : 'disabled'} type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/>
            </svg>
            Tambah ke Keranjang
          </button>
          <button class="btn-p-buy-now" id="modal-buy-now-btn" data-id="${p.id}" data-name="${p.name}" data-price="${p.price}" data-image="${mainImage}" data-shop="${shopName}" data-shop-id="${p.shop_id || ''}" ${inStock ? '' : 'disabled'} type="button">
            Beli Sekarang
          </button>
        </div>
        
        <!-- Accordions -->
        <div class="p-detail-accordions">
          <!-- SPESIFIKASI PRODUK -->
          <div class="p-accordion-item">
            <button class="p-accordion-header" type="button">
              <span>SPESIFIKASI PRODUK</span>
              <svg class="p-accordion-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="p-accordion-content">
              <table class="p-spec-table">
                <tr><td>Brand</td><td>${spec.brand}</td></tr>
                <tr><td>Kategori</td><td>${spec.category}</td></tr>
                <tr><td>Warna</td><td>${spec.warna}</td></tr>
                <tr><td>Garansi</td><td>${spec.garansi}</td></tr>
                <tr><td>Material</td><td>${spec.material}</td></tr>
                <tr><td>Stok</td><td>${p.stock} unit</td></tr>
              </table>
            </div>
          </div>
          
          <!-- DESKRIPSI PRODUK -->
          <div class="p-accordion-item">
            <button class="p-accordion-header" type="button">
              <span>DESKRIPSI PRODUK</span>
              <svg class="p-accordion-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="p-accordion-content">
              <p class="p-spec-desc">${p.description || 'Tidak ada deskripsi produk.'}</p>
            </div>
          </div>
          
          <!-- INFORMASI PENJUAL -->
          <div class="p-accordion-item">
            <button class="p-accordion-header" type="button">
              <span>INFORMASI PENJUAL</span>
              <svg class="p-accordion-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="p-accordion-content">
              <div class="p-seller-info">
                <div class="p-seller-name">${shopName || 'Toko Mitra Resmi'}</div>
                <div class="p-seller-verified">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="color:var(--primary)"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  <span>Merchant Terverifikasi</span>
                </div>
                ${shopAddress ? `<div class="p-seller-address"><strong>Alamat Toko:</strong> ${shopAddress}</div>` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Bind Thumbnail Click events to swap main image
  const mainImg = body.querySelector('#p-main-img');
  const thumbs = body.querySelectorAll('.p-thumb');
  thumbs.forEach(thumb => {
    thumb.addEventListener('click', () => {
      thumbs.forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
      const idx = parseInt(thumb.dataset.idx);
      mainImg.src = galleryImages[idx];
    });
  });

  // Bind Qty Selector logic
  const qtyInput = body.querySelector('#qty-input');
  const btnMinus = body.querySelector('#qty-minus');
  const btnPlus = body.querySelector('#qty-plus');
  if (btnMinus && btnPlus && qtyInput && inStock) {
    btnMinus.addEventListener('click', () => {
      let val = parseInt(qtyInput.value);
      if (val > 1) {
        qtyInput.value = val - 1;
      }
    });
    btnPlus.addEventListener('click', () => {
      let val = parseInt(qtyInput.value);
      if (val < p.stock) {
        qtyInput.value = val + 1;
      }
    });
  }

  // Bind Cart Action inside Modal
  const modalAddCartBtn = body.querySelector('#modal-add-cart-btn');
  if (modalAddCartBtn && inStock) {
    modalAddCartBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const qty = parseInt(qtyInput.value) || 1;
      
      let added = false;
      for (let i = 0; i < qty; i++) {
        added = addToCart({
          id: p.id,
          name: p.name,
          price: parseFloat(p.price),
          image: mainImage,
          shopName: shopName,
          shopId: p.shop_id || ''
        });
      }

      if (!added) return;
      updateCartUI();
      showAlert(`"${p.name}" (${qty} item) ditambahkan ke keranjang!`, "success");

      // Button feedback
      modalAddCartBtn.classList.add('pulse-add');
      modalAddCartBtn.textContent = '✓ Dimasukkan';
      setTimeout(() => {
        modalAddCartBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/>
          </svg>
          Tambah ke Keranjang
        `;
        modalAddCartBtn.classList.remove('pulse-add');
      }, 1200);
    });
  }

  // Bind Buy Now Action inside Modal
  const modalBuyNowBtn = body.querySelector('#modal-buy-now-btn');
  if (modalBuyNowBtn && inStock) {
    modalBuyNowBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const qty = parseInt(qtyInput.value) || 1;
      
      let added = false;
      for (let i = 0; i < qty; i++) {
        added = addToCart({
          id: p.id,
          name: p.name,
          price: parseFloat(p.price),
          image: mainImage,
          shopName: shopName,
          shopId: p.shop_id || ''
        });
      }

      if (!added) return;
      updateCartUI();

      // Close product modal, open cart drawer
      modal.classList.remove('active');
      document.dispatchEvent(new CustomEvent('vendora:open-cart'));
    });
  }

  // Bind Accordion expand/collapse
  const accordionItems = body.querySelectorAll('.p-accordion-item');
  accordionItems.forEach(item => {
    const header = item.querySelector('.p-accordion-header');
    const content = item.querySelector('.p-accordion-content');
    
    header.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      
      // Close other accordions
      accordionItems.forEach(otherItem => {
        otherItem.classList.remove('active');
        otherItem.querySelector('.p-accordion-content').style.maxHeight = null;
      });

      if (!isActive) {
        item.classList.add('active');
        content.style.maxHeight = content.scrollHeight + "px";
      }
    });
  });

  // Open the modal
  modal.classList.add('active');
}

// Bind close button on product detail modal
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('product-detail-close-btn');
  const modal = document.getElementById('product-detail-modal');
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') modal.classList.remove('active');
    });
  }
});
