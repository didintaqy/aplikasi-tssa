/** ============================================================
 *  Keuangan.gs — iuran atlet (hanya Admin & Pelatih)
 *
 *  Alur:
 *   - Tagihan bulanan dibuat otomatis untuk SEMUA atlet berstatus aktif.
 *     Nominal diambil dari tarif: Atlet (khusus) > Tingkatan > Default.
 *   - Pembayaran dicatat per tagihan (boleh dicicil). Metode: Tunai/Transfer/QRIS.
 *   - Pembayaran yang salah TIDAK dihapus, tetapi dibatalkan dengan alasan
 *     dan tetap tercatat (siapa, kapan, mengapa).
 *   - Saldo/terbayar/sisa selalu dihitung ulang dari catatan pembayaran,
 *     tidak disimpan sebagai angka sendiri, sehingga tidak bisa tidak cocok.
 *
 *  Sheet baru: TAGIHAN, PEMBAYARAN, TARIF_IURAN (dibuat oleh setupAplikasi()).
 *  ============================================================ */

var METODE_BAYAR = ['Tunai', 'Transfer', 'QRIS'];
var JENIS_TARIF = ['Tingkatan', 'Atlet'];
var PERAN_KEUANGAN = ['Admin', 'Pelatih'];
var NAMA_IURAN = 'Iuran bulanan';   // tagihan otomatis; selain ini dianggap "biaya lain" (custom)

/** Tagihan lama (tanpa nama_biaya) otomatis dianggap iuran bulanan. */
function eIuran_(t) {
  return !String(t.nama_biaya || '').trim() || String(t.nama_biaya) === NAMA_IURAN;
}

/** Sheet TAGIHAN versi lama belum punya kolom nama_biaya; tambahkan header-nya bila perlu. */
function skemaTagihan_() {
  var sh = sheet_(SH.TAGIHAN), n = KOLOM.TAGIHAN.length;
  var kini = sh.getRange(1, 1, 1, n).getValues()[0].map(String);
  if (kini[n - 1] !== KOLOM.TAGIHAN[n - 1]) {
    sh.getRange(1, n).setValue(KOLOM.TAGIHAN[n - 1]).setFontWeight('bold');
  }
}

/**
 * UJI DARI EDITOR — fungsi ini TANPA token, jadi aman dijalankan lewat tombol "Jalankan".
 * (Fungsi lain seperti getKonfigKeuangan butuh token sesi dari aplikasi web, sehingga
 * bila dijalankan dari editor akan selalu menjawab SESI_HABIS. Itu normal.)
 * Hasil tampil di Log eksekusi dan dikembalikan sebagai teks.
 */
function ujiKeuangan() {
  var baris = [];
  var lengkap = true;
  [SH.TAGIHAN, SH.PEMBAYARAN, SH.TARIF].forEach(function (n) {
    var ada = !!ss_().getSheetByName(n);
    if (!ada) lengkap = false;
    baris.push('Sheet ' + n + ': ' + (ada ? 'ada' : 'BELUM ADA'));
  });
  if (!lengkap) {
    baris.push('=> Jalankan setupAplikasi() dulu, lalu jalankan ujiKeuangan() lagi.');
  } else {
    var pk = pengaturanKeuangan_();
    var p = periodeSekarang_();
    var dibuat = pastikanTagihanOtomatis_(p);
    var bulanIni = muatTagihan_().filter(function (t) { return t.periode === p; });
    baris.push('Iuran default: Rp ' + pk.iuran_default + ' | pembukuan mulai: ' + pk.keuangan_mulai);
    baris.push('Tagihan baru dibuat sekarang: ' + dibuat);
    baris.push('Total tagihan ' + p + ': ' + bulanIni.length);
    baris.push('Tarif khusus terdaftar: ' + daftarTarif_().length);
    baris.push('=> Struktur keuangan siap. Buka aplikasi web dan masuk sebagai Admin/Pelatih.');
  }
  var teks = baris.join('\n');
  Logger.log(teks);
  return teks;
}

/* ---------------- Pembantu ---------------- */

function tz_() { return Session.getScriptTimeZone(); }

function periodeSekarang_() {
  return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM');
}

/** Sheets kadang mengubah "2026-10" menjadi tanggal; di sini selalu dikembalikan jadi teks. */
function periodeTeks_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM');
  return String(v).trim().slice(0, 7);
}

function validasiPeriode_(p) {
  p = String(p || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) {
    throw new Error('Periode tidak valid. Gunakan format tahun-bulan, contoh 2026-10.');
  }
  return p;
}

