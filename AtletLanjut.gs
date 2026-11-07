/** ============================================================
 *  AtletLanjut.gs — Revisi 3 (hanya penambahan, tidak mengubah Atlet.gs)
 *
 *   1. Hapus permanen atlet beserta seluruh data terkait (khusus Admin)
 *   2. Siswa memperbaiki biodata sendiri (nama, tempat lahir, asal daerah, foto)
 *   3. Impor data atlet dari Excel/CSV (Admin & Pelatih), data lama diperbarui
 *
 *  Ekspor dilakukan di sisi klien dari data yang memang sudah boleh dilihat
 *  pengguna, sehingga tidak ada jalur baru untuk membocorkan data.
 *
 *  Perubahan penting dicatat di sheet LOG_ATLET (dibuat otomatis).
 *  Memakai pembantu dari Keuangan.gs: denganKunci_, tz_, tulisPengaturan_.
 *  ============================================================ */

var LOG_ATLET_NAMA = 'LOG_ATLET';
var LOG_ATLET_KOLOM = ['waktu', 'oleh', 'id_atlet', 'aksi', 'rincian'];
var BATAS_BARIS_IMPOR = 2000;

/* ---------------- Catatan perubahan ---------------- */

/** Gagal mencatat tidak boleh menggagalkan pekerjaan utama. */
function logAtlet_(oleh, idAtlet, aksi, rincian) {
  try {
    var ss = ss_();
    var s = ss.getSheetByName(LOG_ATLET_NAMA);
    if (!s) {
      s = ss.insertSheet(LOG_ATLET_NAMA);
      s.appendRow(LOG_ATLET_KOLOM);
      s.getRange(1, 1, 1, LOG_ATLET_KOLOM.length).setFontWeight('bold');
      s.setFrozenRows(1);
    }
    s.appendRow([new Date(), String(oleh || ''), String(idAtlet || ''), String(aksi), String(rincian || '')]);
  } catch (e) { /* diabaikan */ }
}

/* ---------------- 1. Hapus permanen ---------------- */

/** Hapus semua baris sheet yang kolom `namaKolom`-nya bernilai id. Dari bawah agar nomor baris tidak bergeser. */
function hapusBarisAtlet_(namaSheet, namaKolom, id) {
  var sh = sheet_(namaSheet);
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return 0;
  var idx = data[0].map(function (h) { return String(h).trim(); }).indexOf(namaKolom);
  if (idx < 0) return 0;
  var n = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][idx]).trim() === id) { sh.deleteRow(i + 1); n++; }
  }
  return n;
}

/**
 * Hapus atlet SECARA PERMANEN beserta data tes, prestasi, tagihan, dan pembayarannya.
 * Akun siswa yang tertaut dinonaktifkan dan dilepas tautannya (tidak dihapus).
 * Foto dan bukti prestasi dipindahkan ke sampah Drive.
 * Konfirmasi: nama atlet harus diketik persis. Atlet dihapus TERAKHIR sehingga
 * bila proses terhenti di tengah, penghapusan bisa diulang.
 */
function hapusAtletPermanen(token, idAtlet, konfirmasiNama) {
  var u = cekPeran_(token, ['Admin']);
  var id = String(idAtlet || '').trim();
  var a = getAtlet(id);
  if (!a) throw new Error('Atlet tidak ditemukan.');
  if (String(konfirmasiNama || '').trim().toLowerCase() !== String(a.nama).trim().toLowerCase()) {
    throw new Error('Nama yang diketik tidak cocok. Penghapusan dibatalkan.');
  }

  return denganKunci_(function () {
    var ringkas = { tes: 0, prestasi: 0, tagihan: 0, pembayaran: 0, akun_dinonaktifkan: 0, berkas: 0 };

    // Kumpulkan berkas Drive sebelum barisnya hilang.
    var berkas = [];
    if (a.foto_id) berkas.push(String(a.foto_id));
    bacaSheet_(SH.PRESTASI).forEach(function (p) {
      if (String(p.id_atlet) === id && p.bukti_id) berkas.push(String(p.bukti_id));
    });

    ringkas.pembayaran = hapusBarisAtlet_(SH.PEMBAYARAN, 'id_atlet', id);
    ringkas.tagihan = hapusBarisAtlet_(SH.TAGIHAN, 'id_atlet', id);
    ringkas.prestasi = hapusBarisAtlet_(SH.PRESTASI, 'id_atlet', id);
    ringkas.tes = hapusBarisAtlet_(SH.PERFORMA, 'id_atlet', id);
    // Pengajuan prestasi siswa (PrestasiSiswa.gs) ikut dibersihkan bila modul itu terpasang.
    if (typeof hapusUsulanAtlet_ === 'function') ringkas.usulan = hapusUsulanAtlet_(id, berkas);

    // Akun tertaut: lepas tautan; akun Siswa sekaligus dinonaktifkan
    // (siswa tanpa tautan akan melihat semua atlet, jadi tidak boleh dibiarkan aktif).
    var shU = sheet_(SH.USERS);
    var du = shU.getDataRange().getValues();
    var kU = KOLOM.USERS;
    for (var i = 1; i < du.length; i++) {
      if (String(du[i][kU.indexOf('id_atlet')]).trim() !== id) continue;
      shU.getRange(i + 1, kU.indexOf('id_atlet') + 1).setValue('');
      if (String(du[i][kU.indexOf('peran')]) === 'Siswa') {
        shU.getRange(i + 1, kU.indexOf('aktif') + 1).setValue('TIDAK');
        ringkas.akun_dinonaktifkan++;
      }
    }

    berkas.forEach(function (fid) {
      try { DriveApp.getFileById(fid).setTrashed(true); ringkas.berkas++; } catch (e) {}
    });

    var row = cariBaris_(SH.ATLET, id);
    if (row > 0) sheet_(SH.ATLET).deleteRow(row);

    logAtlet_(u.username, id, 'HAPUS_PERMANEN', a.nama + ' | ' + JSON.stringify(ringkas));
    return { nama: a.nama, id_atlet: id, ringkas: ringkas };
  });
}

