/** ============================================================
 *  Pengaturan.gs — menu ⚙️
 *  Seluruh isi menu ini dapat ditambah, diubah, dan dihapus admin:
 *  identitas & tampilan, komponen, item tes, kategori skor,
 *  benchmark, batas usia, dan daftar pengguna.
 *  ============================================================ */

function getPengaturan() {
  var o = {};
  bacaSheet_(SH.PENGATURAN).forEach(function (r) {
    // Pengaturan keuangan hanya dibaca lewat Keuangan.gs (khusus Admin & Pelatih).
    if (/^(iuran_|keuangan_)/.test(String(r.kunci))) return;
    o[String(r.kunci)] = r.nilai;
  });
  o.usia_min = Number(o.usia_min) || 5;
  o.usia_max = Number(o.usia_max) || 40;
  o.logo_url = o.logo_id ? urlFoto_(o.logo_id) : '';
  o.akses_siswa = String(o.akses_siswa === undefined ? 'dashboard,prestasi,perkembangan,laporan' : o.akses_siswa)
    .split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
  o.halaman_siswa = HALAMAN_SISWA;
  o.cetak_bagian = String(o.cetak_bagian === undefined ? CETAK_BAGIAN_SAH.join(',') : o.cetak_bagian)
    .split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
  o.cetak_bentuk_profil = o.cetak_bentuk_profil || 'radar';
  o.cetak_bentuk_detail = o.cetak_bentuk_detail || 'keduanya';
  o.cetak_orientasi = o.cetak_orientasi || 'potret';
  o.cetak_ukuran = o.cetak_ukuran || 'A4';
  o.cetak_pisah_profil = String(o.cetak_pisah_profil || 'YA').toUpperCase();
  o.cetak_pisah_prestasi = String(o.cetak_pisah_prestasi || 'YA').toUpperCase();
  return o;
}

/**
 * Simpan identitas & tampilan.
 * logo: { data: base64, mimeType, nama } — opsional; bila diisi,
 * berkas diunggah ke folder Drive akademi dan logo lama dibuang.
 */
function simpanPengaturan(token, obj, logo) {
  cekPeran_(token, ['Admin']);

  var min = Number(obj.usia_min), maks = Number(obj.usia_max);
  if (obj.usia_min !== undefined) {
    if (!min || !maks || min > maks) throw new Error('Batas usia tidak valid.');
    if (min < USIA_BATAS_BAWAH || maks > USIA_BATAS_ATAS) {
      throw new Error('Batas usia harus di antara ' + USIA_BATAS_BAWAH + ' dan ' + USIA_BATAS_ATAS + ' tahun.');
    }
  }

  var lama = getPengaturan();
  if (logo && logo.data) {
    obj.logo_id = unggahFoto_(logo, 'logo_aplikasi', lama.logo_id || '');
  }
  if (obj.hapus_logo === true) {
    if (lama.logo_id) { try { DriveApp.getFileById(lama.logo_id).setTrashed(true); } catch (e) {} }
    obj.logo_id = '';
  }
  delete obj.hapus_logo;
  delete obj.logo_url;
  delete obj.halaman_siswa;

  if (obj.akses_siswa !== undefined) {
    var sah = HALAMAN_SISWA.map(function (h) { return h.kunci; });
    var pilih = (obj.akses_siswa instanceof Array ? obj.akses_siswa : String(obj.akses_siswa).split(','))
      .map(function (s) { return String(s).trim(); })
      .filter(function (s) { return sah.indexOf(s) >= 0; });
    obj.akses_siswa = pilih.join(',');
  }

  if (obj.cetak_bagian !== undefined) {
    var pilihCetak = (obj.cetak_bagian instanceof Array ? obj.cetak_bagian : String(obj.cetak_bagian).split(','))
      .map(function (s) { return String(s).trim(); })
      .filter(function (s) { return CETAK_BAGIAN_SAH.indexOf(s) >= 0; });
    obj.cetak_bagian = pilihCetak.join(',');
  }
  if (obj.cetak_bentuk_profil !== undefined && CETAK_BENTUK_PROFIL_SAH.indexOf(obj.cetak_bentuk_profil) < 0) {
    throw new Error('Bentuk profil kebugaran tidak dikenal.');
  }
  if (obj.cetak_bentuk_detail !== undefined && CETAK_BENTUK_DETAIL_SAH.indexOf(obj.cetak_bentuk_detail) < 0) {
    throw new Error('Bentuk detail item tes tidak dikenal.');
  }
  if (obj.cetak_orientasi !== undefined && CETAK_ORIENTASI_SAH.indexOf(obj.cetak_orientasi) < 0) {
    throw new Error('Posisi kertas tidak dikenal.');
  }
  if (obj.cetak_ukuran !== undefined && CETAK_UKURAN_SAH.indexOf(obj.cetak_ukuran) < 0) {
    throw new Error('Ukuran kertas tidak dikenal.');
  }
  if (obj.cetak_pisah_profil !== undefined) {
    obj.cetak_pisah_profil = String(obj.cetak_pisah_profil).toUpperCase() === 'TIDAK' ? 'TIDAK' : 'YA';
  }
  if (obj.cetak_pisah_prestasi !== undefined) {
    obj.cetak_pisah_prestasi = String(obj.cetak_pisah_prestasi).toUpperCase() === 'TIDAK' ? 'TIDAK' : 'YA';
  }

  var sh = sheet_(SH.PENGATURAN);
  var data = sh.getDataRange().getValues();
  Object.keys(obj).forEach(function (k) {
    var ketemu = false;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === k) { sh.getRange(i + 1, 2).setValue(obj[k]); ketemu = true; break; }
    }
    if (!ketemu) sh.appendRow([k, obj[k]]);
  });
  return getPengaturan();
}

