/** ============================================================
 *  APLIKASI REMAJA — TAPAK SUCI SPORT ACADEMY
 *  Config.gs — konstanta, skema sheet, dan setup awal
 *
 *  VERSI 2: komponen, item tes, batas usia, identitas, dan
 *  pengguna seluruhnya disimpan di sheet sehingga bisa diubah
 *  admin lewat menu Pengaturan tanpa menyentuh kode.
 *  ============================================================ */

// Kosongkan ID bila script terikat langsung pada spreadsheet (Ekstensi > Apps Script).
var SPREADSHEET_ID = '14Lt_DaJnhHwJ7oLoPQo9Ucdz6mSJGmHLb4QqgT9xetQ';

// ID folder Google Drive tempat foto atlet, bukti prestasi, dan logo disimpan.
var FOLDER_FOTO_ID = '12g6yoJ3Mjn5T-xEA4c-vCahk_foqTeMJ';

// Batas pengaman paling luar. Batas usia yang dipakai aplikasi
// diatur admin lewat Pengaturan (kunci usia_min / usia_max).
var USIA_BATAS_BAWAH = 3;
var USIA_BATAS_ATAS = 80;

var PERAN_SAH = ['Admin', 'Pelatih', 'Siswa'];

var SH = {
  ATLET: 'DB_ATLET',
  PERFORMA: 'DB_PERFORMA',
  PRESTASI: 'DB_PRESTASI',
  BENCHMARK: 'BENCHMARK',
  KOMPONEN: 'KOMPONEN',
  ITEM: 'ITEM_TES',
  KATEGORI: 'KATEGORI_SKOR',
  PENGATURAN: 'PENGATURAN',
  USERS: 'USERS',
  TAGIHAN: 'TAGIHAN',
  PEMBAYARAN: 'PEMBAYARAN',
  TARIF: 'TARIF_IURAN'
};

/** Kolom tetap DB_PERFORMA. Kolom item tes ditambahkan otomatis
 *  sesuai isi sheet ITEM_TES lewat sinkronKolomPerforma_(). */
var KOLOM_PERFORMA_TETAP = ['id_tes', 'id_atlet', 'tanggal_tes', 'pelatih',
                            'nadi_istirahat', 'nadi_latihan', 'tinggi_badan',
                            'berat_badan', 'keterangan'];

var KOLOM = {
  DB_ATLET: ['id_atlet', 'nama', 'tempat_lahir', 'tanggal_lahir', 'gender',
             'asal_daerah', 'tingkatan', 'foto_id', 'status', 'tahun_bergabung', 'catatan'],

  DB_PERFORMA: KOLOM_PERFORMA_TETAP,

  DB_PRESTASI: ['id_prestasi', 'id_atlet', 'nama_kejuaraan', 'tingkat', 'tanggal',
                'tempat', 'penyelenggara', 'kategori', 'kelas', 'medali',
                'bukti_id', 'catatan'],

  // Nama item, komponen, satuan, dan arah tidak lagi disalin ke sini —
  // semuanya dibaca hidup dari sheet ITEM_TES lewat kolom "kunci".
  BENCHMARK: ['id_bm', 'kunci', 'gender', 'usia_min', 'usia_max', 'nilai_bm', 'aktif'],

  KOMPONEN: ['id_komponen', 'nama', 'bobot', 'urutan', 'aktif'],

  ITEM_TES: ['id_item', 'kunci', 'nama', 'id_komponen', 'satuan', 'arah', 'urutan', 'aktif'],

  KATEGORI_SKOR: ['min', 'max', 'label', 'deskripsi', 'warna'],

  PENGATURAN: ['kunci', 'nilai'],

  USERS: ['username', 'nama', 'peran', 'salt', 'hash', 'id_atlet', 'aktif'],

  // Keuangan (iuran atlet). Saldo/terbayar/sisa dihitung dari PEMBAYARAN, tidak disimpan.
  TAGIHAN: ['id_tagihan', 'id_atlet', 'periode', 'nominal', 'sumber', 'dibuat_pada', 'catatan', 'nama_biaya'],

  PEMBAYARAN: ['id_bayar', 'id_tagihan', 'id_atlet', 'tanggal', 'jumlah', 'metode', 'catatan',
               'status', 'dicatat_oleh', 'dicatat_pada', 'alasan_batal', 'dibatalkan_oleh', 'dibatalkan_pada'],

  TARIF_IURAN: ['id_tarif', 'jenis', 'acuan', 'nominal', 'keterangan', 'aktif']
};

