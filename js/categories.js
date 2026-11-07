// ─── Taksonomi kategori Vendora ─────────────────────────────────────────────
// Dipakai: menu Kategori, chip filter katalog, carousel kategori, pencarian,
// dan form produk penjual. Produk lama tanpa field `category` dicocokkan lewat
// kata kunci di nama/deskripsi.

export const CATEGORIES = [
  { key: 'fashion', label: 'Fashion', tagline: 'Koleksi terbaru',
    img: 'photo-1490481651871-ab68de25d43d',
    subs: ['Pakaian Pria', 'Pakaian Wanita', 'Sepatu', 'Tas & Dompet', 'Aksesoris', 'Jam Tangan'],
    keywords: ['fashion', 'pakaian', 'baju', 'kaos', 't-shirt', 'kemeja', 'jaket', 'hoodie', 'celana', 'jeans',
               'dress', 'gaun', 'blus', 'sepatu', 'sneakers', 'sandal', 'tas', 'ransel', 'backpack', 'dompet', 'topi', 'cap'] },
  { key: 'elektronik', label: 'Elektronik', tagline: 'Gadget original',
    img: 'photo-1498049794561-7780e7231661',
    subs: ['Handphone & Tablet', 'Laptop & Komputer', 'Audio', 'Kamera', 'Aksesoris Gadget', 'Smartwatch'],
    keywords: ['elektronik', 'smartphone', 'handphone', 'laptop', 'tablet', 'audio', 'iphone', 'macbook', 'ipad',
               'airpods', 'adaptor', 'adapter', 'charger', 'kamera', 'headphone', 'earphone', 'speaker', 'gadget'] },
  { key: 'dapur', label: 'Dapur', tagline: 'Masak lebih seru',
    img: 'photo-1590794056226-79ef3a8147e1',
    subs: ['Peralatan Masak', 'Alat Makan & Minum', 'Wadah & Penyimpanan', 'Elektronik Dapur'],
    keywords: ['dapur', 'panci', 'wajan', 'teflon', 'pisau', 'talenan', 'piring', 'gelas', 'mangkuk', 'sendok',
               'garpu', 'tumbler', 'botol minum', 'blender', 'rice cooker', 'air fryer', 'toples', 'bento'] },
  { key: 'rumah', label: 'Rumah & Taman', tagline: 'Rumah lebih nyaman',
    img: 'photo-1616486338812-3dadae4b4ace',
    subs: ['Furnitur', 'Dekorasi', 'Kamar Tidur', 'Kamar Mandi', 'Taman & Tanaman', 'Kebersihan'],
    keywords: ['rumah', 'taman', 'furnitur', 'dekorasi', 'perabot', 'kursi', 'meja', 'lemari', 'sofa', 'lampu',
               'bantal', 'sprei', 'karpet', 'tanaman', 'pot', 'handuk'] },
  { key: 'kecantikan', label: 'Kecantikan', tagline: 'Perawatan harian',
    img: 'photo-1596462502278-27bfdc403348',
    subs: ['Skincare', 'Makeup', 'Parfum', 'Perawatan Rambut'],
    keywords: ['kecantikan', 'skincare', 'kosmetik', 'makeup', 'parfum', 'perfume', 'serum', 'lipstik',
               'toner', 'sunscreen', 'masker', 'sampo', 'shampoo'] },
  { key: 'kesehatan', label: 'Kesehatan', tagline: 'Jaga tubuh tetap fit',
    img: 'photo-1505751172876-fa1923c5c528',
    subs: ['Vitamin & Suplemen', 'Alat Kesehatan', 'Perawatan Tubuh'],
    keywords: ['kesehatan', 'vitamin', 'suplemen', 'obat', 'termometer', 'tensimeter', 'masker medis', 'p3k'] },
  { key: 'olahraga', label: 'Olahraga', tagline: 'Siap bergerak setiap hari',
    img: 'photo-1534438327276-14e5300c3a48',
    subs: ['Pakaian Olahraga', 'Fitness & Gym', 'Sepeda', 'Camping & Hiking'],
    keywords: ['olahraga', 'sport', 'fitness', 'gym', 'yoga', 'sepeda', 'raket', 'bola', 'dumbel', 'dumbbell',
               'matras', 'camping', 'tenda', 'hiking'] },
  { key: 'ibu-bayi', label: 'Ibu & Bayi', tagline: 'Untuk si kecil',
    img: 'photo-1515488042361-ee00e0ddd4e4',
    subs: ['Perlengkapan Bayi', 'Pakaian Anak', 'Mainan Anak'],
    keywords: ['bayi', 'baby', 'popok', 'diapers', 'susu formula', 'stroller', 'anak', 'mainan'] },
  { key: 'makanan', label: 'Makanan & Minuman', tagline: 'Camilan sampai kopi',
    img: 'photo-1495474472287-4d71bcdd2085',
    subs: ['Makanan Ringan', 'Minuman', 'Kopi & Teh', 'Bahan Pokok'],
    keywords: ['makanan', 'minuman', 'snack', 'camilan', 'keripik', 'kopi', 'teh', 'cokelat', 'beras', 'mie', 'sambal'] },
  { key: 'otomotif', label: 'Otomotif', tagline: 'Rawat kendaraanmu',
    img: 'photo-1558981806-ec527fa84c39',
    subs: ['Aksesoris Motor', 'Aksesoris Mobil', 'Helm', 'Perawatan Kendaraan'],
    keywords: ['otomotif', 'motor', 'mobil', 'helm', 'oli', 'ban', 'jok', 'spion'] },
  { key: 'buku', label: 'Buku & Alat Tulis', tagline: 'Baca dan berkarya',
    img: 'photo-1495446815901-a7297e633e8d',
    subs: ['Buku', 'Alat Tulis', 'Perlengkapan Kantor'],
    keywords: ['buku', 'novel', 'komik', 'pulpen', 'pensil', 'notebook', 'alat tulis', 'kertas', 'stabilo'] },
  { key: 'hewan', label: 'Hewan Peliharaan', tagline: 'Sayang anabul',
    img: 'photo-1450778869180-41d0601e046e',
    subs: ['Makanan Hewan', 'Aksesoris Hewan', 'Perawatan Hewan'],
    keywords: ['kucing', 'anjing', 'hewan', 'pet', 'whiskas', 'pasir kucing', 'kandang'] },
];