/* ============================================================
 *  Komponen penilaian — tambah, ubah nama, ubah bobot, hapus
 *  ============================================================ */

function getKomponen(token) {
  sesi_(token);
  return daftarKomponen_(true);
}

/**
 * Simpan seluruh daftar komponen sekaligus.
 * daftar: [{ id_komponen, nama, bobot, aktif }] — id kosong berarti baris baru.
 */
function simpanKomponen(token, daftar) {
  cekPeran_(token, ['Admin']);
  if (!daftar || !daftar.length) throw new Error('Minimal satu komponen harus ada.');

  var nama = {};
  daftar.forEach(function (k) {
    var n = String(k.nama || '').trim();
    if (!n) throw new Error('Nama komponen tidak boleh kosong.');
    if (nama[n.toLowerCase()]) throw new Error('Nama komponen "' + n + '" ganda.');
    nama[n.toLowerCase()] = true;
  });

  var aktif = daftar.filter(function (k) { return String(k.aktif).toUpperCase() !== 'TIDAK'; });
  if (!aktif.length) throw new Error('Minimal satu komponen harus aktif.');
  var total = aktif.reduce(function (a, b) { return a + (Number(b.bobot) || 0); }, 0);
  if (Math.round(total) !== 100) {
    throw new Error('Total bobot komponen aktif harus 100%, saat ini ' + Math.round(total) + '%.');
  }

  var sh = sheet_(SH.KOMPONEN);
  var nomor = 0;
  bacaSheet_(SH.KOMPONEN).forEach(function (k) {
    var n = parseInt(String(k.id_komponen).replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > nomor) nomor = n;
  });

  var rows = daftar.map(function (k, i) {
    var id = String(k.id_komponen || '').trim() || ('KMP' + (++nomor));
    return [id, String(k.nama).trim(), Number(k.bobot) || 0, i + 1,
            String(k.aktif).toUpperCase() === 'TIDAK' ? 'TIDAK' : 'YA'];
  });

  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, KOLOM.KOMPONEN.length).clearContent();
  sh.getRange(2, 1, rows.length, KOLOM.KOMPONEN.length).setValues(rows);
  return daftarKomponen_(true);
}

