# Vendora Frontend — Storefront, Seller Console & Admin Dashboard

Antarmuka web statis (HTML5, CSS3, Vanilla JavaScript ES Modules) untuk platform e-commerce **Vendora** yang terhubung langsung ke REST API backend Go Fiber.

- **Live Production:** `https://www.vendorashop.my.id`
- **Backend API:** `https://vendora-backend-zeta.vercel.app/api`
- **Hosting:** Vercel Static Deployment dengan security headers (`vercel.json`)

---

## Struktur Halaman & Modul

### Halaman HTML (9 Entrypoint)
| Halaman | Fungsi Utama |
|---|---|
| `index.html` | Etalase utama (katalog produk, kategori, pencarian, detail variasi, keranjang, checkout multi-kurir) |
| `login.html` | Masuk, daftar akun (Pembeli / Penjual), dan lupa kata sandi via OTP Email / WhatsApp |
| `pesanan.html` | Daftar pesanan pembeli, pembayaran, pelacakan peta kurir (Leaflet), konfirmasi diterima, dan komplain/dispute |
| `seller.html` | Konsol penjual: onboarding/sewa ruko virtual, CRUD produk & variasi, proses pesanan, dompet Escrow & penarikan saldo |
| `admin.html` | Konsol administrator: ringkasan KPI, kelola transaksi & ekspor CSV, moderasi ruko, moderasi produk, manajemen pengguna, komplain/dispute, laporan pelanggaran, dan tiket bantuan CS |
| `akun.html` | Pengaturan profil pengguna, alamat pengiriman, kontak, dan keamanan akun |
| `bantuan.html` | Pusat bantuan (FAQ) dan formulir pengajuan tiket CS |
| `tentang.html` | Informasi platform dan mekanisme rekening bersama (Escrow) Vendora |
| `terms.html` | Syarat & ketentuan pengguna, penjual, dan kebijakan sewa ruko |

### Modul JavaScript (`js/`)
- `js/config/api.js` — Konfigurasi base URL API (otomatis mendeteksi lokal `:8081` vs produksi Vercel), helper `apiFetch` dengan header `Authorization: Bearer`, manajemen sesi aman, dan guard 401.
- `js/ui.js`, `js/main.js`, `js/storefront.js`, `js/categories.js` — Utilitas format Rupiah/tanggal, escape XSS, status badge transaksi/escrow, dan inisialisasi etalase.
- `js/controller/auth.js` — Alur login, registrasi, dan reset kata sandi OTP.
- `js/controller/product.js` — Pencarian, filter kategori, modal detail produk & variasi, ulasan/pelaporan produk.
- `js/controller/transaction.js` — Keranjang belanja, pemilihan kurir, checkout, dan simulasi/verifikasi pembayaran.
- `js/controller/orders.js` — Riwayat pesanan pembeli, pelacakan peta, konfirmasi diterima, pembatalan, dan pengajuan komplain.
- `js/controller/ruko.js` — Kalkulator sewa ruko virtual, pengajuan ruko baru, dan perpanjangan sewa.
- `js/controller/dashboard.js` — Logika konsol Seller & Admin (CRUD produk, manajemen pesanan, dompet/withdraw, moderasi, dispute, laporan, ekspor CSV).
- `js/controller/ticket.js` — Pengajuan tiket CS (pengguna) dan tabel/modal balasan tiket CS (Admin).
- `js/controller/chat.js` — Widget chat pembeli ↔ penjual (teks + kompresi foto) dengan polling berkala.
- `js/controller/account.js` — Edit profil akun untuk semua peran (Buyer, Seller, Admin).
- `js/controller/navkit.js` & `js/controller/pages.js` — Navigasi lintas halaman, menu responsif, dan lonceng notifikasi.

### Stylesheet (`css/`) & Konfigurasi
- `css/theme.css`, `css/style.css`, `css/storefront.css`, `css/console.css`, `css/account.css`, `css/auth.css`, `css/pages.css`
- `vercel.json` — Konfigurasi header keamanan HTTP (`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, dll).
- `robots.txt` & `sitemap.xml` — Konfigurasi indeksasi mesin pencari.

---

## Menjalankan Secara Lokal & Verifikasi Sintaks

1. Jalankan server statis lokal pada port `5500`:
   ```powershell
   python -m http.server 5500 --bind 127.0.0.1
   ```
   Lalu buka `http://127.0.0.1:5500/index.html` (otomatis mengarah ke backend lokal `http://127.0.0.1:8081/api` jika server backend lokal berjalan, atau ubah konfigurasi di `js/config/api.js`).

2. Validasi sintaks seluruh modul JavaScript (sama seperti workflow GitHub Actions `.github/workflows/build.yml`):
   ```powershell
   Get-ChildItem js -Recurse -Filter "*.js" | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
   ```