function geserPeriode_(p, n) {
  var y = Number(p.slice(0, 4)), m = Number(p.slice(5, 7)) - 1 + n;
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return y + '-' + ('0' + (m + 1)).slice(-2);
}

/** "2026-10-24" -> Date lokal (tanpa pergeseran zona waktu). */
function tglDariTeks_(teks) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(teks || ''));
  if (!m) throw new Error('Tanggal tidak valid.');
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) throw new Error('Tanggal tidak valid.');
  return d;
}

function waktuTeks_(t) {
  return t ? Utilities.formatDate(new Date(t), tz_(), 'yyyy-MM-dd HH:mm') : '';
}

function nomorId_(id) {
  var n = parseInt(String(id).replace(/\D/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function rupiahBulat_(v) {
  var n = Math.round(Number(v));
  return isNaN(n) ? NaN : n;
}

function denganKunci_(fn) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try { return fn(); } finally { kunci.releaseLock(); }
}

/* ---------------- Pengaturan keuangan ---------------- */

/** Tulis satu nilai ke sheet PENGATURAN; teks=true menjaga "2026-10" tetap teks. */
function tulisPengaturan_(kunci, nilai, teks) {
  var sh = sheet_(SH.PENGATURAN);
  var data = sh.getDataRange().getValues(), row = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === kunci) { row = i + 1; break; }
  }
  if (row < 0) { sh.appendRow([kunci, '']); row = sh.getLastRow(); }
  var sel = sh.getRange(row, 2);
  if (teks) sel.setNumberFormat('@');
  sel.setValue(nilai);
}

function pengaturanKeuangan_() {
  var o = {};
  bacaSheet_(SH.PENGATURAN).forEach(function (r) { o[String(r.kunci)] = r.nilai; });
  var def = Number(o.iuran_default);
  if (isNaN(def) || def < 0) def = 0;
  var mulai = periodeTeks_(o.keuangan_mulai);
  if (!/^\d{4}-\d{2}$/.test(mulai)) {
    mulai = periodeSekarang_();
    tulisPengaturan_('keuangan_mulai', mulai, true);
  }
  return { iuran_default: def, keuangan_mulai: mulai };
}

function getKonfigKeuangan(token) {
  var u = cekPeran_(token, PERAN_KEUANGAN);
  var p = pengaturanKeuangan_();
  return {
    periode_sekarang: periodeSekarang_(),
    iuran_default: p.iuran_default,
    keuangan_mulai: p.keuangan_mulai,
    metode: METODE_BAYAR,
    tarif: String(u.peran) === 'Admin' ? daftarTarif_() : []
  };
}

function simpanPengaturanKeuangan(token, obj) {
  cekPeran_(token, ['Admin']);
  var def = rupiahBulat_(obj.iuran_default);
  if (isNaN(def) || def < 0) throw new Error('Iuran default harus berupa angka 0 atau lebih.');
  var mulai = validasiPeriode_(obj.keuangan_mulai);
  tulisPengaturan_('iuran_default', def, false);
  tulisPengaturan_('keuangan_mulai', mulai, true);
  return getKonfigKeuangan(token);
}

/* ---------------- Tarif (default < tingkatan < atlet) ---------------- */

function daftarTarif_() {
  return bacaSheet_(SH.TARIF).map(function (t) {
    return {
      id_tarif: String(t.id_tarif),
      jenis: String(t.jenis),
      acuan: String(t.acuan),
      nominal: Number(t.nominal) || 0,
      keterangan: String(t.keterangan || ''),
      aktif: String(t.aktif || 'YA').toUpperCase()
    };
  });
}

function getTarif(token) {
  cekPeran_(token, ['Admin']);
  return daftarTarif_();
}

/**
 * Simpan seluruh daftar tarif sekaligus.
 * daftar: [{ id_tarif, jenis: 'Tingkatan'|'Atlet', acuan, nominal, keterangan, aktif }]
 * Untuk jenis Atlet, acuan = id_atlet. Nominal 0 berarti bebas iuran.
 */