export const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

/** URL foto Unsplash untuk kategori. */
export const categoryImage = (cat, w = 900) =>
  `https://images.unsplash.com/${cat.img}?w=${w}&q=75&auto=format&fit=crop`;

// Kata yang biasa diketik pembeli → kata yang ada di produk
export const SEARCH_SYNONYMS = {
  baju: ['kaos', 't-shirt', 'kemeja', 'hoodie', 'jaket', 'pakaian', 'dress', 'blus'],
  kaos: ['t-shirt', 'tee'],
  hp: ['iphone', 'smartphone', 'handphone'],
  handphone: ['iphone', 'smartphone'],
  ponsel: ['iphone', 'smartphone'],
  sepatu: ['sneakers', 'speedcat', 'shoes'],
  tas: ['backpack', 'ransel', 'bag'],
  topi: ['cap', 'hat'],
  laptop: ['macbook', 'notebook'],
  tablet: ['ipad'],
  earphone: ['airpods', 'tws'],
  headset: ['airpods max', 'headphone'],
  charger: ['adaptor', 'adapter'],
  casan: ['adaptor', 'adapter', 'charger'],
  apple: ['iphone', 'macbook', 'ipad', 'airpods'],
};

const wordRe = (kw) => new RegExp(`(^|[^a-z0-9])${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}([^a-z0-9]|$)`);

/** Kunci kategori utama sebuah produk ('' bila tidak dikenali). */
export function categoryOf(p) {
  if (p.category && CATEGORY_BY_KEY[p.category]) return p.category;
  const text = `${p.name || ''} ${p.description || ''}`.toLowerCase();
  const hit = CATEGORIES.find(c => c.keywords.some(kw => wordRe(kw).test(text)));
  return hit ? hit.key : '';
}

export function categoryLabel(key) {
  return CATEGORY_BY_KEY[key]?.label || 'Lainnya';
}

/** Apakah produk cocok dengan sub-kategori (label), lewat field atau kata kunci. */
export function matchesSub(p, sub) {
  if (p.subcategory) return p.subcategory.toLowerCase() === sub.toLowerCase();
  const text = `${p.name || ''} ${p.description || ''}`.toLowerCase();
  return sub.toLowerCase().split(/\s*&\s*|\s+/).filter(w => w.length > 2).some(w => wordRe(w).test(text));
}
