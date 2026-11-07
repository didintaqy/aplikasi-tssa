/** ============================================================
 *  Hitung.gs — logika perhitungan
 *  Komponen, item tes, bobot, dan batas usia dibaca dari sheet,
 *  jadi menambah atau mengganti nama komponen tidak menyentuh kode.
 *  ============================================================ */

function hitungUsia_(tanggalLahir, acuan) {
  if (!tanggalLahir) return '';
  var lahir = new Date(tanggalLahir);
  var kini = acuan ? new Date(acuan) : new Date();
  var usia = kini.getFullYear() - lahir.getFullYear();
  var m = kini.getMonth() - lahir.getMonth();
  if (m < 0 || (m === 0 && kini.getDate() < lahir.getDate())) usia--;
  return usia;
}

function hitungIMT_(tinggi, berat) {
  tinggi = Number(tinggi); berat = Number(berat);
  if (!tinggi || !berat) return null;
  if (tinggi > 3) tinggi = tinggi / 100;          // toleransi bila diisi dalam cm
  return berat / (tinggi * tinggi);
}

function kategoriIMT_(imt) {
  if (imt === null || isNaN(imt)) return '';
  if (imt >= 27) return 'OBESITAS';
  if (imt >= 25.1) return 'GEMUK';
  if (imt >= 18.5) return 'NORMAL';
  if (imt >= 17) return 'KURUS';
  return 'KURANG BERAT';
}

/** Cari benchmark yang cocok untuk satu item tes, gender, dan usia atlet. */
function cariBenchmark_(daftarBM, kunci, gender, usia, ref) {
  usia = Number(usia);
  if (usia < ref.usia_min) usia = ref.usia_min;
  if (usia > ref.usia_max) usia = ref.usia_max;

  var cocok = daftarBM.filter(function (b) {
    return String(b.kunci) === kunci
      && String(b.aktif).toUpperCase() !== 'TIDAK'
      && (String(b.gender) === String(gender) || String(b.gender) === 'Semua')
      && usia >= Number(b.usia_min) && usia <= Number(b.usia_max);
  });
  if (!cocok.length) {
    // Cadangan: abaikan rentang usia, ambil yang gendernya cocok.
    cocok = daftarBM.filter(function (b) {
      return String(b.kunci) === kunci &&
        (String(b.gender) === String(gender) || String(b.gender) === 'Semua');
    });
  }
  return cocok.length ? cocok[0] : null;
}

/** Persentase capaian satu item terhadap benchmark, maksimal 100%. */
function persenItem_(hasil, nilaiBM, arah) {
  hasil = Number(hasil);
  if (!nilaiBM || !hasil || isNaN(hasil)) return null;
  var p = String(arah).toUpperCase() === 'LOWER' ? nilaiBM / hasil : hasil / nilaiBM;
  return Math.min(1, Math.max(0, p));
}

/**
 * Menghitung seluruh profil dari satu sesi tes.
 * Persentase komponen adalah RATA-RATA persentase item di dalamnya,
 * bukan rasio penjumlahan nilai mentah — agar satuan yang berbeda
 * (repetisi, level, meter) tidak saling mendominasi.
 */
function hitungProfil_(tes, atlet, ref) {
  var usia = hitungUsia_(atlet.tanggal_lahir);
  var gender = atlet.gender;

  var detail = ref.item.map(function (it) {
    var bm = cariBenchmark_(ref.benchmark, it.kunci, gender, usia, ref);
    var nilaiBM = bm ? Number(bm.nilai_bm) : null;
    var hasil = tes[it.kunci];
    var p = persenItem_(hasil, nilaiBM, it.arah);
    return {
      kunci: it.kunci,
      nama: it.nama,
      id_komponen: it.id_komponen,
      komponen: it.komponen,
      satuan: it.satuan,
      arah: it.arah,
      hasil: hasil === '' || hasil === null || hasil === undefined ? null : Number(hasil),
      benchmark: nilaiBM,
      persen: p,
      kekurangan: p === null ? null : 1 - p
    };
  });

  var komponen = ref.komponen.map(function (k) {
    var item = detail.filter(function (d) {
      return d.id_komponen === k.id_komponen && d.persen !== null;
    });
    var p = item.length
      ? item.reduce(function (a, b) { return a + b.persen; }, 0) / item.length
      : null;
    return {
      id_komponen: k.id_komponen,
      nama: k.nama,
      persen: p,
      kekurangan: p === null ? null : 1 - p,
      bobot: Number(k.bobot) || 0,
      jumlahItem: item.length
    };
  });

  // Profil = Σ (%komponen × bobot). Bobot dinormalkan agar komponen
  // yang belum ada datanya tidak menurunkan nilai secara keliru.
  var terisi = komponen.filter(function (k) { return k.persen !== null; });
  var totalBobot = terisi.reduce(function (a, b) { return a + b.bobot; }, 0);
  var profil = totalBobot
    ? terisi.reduce(function (a, b) { return a + b.persen * b.bobot; }, 0) / totalBobot
    : null;

  var imt = hitungIMT_(tes.tinggi_badan, tes.berat_badan);
  var nadiMaks = usia ? 220 - usia : null;

  return {
    usia: usia,
    gender: gender,
    imt: imt === null ? null : Math.round(imt * 10) / 10,
    kategori_imt: kategoriIMT_(imt),
    nadi_istirahat: tes.nadi_istirahat || null,
    nadi_latihan: tes.nadi_latihan || null,
    nadi_maksimal: nadiMaks,
    persen_nadi_istirahat: nadiMaks && tes.nadi_istirahat ? Number(tes.nadi_istirahat) / nadiMaks : null,
    persen_nadi_latihan: nadiMaks && tes.nadi_latihan ? Number(tes.nadi_latihan) / nadiMaks : null,
    detail: detail,
    komponen: komponen,
    profil: profil,
    kekurangan_profil: profil === null ? null : 1 - profil,
    kategori: cariKategori_(ref.kategori, profil)
  };
}

function cariKategori_(daftar, profil) {
  if (profil === null) return { label: '-', deskripsi: '', warna: '#888888' };
  var nilai = profil * 100;
  for (var i = 0; i < daftar.length; i++) {
    if (nilai >= Number(daftar[i].min) && nilai <= Number(daftar[i].max)) {
      return {
        label: daftar[i].label,
        deskripsi: daftar[i].deskripsi,
        warna: daftar[i].warna || '#888888'
      };
    }
  }
  return { label: '-', deskripsi: '', warna: '#888888' };
}

/** Referensi yang dipakai berulang kali; dibaca sekali per permintaan. */
function referensi_() {
  var p = getPengaturan();
  return {
    benchmark: bacaSheet_(SH.BENCHMARK),
    komponen: daftarKomponen_(false),
    item: daftarItem_(false),
    kategori: bacaSheet_(SH.KATEGORI),
    usia_min: Number(p.usia_min) || 5,
    usia_max: Number(p.usia_max) || 40
  };
}