function simpanTarif(token, daftar) {
  cekPeran_(token, ['Admin']);
  daftar = daftar || [];

  var dipakai = {}, nomor = 0;
  var atletSah = {};
  bacaSheet_(SH.ATLET).forEach(function (a) { atletSah[String(a.id_atlet)] = true; });
  bacaSheet_(SH.TARIF).forEach(function (t) { nomor = Math.max(nomor, nomorId_(t.id_tarif)); });
  daftar.forEach(function (t) { nomor = Math.max(nomor, nomorId_(t.id_tarif)); });

  var rows = daftar.map(function (t) {
    var jenis = String(t.jenis || '');
    if (JENIS_TARIF.indexOf(jenis) < 0) throw new Error('Jenis tarif harus Tingkatan atau Atlet.');
    var acuan = String(t.acuan || '').trim();
    if (!acuan) throw new Error('Tarif ' + jenis + ' belum menentukan ' + (jenis === 'Atlet' ? 'atlet' : 'nama tingkatan') + '.');
    if (jenis === 'Atlet' && !atletSah[acuan]) throw new Error('Atlet pada tarif khusus tidak ditemukan.');
    var nominal = rupiahBulat_(t.nominal);
    if (isNaN(nominal) || nominal < 0) throw new Error('Nominal tarif "' + acuan + '" tidak valid.');
    var aktif = String(t.aktif).toUpperCase() === 'TIDAK' ? 'TIDAK' : 'YA';

    if (aktif === 'YA') {
      var k = jenis + '|' + acuan.toLowerCase();
      if (dipakai[k]) throw new Error('Tarif ' + jenis + ' "' + acuan + '" ganda. Satu acuan hanya boleh punya satu tarif aktif.');
      dipakai[k] = true;
    }
    var id = String(t.id_tarif || '').trim() || ('TRF' + (++nomor));
    return [id, jenis, acuan, nominal, String(t.keterangan || ''), aktif];
  });

  return denganKunci_(function () {
    var sh = sheet_(SH.TARIF);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, KOLOM.TARIF_IURAN.length).clearContent();
    if (rows.length) sh.getRange(2, 1, rows.length, KOLOM.TARIF_IURAN.length).setValues(rows);
    return daftarTarif_();
  });
}

function tentukanTarif_(atlet, tarif, def) {
  var aktif = tarif.filter(function (t) { return t.aktif !== 'TIDAK'; });
  var khusus = aktif.filter(function (t) {
    return t.jenis === 'Atlet' && t.acuan === String(atlet.id_atlet);
  })[0];
  if (khusus) return { nominal: khusus.nominal, sumber: 'Atlet' };

  var tk = String(atlet.tingkatan || '').trim().toLowerCase();
  if (tk) {
    var grup = aktif.filter(function (t) {
      return t.jenis === 'Tingkatan' && t.acuan.trim().toLowerCase() === tk;
    })[0];
    if (grup) return { nominal: grup.nominal, sumber: 'Tingkatan' };
  }
  return { nominal: def, sumber: 'Default' };
}

/* ---------------- Tagihan ---------------- */

/** Buat tagihan yang belum ada untuk semua atlet aktif. Aman dipanggil berulang. */
function buatTagihanPeriode_(periode) {
  return denganKunci_(function () {
    skemaTagihan_();
    var sh = sheet_(SH.TAGIHAN);
    var ada = {}, maks = 0;
    bacaSheet_(SH.TAGIHAN).forEach(function (t) {
      if (periodeTeks_(t.periode) === periode && eIuran_(t)) ada[String(t.id_atlet)] = true;
      maks = Math.max(maks, nomorId_(t.id_tagihan));
    });

    var pk = pengaturanKeuangan_(), tarif = daftarTarif_();
    var sekarang = new Date(), rows = [];

    bacaSheet_(SH.ATLET).forEach(function (a) {
      if (String(a.status || 'Aktif') === 'Non-aktif') return;
      var id = String(a.id_atlet);
      if (ada[id]) return;
      var t = tentukanTarif_({ id_atlet: id, tingkatan: a.tingkatan }, tarif, pk.iuran_default);
      if (!(t.nominal > 0)) return;                 // nominal 0 = bebas iuran, tidak ditagih
      rows.push(['TGH' + (++maks), id, periode, t.nominal, t.sumber, sekarang, '', NAMA_IURAN]);
    });

    if (rows.length) {
      var awal = sh.getLastRow() + 1;
      sh.getRange(awal, KOLOM.TAGIHAN.indexOf('periode') + 1, rows.length, 1).setNumberFormat('@');
      sh.getRange(awal, 1, rows.length, KOLOM.TAGIHAN.length).setValues(rows);
    }
    return rows.length;
  });
}

/** Otomatis hanya untuk periode sejak pembukuan dimulai sampai bulan berjalan. */
function pastikanTagihanOtomatis_(periode) {
  var pk = pengaturanKeuangan_();
  if (periode < pk.keuangan_mulai || periode > periodeSekarang_()) return 0;
  return buatTagihanPeriode_(periode);
}