var PENGATURAN_BAWAAN = [
  ['nama_aplikasi', 'REMAJA'],
  ['subjudul', 'Rekam Medis & Analisis Jasmani Atlet'],
  ['nama_organisasi', 'Tapak Suci Sport Academy'],
  ['logo_id', ''],
  ['warna_utama', '#A81D26'],
  ['warna_sekunder', '#1D2023'],
  ['warna_aksen', '#D9A31B'],
  ['warna_background', '#FBFAF7'],
  ['footer', 'Tapak Suci Sport Academy — Batam'],
  ['usia_min', 5],
  ['usia_max', 40],
  ['akses_siswa', 'dashboard,prestasi,perkembangan,laporan'],
  ['cetak_bagian', 'antropometri,nadi,profil,detail,prestasi'],
  ['cetak_bentuk_profil', 'radar'],
  ['cetak_bentuk_detail', 'keduanya'],
  ['cetak_orientasi', 'potret'],
  ['cetak_ukuran', 'A4'],
  ['cetak_pisah_profil', 'YA'],
  ['cetak_pisah_prestasi', 'YA'],
  ['iuran_default', 100000],
  ['keuangan_mulai', '']
];

/** Halaman yang boleh dibuka akun Siswa, dipilih admin lewat Pengaturan. */
var HALAMAN_SISWA = [
  { kunci: 'dashboard',    nama: 'Dashboard — profil kebugaran & hasil tes' },
  { kunci: 'prestasi',     nama: 'Prestasi — daftar kejuaraan & medali' },
  { kunci: 'perkembangan', nama: 'Perkembangan — grafik antar sesi tes' },
  { kunci: 'laporan',      nama: 'Laporan — cetak / simpan PDF' },
  { kunci: 'atlet',        nama: 'Data Atlet — biodata (hanya melihat)' }
];

/** Bagian & format laporan cetak, dipilih admin lewat Pengaturan. */
var CETAK_BAGIAN_SAH = ['antropometri', 'nadi', 'profil', 'detail', 'prestasi'];
var CETAK_BENTUK_PROFIL_SAH = ['radar', 'bar', 'keduanya'];
var CETAK_BENTUK_DETAIL_SAH = ['diagram', 'tabel', 'keduanya'];
var CETAK_ORIENTASI_SAH = ['potret', 'lanskap'];
var CETAK_UKURAN_SAH = ['A4', 'Letter', 'F4'];

/* ============================================================
 *  Pembantu spreadsheet
 *  ============================================================ */

function ss_() {
  var id = String(SPREADSHEET_ID || '').trim().replace(/\/+$/, '');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Spreadsheet tidak ditemukan. Periksa SPREADSHEET_ID di Config.gs — ' +
                    'salin hanya deretan huruf/angka di antara "/d/" dan "/edit" pada URL.');
  }
  return ss;
}

function sheet_(nama) {
  var s = ss_().getSheetByName(nama);
  if (!s) throw new Error('Sheet "' + nama + '" belum ada. Jalankan setupAplikasi() sekali dari editor Apps Script.');
  return s;
}

/** Baca seluruh isi sheet sebagai array objek, memakai baris pertama sebagai header. */
function bacaSheet_(nama) {
  var data = sheet_(nama).getDataRange().getValues();
  if (data.length < 2) return [];
  var header = data.shift();
  return data
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      var o = {};
      header.forEach(function (h, i) { o[String(h).trim()] = r[i]; });
      return o;
    });
}