/* ---------------- 2. Siswa memperbaiki biodata sendiri ---------------- */

/** Default aktif; Admin dapat mematikannya lewat Pengaturan. */
function siswaBolehEdit_() {
  var nilai = '';
  bacaSheet_(SH.PENGATURAN).forEach(function (r) {
    if (String(r.kunci) === 'siswa_edit_biodata') nilai = String(r.nilai).trim().toUpperCase();
  });
  return nilai !== 'TIDAK';
}

function simpanSiswaEditBiodata(token, nilai) {
  cekPeran_(token, ['Admin']);
  var v = String(nilai).toUpperCase() === 'TIDAK' ? 'TIDAK' : 'YA';
  tulisPengaturan_('siswa_edit_biodata', v, false);
  return v;
}

/**
 * Hanya nama, tempat lahir, asal daerah, dan foto. Kolom lain (tanggal lahir,
 * gender, tingkatan, status, catatan) tidak disentuh sama sekali, karena tanggal
 * lahir dan gender menentukan benchmark skor.
 * Fungsi ini sengaja terpisah dari simpanAtlet agar akses siswa tidak melebar.
 */
function simpanBiodataSaya(token, data, foto) {
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

/* ---------------- 3. Impor atlet ---------------- */

function normGender_(g) {
  var k = String(g || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!k) return '';
  if (['l', 'lakilaki', 'laki', 'pria', 'male', 'm'].indexOf(k) >= 0) return 'Laki-laki';
  if (['p', 'perempuan', 'wanita', 'female', 'f'].indexOf(k) >= 0) return 'Perempuan';
  return null;
}

function normStatus_(s) {
  var k = String(s || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!k) return '';
  if (k === 'aktif') return 'Aktif';
  if (k === 'nonaktif' || k === 'tidakaktif') return 'Non-aktif';
  return null;
}

function tglValid_(teks) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(teks || '').trim());
  if (!m) return null;
  var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  var dt = new Date(y, mo - 1, d);
  return (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) ? dt : null;
}

function tglKunci_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return String(v || '').trim().slice(0, 10);
}

function kunciAtlet_(nama, tgl) {
  return String(nama || '').trim().toLowerCase().replace(/\s+/g, ' ') + '|' + tglKunci_(tgl);
}

/**
 * baris: [{ baris, id_atlet, nama, tempat_lahir, tanggal_lahir('yyyy-MM-dd'), gender,
 *           asal_daerah, tingkatan, status, tahun_bergabung, catatan }]
 *
 * Pencocokan atlet yang sudah ada: ID (bila ada di sistem), lalu nama + tanggal lahir.
 * Yang cocok DIPERBARUI; sel kosong di berkas tidak menghapus data lama.
 * Baris yang salah dilaporkan per baris dan tidak menggagalkan baris lain.
 */