/** Semua tagihan lengkap dengan terbayar, sisa, dan status — dihitung dari PEMBAYARAN. */
function muatTagihan_() {
  skemaTagihan_();
  var bayar = {};
  bacaSheet_(SH.PEMBAYARAN).forEach(function (b) {
    if (String(b.status || 'Sah') === 'Batal') return;
    var k = String(b.id_tagihan);
    bayar[k] = (bayar[k] || 0) + (Number(b.jumlah) || 0);
  });

  var atlet = {};
  bacaSheet_(SH.ATLET).forEach(function (a) {
    atlet[String(a.id_atlet)] = {
      nama: String(a.nama), tingkatan: String(a.tingkatan || ''), status: String(a.status || 'Aktif')
    };
  });

  return bacaSheet_(SH.TAGIHAN).map(function (t) {
    var nominal = Number(t.nominal) || 0;
    var terbayar = bayar[String(t.id_tagihan)] || 0;
    var a = atlet[String(t.id_atlet)] || { nama: '(atlet terhapus)', tingkatan: '', status: '' };
    return {
      id_tagihan: String(t.id_tagihan),
      id_atlet: String(t.id_atlet),
      nama_atlet: a.nama,
      tingkatan: a.tingkatan,
      status_atlet: a.status,
      periode: periodeTeks_(t.periode),
      nominal: nominal,
      terbayar: terbayar,
      sisa: Math.max(0, nominal - terbayar),
      status: terbayar >= nominal ? 'Lunas' : (terbayar > 0 ? 'Sebagian' : 'Belum'),
      sumber: String(t.sumber || ''),
      catatan: String(t.catatan || ''),
      nama_biaya: eIuran_(t) ? NAMA_IURAN : String(t.nama_biaya),
      custom: !eIuran_(t)
    };
  });
}

function jumlahkanTagihan_(daftar) {
  var r = { total_tagihan: 0, total_terbayar: 0, total_sisa: 0, lunas: 0, sebagian: 0, belum: 0 };
  daftar.forEach(function (t) {
    r.total_tagihan += t.nominal; r.total_terbayar += t.terbayar; r.total_sisa += t.sisa;
    if (t.status === 'Lunas') r.lunas++; else if (t.status === 'Sebagian') r.sebagian++; else r.belum++;
  });
  return r;
}

function getIuran(token, periode) {
  cekPeran_(token, PERAN_KEUANGAN);
  periode = validasiPeriode_(periode);
  var dibuat = pastikanTagihanOtomatis_(periode);
  var daftar = muatTagihan_()
    .filter(function (t) { return t.periode === periode; })
    .sort(function (a, b) { return a.nama_atlet.toLowerCase() < b.nama_atlet.toLowerCase() ? -1 : 1; });
  return {
    periode: periode,
    daftar: daftar,
    ringkas: jumlahkanTagihan_(daftar),
    dibuat: dibuat,
    sebelum_mulai: periode < pengaturanKeuangan_().keuangan_mulai
  };
}

/** Pembuatan manual untuk bulan tertentu (mis. mengejar bulan sebelum pembukuan dimulai). */
function buatTagihan(token, periode) {
  cekPeran_(token, PERAN_KEUANGAN);
  periode = validasiPeriode_(periode);
  if (periode > periodeSekarang_()) throw new Error('Tagihan untuk bulan mendatang belum dapat dibuat.');
  return { dibuat: buatTagihanPeriode_(periode) };
}

/**
 * Buat tagihan BIAYA LAIN yang nama dan nominalnya ditulis sendiri
 * (seragam, pendaftaran, biaya kejuaraan, dan seterusnya).
 * data: { nama_biaya, nominal, periode: 'yyyy-MM', sasaran: 'semua'|'pilih', id_atlet: [..], catatan }
 * Tagihan yang sama (atlet + bulan + nama biaya) tidak dibuat dua kali.
 */
