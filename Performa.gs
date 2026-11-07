/** ============================================================
 *  Performa.gs — sesi tes dan dashboard
 *  Kolom hasil tes mengikuti isi sheet ITEM_TES, bukan daftar tetap.
 *  ============================================================ */

function tanggalTeks_(t) {
  if (!t) return '';
  return Utilities.formatDate(new Date(t), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Seluruh sesi tes milik satu atlet, terbaru di urutan pertama. */
function getTesAtlet(token, idAtlet) {
  var u = sesi_(token);
  cekAksesAtlet_(u, idAtlet);
  return bacaSheet_(SH.PERFORMA)
    .filter(function (t) { return String(t.id_atlet) === String(idAtlet); })
    .map(function (t) { t.tanggal_tes = tanggalTeks_(t.tanggal_tes); return t; })
    .sort(function (a, b) { return a.tanggal_tes < b.tanggal_tes ? 1 : -1; });
}

function tesAtlet_(idAtlet) {
  return bacaSheet_(SH.PERFORMA)
    .filter(function (t) { return String(t.id_atlet) === String(idAtlet); })
    .map(function (t) { t.tanggal_tes = tanggalTeks_(t.tanggal_tes); return t; })
    .sort(function (a, b) { return a.tanggal_tes < b.tanggal_tes ? 1 : -1; });
}

function simpanTes(token, data) {
  cekPeran_(token, ['Admin', 'Pelatih']);
  if (!data.id_atlet) throw new Error('Atlet belum dipilih.');
  if (!data.tanggal_tes) throw new Error('Tanggal tes wajib diisi.');

  var atlet = getAtlet(data.id_atlet);
  if (!atlet) throw new Error('Atlet tidak ditemukan.');

  var header = sinkronKolomPerforma_();
  var teks = { id_tes: true, id_atlet: true, pelatih: true, keterangan: true };

  var baris = { id_tes: data.id_tes || idBaru_(SH.PERFORMA, 'TES') };
  header.forEach(function (k) {
    if (k === 'id_tes') return;
    if (k === 'tanggal_tes') { baris[k] = new Date(data.tanggal_tes); return; }
    if (teks[k]) { baris[k] = data[k] || ''; return; }
    baris[k] = data[k] === '' || data[k] === undefined || data[k] === null ? '' : Number(data[k]);
  });

  var sh = sheet_(SH.PERFORMA);
  var row = data.id_tes ? cariBaris_(SH.PERFORMA, data.id_tes) : -1;
  if (row > 0) sh.getRange(row, 1, 1, header.length).setValues([objKeBaris_(header, baris)]);
  else sh.appendRow(objKeBaris_(header, baris));

  return { id_tes: baris.id_tes, hasil: hitungProfil_(baris, atlet, referensi_()) };
}

function hapusTes(token, idTes) {
  cekPeran_(token, ['Admin']);
  var row = cariBaris_(SH.PERFORMA, idTes);
  if (row < 0) throw new Error('Data tes tidak ditemukan.');
  sheet_(SH.PERFORMA).deleteRow(row);
  return true;
}

/** Pratinjau perhitungan tanpa menyimpan — dipakai form Input Performa. */
function pratinjauTes(token, data) {
  cekPeran_(token, ['Admin', 'Pelatih']);
  var atlet = getAtlet(data.id_atlet);
  if (!atlet) throw new Error('Atlet belum dipilih.');
  return hitungProfil_(data, atlet, referensi_());
}

/** Seluruh isi halaman Dashboard untuk satu atlet dalam satu panggilan. */
function getDashboard(token, idAtlet, idTes) {
  var u = sesi_(token);
  cekAksesAtlet_(u, idAtlet);
  cekHalaman_(u, ['dashboard', 'perkembangan', 'laporan', 'atlet']);

  var atlet = getAtlet(idAtlet);
  if (!atlet) throw new Error('Atlet tidak ditemukan.');

  var ref = referensi_();
  var daftarTes = tesAtlet_(idAtlet);
  if (!daftarTes.length) {
    return { atlet: atlet, daftarTes: [], hasil: null, riwayat: [], prestasi: prestasiAtlet_(idAtlet) };
  }

  var tes = idTes ? daftarTes.filter(function (t) { return String(t.id_tes) === String(idTes); })[0] : daftarTes[0];
  if (!tes) tes = daftarTes[0];

  // Riwayat untuk grafik perkembangan: persentase tiap komponen per tanggal tes, urut lama ke baru.
  var riwayat = daftarTes.slice().reverse().map(function (t) {
    var h = hitungProfil_(t, atlet, ref);
    var baris = { tanggal: t.tanggal_tes, profil: h.profil };
    h.komponen.forEach(function (k) { baris[k.id_komponen] = k.persen; });
    return baris;
  });

  return {
    atlet: atlet,
    daftarTes: daftarTes.map(function (t) { return { id_tes: t.id_tes, tanggal_tes: t.tanggal_tes }; }),
    tes: tes,
    hasil: hitungProfil_(tes, atlet, ref),
    riwayat: riwayat,
    prestasi: prestasiAtlet_(idAtlet)
  };
}

/** Ringkasan seluruh tim untuk kartu statistik di halaman depan. */
function ringkasanTim_(u) {
  var atlet = daftarAtlet_(u);
  var aktif = atlet.filter(function (a) { return String(a.status) !== 'Non-aktif'; });
  var batas = batasAtlet_(u);
  var prestasi = bacaSheet_(SH.PRESTASI).filter(function (p) {
    return !batas || String(p.id_atlet) === batas;
  });
  var medali = { Emas: 0, Perak: 0, Perunggu: 0 };
  prestasi.forEach(function (p) {
    if (medali[p.medali] !== undefined) medali[p.medali]++;
  });
  return {
    total_atlet: atlet.length,
    atlet_aktif: aktif.length,
    total_prestasi: prestasi.length,
    medali: medali
  };
}

function getRingkasanTim(token) {
  return ringkasanTim_(sesi_(token));
}
