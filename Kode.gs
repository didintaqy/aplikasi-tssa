/** ============================================================
 *  Kode.gs — entri Web App
 *  ============================================================ */

function doGet(e) {
  var judul = 'REMAJA';
  try { judul = getPengaturan().nama_aplikasi || 'REMAJA'; } catch (err) {}
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle(judul)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // wajib agar bisa disematkan di Google Sites
}

function include(nama) {
  return HtmlService.createHtmlOutputFromFile(nama).getContent();
}

/**
 * Identitas untuk layar login — satu-satunya data yang boleh dibaca
 * sebelum pengguna masuk. Tidak memuat data atlet sama sekali.
 */
function getIdentitas() {
  var p = getPengaturan();
  return {
    nama_aplikasi: p.nama_aplikasi || 'REMAJA',
    subjudul: p.subjudul || '',
    nama_organisasi: p.nama_organisasi || '',
    logo_url: p.logo_url || '',
    warna_utama: p.warna_utama || '#A81D26',
    warna_sekunder: p.warna_sekunder || '#1D2023',
    warna_aksen: p.warna_aksen || '#D9A31B',
    warna_background: p.warna_background || '#FBFAF7',
    footer: p.footer || ''
  };
}

/** Satu panggilan untuk seluruh data awal halaman, setelah login. */
function getBootstrap(token) {
  var u = sesi_(token);
  return {
    pengaturan: getPengaturan(),
    sesi: {
      username: String(u.username),
      nama: String(u.nama || u.username),
      peran: String(u.peran),
      id_atlet: String(u.id_atlet || '')
    },
    atlet: daftarAtlet_(u),
    ringkasan: ringkasanTim_(u),
    komponen: daftarKomponen_(true),
    itemTes: daftarItem_(true),
    kategori: bacaSheet_(SH.KATEGORI),
    benchmark: getBenchmark(token),
    pengguna: String(u.peran) === 'Admin' ? getPengguna(token) : []
  };
}