function buatBiayaCustom(token, data) {
  cekPeran_(token, PERAN_KEUANGAN);
  var nama = String(data.nama_biaya || '').trim().slice(0, 60);
  if (!nama) throw new Error('Nama biaya wajib diisi.');
  if (nama.toLowerCase() === NAMA_IURAN.toLowerCase()) {
    throw new Error('Nama "' + NAMA_IURAN + '" dipakai untuk tagihan otomatis. Gunakan nama biaya lain.');
  }
  var nominal = rupiahBulat_(data.nominal);
  if (isNaN(nominal) || nominal <= 0) throw new Error('Nominal biaya harus lebih dari 0.');
  var periode = validasiPeriode_(data.periode);

  var aktif = bacaSheet_(SH.ATLET).filter(function (a) {
    return String(a.status || 'Aktif') !== 'Non-aktif';
  });
  var sasaran;
  if (String(data.sasaran) === 'pilih') {
    var pilih = {};
    (data.id_atlet || []).forEach(function (id) { pilih[String(id)] = true; });
    sasaran = bacaSheet_(SH.ATLET).filter(function (a) { return pilih[String(a.id_atlet)]; });
    if (!sasaran.length) throw new Error('Pilih minimal satu atlet.');
  } else {
    sasaran = aktif;
    if (!sasaran.length) throw new Error('Belum ada atlet aktif.');
  }

  return denganKunci_(function () {
    skemaTagihan_();
    var sh = sheet_(SH.TAGIHAN);
    var maks = 0, ada = {};
    bacaSheet_(SH.TAGIHAN).forEach(function (x) {
      maks = Math.max(maks, nomorId_(x.id_tagihan));
      if (periodeTeks_(x.periode) === periode && String(x.nama_biaya || '').toLowerCase() === nama.toLowerCase()) {
        ada[String(x.id_atlet)] = true;
      }
    });

    var sekarang = new Date(), rows = [], lewat = 0;
    sasaran.forEach(function (a) {
      var id = String(a.id_atlet);
      if (ada[id]) { lewat++; return; }
      rows.push(['TGH' + (++maks), id, periode, nominal, 'Custom', sekarang, String(data.catatan || ''), nama]);
    });

    if (rows.length) {
      var awal = sh.getLastRow() + 1;
      sh.getRange(awal, KOLOM.TAGIHAN.indexOf('periode') + 1, rows.length, 1).setNumberFormat('@');
      sh.getRange(awal, 1, rows.length, KOLOM.TAGIHAN.length).setValues(rows);
    }
    return { dibuat: rows.length, dilewati: lewat };
  });
}

/** Ubah nominal (mis. potongan) atau catatan satu tagihan. */
function ubahTagihan(token, data) {
  cekPeran_(token, PERAN_KEUANGAN);
  var nominal = rupiahBulat_(data.nominal);
  if (isNaN(nominal) || nominal < 0) throw new Error('Nominal tagihan tidak valid.');

  return denganKunci_(function () {
    var row = cariBaris_(SH.TAGIHAN, data.id_tagihan);
    if (row < 0) throw new Error('Tagihan tidak ditemukan.');
    var t = muatTagihan_().filter(function (x) { return x.id_tagihan === String(data.id_tagihan); })[0];
    if (nominal < t.terbayar) {
      throw new Error('Nominal tidak boleh lebih kecil dari yang sudah dibayar (Rp ' + t.terbayar + ').');
    }
    var sh = sheet_(SH.TAGIHAN);
    var namaBaru = String(data.nama_biaya || '').trim().slice(0, 60);
    if (t.custom && namaBaru) {
      if (namaBaru.toLowerCase() === NAMA_IURAN.toLowerCase()) {
        throw new Error('Nama "' + NAMA_IURAN + '" dipakai untuk tagihan otomatis.');
      }
      sh.getRange(row, KOLOM.TAGIHAN.indexOf('nama_biaya') + 1).setValue(namaBaru);
    }
    if (nominal !== t.nominal) {
      sh.getRange(row, KOLOM.TAGIHAN.indexOf('nominal') + 1).setValue(nominal);
      sh.getRange(row, KOLOM.TAGIHAN.indexOf('sumber') + 1).setValue('Manual');
    }
    sh.getRange(row, KOLOM.TAGIHAN.indexOf('catatan') + 1).setValue(String(data.catatan || ''));
    return muatTagihan_().filter(function (x) { return x.id_tagihan === String(data.id_tagihan); })[0];
  });
}

/* ---------------- Pembayaran ---------------- */

/**
 * data: { id_tagihan, tanggal: 'yyyy-MM-dd', jumlah, metode, catatan }
 * Boleh dicicil; jumlah tidak boleh melebihi sisa tagihan.
 */
