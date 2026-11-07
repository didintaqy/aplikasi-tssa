/** ============================================================
 *  KasUmum.gs — uang masuk & keluar, dan kewenangan edit penuh Admin
 *  (hanya penambahan; Keuangan.gs tidak diubah)
 *
 *  1. KAS_UMUM  : pemasukan non-iuran (donasi, sponsor, ...) dan pengeluaran
 *                 (sewa tempat, honor, ...). Kategori dapat diatur Admin; foto nota opsional.
 *  2. Buku kas gabungan: pembayaran iuran/biaya atlet OTOMATIS tampil sebagai pemasukan,
 *                 lengkap dengan saldo awal, total masuk, total keluar, saldo akhir, filter bulan.
 *  3. Admin boleh mengedit semua transaksi (pembayaran, tagihan, kas umum) dan
 *                 menghapus permanen. SETIAP edit/hapus dicatat di LOG_KEUANGAN
 *                 (siapa, kapan, nilai lama → baru, atau salinan data yang dihapus).
 *
 *  SEMUA fungsi di sini khusus Admin. Pelatih tetap seperti sebelumnya (mencatat
 *  pembayaran dan membatalkan lewat Keuangan.gs).
 *
 *  Sheet baru dibuat otomatis: KAS_UMUM, LOG_KEUANGAN.
 *  Memakai pembantu dari Keuangan.gs/AtletLanjut.gs: denganKunci_, tz_, waktuTeks_,
 *  nomorId_, rupiahBulat_, tulisPengaturan_, muatTagihan_, tglValid_, METODE_BAYAR,
 *  NAMA_IURAN, eIuran_, validasiPeriode_, tanggalTeks_ (Performa.gs).
 *  ============================================================ */

var KAS_NAMA = 'KAS_UMUM';
var KAS_KOLOM = ['id_kas', 'tanggal', 'jenis', 'kategori', 'jumlah', 'metode', 'keterangan',
                 'nota_id', 'dicatat_oleh', 'dicatat_pada', 'diubah_oleh', 'diubah_pada'];
var LOG_KEU_NAMA = 'LOG_KEUANGAN';
var LOG_KEU_KOLOM = ['waktu', 'oleh', 'aksi', 'objek', 'id_objek', 'rincian'];
var JENIS_KAS = ['Masuk', 'Keluar'];
var KAT_MASUK_DEF = ['Donasi', 'Sponsor', 'Pendaftaran', 'Lain-lain'];
var KAT_KELUAR_DEF = ['Sewa tempat', 'Honor pelatih', 'Peralatan', 'Konsumsi', 'Transport', 'Kejuaraan', 'Lain-lain'];

/* ---------------- Sheet & catatan ---------------- */

