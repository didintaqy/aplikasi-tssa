/** ============================================================
 *  PrestasiSiswa.gs — siswa mengajukan dan mengedit prestasi (hanya penambahan)
 *
 *  Prinsip: Prestasi.gs dan DB_PRESTASI TIDAK diubah.
 *   - Prestasi dari siswa disimpan dulu di sheet terpisah PRESTASI_USULAN
 *     (dibuat otomatis) dengan status Menunggu / Ditolak / Disetujui.
 *   - Hanya setelah Admin atau Pelatih menyetujui, salinannya masuk ke
 *     DB_PRESTASI. Dengan begitu rekap medali, statistik, Dashboard, dan laporan
 *     yang sudah ada otomatis hanya menghitung prestasi yang terverifikasi.
 *   - Siswa hanya dapat mengajukan/mengedit untuk atletnya sendiri.
 *     Atlet diambil dari akun, bukan dari kiriman klien.
 *   - Pengajuan Menunggu/Ditolak boleh diedit siswa; yang Disetujui terkunci.
 *   - Tidak ada hapus untuk siswa.
 *   - Semua tindakan dicatat di LOG_ATLET.
 *
 *  Memakai pembantu dari file lain: denganKunci_, waktuTeks_, nomorId_ (Keuangan.gs),
 *  logAtlet_, tglValid_, hapusBarisAtlet_ (AtletLanjut.gs), tanggalTeks_ (Performa.gs).
 *  ============================================================ */

var USULAN_NAMA = 'PRESTASI_USULAN';
var USULAN_KOLOM = [
  'id_usulan', 'id_atlet', 'nama_kejuaraan', 'tingkat', 'tanggal', 'tempat', 'penyelenggara',
  'kategori', 'kelas', 'medali', 'bukti_id', 'catatan', 'status',
  'diajukan_oleh', 'diajukan_pada', 'diubah_pada',
  'diputuskan_oleh', 'diputuskan_pada', 'alasan_tolak', 'id_prestasi'
];

// Daftar pilihan sama dengan formulir prestasi yang sudah ada.
var TINGKAT_SAH = ['Sekolah', 'Kota', 'Provinsi', 'Nasional', 'Internasional'];
var KATEGORI_SAH = ['Tanding', 'Seni Tunggal', 'Seni Ganda', 'Seni Regu'];
var MEDALI_SAH = ['Emas', 'Perak', 'Perunggu', 'Partisipasi'];

/* ---------------- Pembantu ---------------- */