function simpanPembayaran(token, data) {
  var u = cekPeran_(token, PERAN_KEUANGAN);
  var jumlah = rupiahBulat_(data.jumlah);
  if (isNaN(jumlah) || jumlah <= 0) throw new Error('Jumlah pembayaran harus lebih dari 0.');
  if (METODE_BAYAR.indexOf(String(data.metode)) < 0) {
    throw new Error('Metode pembayaran harus ' + METODE_BAYAR.join(', ') + '.');
  }
  var tanggal = tglDariTeks_(data.tanggal);

  return denganKunci_(function () {
    var t = muatTagihan_().filter(function (x) { return x.id_tagihan === String(data.id_tagihan); })[0];
    if (!t) throw new Error('Tagihan tidak ditemukan.');
    if (jumlah > t.sisa) {
      throw new Error(t.sisa > 0
        ? 'Jumlah melebihi sisa tagihan (Rp ' + t.sisa + ').'
        : 'Tagihan ini sudah lunas.');
    }
    var id = idBaru_(SH.PEMBAYARAN, 'BYR');
    sheet_(SH.PEMBAYARAN).appendRow([
      id, t.id_tagihan, t.id_atlet, tanggal, jumlah, String(data.metode),
      String(data.catatan || ''), 'Sah', String(u.username), new Date(), '', '', ''
    ]);
    return {
      id_bayar: id,
      tagihan: muatTagihan_().filter(function (x) { return x.id_tagihan === t.id_tagihan; })[0]
    };
  });
}

/** Pembayaran tidak dihapus: ditandai Batal beserta alasan, pelaku, dan waktunya. */
function batalkanPembayaran(token, idBayar, alasan) {
  var u = cekPeran_(token, PERAN_KEUANGAN);
  alasan = String(alasan || '').trim();
  if (!alasan) throw new Error('Alasan pembatalan wajib diisi.');

  return denganKunci_(function () {
    var row = cariBaris_(SH.PEMBAYARAN, idBayar);
    if (row < 0) throw new Error('Data pembayaran tidak ditemukan.');
    var sh = sheet_(SH.PEMBAYARAN);
    var kol = KOLOM.PEMBAYARAN;
    var nilai = sh.getRange(row, 1, 1, kol.length).getValues()[0];
    if (String(nilai[kol.indexOf('status')]) === 'Batal') throw new Error('Pembayaran ini sudah dibatalkan.');

    nilai[kol.indexOf('status')] = 'Batal';
    nilai[kol.indexOf('alasan_batal')] = alasan;
    nilai[kol.indexOf('dibatalkan_oleh')] = String(u.username);
    nilai[kol.indexOf('dibatalkan_pada')] = new Date();
    sh.getRange(row, 1, 1, kol.length).setValues([nilai]);
    return true;
  });
}

/** Buku kas: seluruh penerimaan (termasuk yang dibatalkan) pada satu bulan atau semua bulan. */
function getKas(token, periode, semua) {
  cekPeran_(token, PERAN_KEUANGAN);
  if (!semua) periode = validasiPeriode_(periode);

  var nama = {};
  bacaSheet_(SH.ATLET).forEach(function (a) { nama[String(a.id_atlet)] = String(a.nama); });
  var periodeTagihan = {}, namaTagihan = {};
  bacaSheet_(SH.TAGIHAN).forEach(function (t) {
    periodeTagihan[String(t.id_tagihan)] = periodeTeks_(t.periode);
    namaTagihan[String(t.id_tagihan)] = eIuran_(t) ? NAMA_IURAN : String(t.nama_biaya);
  });

  var daftar = bacaSheet_(SH.PEMBAYARAN).map(function (b) {
    return {
      id_bayar: String(b.id_bayar),
      id_tagihan: String(b.id_tagihan),
      id_atlet: String(b.id_atlet),
      nama_atlet: nama[String(b.id_atlet)] || '(atlet terhapus)',
      periode_tagihan: periodeTagihan[String(b.id_tagihan)] || '',
      nama_biaya: namaTagihan[String(b.id_tagihan)] || NAMA_IURAN,
      tanggal: tanggalTeks_(b.tanggal),
      jumlah: Number(b.jumlah) || 0,
      metode: String(b.metode),
      catatan: String(b.catatan || ''),
      status: String(b.status || 'Sah'),
      dicatat_oleh: String(b.dicatat_oleh || ''),
      dicatat_pada: waktuTeks_(b.dicatat_pada),
      alasan_batal: String(b.alasan_batal || ''),
      dibatalkan_oleh: String(b.dibatalkan_oleh || ''),
      dibatalkan_pada: waktuTeks_(b.dibatalkan_pada)
    };
  }).filter(function (b) {
    return semua || b.tanggal.slice(0, 7) === periode;
  }).sort(function (a, b) {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1;
    return nomorId_(b.id_bayar) - nomorId_(a.id_bayar);
  });

  var total = 0, batal = 0, metode = {};
  METODE_BAYAR.forEach(function (m) { metode[m] = 0; });
  daftar.forEach(function (b) {
    if (b.status === 'Batal') { batal++; return; }
    total += b.jumlah;
    metode[b.metode] = (metode[b.metode] || 0) + b.jumlah;
  });

  return { periode: semua ? '' : periode, daftar: daftar, total: total, per_metode: metode, jumlah_batal: batal };
}