function headerSheet_(nama) {
  var sh = sheet_(nama);
  var kol = sh.getLastColumn();
  if (!kol) return [];
  return sh.getRange(1, 1, 1, kol).getValues()[0].map(function (h) { return String(h).trim(); });
}

/** Cari nomor baris (1-based di sheet) berdasarkan nilai kolom pertama. */
function cariBaris_(nama, id) {
  var kol = sheet_(nama).getDataRange().getValues();
  for (var i = 1; i < kol.length; i++) {
    if (String(kol[i][0]).trim() === String(id).trim()) return i + 1;
  }
  return -1;
}

function objKeBaris_(daftarKolom, obj) {
  return daftarKolom.map(function (k) {
    return obj[k] === undefined || obj[k] === null ? '' : obj[k];
  });
}

function idBaru_(namaSheet, prefix) {
  var data = sheet_(namaSheet).getDataRange().getValues();
  var maks = 0;
  for (var i = 1; i < data.length; i++) {
    var n = parseInt(String(data[i][0]).replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > maks) maks = n;
  }
  return prefix + (maks + 1);
}

/** Ubah teks bebas menjadi kunci kolom yang aman: "Push Up 1 Menit" -> "push_up_1_menit". */
function keKunci_(teks) {
  var k = String(teks || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!k) k = 'item';
  if (/^[0-9]/.test(k)) k = 'i_' + k;
  return k.slice(0, 40);
}

/* ============================================================
 *  Komponen & item tes — dibaca dari sheet, bukan dari kode
 *  ============================================================ */

function daftarKomponen_(semua) {
  return bacaSheet_(SH.KOMPONEN)
    .filter(function (k) { return semua || String(k.aktif).toUpperCase() !== 'TIDAK'; })
    .map(function (k) {
      return {
        id_komponen: String(k.id_komponen),
        nama: String(k.nama),
        bobot: Number(k.bobot) || 0,
        urutan: Number(k.urutan) || 0,
        aktif: String(k.aktif || 'YA').toUpperCase()
      };
    })
    .sort(function (a, b) { return a.urutan - b.urutan; });
}

function daftarItem_(semua) {
  var kmp = {};
  daftarKomponen_(true).forEach(function (k) { kmp[k.id_komponen] = k.nama; });
  return bacaSheet_(SH.ITEM)
    .filter(function (i) { return semua || String(i.aktif).toUpperCase() !== 'TIDAK'; })
    .map(function (i) {
      return {
        id_item: String(i.id_item),
        kunci: String(i.kunci),
        nama: String(i.nama),
        id_komponen: String(i.id_komponen),
        komponen: kmp[String(i.id_komponen)] || '(komponen terhapus)',
        satuan: String(i.satuan || ''),
        arah: String(i.arah || 'HIGHER').toUpperCase(),
        urutan: Number(i.urutan) || 0,
        aktif: String(i.aktif || 'YA').toUpperCase()
      };
    })
    .sort(function (a, b) { return a.urutan - b.urutan; });
}

/**
 * Pastikan setiap item tes punya kolomnya sendiri di DB_PERFORMA.
 * Kolom lama milik item yang sudah dihapus sengaja dibiarkan agar
 * data historis tidak ikut hilang.
 */
function sinkronKolomPerforma_() {
  var sh = sheet_(SH.PERFORMA);
  var header = headerSheet_(SH.PERFORMA);

  if (!header.length) {
    sh.getRange(1, 1, 1, KOLOM_PERFORMA_TETAP.length)
      .setValues([KOLOM_PERFORMA_TETAP]).setFontWeight('bold');
    sh.setFrozenRows(1);
    header = KOLOM_PERFORMA_TETAP.slice();
  }

  var perlu = [];
  KOLOM_PERFORMA_TETAP.forEach(function (k) {
    if (header.indexOf(k) < 0 && perlu.indexOf(k) < 0) perlu.push(k);
  });
  daftarItem_(true).forEach(function (it) {
    if (it.kunci && header.indexOf(it.kunci) < 0 && perlu.indexOf(it.kunci) < 0) perlu.push(it.kunci);
  });

  if (perlu.length) {
    sh.getRange(1, header.length + 1, 1, perlu.length).setValues([perlu]).setFontWeight('bold');
  }
  return headerSheet_(SH.PERFORMA);
}