function hapusKomponen(token, idKomponen) {
  cekPeran_(token, ['Admin']);
  var pakai = daftarItem_(true).filter(function (i) {
    return String(i.id_komponen) === String(idKomponen);
  });
  if (pakai.length) {
    throw new Error('Komponen masih dipakai ' + pakai.length + ' item tes (' +
      pakai.map(function (i) { return i.nama; }).join(', ') +
      '). Pindahkan atau hapus item tersebut terlebih dahulu.');
  }
  if (daftarKomponen_(true).length <= 1) throw new Error('Minimal satu komponen harus ada.');

  var row = cariBaris_(SH.KOMPONEN, idKomponen);
  if (row < 0) throw new Error('Komponen tidak ditemukan.');
  sheet_(SH.KOMPONEN).deleteRow(row);
  return daftarKomponen_(true);
}

/* ============================================================
 *  Item tes — tambah, ubah nama/satuan/komponen/arah, hapus
 *  ============================================================ */

function getItemTes(token) {
  sesi_(token);
  return daftarItem_(true);
}

/**
 * Simpan seluruh daftar item sekaligus.
 * daftar: [{ id_item, kunci, nama, id_komponen, satuan, arah, aktif }]
 *
 * "kunci" adalah nama kolom penyimpanan di DB_PERFORMA. Untuk item lama
 * kunci dipertahankan apa adanya supaya data historis tetap terbaca —
 * mengganti nama item tidak mengubah kunci maupun menghapus data.
 */
function simpanItemTes(token, daftar) {
  cekPeran_(token, ['Admin']);
  if (!daftar || !daftar.length) throw new Error('Minimal satu item tes harus ada.');

  var idKomponenSah = {};
  daftarKomponen_(true).forEach(function (k) { idKomponenSah[k.id_komponen] = true; });

  var lama = {};
  bacaSheet_(SH.ITEM).forEach(function (i) { lama[String(i.id_item)] = i; });

  var nomor = 0;
  Object.keys(lama).forEach(function (id) {
    var n = parseInt(id.replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > nomor) nomor = n;
  });

  var headerPerforma = headerSheet_(SH.PERFORMA);
  var kunciDipakai = {}, namaDipakai = {}, rows = [];

  daftar.forEach(function (it, i) {
    var nama = String(it.nama || '').trim();
    if (!nama) throw new Error('Nama item tes tidak boleh kosong.');
    if (namaDipakai[nama.toLowerCase()]) throw new Error('Nama item "' + nama + '" ganda.');
    namaDipakai[nama.toLowerCase()] = true;

    if (!idKomponenSah[String(it.id_komponen)]) {
      throw new Error('Item "' + nama + '" belum punya komponen yang sah.');
    }

    var id = String(it.id_item || '').trim();
    var kunci;
    if (id && lama[id]) {
      kunci = String(lama[id].kunci);              // kunci item lama tidak pernah diubah
    } else {
      id = 'ITM' + (++nomor);
      kunci = keKunci_(nama);
      var dasar = kunci, n = 2;
      while (kunciDipakai[kunci] || headerPerforma.indexOf(kunci) >= 0) {
        kunci = dasar + '_' + (n++);
      }
    }
    if (kunciDipakai[kunci]) throw new Error('Kunci kolom "' + kunci + '" ganda.');
    kunciDipakai[kunci] = true;

    rows.push([id, kunci, nama, String(it.id_komponen),
               String(it.satuan || ''),
               String(it.arah).toUpperCase() === 'LOWER' ? 'LOWER' : 'HIGHER',
               i + 1,
               String(it.aktif).toUpperCase() === 'TIDAK' ? 'TIDAK' : 'YA']);
  });

  var sh = sheet_(SH.ITEM);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, KOLOM.ITEM_TES.length).clearContent();
  sh.getRange(2, 1, rows.length, KOLOM.ITEM_TES.length).setValues(rows);

  sinkronKolomPerforma_();
  return daftarItem_(true);
}

/**
 * Hapus satu item tes beserta seluruh benchmark-nya.
 * Kolom datanya di DB_PERFORMA sengaja dibiarkan agar hasil tes lama
 * tidak ikut terhapus; kolom itu hanya berhenti ditampilkan.
 */
