/** ============================================================
 *  Auth.gs — kata sandi, sesi, dan hak akses
 *
 *  Tiga peran: Admin, Pelatih, Siswa.
 *  Login memakai username + kata sandi yang disimpan dalam bentuk
 *  hash SHA-256 bersalt di sheet USERS, jadi kata sandi asli tidak
 *  pernah tersimpan di spreadsheet.
 *
 *  Setelah login, server menerbitkan token acak yang disimpan di
 *  CacheService (berlaku 6 jam, diperpanjang setiap kali dipakai).
 *  Token itu dikirim klien pada setiap pemanggilan fungsi server.
 *  ============================================================ */

var SESI_DETIK = 21600;     // 6 jam — batas maksimal CacheService
var AWALAN_SESI = 'REMAJA_SESI_';

/* ---------------- Hash ---------------- */

function saltBaru_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function hashSandi_(sandi, salt) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt) + '|' + String(sandi),
    Utilities.Charset.UTF_8
  );
  return raw.map(function (b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function buatBarisPengguna_(username, nama, peran, sandi, idAtlet, aktif) {
  var salt = saltBaru_();
  return [String(username).toLowerCase().trim(), nama, peran, salt,
          hashSandi_(sandi, salt), idAtlet || '', aktif || 'YA'];
}

function validasiSandi_(sandi) {
  if (!sandi || String(sandi).length < 6) {
    throw new Error('Kata sandi minimal 6 karakter.');
  }
  return String(sandi);
}

/* ---------------- Masuk & keluar ---------------- */

function penggunaDenganNama_(username) {
  var u = String(username || '').toLowerCase().trim();
  return bacaSheet_(SH.USERS).filter(function (x) {
    return String(x.username).toLowerCase().trim() === u;
  })[0] || null;
}

function bungkusSesi_(u, token) {
  return {
    token: token,
    username: String(u.username),
    nama: String(u.nama || u.username),
    peran: String(u.peran),
    id_atlet: String(u.id_atlet || '')
  };
}

/** Dipanggil dari layar login. */
function masuk(username, sandi) {
  var u = penggunaDenganNama_(username);
  var gagal = new Error('Nama pengguna atau kata sandi salah.');
  if (!u) throw gagal;
  if (String(u.aktif).toUpperCase() === 'TIDAK') {
    throw new Error('Akun ini dinonaktifkan. Hubungi admin.');
  }
  if (hashSandi_(sandi, u.salt) !== String(u.hash)) throw gagal;

  var token = Utilities.getUuid();
  CacheService.getScriptCache().put(AWALAN_SESI + token, String(u.username), SESI_DETIK);
  return bungkusSesi_(u, token);
}

function keluar(token) {
  if (token) CacheService.getScriptCache().remove(AWALAN_SESI + token);
  return true;
}

/** Ambil pengguna dari token; melempar SESI_HABIS bila tidak sah. */
function sesi_(token) {
  var cache = CacheService.getScriptCache();
  var username = token ? cache.get(AWALAN_SESI + token) : null;
  if (!username) throw new Error('SESI_HABIS');

  var u = penggunaDenganNama_(username);
  if (!u || String(u.aktif).toUpperCase() === 'TIDAK') throw new Error('SESI_HABIS');

  cache.put(AWALAN_SESI + token, String(u.username), SESI_DETIK); // perpanjang
  return u;
}

function cekPeran_(token, izin) {
  var u = sesi_(token);
  if (izin.indexOf(String(u.peran)) < 0) {
    throw new Error('Akses ditolak. Tindakan ini hanya untuk: ' + izin.join(' atau ') + '.');
  }
  return u;
}

/** Siswa yang ditautkan ke satu atlet hanya boleh melihat datanya sendiri. */
function batasAtlet_(u) {
  return String(u.peran) === 'Siswa' && String(u.id_atlet || '') ? String(u.id_atlet) : null;
}

function cekAksesAtlet_(u, idAtlet) {
  var batas = batasAtlet_(u);
  if (batas && String(idAtlet) !== batas) {
    throw new Error('Akses ditolak. Akun siswa hanya dapat melihat datanya sendiri.');
  }
  return true;
}

/**
 * Halaman apa saja yang boleh dibuka akun Siswa diatur admin lewat Pengaturan.
 * Peran lain tidak dibatasi di sini.
 */
function bolehHalaman_(u, halaman) {
  if (String(u.peran) !== 'Siswa') return true;
  var izin = getPengaturan().akses_siswa || [];
  if (halaman instanceof Array) {
    return halaman.some(function (h) { return izin.indexOf(h) >= 0; });
  }
  return izin.indexOf(halaman) >= 0;
}

function cekHalaman_(u, halaman) {
  if (!bolehHalaman_(u, halaman)) {
    throw new Error('Akses ditolak. Bagian ini tidak dibuka untuk akun siswa.');
  }
  return true;
}

/* ---------------- Manajemen pengguna (Admin) ---------------- */

function getPengguna(token) {
  cekPeran_(token, ['Admin']);
  return bacaSheet_(SH.USERS).map(function (u) {
    return {
      username: String(u.username),
      nama: String(u.nama || ''),
      peran: String(u.peran),
      id_atlet: String(u.id_atlet || ''),
      aktif: String(u.aktif || 'YA').toUpperCase()
    };
  });
}

/**
 * Tambah pengguna baru atau perbarui yang ada.
 * data: { username, nama, peran, sandi, id_atlet, aktif, username_lama }
 * Kata sandi hanya diubah bila diisi.
 */
function simpanPengguna(token, data) {
  var aku = cekPeran_(token, ['Admin']);

  var username = String(data.username || '').toLowerCase().trim();
  if (!/^[a-z0-9._-]{3,20}$/.test(username)) {
    throw new Error('Nama pengguna 3–20 karakter, hanya huruf kecil, angka, titik, garis bawah, atau strip.');
  }
  if (PERAN_SAH.indexOf(String(data.peran)) < 0) {
    throw new Error('Peran harus Admin, Pelatih, atau Siswa.');
  }

  var lamaNama = String(data.username_lama || '').toLowerCase().trim();
  var lama = lamaNama ? penggunaDenganNama_(lamaNama) : null;

  if (!lama && penggunaDenganNama_(username)) {
    throw new Error('Nama pengguna "' + username + '" sudah dipakai.');
  }
  if (lama && username !== lamaNama && penggunaDenganNama_(username)) {
    throw new Error('Nama pengguna "' + username + '" sudah dipakai.');
  }

  var aktif = String(data.aktif || 'YA').toUpperCase() === 'TIDAK' ? 'TIDAK' : 'YA';

  // Jangan sampai admin terakhir hilang atau mengunci dirinya sendiri.
  if (lama && String(lama.peran) === 'Admin' &&
      (String(data.peran) !== 'Admin' || aktif === 'TIDAK')) {
    var adminAktif = bacaSheet_(SH.USERS).filter(function (x) {
      return String(x.peran) === 'Admin' && String(x.aktif).toUpperCase() !== 'TIDAK';
    });
    if (adminAktif.length <= 1) throw new Error('Minimal satu akun Admin aktif harus tersisa.');
  }

  var salt, hash;
  if (data.sandi) {
    validasiSandi_(data.sandi);
    salt = saltBaru_();
    hash = hashSandi_(data.sandi, salt);
  } else if (lama) {
    salt = lama.salt; hash = lama.hash;
  } else {
    throw new Error('Kata sandi wajib diisi untuk pengguna baru.');
  }

  var baris = [username, String(data.nama || username), String(data.peran),
               salt, hash, String(data.id_atlet || ''), aktif];

  var sh = sheet_(SH.USERS);
  var row = lamaNama ? cariBaris_(SH.USERS, lamaNama) : -1;
  if (row > 0) sh.getRange(row, 1, 1, KOLOM.USERS.length).setValues([baris]);
  else sh.appendRow(baris);

  return getPengguna(token);
}

function hapusPengguna(token, username) {
  var aku = cekPeran_(token, ['Admin']);
  var target = String(username || '').toLowerCase().trim();

  if (target === String(aku.username).toLowerCase()) {
    throw new Error('Anda tidak dapat menghapus akun yang sedang dipakai.');
  }
  var u = penggunaDenganNama_(target);
  if (!u) throw new Error('Pengguna tidak ditemukan.');

  if (String(u.peran) === 'Admin') {
    var adminAktif = bacaSheet_(SH.USERS).filter(function (x) {
      return String(x.peran) === 'Admin' && String(x.aktif).toUpperCase() !== 'TIDAK';
    });
    if (adminAktif.length <= 1) throw new Error('Minimal satu akun Admin aktif harus tersisa.');
  }

  var row = cariBaris_(SH.USERS, target);
  if (row < 0) throw new Error('Pengguna tidak ditemukan.');
  sheet_(SH.USERS).deleteRow(row);
  return getPengguna(token);
}

/** Setiap pengguna boleh mengganti kata sandinya sendiri. */
function gantiSandiSaya(token, sandiLama, sandiBaru) {
  var u = sesi_(token);
  if (hashSandi_(sandiLama, u.salt) !== String(u.hash)) {
    throw new Error('Kata sandi lama tidak cocok.');
  }
  validasiSandi_(sandiBaru);
  var salt = saltBaru_();
  var row = cariBaris_(SH.USERS, String(u.username));
  if (row < 0) throw new Error('Pengguna tidak ditemukan.');
  sheet_(SH.USERS).getRange(row, KOLOM.USERS.indexOf('salt') + 1, 1, 2)
    .setValues([[salt, hashSandi_(sandiBaru, salt)]]);
  return true;
}