/** Ganti nama kolom di DB_PERFORMA ketika kunci item berubah. */
function gantiKolomPerforma_(kunciLama, kunciBaru) {
  if (!kunciLama || kunciLama === kunciBaru) return;
  var header = headerSheet_(SH.PERFORMA);
  var i = header.indexOf(kunciLama);
  if (i < 0) return;
  if (header.indexOf(kunciBaru) >= 0) return; // kolom tujuan sudah ada, biarkan
  sheet_(SH.PERFORMA).getRange(1, i + 1).setValue(kunciBaru);
}

/* ============================================================
 *  SETUP — jalankan SEKALI dari editor Apps Script.
 *  Aman dijalankan ulang: sheet & data yang sudah ada tidak ditimpa,
 *  struktur versi lama dimigrasikan otomatis.
 *  ============================================================ */
function setupAplikasi() {
  var ss = ss_();
  var catatan = [];

  migrasiSheetLama_(ss, catatan);

  Object.keys(KOLOM).forEach(function (nama) {
    var s = ss.getSheetByName(nama);
    if (!s) s = ss.insertSheet(nama);
    if (s.getLastRow() === 0) {
      s.getRange(1, 1, 1, KOLOM[nama].length).setValues([KOLOM[nama]]).setFontWeight('bold');
      s.setFrozenRows(1);
    }
  });

  // Kolom periode TAGIHAN harus teks, agar "2026-10" tidak diubah Sheets menjadi tanggal.
  var shTg = ss.getSheetByName(SH.TAGIHAN);
  if (shTg) shTg.getRange(1, KOLOM.TAGIHAN.indexOf('periode') + 1, shTg.getMaxRows(), 1).setNumberFormat('@');
  skemaTagihan_();   // tambah kolom nama_biaya pada sheet TAGIHAN versi lama

  // Pengaturan
  var adaPengaturan = {};
  bacaSheet_(SH.PENGATURAN).forEach(function (r) { adaPengaturan[String(r.kunci)] = true; });
  var tambahan = PENGATURAN_BAWAAN.filter(function (p) { return !adaPengaturan[p[0]]; });
  if (tambahan.length) {
    var shP = sheet_(SH.PENGATURAN);
    shP.getRange(shP.getLastRow() + 1, 1, tambahan.length, 2).setValues(tambahan);
  }

  if (sheet_(SH.KOMPONEN).getLastRow() < 2) { seedKomponen_(); catatan.push('komponen bawaan dibuat'); }
  if (sheet_(SH.ITEM).getLastRow() < 2) { seedItem_(); catatan.push('item tes bawaan dibuat'); }

  if (sheet_(SH.KATEGORI).getLastRow() < 2) {
    sheet_(SH.KATEGORI).getRange(2, 1, 5, 5).setValues([
      [0,  40,  'Kurang Sekali', 'Perlu program dasar menyeluruh',        '#C0392B'],
      [41, 55,  'Kurang',        'Fokus pada komponen terlemah',          '#E67E22'],
      [56, 70,  'Cukup',         'Pertahankan sambil tingkatkan volume',  '#D9A31B'],
      [71, 85,  'Baik',          'Siap masuk program spesialisasi',       '#27924F'],
      [86, 100, 'Sangat Baik',   'Siap dipersiapkan untuk kejuaraan',     '#186B39']
    ]);
  }

  if (sheet_(SH.BENCHMARK).getLastRow() < 2) { seedBenchmark_(); catatan.push('benchmark bawaan dibuat'); }

  if (sheet_(SH.USERS).getLastRow() < 2) {
    seedPengguna_();
    catatan.push('3 akun bawaan dibuat: admin/admin123, pelatih/pelatih123, siswa/siswa123 — SEGERA GANTI kata sandinya');
  }

  sinkronKolomPerforma_();
  SpreadsheetApp.flush();

  return 'Setup selesai. ' + (catatan.length ? catatan.join('; ') + '.' : 'Tidak ada perubahan struktur.');
}