/* ---------------- Ringkasan & tunggakan ---------------- */

/**
 * Tunggakan = sisa tagihan pada bulan SEBELUM bulan berjalan.
 * sertakanBerjalan=true ikut menghitung tagihan bulan berjalan.
 */
function getRingkasanKeuangan(token, sertakanBerjalan) {
  cekPeran_(token, PERAN_KEUANGAN);
  var p = periodeSekarang_();
  pastikanTagihanOtomatis_(p);

  var tagihan = muatTagihan_();
  var sah = bacaSheet_(SH.PEMBAYARAN)
    .filter(function (b) { return String(b.status || 'Sah') !== 'Batal'; })
    .map(function (b) {
      return { tanggal: tanggalTeks_(b.tanggal), jumlah: Number(b.jumlah) || 0, metode: String(b.metode) };
    });

  var bulanIni = tagihan.filter(function (t) { return t.periode === p; });
  var rBulan = jumlahkanTagihan_(bulanIni);

  var diterima = 0, perMetode = {};
  METODE_BAYAR.forEach(function (m) { perMetode[m] = 0; });
  sah.forEach(function (b) {
    if (b.tanggal.slice(0, 7) !== p) return;
    diterima += b.jumlah;
    perMetode[b.metode] = (perMetode[b.metode] || 0) + b.jumlah;
  });

  var grup = {}, totalTunggakan = 0;
  tagihan.forEach(function (t) {
    if (t.sisa <= 0) return;
    if (sertakanBerjalan ? t.periode > p : t.periode >= p) return;
    var g = grup[t.id_atlet];
    if (!g) {
      g = grup[t.id_atlet] = {
        id_atlet: t.id_atlet, nama: t.nama_atlet, tingkatan: t.tingkatan,
        status_atlet: t.status_atlet, bulan: [], item: [], total: 0
      };
    }
    g.bulan.push(t.periode);
    g.item.push({ periode: t.periode, nama_biaya: t.nama_biaya });
    g.total += t.sisa;
    totalTunggakan += t.sisa;
  });
  var tunggakan = Object.keys(grup).map(function (k) {
    grup[k].bulan.sort();
    grup[k].item.sort(function (a, b) { return a.periode < b.periode ? -1 : 1; });
    grup[k].jumlah_bulan = grup[k].bulan.length;
    return grup[k];
  }).sort(function (a, b) { return b.total - a.total; });

  var arus = [];
  for (var i = 5; i >= 0; i--) {
    var per = geserPeriode_(p, -i);
    var tg = 0, dt = 0;
    tagihan.forEach(function (t) { if (t.periode === per) tg += t.nominal; });
    sah.forEach(function (b) { if (b.tanggal.slice(0, 7) === per) dt += b.jumlah; });
    arus.push({ periode: per, tagihan: tg, diterima: dt });
  }

  return {
    periode: p,
    sertakan_berjalan: !!sertakanBerjalan,
    tagihan_bulan_ini: rBulan,
    diterima_bulan_ini: diterima,
    per_metode: perMetode,
    total_tunggakan: totalTunggakan,
    tunggakan: tunggakan,
    arus: arus
  };
}

/* ---------------- Rekap keuangan per atlet ---------------- */