function sheetUsulan_() {
  var ss = ss_();
  var s = ss.getSheetByName(USULAN_NAMA);
  if (!s) {
    s = ss.insertSheet(USULAN_NAMA);
    s.appendRow(USULAN_KOLOM);
    s.getRange(1, 1, 1, USULAN_KOLOM.length).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function bacaUsulan_() {
  sheetUsulan_();
  return bacaSheet_(USULAN_NAMA);
}

function usulanKeObj_(o, namaAtlet) {
  return {
    id_usulan: String(o.id_usulan),
    id_atlet: String(o.id_atlet),
    nama_atlet: namaAtlet || '',
    nama_kejuaraan: String(o.nama_kejuaraan || ''),
    tingkat: String(o.tingkat || ''),
    tanggal: tanggalTeks_(o.tanggal),
    tempat: String(o.tempat || ''),
    penyelenggara: String(o.penyelenggara || ''),
    kategori: String(o.kategori || ''),
    kelas: String(o.kelas || ''),
    medali: String(o.medali || ''),
    bukti_id: String(o.bukti_id || ''),
    bukti_url: o.bukti_id ? urlFoto_(o.bukti_id) : '',
    catatan: String(o.catatan || ''),
    status: String(o.status || 'Menunggu'),
    diajukan_oleh: String(o.diajukan_oleh || ''),
    diajukan_pada: waktuTeks_(o.diajukan_pada),
    diubah_pada: waktuTeks_(o.diubah_pada),
    diputuskan_oleh: String(o.diputuskan_oleh || ''),
    diputuskan_pada: waktuTeks_(o.diputuskan_pada),
    alasan_tolak: String(o.alasan_tolak || ''),
    id_prestasi: String(o.id_prestasi || '')
  };
}

function namaAtletPeta_() {
  var m = {};
  bacaSheet_(SH.ATLET).forEach(function (a) { m[String(a.id_atlet)] = String(a.nama); });
  return m;
}

function urutkanUsulan_(daftar) {
  return daftar.sort(function (a, b) {
    if (a.diajukan_pada !== b.diajukan_pada) return a.diajukan_pada < b.diajukan_pada ? 1 : -1;
    return nomorId_(b.id_usulan) - nomorId_(a.id_usulan);
  });
}

function bersihkanIsian_(data) {
  var potong = function (v, n) { return String(v === undefined || v === null ? '' : v).trim().slice(0, n); };
  var nama = potong(data.nama_kejuaraan, 150);
  if (!nama) throw new Error('Nama kejuaraan wajib diisi.');

  var tingkat = potong(data.tingkat, 30);
  if (TINGKAT_SAH.indexOf(tingkat) < 0) throw new Error('Tingkat kejuaraan tidak valid.');
  var kategori = potong(data.kategori, 30);
  if (KATEGORI_SAH.indexOf(kategori) < 0) throw new Error('Kategori tidak valid.');
  var medali = potong(data.medali, 30);
  if (MEDALI_SAH.indexOf(medali) < 0) throw new Error('Medali tidak valid.');

  var tanggal = '';
  if (potong(data.tanggal, 20)) {
    tanggal = tglValid_(data.tanggal);
    if (!tanggal) throw new Error('Tanggal tidak valid.');
  }
  return {
    nama_kejuaraan: nama, tingkat: tingkat, tanggal: tanggal,
    tempat: potong(data.tempat, 150), penyelenggara: potong(data.penyelenggara, 150),
    kategori: kategori, kelas: potong(data.kelas, 60), medali: medali,
    catatan: potong(data.catatan, 500)
  };
}

function bacaBarisUsulan_(row) {
  var nilai = sheetUsulan_().getRange(row, 1, 1, USULAN_KOLOM.length).getValues()[0];
  var o = {};
  USULAN_KOLOM.forEach(function (k, i) { o[k] = nilai[i]; });
  return o;
}

function tulisBarisUsulan_(row, o) {
  sheetUsulan_().getRange(row, 1, 1, USULAN_KOLOM.length).setValues([objKeBaris_(USULAN_KOLOM, o)]);
}

/* ---------------- Sisi siswa ---------------- */

/**
 * Ajukan prestasi baru, atau edit pengajuan sendiri (data.id_usulan terisi).
 * Edit hanya untuk status Menunggu/Ditolak; setelah diedit status kembali Menunggu.
 * bukti: { data: base64, mimeType, nama } — opsional.
 */
function simpanUsulanPrestasi(token, data, bukti) {
  var u = sesi_(token);
  if (String(u.peran) !== 'Siswa') {
    throw new Error('Pengajuan prestasi khusus akun siswa. Admin dan Pelatih memakai formulir prestasi.');
  }
  var idAtlet = String(u.id_atlet || '').trim();
  if (!idAtlet) throw new Error('Akun Anda belum ditautkan ke data atlet. Hubungi pelatih atau admin.');
  if (!getAtlet(idAtlet)) throw new Error('Data atlet tidak ditemukan.');

  data = data || {};
  var f = bersihkanIsian_(data);

  return denganKunci_(function () {
    sheetUsulan_();
    var sekarang = new Date();
    var idUsulan = String(data.id_usulan || '').trim();

    if (idUsulan) {                                   // ---- edit ----
      var row = cariBaris_(USULAN_NAMA, idUsulan);
      if (row < 0) throw new Error('Pengajuan tidak ditemukan.');
      var o = bacaBarisUsulan_(row);
      if (String(o.id_atlet) !== idAtlet) throw new Error('Akses ditolak. Pengajuan ini bukan milik Anda.');
      if (String(o.status || 'Menunggu') === 'Disetujui') {
        throw new Error('Prestasi yang sudah disetujui terkunci. Hubungi pelatih bila ada yang perlu diperbaiki.');
      }
      var buktiId = String(o.bukti_id || '');
      if (bukti && bukti.data) buktiId = unggahFoto_(bukti, 'bukti_' + f.nama_kejuaraan, buktiId);

      Object.keys(f).forEach(function (k) { o[k] = f[k]; });
      o.bukti_id = buktiId;
      o.status = 'Menunggu';
      o.diubah_pada = sekarang;
      o.diputuskan_oleh = ''; o.diputuskan_pada = ''; o.alasan_tolak = ''; o.id_prestasi = '';
      tulisBarisUsulan_(row, o);
      logAtlet_(u.username, idAtlet, 'EDIT_USULAN_PRESTASI', o.id_usulan + ' | ' + f.nama_kejuaraan + ' | ' + f.medali);
      return usulanKeObj_(o, '');
    }

    var o2 = {                                        // ---- baru ----
      id_usulan: idBaru_(USULAN_NAMA, 'USL'),
      id_atlet: idAtlet,
      bukti_id: (bukti && bukti.data) ? unggahFoto_(bukti, 'bukti_' + f.nama_kejuaraan, '') : '',
      status: 'Menunggu',
      diajukan_oleh: String(u.username),
      diajukan_pada: sekarang
    };
    Object.keys(f).forEach(function (k) { o2[k] = f[k]; });
    sheetUsulan_().appendRow(objKeBaris_(USULAN_KOLOM, o2));
    logAtlet_(u.username, idAtlet, 'USULAN_PRESTASI', o2.id_usulan + ' | ' + f.nama_kejuaraan + ' | ' + f.medali);
    return usulanKeObj_(o2, '');
  });
}

/** Seluruh pengajuan milik atlet yang tertaut ke akun siswa ini. */
function getUsulanSaya(token) {
  var u = sesi_(token);
  var id = String(u.id_atlet || '').trim();
  if (String(u.peran) !== 'Siswa' || !id) return [];
  return urutkanUsulan_(bacaUsulan_()
    .filter(function (o) { return String(o.id_atlet) === id; })
    .map(function (o) { return usulanKeObj_(o, ''); }));
}

/* ---------------- Sisi Admin & Pelatih ---------------- */

/** Daftar pengajuan; status '' = semua. Sekaligus mengembalikan jumlah yang menunggu (untuk lencana). */
function getUsulanPrestasi(token, status) {
  cekPeran_(token, ['Admin', 'Pelatih']);
  status = String(status || '').trim();
  var nama = namaAtletPeta_();
  var semua = bacaUsulan_();
  var menunggu = semua.filter(function (o) { return String(o.status || 'Menunggu') === 'Menunggu'; }).length;
  var daftar = semua.filter(function (o) {
    return !status || String(o.status || 'Menunggu') === status;
  }).map(function (o) {
    return usulanKeObj_(o, nama[String(o.id_atlet)] || '(atlet terhapus)');
  });
  return { daftar: urutkanUsulan_(daftar), jumlah_menunggu: menunggu };
}

/** Setujui: salin ke DB_PRESTASI (dengan struktur yang sama seperti simpanPrestasi). */
function setujuiUsulanPrestasi(token, idUsulan) {
  var u = cekPeran_(token, ['Admin', 'Pelatih']);
  return denganKunci_(function () {
    var row = cariBaris_(USULAN_NAMA, String(idUsulan || ''));
    if (row < 0) throw new Error('Pengajuan tidak ditemukan.');
    var o = bacaBarisUsulan_(row);
    if (String(o.status || 'Menunggu') !== 'Menunggu') {
      throw new Error('Hanya pengajuan berstatus Menunggu yang dapat disetujui.');
    }
    if (!getAtlet(String(o.id_atlet))) throw new Error('Atlet pada pengajuan ini sudah tidak ada.');

    var idPrestasi = idBaru_(SH.PRESTASI, 'PRS');
    sheet_(SH.PRESTASI).appendRow(objKeBaris_(KOLOM.DB_PRESTASI, {
      id_prestasi: idPrestasi, id_atlet: o.id_atlet, nama_kejuaraan: o.nama_kejuaraan,
      tingkat: o.tingkat, tanggal: o.tanggal, tempat: o.tempat, penyelenggara: o.penyelenggara,
      kategori: o.kategori, kelas: o.kelas, medali: o.medali, bukti_id: o.bukti_id, catatan: o.catatan
    }));

    o.status = 'Disetujui';
    o.diputuskan_oleh = String(u.username);
    o.diputuskan_pada = new Date();
    o.alasan_tolak = '';
    o.id_prestasi = idPrestasi;
    tulisBarisUsulan_(row, o);
    logAtlet_(u.username, o.id_atlet, 'SETUJUI_PRESTASI', o.id_usulan + ' → ' + idPrestasi + ' | ' + o.nama_kejuaraan);
    return { id_usulan: o.id_usulan, id_prestasi: idPrestasi };
  });
}

function tolakUsulanPrestasi(token, idUsulan, alasan) {
  var u = cekPeran_(token, ['Admin', 'Pelatih']);
  alasan = String(alasan || '').trim().slice(0, 300);
  if (!alasan) throw new Error('Alasan penolakan wajib diisi agar siswa tahu apa yang perlu diperbaiki.');
  return denganKunci_(function () {
    var row = cariBaris_(USULAN_NAMA, String(idUsulan || ''));
    if (row < 0) throw new Error('Pengajuan tidak ditemukan.');
    var o = bacaBarisUsulan_(row);
    if (String(o.status || 'Menunggu') !== 'Menunggu') {
      throw new Error('Hanya pengajuan berstatus Menunggu yang dapat ditolak.');
    }
    o.status = 'Ditolak';
    o.diputuskan_oleh = String(u.username);
    o.diputuskan_pada = new Date();
    o.alasan_tolak = alasan;
    tulisBarisUsulan_(row, o);
    logAtlet_(u.username, o.id_atlet, 'TOLAK_PRESTASI', o.id_usulan + ' | ' + o.nama_kejuaraan + ' | ' + alasan);
    return { id_usulan: o.id_usulan };
  });
}

/* ---------------- Pembersihan saat atlet dihapus permanen ---------------- */

/** Dipanggil oleh hapusAtletPermanen: buang pengajuan atlet dan kumpulkan berkas buktinya. */
function hapusUsulanAtlet_(idAtlet, berkas) {
  if (!ss_().getSheetByName(USULAN_NAMA)) return 0;
  bacaSheet_(USULAN_NAMA).forEach(function (o) {
    if (String(o.id_atlet) === String(idAtlet) && o.bukti_id) berkas.push(String(o.bukti_id));
  });
  return hapusBarisAtlet_(USULAN_NAMA, 'id_atlet', String(idAtlet));
}