function imporAtlet(token, baris) {
  var u = cekPeran_(token, ['Admin', 'Pelatih']);
  if (!(baris instanceof Array) || !baris.length) throw new Error('Tidak ada baris data untuk diimpor.');
  if (baris.length > BATAS_BARIS_IMPOR) {
    throw new Error('Maksimal ' + BATAS_BARIS_IMPOR + ' baris per impor. Bagi berkas menjadi beberapa bagian.');
  }
  var p = getPengaturan();

  return denganKunci_(function () {
    var sh = sheet_(SH.ATLET), kol = KOLOM.DB_ATLET, n = kol.length;
    var jml = Math.max(sh.getLastRow() - 1, 0);
    var data = jml ? sh.getRange(2, 1, jml, n).getValues() : [];
    var ix = {};
    kol.forEach(function (k, i) { ix[k] = i; });

    var peId = {}, peKunci = {}, maks = 0;
    data.forEach(function (r, i) {
      var id = String(r[ix.id_atlet]).trim();
      if (!id) return;
      peId[id] = i;
      var no = parseInt(id.replace(/\D/g, ''), 10);
      if (!isNaN(no) && no > maks) maks = no;
      peKunci[kunciAtlet_(r[ix.nama], r[ix.tanggal_lahir])] = i;
    });

    var dibuat = 0, diperbarui = 0, tanpaUbah = 0, gagal = [];
    var tahunIni = new Date().getFullYear();

    baris.forEach(function (b, i) {
      var noBaris = Number(b.baris) || (i + 2);
      var nama = String(b.nama || '').trim();
      try {
        if (!nama) throw new Error('Nama kosong.');
        var tgl = tglValid_(b.tanggal_lahir);
        if (!tgl) throw new Error('Tanggal lahir tidak valid (gunakan tahun-bulan-tanggal, mis. 2012-05-20).');
        var usia = hitungUsia_(tgl);
        if (usia < p.usia_min || usia > p.usia_max) {
          throw new Error('Usia ' + usia + ' tahun di luar jangkauan aplikasi (' + p.usia_min + '–' + p.usia_max + ').');
        }
        var gender = normGender_(b.gender);
        if (gender === null) throw new Error('Gender tidak dikenal (isi Laki-laki atau Perempuan).');
        var status = normStatus_(b.status);
        if (status === null) throw new Error('Status tidak dikenal (isi Aktif atau Non-aktif).');

        var thTeks = String(b.tahun_bergabung === undefined || b.tahun_bergabung === null ? '' : b.tahun_bergabung).trim();
        var th = '';
        if (thTeks !== '') {
          th = Number(thTeks);
          if (!(th >= 1950 && th <= 2100) || th % 1 !== 0) throw new Error('Tahun bergabung tidak valid.');
        }

        var teksTgl = tglKunci_(tgl);
        var idCocok = String(b.id_atlet || '').trim();
        var pos = (idCocok && peId[idCocok] !== undefined) ? peId[idCocok] : peKunci[kunciAtlet_(nama, teksTgl)];

        if (pos !== undefined) {
          var r = data[pos], sebelum = r.map(String).join('|');
          r[ix.nama] = nama;
          if (tglKunci_(r[ix.tanggal_lahir]) !== teksTgl) r[ix.tanggal_lahir] = tgl;
          if (gender) r[ix.gender] = gender;
          if (status) r[ix.status] = status;
          if (th !== '') r[ix.tahun_bergabung] = th;
          ['tempat_lahir', 'asal_daerah', 'tingkatan', 'catatan'].forEach(function (k) {
            var v = String(b[k] === undefined || b[k] === null ? '' : b[k]).trim();
            if (v !== '') r[ix[k]] = v;
          });
          peKunci[kunciAtlet_(r[ix.nama], r[ix.tanggal_lahir])] = pos;
          if (r.map(String).join('|') === sebelum) tanpaUbah++; else diperbarui++;
        } else {
          if (!gender) throw new Error('Gender wajib diisi untuk atlet baru.');
          var baru = new Array(n);
          for (var c = 0; c < n; c++) baru[c] = '';
          baru[ix.id_atlet] = 'ATL' + (++maks);
          baru[ix.nama] = nama;
          baru[ix.tempat_lahir] = String(b.tempat_lahir || '').trim();
          baru[ix.tanggal_lahir] = tgl;
          baru[ix.gender] = gender;
          baru[ix.asal_daerah] = String(b.asal_daerah || '').trim();
          baru[ix.tingkatan] = String(b.tingkatan || '').trim();
          baru[ix.status] = status || 'Aktif';
          baru[ix.tahun_bergabung] = th !== '' ? th : tahunIni;
          baru[ix.catatan] = String(b.catatan || '').trim();
          data.push(baru);
          peId[baru[ix.id_atlet]] = data.length - 1;
          peKunci[kunciAtlet_(nama, teksTgl)] = data.length - 1;
          dibuat++;
        }
      } catch (e) {
        gagal.push({ baris: noBaris, nama: nama, pesan: e.message });
      }
    });

    if (dibuat || diperbarui) {
      var perlu = data.length + 1;
      if (sh.getMaxRows() < perlu) sh.insertRowsAfter(sh.getMaxRows(), perlu - sh.getMaxRows());
      sh.getRange(2, 1, data.length, n).setValues(data);
    }

    logAtlet_(u.username, '', 'IMPOR',
      'baru ' + dibuat + ', diperbarui ' + diperbarui + ', tanpa perubahan ' + tanpaUbah + ', gagal ' + gagal.length);
    return {
      dibuat: dibuat, diperbarui: diperbarui, tanpa_perubahan: tanpaUbah,
      gagal: gagal.slice(0, 200), jumlah_gagal: gagal.length
    };
  });
}