/** Pindahkan struktur versi lama (BOBOT, BENCHMARK berkolom lama, USERS berbasis email). */
function migrasiSheetLama_(ss, catatan) {
  // --- BENCHMARK lama: id_item, komponen, nama_item, kunci, ... ---
  var bm = ss.getSheetByName(SH.BENCHMARK);
  if (bm && bm.getLastRow() > 0) {
    var hBm = bm.getRange(1, 1, 1, bm.getLastColumn()).getValues()[0].map(String);
    if (hBm[0] === 'id_item') {
      var isi = bm.getDataRange().getValues();
      var idx = {};
      hBm.forEach(function (h, i) { idx[h.trim()] = i; });
      var baru = [];
      for (var i = 1; i < isi.length; i++) {
        if (!String(isi[i][0]).trim()) continue;
        baru.push(['BM' + (baru.length + 1), String(isi[i][idx.kunci]),
                   isi[i][idx.gender], isi[i][idx.usia_min], isi[i][idx.usia_max],
                   isi[i][idx.nilai_bm], isi[i][idx.aktif] || 'YA']);
      }
      bm.setName('BENCHMARK_LAMA_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm'));
      var bmBaru = ss.insertSheet(SH.BENCHMARK);
      bmBaru.getRange(1, 1, 1, KOLOM.BENCHMARK.length).setValues([KOLOM.BENCHMARK]).setFontWeight('bold');
      bmBaru.setFrozenRows(1);
      if (baru.length) bmBaru.getRange(2, 1, baru.length, KOLOM.BENCHMARK.length).setValues(baru);
      catatan.push('benchmark versi lama dipindahkan (' + baru.length + ' baris)');
    }
  }

  // --- BOBOT lama -> KOMPONEN ---
  var bobot = ss.getSheetByName('BOBOT');
  if (bobot && bobot.getLastRow() > 1 && !ss.getSheetByName(SH.KOMPONEN)) {
    var isiB = bobot.getDataRange().getValues();
    var rows = [];
    for (var j = 1; j < isiB.length; j++) {
      if (!String(isiB[j][0]).trim()) continue;
      rows.push(['KMP' + (rows.length + 1), String(isiB[j][0]), Number(isiB[j][1]) || 0, rows.length + 1, 'YA']);
    }
    var kmp = ss.insertSheet(SH.KOMPONEN);
    kmp.getRange(1, 1, 1, KOLOM.KOMPONEN.length).setValues([KOLOM.KOMPONEN]).setFontWeight('bold');
    kmp.setFrozenRows(1);
    if (rows.length) kmp.getRange(2, 1, rows.length, KOLOM.KOMPONEN.length).setValues(rows);
    bobot.setName('BOBOT_LAMA');
    catatan.push('bobot versi lama dipindahkan ke sheet KOMPONEN');
  }

  // --- USERS lama berbasis email ---
  var us = ss.getSheetByName(SH.USERS);
  if (us && us.getLastColumn() > 0) {
    var hU = us.getRange(1, 1, 1, us.getLastColumn()).getValues()[0].map(String);
    if (hU[0] === 'email') {
      us.setName('USERS_LAMA');
      catatan.push('USERS versi lama disimpan sebagai USERS_LAMA; akun baru berbasis kata sandi dibuat');
    }
  }
}

function seedKomponen_() {
  var rows = [
    ['KMP1', 'Flexibility', 20, 1, 'YA'],
    ['KMP2', 'Strength',    20, 2, 'YA'],
    ['KMP3', 'Power',       20, 3, 'YA'],
    ['KMP4', 'Agility',     20, 4, 'YA'],
    ['KMP5', 'Endurance',   20, 5, 'YA']
  ];
  sheet_(SH.KOMPONEN).getRange(2, 1, rows.length, KOLOM.KOMPONEN.length).setValues(rows);
}

