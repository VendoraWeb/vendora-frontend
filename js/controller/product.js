import { BASE_URL } from "../config/api.js";
import { addToCart, updateCartUI } from "./transaction.js";

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

async function getShopName(shopId) {
  if (!shopId) return '';
  if (shopCache[shopId]) return shopCache[shopId];
  try {
    const res  = await fetch(`${BASE_URL}/shops`);
    const data = await res.json();
    (data.data || []).forEach(s => { shopCache[s.id] = s.name; });
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
          <div class="product-shop-tag">
            <span class="verified-dot"></span>
            <span>${shopName}</span>
          </div>` : ''}
        <div class="product-name">${p.name}</div>
        <div class="product-desc">${p.description || 'Tidak ada deskripsi produk.'}</div>
        <div class="product-price">${priceStr}</div>
        <div class="product-stock-text">${stockStr}</div>
        <button
          class="btn-add-cart"
          data-id="${p.id}"
          data-name="${p.name}"
          data-price="${p.price}"
          data-image="${image}"
          data-shop="${shopName || ''}"
          ${inStock ? '' : 'disabled'}
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/>
          </svg>
          ${inStock ? 'Tambah ke Keranjang' : 'Stok Habis'}
        </button>
      </div>
    </div>
  `;
}

// ─── Load and render all catalog products ────────────────────────────────────
export async function loadCatalogProducts(filter = 'all') {
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
    let products = data.data || [];

    // Jika database kosong, gunakan Mockup Produk (Variasi 6 Item)
    if (products.length === 0) {
      products = [
        { id: 'm1', name: 'MacBook Pro M3 14" 2024', price: 29999000, stock: 8, shop_name: 'Official Store 1', description: 'Produk MacBook Pro M3 14" 2024 dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Elektronik]', images: ['https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400&q=80'] },
        { id: 'm2', name: 'iPhone 15 Pro Max 256GB', price: 22499000, stock: 11, shop_name: 'Official Store 2', description: 'Produk iPhone 15 Pro Max 256GB dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Elektronik]', images: ['https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400&q=80'] },
        { id: 'm3', name: 'Sony WH-1000XM5 ANC Headphone', price: 4999000, stock: 14, shop_name: 'Official Store 3', description: 'Produk Sony WH-1000XM5 ANC Headphone dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Elektronik]', images: ['https://images.unsplash.com/photo-1596755094514-f87e32f6b717?w=400&q=80'] },
        { id: 'm4', name: 'Samsung Galaxy S24 Ultra', price: 21000000, stock: 17, shop_name: 'Official Store 4', description: 'Produk Samsung Galaxy S24 Ultra dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Elektronik]', images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80'] },
        { id: 'm5', name: 'LG 27" UltraGear 4K Monitor', price: 7500000, stock: 20, shop_name: 'Official Store 5', description: 'Produk LG 27" UltraGear 4K Monitor dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Elektronik]', images: ['https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=400&q=80'] },
        { id: 'm6', name: 'Asus ROG Zephyrus G14', price: 28500000, stock: 23, shop_name: 'Official Store 6', description: 'Produk Asus ROG Zephyrus G14 dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Elektronik]', images: ['https://images.unsplash.com/photo-1584916201218-f4242ceb4809?w=400&q=80'] },
        { id: 'm7', name: 'AirPods Pro 2nd Gen', price: 3500000, stock: 26, shop_name: 'Official Store 7', description: 'Produk AirPods Pro 2nd Gen dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Elektronik]', images: ['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&q=80'] },
        { id: 'm8', name: 'Nintendo Switch OLED', price: 4800000, stock: 29, shop_name: 'Official Store 8', description: 'Produk Nintendo Switch OLED dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Elektronik]', images: ['https://images.unsplash.com/photo-1495105787522-5334e3ffa0ebd?w=400&q=80'] },
        { id: 'm9', name: 'PlayStation 5 Slim', price: 8900000, stock: 32, shop_name: 'Official Store 9', description: 'Produk PlayStation 5 Slim dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Elektronik]', images: ['https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=400&q=80'] },
        { id: 'm10', name: 'Logitech MX Master 3S', price: 1600000, stock: 35, shop_name: 'Official Store 10', description: 'Produk Logitech MX Master 3S dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Elektronik]', images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&q=80'] },
        { id: 'm11', name: 'Kemeja Flannel Pria Premium', price: 250000, stock: 38, shop_name: 'Official Store 11', description: 'Produk Kemeja Flannel Pria Premium dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Fashion]', images: ['https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400&q=80'] },
        { id: 'm12', name: 'Gaun Pesta Malam Sutra', price: 1250000, stock: 41, shop_name: 'Official Store 12', description: 'Produk Gaun Pesta Malam Sutra dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Fashion]', images: ['https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400&q=80'] },
        { id: 'm13', name: 'Tas Tangan Kulit Wanita', price: 1550000, stock: 44, shop_name: 'Official Store 13', description: 'Produk Tas Tangan Kulit Wanita dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Fashion]', images: ['https://images.unsplash.com/photo-1596755094514-f87e32f6b717?w=400&q=80'] },
        { id: 'm14', name: 'Jaket Denim Vintage Pria', price: 450000, stock: 47, shop_name: 'Official Store 14', description: 'Produk Jaket Denim Vintage Pria dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Fashion]', images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80'] },
        { id: 'm15', name: 'Kaos Oversize Hitam Polos', price: 120000, stock: 50, shop_name: 'Official Store 15', description: 'Produk Kaos Oversize Hitam Polos dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Fashion]', images: ['https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=400&q=80'] },
        { id: 'm16', name: 'Celana Chino Slim Fit', price: 200000, stock: 53, shop_name: 'Official Store 16', description: 'Produk Celana Chino Slim Fit dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Fashion]', images: ['https://images.unsplash.com/photo-1584916201218-f4242ceb4809?w=400&q=80'] },
        { id: 'm17', name: 'Topi Baseball Canvas', price: 85000, stock: 6, shop_name: 'Official Store 17', description: 'Produk Topi Baseball Canvas dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Fashion]', images: ['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&q=80'] },
        { id: 'm18', name: 'Kacamata Hitam Aviator', price: 350000, stock: 9, shop_name: 'Official Store 18', description: 'Produk Kacamata Hitam Aviator dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Fashion]', images: ['https://images.unsplash.com/photo-1495105787522-5334e3ffa0ebd?w=400&q=80'] },
        { id: 'm19', name: 'Sepatu Boots Kulit Asli', price: 1100000, stock: 12, shop_name: 'Official Store 19', description: 'Produk Sepatu Boots Kulit Asli dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Fashion]', images: ['https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=400&q=80'] },
        { id: 'm20', name: 'Dompet Kulit Pria Lipat', price: 250000, stock: 15, shop_name: 'Official Store 20', description: 'Produk Dompet Kulit Pria Lipat dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Fashion]', images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&q=80'] },
        { id: 'm21', name: 'Serum Wajah Anti-Aging Glow', price: 350000, stock: 18, shop_name: 'Official Store 21', description: 'Produk Serum Wajah Anti-Aging Glow dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Kecantikan]', images: ['https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400&q=80'] },
        { id: 'm22', name: 'Moisturizer Gel Skincare', price: 150000, stock: 21, shop_name: 'Official Store 22', description: 'Produk Moisturizer Gel Skincare dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Kecantikan]', images: ['https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400&q=80'] },
        { id: 'm23', name: 'Lipstik Matte Tahan Lama', price: 120000, stock: 24, shop_name: 'Official Store 23', description: 'Produk Lipstik Matte Tahan Lama dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Kecantikan]', images: ['https://images.unsplash.com/photo-1596755094514-f87e32f6b717?w=400&q=80'] },
        { id: 'm24', name: 'Sunscreen SPF 50 PA++++', price: 95000, stock: 27, shop_name: 'Official Store 24', description: 'Produk Sunscreen SPF 50 PA++++ dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Kecantikan]', images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80'] },
        { id: 'm25', name: 'Toner Wajah Ekstrak Mawar', price: 110000, stock: 30, shop_name: 'Official Store 25', description: 'Produk Toner Wajah Ekstrak Mawar dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Kecantikan]', images: ['https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=400&q=80'] },
        { id: 'm26', name: 'Masker Wajah Clay Charcoal', price: 85000, stock: 33, shop_name: 'Official Store 26', description: 'Produk Masker Wajah Clay Charcoal dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Kecantikan]', images: ['https://images.unsplash.com/photo-1584916201218-f4242ceb4809?w=400&q=80'] },
        { id: 'm27', name: 'Parfum Eau De Parfum 50ml', price: 450000, stock: 36, shop_name: 'Official Store 27', description: 'Produk Parfum Eau De Parfum 50ml dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Kecantikan]', images: ['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&q=80'] },
        { id: 'm28', name: 'Sabun Cuci Muka Acne Clear', price: 65000, stock: 39, shop_name: 'Official Store 28', description: 'Produk Sabun Cuci Muka Acne Clear dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Kecantikan]', images: ['https://images.unsplash.com/photo-1495105787522-5334e3ffa0ebd?w=400&q=80'] },
        { id: 'm29', name: 'Eye Cream Peptida', price: 250000, stock: 42, shop_name: 'Official Store 29', description: 'Produk Eye Cream Peptida dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Kecantikan]', images: ['https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=400&q=80'] },
        { id: 'm30', name: 'Body Lotion Brightening', price: 180000, stock: 45, shop_name: 'Official Store 30', description: 'Produk Body Lotion Brightening dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Kecantikan]', images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&q=80'] },
        { id: 'm31', name: 'Sepatu Sneakers Running Aero', price: 899000, stock: 48, shop_name: 'Official Store 31', description: 'Produk Sepatu Sneakers Running Aero dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Olahraga]', images: ['https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400&q=80'] },
        { id: 'm32', name: 'Matras Yoga Anti Slip', price: 250000, stock: 51, shop_name: 'Official Store 32', description: 'Produk Matras Yoga Anti Slip dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Olahraga]', images: ['https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400&q=80'] },
        { id: 'm33', name: 'Dumbbell 5kg Set 2', price: 400000, stock: 54, shop_name: 'Official Store 33', description: 'Produk Dumbbell 5kg Set 2 dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Olahraga]', images: ['https://images.unsplash.com/photo-1596755094514-f87e32f6b717?w=400&q=80'] },
        { id: 'm34', name: 'Botol Minum Tumbler 1L', price: 150000, stock: 7, shop_name: 'Official Store 34', description: 'Produk Botol Minum Tumbler 1L dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Olahraga]', images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80'] },
        { id: 'm35', name: 'Jersey Sepak Bola Original', price: 550000, stock: 10, shop_name: 'Official Store 35', description: 'Produk Jersey Sepak Bola Original dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Olahraga]', images: ['https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=400&q=80'] },
        { id: 'm36', name: 'Resistance Band Set', price: 120000, stock: 13, shop_name: 'Official Store 36', description: 'Produk Resistance Band Set dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Olahraga]', images: ['https://images.unsplash.com/photo-1584916201218-f4242ceb4809?w=400&q=80'] },
        { id: 'm37', name: 'Tas Gym Ransel Olahraga', price: 300000, stock: 16, shop_name: 'Official Store 37', description: 'Produk Tas Gym Ransel Olahraga dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Olahraga]', images: ['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&q=80'] },
        { id: 'm38', name: 'Sarung Tangan Fitness', price: 85000, stock: 19, shop_name: 'Official Store 38', description: 'Produk Sarung Tangan Fitness dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Olahraga]', images: ['https://images.unsplash.com/photo-1495105787522-5334e3ffa0ebd?w=400&q=80'] },
        { id: 'm39', name: 'Lompat Tali Speed Rope', price: 60000, stock: 22, shop_name: 'Official Store 39', description: 'Produk Lompat Tali Speed Rope dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Olahraga]', images: ['https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=400&q=80'] },
        { id: 'm40', name: 'Sepeda Lipat Gunung', price: 3500000, stock: 25, shop_name: 'Official Store 40', description: 'Produk Sepeda Lipat Gunung dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Olahraga]', images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&q=80'] },
        { id: 'm41', name: 'Set Tanaman Hias Indoor Monstera', price: 185000, stock: 28, shop_name: 'Official Store 41', description: 'Produk Set Tanaman Hias Indoor Monstera dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Rumah & Taman]', images: ['https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400&q=80'] },
        { id: 'm42', name: 'Lampu Meja Belajar LED', price: 150000, stock: 31, shop_name: 'Official Store 42', description: 'Produk Lampu Meja Belajar LED dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Rumah & Taman]', images: ['https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400&q=80'] },
        { id: 'm43', name: 'Karpet Bulu Rasfur 150x200', price: 250000, stock: 34, shop_name: 'Official Store 43', description: 'Produk Karpet Bulu Rasfur 150x200 dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Rumah & Taman]', images: ['https://images.unsplash.com/photo-1596755094514-f87e32f6b717?w=400&q=80'] },
        { id: 'm44', name: 'Rak Sepatu Susun Kayu', price: 350000, stock: 37, shop_name: 'Official Store 44', description: 'Produk Rak Sepatu Susun Kayu dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Rumah & Taman]', images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80'] },
        { id: 'm45', name: 'Sofa Minimalis 2 Seater', price: 2500000, stock: 40, shop_name: 'Official Store 45', description: 'Produk Sofa Minimalis 2 Seater dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Rumah & Taman]', images: ['https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=400&q=80'] },
        { id: 'm46', name: 'Set Sprei Katun Jepang', price: 450000, stock: 43, shop_name: 'Official Store 46', description: 'Produk Set Sprei Katun Jepang dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Rumah & Taman]', images: ['https://images.unsplash.com/photo-1584916201218-f4242ceb4809?w=400&q=80'] },
        { id: 'm47', name: 'Panci Teflon Anti Lengket', price: 200000, stock: 46, shop_name: 'Official Store 47', description: 'Produk Panci Teflon Anti Lengket dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Rumah & Taman]', images: ['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&q=80'] },
        { id: 'm48', name: 'Blender Kaca 1.5L', price: 350000, stock: 49, shop_name: 'Official Store 48', description: 'Produk Blender Kaca 1.5L dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Rumah & Taman]', images: ['https://images.unsplash.com/photo-1495105787522-5334e3ffa0ebd?w=400&q=80'] },
        { id: 'm49', name: 'Bantal Guling Set Premium', price: 180000, stock: 52, shop_name: 'Official Store 49', description: 'Produk Bantal Guling Set Premium dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Rumah & Taman]', images: ['https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=400&q=80'] },
        { id: 'm50', name: 'Vas Bunga Kaca Estetik', price: 95000, stock: 5, shop_name: 'Official Store 50', description: 'Produk Vas Bunga Kaca Estetik dengan kualitas terbaik. Cocok untuk kebutuhan Anda sehari-hari. [Kategori: Rumah & Taman]', images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&q=80'] }
      ];
    }

    // Apply filtering on client side
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

    // Pre-fetch shop names for all unique shop IDs
    const shopIds = [...new Set(products.map(p => p.shop_id).filter(Boolean))];
    if (shopIds.length > 0) {
      try {
        const shopRes  = await fetch(`${BASE_URL}/shops`);
        const shopData = await shopRes.json();
        (shopData.data || []).forEach(s => { shopCache[s.id] = s.name; });
      } catch { /* shop names are optional */ }
    }

    // Render all cards
    grid.innerHTML = products.map(p => renderCard(p, p.shop_name || shopCache[p.shop_id] || '')).join('');

    // Bind Add-to-cart buttons
    grid.querySelectorAll('.btn-add-cart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const { id, name, price, image, shop: shopName } = btn.dataset;
        addToCart({ id, name, price: parseFloat(price), image, shopName });
        updateCartUI();
        showAlert(`"${name}" ditambahkan ke keranjang!`, "success");

        // Open cart drawer via event (avoids circular import)
        document.dispatchEvent(new CustomEvent('vendora:open-cart'));

        // Brief button feedback
        btn.classList.add('pulse-add');
        btn.textContent = '✓ Dimasukkan';
        setTimeout(() => {
          btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/>
            </svg>
            Tambah ke Keranjang
          `;
          btn.classList.remove('pulse-add');
        }, 1000);
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