function sheetKas_() {
  var ss = ss_();
  var s = ss.getSheetByName(KAS_NAMA);
  if (!s) {
    s = ss.insertSheet(KAS_NAMA);
    s.appendRow(KAS_KOLOM);
    s.getRange(1, 1, 1, KAS_KOLOM.length).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function sheetLogKeu_() {
  var ss = ss_();
  var s = ss.getSheetByName(LOG_KEU_NAMA);
  if (!s) {
    s = ss.insertSheet(LOG_KEU_NAMA);
    s.appendRow(LOG_KEU_KOLOM);
    s.getRange(1, 1, 1, LOG_KEU_KOLOM.length).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

/** Catatan audit. Bila gagal menulis, PEKERJAAN UTAMA dibatalkan agar tidak ada edit tanpa jejak. */
function logKeu_(oleh, aksi, objek, idObjek, rincian) {
  sheetLogKeu_().appendRow([new Date(), String(oleh || ''), String(aksi), String(objek),
                            String(idObjek || ''), String(rincian || '')]);
}

function getLogKeuangan(token, batas) {
  cekPeran_(token, ['Admin']);
  var n = Math.min(Math.max(Number(batas) || 50, 1), 300);
  var s = sheetLogKeu_();
  var jml = Math.max(s.getLastRow() - 1, 0);
  if (!jml) return [];
  var mulai = Math.max(2, s.getLastRow() - n + 1);
  return s.getRange(mulai, 1, s.getLastRow() - mulai + 1, LOG_KEU_KOLOM.length).getValues()
    .map(function (r) {
      return { waktu: waktuTeks_(r[0]), oleh: String(r[1]), aksi: String(r[2]),
               objek: String(r[3]), id_objek: String(r[4]), rincian: String(r[5]) };
    }).reverse();
}

function perbedaan_(lama, baru, label) {
  var out = [];
  Object.keys(baru).forEach(function (k) {
    if (String(lama[k]) !== String(baru[k])) out.push((label[k] || k) + ': "' + lama[k] + '" → "' + baru[k] + '"');
  });
  return out;
}

/* ---------------- Pengaturan kategori & saldo awal ---------------- */

function konfigKas_() {
  var o = {};
  bacaSheet_(SH.PENGATURAN).forEach(function (r) { o[String(r.kunci)] = r.nilai; });
  var daftar = function (k, def) {
    var v = String(o[k] === undefined || o[k] === null ? '' : o[k]).trim();
    if (!v) return def.slice();
    var h = v.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
    return h.length ? h : def.slice();
  };
  var sa = Number(o.keuangan_saldo_awal);
  if (isNaN(sa)) sa = 0;
  return {
    kat_masuk: daftar('keuangan_kat_masuk', KAT_MASUK_DEF),
    kat_keluar: daftar('keuangan_kat_keluar', KAT_KELUAR_DEF),
    saldo_awal: sa
  };
}

function getKonfigKas(token) {
  cekPeran_(token, ['Admin']);
  var k = konfigKas_();
  k.metode = METODE_BAYAR;
  return k;
}

function rapikanKategori_(arr, label) {
  var hasil = [], pernah = {};
  (arr instanceof Array ? arr : []).forEach(function (k) {
    k = String(k === undefined || k === null ? '' : k).trim();
    if (!k) return;
    if (k.length > 40) throw new Error('Nama kategori "' + k.slice(0, 20) + '…" terlalu panjang (maks. 40 karakter).');
    if (k.indexOf(',') >= 0) throw new Error('Nama kategori tidak boleh mengandung koma: "' + k + '".');
    var low = k.toLowerCase();
    if (pernah[low]) return;
    pernah[low] = true;
    hasil.push(k);
  });
  if (!hasil.length) throw new Error('Kategori ' + label + ' minimal harus ada satu.');
  if (hasil.length > 30) throw new Error('Kategori ' + label + ' maksimal 30.');
  return hasil;
}

function simpanKonfigKas(token, obj) {
  var u = cekPeran_(token, ['Admin']);
  obj = obj || {};
  var masuk = rapikanKategori_(obj.kat_masuk, 'pemasukan');
  var keluar = rapikanKategori_(obj.kat_keluar, 'pengeluaran');
  var sa = rupiahBulat_(obj.saldo_awal === '' || obj.saldo_awal === undefined ? 0 : obj.saldo_awal);
  if (isNaN(sa)) throw new Error('Saldo awal harus berupa angka.');

  return denganKunci_(function () {
    var lama = konfigKas_();
    tulisPengaturan_('keuangan_kat_masuk', masuk.join(','), true);
    tulisPengaturan_('keuangan_kat_keluar', keluar.join(','), true);
    tulisPengaturan_('keuangan_saldo_awal', sa, false);
    logKeu_(u.username, 'UBAH_PENGATURAN', 'KONFIG_KAS', '',
      'saldo awal ' + lama.saldo_awal + ' → ' + sa + '; kategori masuk: ' + masuk.join(', ') +
      '; kategori keluar: ' + keluar.join(', '));
    return getKonfigKas(token);
  });
}

/* ---------------- Kas umum (masuk & keluar) ---------------- */

function kasKeObj_(o) {
  return {
    id_kas: String(o.id_kas),
    tanggal: tanggalTeks_(o.tanggal),
    jenis: String(o.jenis),
    kategori: String(o.kategori || ''),
    jumlah: Number(o.jumlah) || 0,
    metode: String(o.metode || ''),
    keterangan: String(o.keterangan || ''),
    nota_id: String(o.nota_id || ''),
    nota_url: o.nota_id ? urlFoto_(o.nota_id) : '',
    dicatat_oleh: String(o.dicatat_oleh || ''),
    diubah_oleh: String(o.diubah_oleh || '')
  };
}

function bacaBarisKas_(row) {
  var nilai = sheetKas_().getRange(row, 1, 1, KAS_KOLOM.length).getValues()[0];
  var o = {};
  KAS_KOLOM.forEach(function (k, i) { o[k] = nilai[i]; });
  return o;
}

function bersihkanKas_(data) {
  data = data || {};
  var jenis = String(data.jenis || '');
  if (JENIS_KAS.indexOf(jenis) < 0) throw new Error('Jenis harus Masuk atau Keluar.');
  var kategori = String(data.kategori || '').trim().slice(0, 40);
  if (!kategori) throw new Error('Kategori wajib dipilih.');
  var jumlah = rupiahBulat_(data.jumlah);
  if (isNaN(jumlah) || jumlah <= 0) throw new Error('Jumlah harus lebih dari 0.');
  var tgl = tglValid_(data.tanggal);
  if (!tgl) throw new Error('Tanggal tidak valid.');
  var metode = String(data.metode || '');
  if (METODE_BAYAR.indexOf(metode) < 0) throw new Error('Metode harus ' + METODE_BAYAR.join(', ') + '.');
  return {
    jenis: jenis, kategori: kategori, jumlah: jumlah, tanggal: tgl, metode: metode,
    keterangan: String(data.keterangan || '').trim().slice(0, 300)
  };
}

/**
 * Tambah (tanpa id_kas) atau ubah (dengan id_kas) satu transaksi kas umum.
 * nota: { data: base64, mimeType, nama } — opsional; mengganti nota lama.
 */
function simpanKasUmum(token, data, nota) {
  var u = cekPeran_(token, ['Admin']);
  var f = bersihkanKas_(data);

  return denganKunci_(function () {
    var sh = sheetKas_(), sekarang = new Date();
    var id = String((data && data.id_kas) || '').trim();

    if (id) {                                                   // ---- ubah ----
      var row = cariBaris_(KAS_NAMA, id);
      if (row < 0) throw new Error('Transaksi kas tidak ditemukan.');
      var o = bacaBarisKas_(row);
      var lama = { tanggal: tanggalTeks_(o.tanggal), jenis: String(o.jenis), kategori: String(o.kategori),
                   jumlah: Number(o.jumlah), metode: String(o.metode), keterangan: String(o.keterangan || '') };
      var baru = { tanggal: Utilities.formatDate(f.tanggal, tz_(), 'yyyy-MM-dd'), jenis: f.jenis, kategori: f.kategori,
                   jumlah: f.jumlah, metode: f.metode, keterangan: f.keterangan };
      var beda = perbedaan_(lama, baru, {});

      var notaId = String(o.nota_id || '');
      if (nota && nota.data) { notaId = unggahFoto_(nota, 'nota_' + f.kategori, notaId); beda.push('nota diganti'); }

      o.tanggal = f.tanggal; o.jenis = f.jenis; o.kategori = f.kategori; o.jumlah = f.jumlah;
      o.metode = f.metode; o.keterangan = f.keterangan; o.nota_id = notaId;
      o.diubah_oleh = String(u.username); o.diubah_pada = sekarang;
      sh.getRange(row, 1, 1, KAS_KOLOM.length).setValues([objKeBaris_(KAS_KOLOM, o)]);
      logKeu_(u.username, 'UBAH', 'KAS_UMUM', id, beda.length ? beda.join('; ') : '(tanpa perubahan nilai)');
      return kasKeObj_(o);
    }

    var o2 = {                                                  // ---- baru ----
      id_kas: idBaru_(KAS_NAMA, 'KAS'), tanggal: f.tanggal, jenis: f.jenis, kategori: f.kategori,
      jumlah: f.jumlah, metode: f.metode, keterangan: f.keterangan,
      nota_id: (nota && nota.data) ? unggahFoto_(nota, 'nota_' + f.kategori, '') : '',
      dicatat_oleh: String(u.username), dicatat_pada: sekarang
    };
    sh.appendRow(objKeBaris_(KAS_KOLOM, o2));
    logKeu_(u.username, 'TAMBAH', 'KAS_UMUM', o2.id_kas, f.jenis + ' | ' + f.kategori + ' | Rp ' + f.jumlah + ' | ' + f.keterangan);
    return kasKeObj_(o2);
  });
}

/** Hapus PERMANEN. Salinan lengkap data tersimpan di LOG_KEUANGAN. */
function hapusKasUmum(token, idKas, alasan) {
  var u = cekPeran_(token, ['Admin']);
  alasan = String(alasan || '').trim().slice(0, 300);
  if (!alasan) throw new Error('Alasan penghapusan wajib diisi.');
  return denganKunci_(function () {
    sheetKas_();
    var row = cariBaris_(KAS_NAMA, String(idKas || ''));
    if (row < 0) throw new Error('Transaksi kas tidak ditemukan.');
    var o = bacaBarisKas_(row);
    logKeu_(u.username, 'HAPUS', 'KAS_UMUM', o.id_kas, 'alasan: ' + alasan + ' | salinan: ' + JSON.stringify(kasKeObj_(o)));
    sheetKas_().deleteRow(row);
    if (o.nota_id) { try { DriveApp.getFileById(String(o.nota_id)).setTrashed(true); } catch (e) {} }
    return true;
  });
}

/* ---------------- Buku kas gabungan ---------------- */

/**
 * Pemasukan iuran/biaya atlet (otomatis dari PEMBAYARAN, yang Sah) + kas umum.
 * periode 'yyyy-MM' atau semua=true. Saldo awal = saldo awal pengaturan + selisih
 * semua transaksi sebelum awal periode.
 */
function getBukuKas(token, periode, semua) {
  cekPeran_(token, ['Admin']);
  if (!semua) periode = validasiPeriode_(periode);

  var nama = {};
  bacaSheet_(SH.ATLET).forEach(function (a) { nama[String(a.id_atlet)] = String(a.nama); });
  var tg = {};
  bacaSheet_(SH.TAGIHAN).forEach(function (t) {
    tg[String(t.id_tagihan)] = { periode: periodeTeks_(t.periode), nama_biaya: eIuran_(t) ? NAMA_IURAN : String(t.nama_biaya) };
  });

  var baris = [];
  bacaSheet_(SH.PEMBAYARAN).forEach(function (b) {
    if (String(b.status || 'Sah') === 'Batal') return;
    var t = tg[String(b.id_tagihan)] || { periode: '', nama_biaya: NAMA_IURAN };
    baris.push({
      sumber: 'Iuran', id: String(b.id_bayar), jenis: 'Masuk', tanggal: tanggalTeks_(b.tanggal),
      kategori: t.nama_biaya, uraian: (nama[String(b.id_atlet)] || '(atlet terhapus)'),
      periode_tagihan: t.periode, nama_biaya: t.nama_biaya,
      jumlah: Number(b.jumlah) || 0, metode: String(b.metode || ''), catatan: String(b.catatan || ''),
      oleh: String(b.dicatat_oleh || ''), nota_url: ''
    });
  });
  bacaSheet_(KAS_NAMA_SAFE_()).forEach(function (k) {
    baris.push({
      sumber: 'Kas', id: String(k.id_kas), jenis: String(k.jenis), tanggal: tanggalTeks_(k.tanggal),
      kategori: String(k.kategori || ''), uraian: String(k.keterangan || ''), periode_tagihan: '', nama_biaya: '',
      jumlah: Number(k.jumlah) || 0, metode: String(k.metode || ''), catatan: '',
      oleh: String(k.dicatat_oleh || ''), nota_url: k.nota_id ? urlFoto_(k.nota_id) : ''
    });
  });

  var cfg = konfigKas_();
  var awal = semua ? '' : periode + '-01';
  var sebelum = 0, masuk = 0, keluar = 0, daftar = [];
  var katMasuk = {}, katKeluar = {};
  baris.forEach(function (r) {
    var bertanda = r.jenis === 'Masuk' ? r.jumlah : -r.jumlah;
    if (!semua) {
      if (r.tanggal < awal) { sebelum += bertanda; return; }
      if (r.tanggal.slice(0, 7) !== periode) return;
    }
    daftar.push(r);
    if (r.jenis === 'Masuk') { masuk += r.jumlah; katMasuk[r.kategori] = (katMasuk[r.kategori] || 0) + r.jumlah; }
    else { keluar += r.jumlah; katKeluar[r.kategori] = (katKeluar[r.kategori] || 0) + r.jumlah; }
  });
  daftar.sort(function (a, b) {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1;
    return nomorId_(b.id) - nomorId_(a.id);
  });

  var saldoAwalPeriode = cfg.saldo_awal + sebelum;
  return {
    periode: semua ? '' : periode,
    saldo_awal_periode: saldoAwalPeriode,
    masuk: masuk, keluar: keluar,
    saldo_akhir: saldoAwalPeriode + masuk - keluar,
    per_kategori: { masuk: katMasuk, keluar: katKeluar },
    daftar: daftar
  };
}

/** Pastikan sheet KAS_UMUM ada sebelum dibaca lewat bacaSheet_. */
function KAS_NAMA_SAFE_() {
  sheetKas_();
  return KAS_NAMA;
}

/* ---------------- Edit penuh pembayaran iuran/biaya (Admin) ---------------- */

/** Ubah tanggal, jumlah, metode, catatan pembayaran yang Sah. Jumlah tidak boleh membuat tagihan kelebihan bayar. */
function ubahPembayaranAdmin(token, data) {
  var u = cekPeran_(token, ['Admin']);
  data = data || {};
  var jumlah = rupiahBulat_(data.jumlah);
  if (isNaN(jumlah) || jumlah <= 0) throw new Error('Jumlah pembayaran harus lebih dari 0.');
  if (METODE_BAYAR.indexOf(String(data.metode)) < 0) throw new Error('Metode harus ' + METODE_BAYAR.join(', ') + '.');
  var tgl = tglValid_(data.tanggal);
  if (!tgl) throw new Error('Tanggal tidak valid.');

  return denganKunci_(function () {
    var row = cariBaris_(SH.PEMBAYARAN, String(data.id_bayar || ''));
    if (row < 0) throw new Error('Pembayaran tidak ditemukan.');
    var sh = sheet_(SH.PEMBAYARAN), kol = KOLOM.PEMBAYARAN;
    var nilai = sh.getRange(row, 1, 1, kol.length).getValues()[0];
    var ix = function (k) { return kol.indexOf(k); };
    if (String(nilai[ix('status')]) === 'Batal') throw new Error('Pembayaran yang dibatalkan tidak dapat diedit.');

    var t = muatTagihan_().filter(function (x) { return x.id_tagihan === String(nilai[ix('id_tagihan')]); })[0];
    if (!t) throw new Error('Tagihan terkait tidak ditemukan.');
    var lainnya = t.terbayar - (Number(nilai[ix('jumlah')]) || 0);
    if (lainnya + jumlah > t.nominal) {
      throw new Error('Jumlah melebihi sisa tagihan (maksimal Rp ' + (t.nominal - lainnya) + ').');
    }

    var lama = { tanggal: tanggalTeks_(nilai[ix('tanggal')]), jumlah: Number(nilai[ix('jumlah')]),
                 metode: String(nilai[ix('metode')]), catatan: String(nilai[ix('catatan')] || '') };
    var baru = { tanggal: Utilities.formatDate(tgl, tz_(), 'yyyy-MM-dd'), jumlah: jumlah,
                 metode: String(data.metode), catatan: String(data.catatan || '').slice(0, 300) };
    var beda = perbedaan_(lama, baru, {});

    nilai[ix('tanggal')] = tgl; nilai[ix('jumlah')] = jumlah;
    nilai[ix('metode')] = baru.metode; nilai[ix('catatan')] = baru.catatan;
    sh.getRange(row, 1, 1, kol.length).setValues([nilai]);
    logKeu_(u.username, 'UBAH', 'PEMBAYARAN', data.id_bayar,
      (t.nama_atlet + ' / ' + t.nama_biaya + ' ' + t.periode + ': ') + (beda.length ? beda.join('; ') : '(tanpa perubahan nilai)'));
    return true;
  });
}

/** Hapus PERMANEN satu pembayaran (tagihannya tetap, sisanya bertambah kembali). */
function hapusPembayaranAdmin(token, idBayar, alasan) {
  var u = cekPeran_(token, ['Admin']);
  alasan = String(alasan || '').trim().slice(0, 300);
  if (!alasan) throw new Error('Alasan penghapusan wajib diisi.');
  return denganKunci_(function () {
    var row = cariBaris_(SH.PEMBAYARAN, String(idBayar || ''));
    if (row < 0) throw new Error('Pembayaran tidak ditemukan.');
    var kol = KOLOM.PEMBAYARAN;
    var nilai = sheet_(SH.PEMBAYARAN).getRange(row, 1, 1, kol.length).getValues()[0];
    var salinan = {};
    kol.forEach(function (k, i) {
      var v = nilai[i];
      salinan[k] = v instanceof Date ? Utilities.formatDate(v, tz_(), 'yyyy-MM-dd HH:mm') : v;
    });
    logKeu_(u.username, 'HAPUS', 'PEMBAYARAN', idBayar, 'alasan: ' + alasan + ' | salinan: ' + JSON.stringify(salinan));
    sheet_(SH.PEMBAYARAN).deleteRow(row);
    return true;
  });
}

/* ---------------- Edit penuh tagihan (Admin) ---------------- */

/**
 * data: { id_tagihan, nominal, catatan, periode?, nama_biaya? }
 * periode dan nama_biaya hanya dapat diubah untuk BIAYA LAIN. Periode tagihan iuran bulanan
 * tidak diubah karena tagihan otomatis akan dibuat ulang untuk bulan yang kosong.
 */
function ubahTagihanAdmin(token, data) {
  var u = cekPeran_(token, ['Admin']);
  data = data || {};
  var nominal = rupiahBulat_(data.nominal);
  if (isNaN(nominal) || nominal < 0) throw new Error('Nominal tagihan tidak valid.');

  return denganKunci_(function () {
    var row = cariBaris_(SH.TAGIHAN, String(data.id_tagihan || ''));
    if (row < 0) throw new Error('Tagihan tidak ditemukan.');
    var semua = muatTagihan_();
    var t = semua.filter(function (x) { return x.id_tagihan === String(data.id_tagihan); })[0];
    if (nominal < t.terbayar) {
      throw new Error('Nominal tidak boleh lebih kecil dari yang sudah dibayar (Rp ' + t.terbayar + ').');
    }

    var periode = t.periode, namaBiaya = t.nama_biaya;
    if (t.custom) {
      if (data.periode !== undefined && String(data.periode).trim() !== '') periode = validasiPeriode_(data.periode);
      var nb = String(data.nama_biaya === undefined ? t.nama_biaya : data.nama_biaya).trim().slice(0, 60);
      if (!nb) throw new Error('Nama biaya wajib diisi.');
      if (nb.toLowerCase() === NAMA_IURAN.toLowerCase()) throw new Error('Nama "' + NAMA_IURAN + '" dipakai untuk tagihan otomatis.');
      namaBiaya = nb;
      var kembar = semua.filter(function (x) {
        return x.id_tagihan !== t.id_tagihan && x.id_atlet === t.id_atlet && x.periode === periode &&
               x.nama_biaya.toLowerCase() === namaBiaya.toLowerCase();
      })[0];
      if (kembar) throw new Error('Atlet ini sudah punya tagihan "' + namaBiaya + '" pada bulan tersebut.');
    }

    var lama = { periode: t.periode, nama_biaya: t.nama_biaya, nominal: t.nominal, catatan: t.catatan };
    var baru = { periode: periode, nama_biaya: namaBiaya, nominal: nominal, catatan: String(data.catatan || '').slice(0, 300) };
    var beda = perbedaan_(lama, baru, {});

    var sh = sheet_(SH.TAGIHAN), kol = KOLOM.TAGIHAN;
    if (baru.periode !== lama.periode) {
      var sel = sh.getRange(row, kol.indexOf('periode') + 1);
      sel.setNumberFormat('@'); sel.setValue(baru.periode);
    }
    if (baru.nama_biaya !== lama.nama_biaya) sh.getRange(row, kol.indexOf('nama_biaya') + 1).setValue(baru.nama_biaya);
    if (baru.nominal !== lama.nominal) {
      sh.getRange(row, kol.indexOf('nominal') + 1).setValue(baru.nominal);
      sh.getRange(row, kol.indexOf('sumber') + 1).setValue('Manual');
    }
    sh.getRange(row, kol.indexOf('catatan') + 1).setValue(baru.catatan);
    logKeu_(u.username, 'UBAH', 'TAGIHAN', t.id_tagihan,
      t.nama_atlet + ': ' + (beda.length ? beda.join('; ') : '(tanpa perubahan nilai)'));
    return true;
  });
}

/**
 * Hapus PERMANEN tagihan biaya lain beserta pembayarannya. Tagihan IURAN bulanan tidak
 * dapat dihapus karena akan dibuat ulang otomatis; ubah nominalnya menjadi 0 untuk membebaskan.
 */
function hapusTagihanAdmin(token, idTagihan, alasan) {
  var u = cekPeran_(token, ['Admin']);
  alasan = String(alasan || '').trim().slice(0, 300);
  if (!alasan) throw new Error('Alasan penghapusan wajib diisi.');
  return denganKunci_(function () {
    var t = muatTagihan_().filter(function (x) { return x.id_tagihan === String(idTagihan || ''); })[0];
    if (!t) throw new Error('Tagihan tidak ditemukan.');
    if (!t.custom) {
      throw new Error('Tagihan iuran bulanan akan dibuat ulang otomatis bila dihapus. Ubah nominalnya menjadi 0 untuk membebaskan bulan ini.');
    }
    var bayar = bacaSheet_(SH.PEMBAYARAN).filter(function (b) { return String(b.id_tagihan) === t.id_tagihan; });
    var salinanBayar = bayar.map(function (b) {
      return { id: String(b.id_bayar), tanggal: tanggalTeks_(b.tanggal), jumlah: Number(b.jumlah), metode: String(b.metode),
               status: String(b.status || 'Sah') };
    });
    logKeu_(u.username, 'HAPUS', 'TAGIHAN', t.id_tagihan,
      'alasan: ' + alasan + ' | salinan: ' + JSON.stringify(t) + ' | pembayaran ikut terhapus: ' + JSON.stringify(salinanBayar));
    hapusBarisAtlet_(SH.PEMBAYARAN, 'id_tagihan', t.id_tagihan);
    var row = cariBaris_(SH.TAGIHAN, t.id_tagihan);
    if (row > 0) sheet_(SH.TAGIHAN).deleteRow(row);
    return { pembayaran_terhapus: salinanBayar.length };
  });
}