function seedItem_() {
  var rows = [
    ['ITM1',  'sit_reach',        'Sit & Reach',           'KMP1', 'cm',         'HIGHER', 1,  'YA'],
    ['ITM2',  'push_up',          'Push Up 1 Menit',       'KMP2', 'repetisi',   'HIGHER', 2,  'YA'],
    ['ITM3',  'sit_up',           'Sit Up 2 Menit',        'KMP2', 'repetisi',   'HIGHER', 3,  'YA'],
    ['ITM4',  'core_stability',   'Core Stability',        'KMP2', 'level',      'HIGHER', 4,  'YA'],
    ['ITM5',  'triple_hop_kanan', 'Triple Hop Kanan',      'KMP3', 'meter',      'HIGHER', 5,  'YA'],
    ['ITM6',  'triple_hop_kiri',  'Triple Hop Kiri',       'KMP3', 'meter',      'HIGHER', 6,  'YA'],
    ['ITM7',  'illinois',         'Illinois Agility Test', 'KMP4', 'detik',      'LOWER',  7,  'YA'],
    ['ITM8',  'rast_power',       'RAST Average Power',    'KMP5', 'watt',       'HIGHER', 8,  'YA'],
    ['ITM9',  'rast_fatigue',     'RAST Fatigue Index',    'KMP5', 'watt/detik', 'LOWER',  9,  'YA'],
    ['ITM10', 'vo2max',           'Beep Test VO2Max',      'KMP5', 'ml/kg/min',  'HIGHER', 10, 'YA']
  ];
  sheet_(SH.ITEM).getRange(2, 1, rows.length, KOLOM.ITEM_TES.length).setValues(rows);
}

/**
 * Nilai awal benchmark, dibagi empat kelompok usia dan dua gender.
 * Semua angka bisa diubah admin lewat menu Pengaturan.
 */
function seedBenchmark_() {
  var band = [[5, 9, 0.55], [10, 12, 0.75], [13, 15, 0.90], [16, 40, 1.00]];
  var dasar = {
    sit_reach: 30, push_up: 35, sit_up: 50, core_stability: 12,
    triple_hop_kanan: 5.5, triple_hop_kiri: 5.5, illinois: 16,
    rast_power: 450, rast_fatigue: 4, vo2max: 50
  };
  var faktorPerempuan = {
    sit_reach: 1.10, push_up: 0.75, sit_up: 0.85, core_stability: 1,
    triple_hop_kanan: 0.88, triple_hop_kiri: 0.88, illinois: 1.08,
    rast_power: 0.80, rast_fatigue: 1.10, vo2max: 0.85
  };

  var item = daftarItem_(true);
  var rows = [], n = 1;
  ['Laki-laki', 'Perempuan'].forEach(function (g) {
    band.forEach(function (b) {
      item.forEach(function (it) {
        var nilai = dasar[it.kunci];
        if (nilai === undefined) return;               // item buatan admin: benchmark diisi manual
        nilai = it.arah === 'LOWER' ? nilai / b[2] : nilai * b[2];
        if (g === 'Perempuan') nilai = nilai * (faktorPerempuan[it.kunci] || 1);
        if (it.kunci === 'core_stability') nilai = Math.min(12, Math.round(nilai));
        rows.push(['BM' + (n++), it.kunci, g, b[0], b[1], Math.round(nilai * 100) / 100, 'YA']);
      });
    });
  });
  if (rows.length) {
    sheet_(SH.BENCHMARK).getRange(2, 1, rows.length, KOLOM.BENCHMARK.length).setValues(rows);
  }
}

function seedPengguna_() {
  var rows = [
    buatBarisPengguna_('admin',   'Administrator', 'Admin',   'admin123',   '', 'YA'),
    buatBarisPengguna_('pelatih', 'Pelatih',       'Pelatih', 'pelatih123', '', 'YA'),
    buatBarisPengguna_('siswa',   'Siswa',         'Siswa',   'siswa123',   '', 'YA')
  ];
  sheet_(SH.USERS).getRange(2, 1, rows.length, KOLOM.USERS.length).setValues(rows);
}