function hapusItemTes(token, idItem) {
  cekPeran_(token, ['Admin']);
  var item = daftarItem_(true).filter(function (i) { return i.id_item === String(idItem); })[0];
  if (!item) throw new Error('Item tes tidak ditemukan.');
  if (daftarItem_(true).length <= 1) throw new Error('Minimal satu item tes harus ada.');

  // Benchmark milik item ini ikut dibuang, dari baris terbawah agar nomor baris tidak bergeser.
  var shBM = sheet_(SH.BENCHMARK);
  var isi = shBM.getDataRange().getValues();
  var kolKunci = KOLOM.BENCHMARK.indexOf('kunci');
  for (var i = isi.length - 1; i >= 1; i--) {
    if (String(isi[i][kolKunci]) === item.kunci) shBM.deleteRow(i + 1);
  }

  var row = cariBaris_(SH.ITEM, idItem);
  if (row > 0) sheet_(SH.ITEM).deleteRow(row);
  return daftarItem_(true);
}

/* ============================================================
 *  Benchmark
 *  ============================================================ */

function getBenchmark(token) {
  sesi_(token);
  var item = {};
  daftarItem_(true).forEach(function (i) { item[i.kunci] = i; });
  return bacaSheet_(SH.BENCHMARK).map(function (b) {
    var it = item[String(b.kunci)];
    return {
      id_bm: String(b.id_bm),
      kunci: String(b.kunci),
      nama_item: it ? it.nama : '(item terhapus)',
      komponen: it ? it.komponen : '',
      satuan: it ? it.satuan : '',
      arah: it ? it.arah : '',
      gender: String(b.gender),
      usia_min: Number(b.usia_min),
      usia_max: Number(b.usia_max),
      nilai_bm: Number(b.nilai_bm),
      aktif: String(b.aktif || 'YA').toUpperCase()
    };
  });
}

function simpanBenchmark(token, data) {
  cekPeran_(token, ['Admin']);
  if (!data.kunci) throw new Error('Item tes wajib dipilih.');
  if (!Number(data.nilai_bm)) throw new Error('Nilai benchmark wajib diisi.');

  var p = getPengaturan();
  var min = Number(data.usia_min), maks = Number(data.usia_max);
  if (min < p.usia_min || maks > p.usia_max || min > maks) {
    throw new Error('Rentang usia harus berada di antara ' + p.usia_min + ' dan ' + p.usia_max + ' tahun.');
  }

  var baris = [
    data.id_bm || idBaru_(SH.BENCHMARK, 'BM'),
    String(data.kunci),
    data.gender || 'Semua',
    min, maks,
    Number(data.nilai_bm),
    String(data.aktif).toUpperCase() === 'TIDAK' ? 'TIDAK' : 'YA'
  ];

  var sh = sheet_(SH.BENCHMARK);
  var row = data.id_bm ? cariBaris_(SH.BENCHMARK, data.id_bm) : -1;
  if (row > 0) sh.getRange(row, 1, 1, KOLOM.BENCHMARK.length).setValues([baris]);
  else sh.appendRow(baris);
  return getBenchmark(token);
}

function hapusBenchmark(token, id) {
  cekPeran_(token, ['Admin']);
  var row = cariBaris_(SH.BENCHMARK, id);
  if (row < 0) throw new Error('Benchmark tidak ditemukan.');
  sheet_(SH.BENCHMARK).deleteRow(row);
  return getBenchmark(token);
}

/* ============================================================
 *  Kategori skor
 *  ============================================================ */

function getKategori(token) {
  if (token) sesi_(token);
  return bacaSheet_(SH.KATEGORI);
}

function simpanKategori(token, daftar) {
  cekPeran_(token, ['Admin']);
  daftar = daftar || [];
  daftar.forEach(function (k) {
    if (!String(k.label || '').trim()) throw new Error('Label kategori tidak boleh kosong.');
    if (Number(k.min) > Number(k.max)) {
      throw new Error('Kategori "' + k.label + '": nilai minimum melebihi maksimum.');
    }
  });

  var sh = sheet_(SH.KATEGORI);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, KOLOM.KATEGORI_SKOR.length).clearContent();
  if (daftar.length) {
    sh.getRange(2, 1, daftar.length, KOLOM.KATEGORI_SKOR.length).setValues(daftar.map(function (k) {
      return [Number(k.min), Number(k.max), String(k.label).trim(), k.deskripsi || '', k.warna || '#888888'];
    }));
  }
  return getKategori(token);
}
