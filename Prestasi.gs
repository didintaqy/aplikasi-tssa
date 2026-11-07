/** ============================================================
 *  Prestasi.gs — satu atlet, banyak prestasi
 *  ============================================================ */

function bungkusPrestasi_(p) {
  return {
    id_prestasi: p.id_prestasi,
    id_atlet: p.id_atlet,
    nama_kejuaraan: p.nama_kejuaraan,
    tingkat: p.tingkat,
    tanggal: tanggalTeks_(p.tanggal),
    tempat: p.tempat,
    penyelenggara: p.penyelenggara,
    kategori: p.kategori,
    kelas: p.kelas,
    medali: p.medali,
    bukti_id: p.bukti_id,
    bukti_url: p.bukti_id ? urlFoto_(p.bukti_id) : '',
    catatan: p.catatan
  };
}

function prestasiAtlet_(idAtlet) {
  return bacaSheet_(SH.PRESTASI)
    .filter(function (p) { return String(p.id_atlet) === String(idAtlet); })
    .map(bungkusPrestasi_)
    .sort(function (a, b) { return a.tanggal < b.tanggal ? 1 : -1; });
}

function getPrestasiAtlet(token, idAtlet) {
  var u = sesi_(token);
  cekAksesAtlet_(u, idAtlet);
  return prestasiAtlet_(idAtlet);
}

function semuaPrestasi_(u) {
  var batas = batasAtlet_(u);
  var atlet = {};
  bacaSheet_(SH.ATLET).forEach(function (a) { atlet[a.id_atlet] = a.nama; });
  return bacaSheet_(SH.PRESTASI)
    .filter(function (p) { return !batas || String(p.id_atlet) === batas; })
    .map(function (p) {
      var o = bungkusPrestasi_(p);
      o.nama_atlet = atlet[p.id_atlet] || '-';
      return o;
    })
    .sort(function (a, b) { return a.tanggal < b.tanggal ? 1 : -1; });
}

function getSemuaPrestasi(token) {
  var u = sesi_(token);
  cekHalaman_(u, ['prestasi', 'dashboard', 'laporan']);
  return semuaPrestasi_(u);
}

function simpanPrestasi(token, data, bukti) {
  cekPeran_(token, ['Admin', 'Pelatih']);
  if (!data.id_atlet) throw new Error('Atlet belum dipilih.');
  if (!data.nama_kejuaraan) throw new Error('Nama kejuaraan wajib diisi.');

  var buktiId = data.bukti_id || '';
  if (bukti && bukti.data) buktiId = unggahFoto_(bukti, 'bukti_' + data.nama_kejuaraan, buktiId);

  var baris = {
    id_prestasi: data.id_prestasi || idBaru_(SH.PRESTASI, 'PRS'),
    id_atlet: data.id_atlet,
    nama_kejuaraan: data.nama_kejuaraan,
    tingkat: data.tingkat || '',
    tanggal: data.tanggal ? new Date(data.tanggal) : '',
    tempat: data.tempat || '',
    penyelenggara: data.penyelenggara || '',
    kategori: data.kategori || '',
    kelas: data.kelas || '',
    medali: data.medali || '',
    bukti_id: buktiId,
    catatan: data.catatan || ''
  };

  var sh = sheet_(SH.PRESTASI);
  var row = data.id_prestasi ? cariBaris_(SH.PRESTASI, data.id_prestasi) : -1;
  if (row > 0) sh.getRange(row, 1, 1, KOLOM.DB_PRESTASI.length).setValues([objKeBaris_(KOLOM.DB_PRESTASI, baris)]);
  else sh.appendRow(objKeBaris_(KOLOM.DB_PRESTASI, baris));

  return bungkusPrestasi_(baris);
}

function hapusPrestasi(token, id) {
  cekPeran_(token, ['Admin']);
  var row = cariBaris_(SH.PRESTASI, id);
  if (row < 0) throw new Error('Data prestasi tidak ditemukan.');
  sheet_(SH.PRESTASI).deleteRow(row);
  return true;
}
