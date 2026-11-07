/** ============================================================
 *  BiodataSiswa.gs — siswa memperbaiki biodata, TERMASUK tanggal lahir
 *  (hanya penambahan; simpanBiodataSaya di AtletLanjut.gs tidak diubah)
 *
 *  Yang boleh diubah siswa: nama, tempat lahir, asal daerah, TANGGAL LAHIR, foto.
 *  Gender, tingkatan, status, tahun bergabung, dan catatan tetap terkunci.
 *
 *  Tanggal lahir menentukan usia, dan usia menentukan benchmark skor, sehingga:
 *   - usia hasilnya harus dalam batas aplikasi (Pengaturan › usia min/maks),
 *   - perubahan langsung berlaku tetapi DICATAT di LOG_ATLET (nilai lama → baru),
 *   - skor seluruh riwayat tes dihitung ulang otomatis (dihitung saat dibuka).
 *
 *  Memakai pembantu: denganKunci_ (Keuangan.gs), logAtlet_ dan siswaBolehEdit_
 *  (AtletLanjut.gs), hitungUsia_ (Hitung.gs).
 *  ============================================================ */

/** Menerima 'yyyy-MM-dd' (dari klien) dan, untuk berjaga-jaga, 'dd-MM-yyyy' / 'dd/MM/yyyy'. */
function tglDariBiodata_(teks) {
  teks = String(teks === undefined || teks === null ? '' : teks).trim();
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(teks);
  var y, mo, d;
  if (m) { y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]); }
  else {
    m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec(teks);
    if (!m) return null;
    d = Number(m[1]); mo = Number(m[2]); y = Number(m[3]);
  }
  var dt = new Date(y, mo - 1, d);
  return (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) ? dt : null;
}

function simpanBiodataSayaLengkap(token, data, foto) {
  var u = sesi_(token);
  if (String(u.peran) !== 'Siswa') {
    throw new Error('Fitur ini khusus akun siswa. Admin dan Pelatih mengubah data lewat formulir atlet.');
  }
  var id = String(u.id_atlet || '').trim();
  if (!id) throw new Error('Akun Anda belum ditautkan ke data atlet. Hubungi pelatih atau admin.');
  if (!siswaBolehEdit_()) throw new Error('Perubahan biodata oleh siswa sedang dinonaktifkan admin.');

  data = data || {};
  var nama = String(data.nama || '').trim().slice(0, 100);
  if (!nama) throw new Error('Nama wajib diisi.');
  var tempat = String(data.tempat_lahir || '').trim().slice(0, 100);
  var asal = String(data.asal_daerah || '').trim().slice(0, 100);

  var tgl = tglDariBiodata_(data.tanggal_lahir);
  if (!tgl) throw new Error('Tanggal lahir tidak valid. Gunakan format hari-bulan-tahun, mis. 20-05-2012.');
  var p = getPengaturan();
  var usiaBaru = hitungUsia_(tgl);
  if (usiaBaru < p.usia_min || usiaBaru > p.usia_max) {
    throw new Error('Usia ' + usiaBaru + ' tahun berada di luar jangkauan aplikasi (' +
                    p.usia_min + '–' + p.usia_max + ' tahun). Periksa kembali tanggal lahir.');
  }

  return denganKunci_(function () {
    var row = cariBaris_(SH.ATLET, id);
    if (row < 0) throw new Error('Data atlet tidak ditemukan.');
    var sh = sheet_(SH.ATLET), kol = KOLOM.DB_ATLET;
    var nilai = sh.getRange(row, 1, 1, kol.length).getValues()[0];
    var berubah = [];

    function ubah(kolom, baru) {
      var i = kol.indexOf(kolom);
      if (String(nilai[i]) !== baru) {
        berubah.push(kolom + ': "' + nilai[i] + '" → "' + baru + '"');
        nilai[i] = baru;
      }
    }
    ubah('nama', nama);
    ubah('tempat_lahir', tempat);
    ubah('asal_daerah', asal);

    // Tanggal lahir: bandingkan sebagai teks yyyy-MM-dd agar zona waktu tidak mengganggu.
    var iT = kol.indexOf('tanggal_lahir');
    var lama = nilai[iT];
    var lamaTeks = lama instanceof Date ? Utilities.formatDate(lama, tz_(), 'yyyy-MM-dd') : String(lama || '').slice(0, 10);
    var baruTeks = Utilities.formatDate(tgl, tz_(), 'yyyy-MM-dd');
    if (lamaTeks !== baruTeks) {
      var usiaLama = lama ? hitungUsia_(lama) : '-';
      berubah.push('tanggal_lahir: "' + lamaTeks + '" → "' + baruTeks + '" (usia ' + usiaLama + ' → ' + usiaBaru + ', skor dihitung ulang)');
      nilai[iT] = tgl;
    }

    if (foto && foto.data) {
      var iF = kol.indexOf('foto_id');
      nilai[iF] = unggahFoto_(foto, nama, String(nilai[iF] || ''));
      berubah.push('foto diganti');
    }

    if (berubah.length) {
      sh.getRange(row, 1, 1, kol.length).setValues([nilai]);
      logAtlet_(u.username, id, 'EDIT_OLEH_SISWA', berubah.join('; '));
    }
    return getAtlet(id);
  });
}