function getRekapAtlet(token, idAtlet, tahun) {
  cekPeran_(token, PERAN_KEUANGAN);
  tahun = String(tahun || '').trim();
  if (tahun && !/^\d{4}$/.test(tahun)) throw new Error('Tahun tidak valid.');

  var a = getAtlet(idAtlet);
  if (!a) throw new Error('Atlet tidak ditemukan.');
  pastikanTagihanOtomatis_(periodeSekarang_());

  var tagihan = muatTagihan_().filter(function (t) {
    return t.id_atlet === String(idAtlet) && (!tahun || t.periode.slice(0, 4) === tahun);
  }).sort(function (x, y) { return x.periode < y.periode ? -1 : 1; });

  var peta = {};
  tagihan.forEach(function (t) { peta[t.id_tagihan] = t; });

  var pembayaran = bacaSheet_(SH.PEMBAYARAN).filter(function (b) {
    return String(b.status || 'Sah') !== 'Batal' && peta[String(b.id_tagihan)] !== undefined;
  }).map(function (b) {
    return {
      tanggal: tanggalTeks_(b.tanggal),
      periode_tagihan: peta[String(b.id_tagihan)].periode,
      nama_biaya: peta[String(b.id_tagihan)].nama_biaya,
      jumlah: Number(b.jumlah) || 0,
      metode: String(b.metode),
      catatan: String(b.catatan || '')
    };
  }).sort(function (x, y) { return x.tanggal < y.tanggal ? -1 : 1; });

  return {
    atlet: { id_atlet: a.id_atlet, nama: a.nama, tingkatan: a.tingkatan, status: a.status },
    tahun: tahun,
    tagihan: tagihan,
    pembayaran: pembayaran,
    total: jumlahkanTagihan_(tagihan),
    dicetak: waktuTeks_(new Date())
  };
}

/* ---------------- Pemicu bulanan (opsional) ---------------- */

/**
 * Tagihan sudah dibuat otomatis saat halaman Keuangan dibuka. Jalankan fungsi ini
 * SEKALI dari editor Apps Script bila tagihan ingin dibuat tepat tiap tanggal 1,
 * walau tidak ada yang membuka aplikasi.
 */
function pasangPemicuTagihan() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tagihanOtomatisBulanan') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tagihanOtomatisBulanan').timeBased().onMonthDay(1).atHour(1).create();
  return 'Pemicu terpasang: tagihan dibuat otomatis tiap tanggal 1 sekitar pukul 01.00.';
}

function tagihanOtomatisBulanan() {
  return pastikanTagihanOtomatis_(periodeSekarang_());
}

/* ---------------- Status SPP per atlet (Revisi 2) ---------------- */

/**
 * Status SPP (iuran bulanan) satu atlet: sudah bayar atau belum, per bulan.
 * - Admin & Pelatih: boleh untuk atlet mana pun.
 * - Siswa: HANYA untuk atlet yang ditautkan ke akunnya, dan hanya bila halaman
 *   Dashboard dibuka untuk siswa di Pengaturan.
 * Hanya membaca; tidak pernah membuat tagihan.
 */
function getSppAtlet(token, idAtlet) {
  var u = sesi_(token);
  var id = String(idAtlet || '');
  if (String(u.peran) === 'Siswa') {
    if (!String(u.id_atlet || '') || String(u.id_atlet) !== id) {
      throw new Error('Akses ditolak. Akun siswa hanya dapat melihat SPP miliknya sendiri.');
    }
    cekHalaman_(u, ['dashboard', 'perkembangan', 'laporan', 'atlet']);
  }
  var a = getAtlet(id);
  if (!a) throw new Error('Atlet tidak ditemukan.');

  var p = periodeSekarang_();
  var mulai = pengaturanKeuangan_().keuangan_mulai;
  var spp = muatTagihan_().filter(function (t) { return t.id_atlet === id && !t.custom; });

  var peta = {}, pertama = '';
  spp.forEach(function (t) {
    peta[t.periode] = t;
    if (!pertama || t.periode < pertama) pertama = t.periode;
  });

  // Jendela tampil: 12 bulan terakhir, tidak lebih awal dari pembukuan / tagihan pertama.
  var batas = (pertama && pertama < mulai) ? pertama : mulai;
  var awal = geserPeriode_(p, -11);
  if (awal < batas) awal = batas;
  if (awal > p) awal = p;

  var riwayat = [];
  for (var per = p; per >= awal; per = geserPeriode_(per, -1)) {
    var t = peta[per];
    riwayat.push(t
      ? { periode: per, ada: true, nominal: t.nominal, terbayar: t.terbayar, sisa: t.sisa, status: t.status }
      : { periode: per, ada: false, nominal: 0, terbayar: 0, sisa: 0, status: 'Tidak ada' });
  }

  var tung = spp.filter(function (t) { return t.periode < p && t.sisa > 0; })
    .sort(function (x, y) { return x.periode < y.periode ? -1 : 1; });
  var totalTung = 0;
  tung.forEach(function (t) { totalTung += t.sisa; });

  return {
    atlet: { id_atlet: a.id_atlet, nama: a.nama, status: a.status },
    periode: p,
    bulan_ini: riwayat[0],
    riwayat: riwayat,
    tunggakan: {
      total: totalTung,
      jumlah_bulan: tung.length,
      bulan: tung.map(function (t) { return t.periode; })
    }
  };
}
