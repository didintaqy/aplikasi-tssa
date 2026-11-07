/** ============================================================
 *  Atlet.gs — data atlet dan unggah berkas
 *  ============================================================ */

var MAKS_FOTO_MB = 5;

function urlFoto_(fileId) {
  if (!fileId) return '';
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w600';
}

function bungkusAtlet_(a) {
  var usia = hitungUsia_(a.tanggal_lahir);
  return {
    id_atlet: a.id_atlet,
    nama: a.nama,
    tempat_lahir: a.tempat_lahir,
    tanggal_lahir: a.tanggal_lahir ? Utilities.formatDate(new Date(a.tanggal_lahir), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
    ttl: (a.tempat_lahir ? a.tempat_lahir + ', ' : '') +
         (a.tanggal_lahir ? Utilities.formatDate(new Date(a.tanggal_lahir), Session.getScriptTimeZone(), 'd MMMM yyyy') : ''),
    usia: usia,
    gender: a.gender,
    asal_daerah: a.asal_daerah,
    tingkatan: a.tingkatan,
    foto_id: a.foto_id,
    foto_url: urlFoto_(a.foto_id),
    status: a.status || 'Aktif',
    tahun_bergabung: a.tahun_bergabung,
    catatan: a.catatan
  };
}

function daftarAtlet_(u) {
  var semua = bacaSheet_(SH.ATLET).map(bungkusAtlet_);
  var batas = batasAtlet_(u);
  return batas ? semua.filter(function (a) { return String(a.id_atlet) === batas; }) : semua;
}

function getDaftarAtlet(token) {
  return daftarAtlet_(sesi_(token));
}

function getAtlet(id) {
  var a = bacaSheet_(SH.ATLET).filter(function (r) {
    return String(r.id_atlet) === String(id);
  })[0];
  return a ? bungkusAtlet_(a) : null;
}

function validasiAtlet_(data) {
  if (!data.nama || !String(data.nama).trim()) throw new Error('Nama atlet wajib diisi.');
  if (!data.tanggal_lahir) throw new Error('Tanggal lahir wajib diisi.');
  if (!data.gender) throw new Error('Gender wajib dipilih.');

  var p = getPengaturan();
  var usia = hitungUsia_(data.tanggal_lahir);
  if (usia < p.usia_min || usia > p.usia_max) {
    throw new Error('Usia atlet ' + usia + ' tahun berada di luar jangkauan aplikasi (' +
                    p.usia_min + '–' + p.usia_max + ' tahun). Periksa kembali tanggal lahir.');
  }
  return usia;
}

/**
 * Simpan atlet baru atau perbarui yang sudah ada.
 * foto: objek { data: base64, mimeType: '...', nama: '...' } — boleh dikosongkan.
 */
function simpanAtlet(token, data, foto) {
  cekPeran_(token, ['Admin', 'Pelatih']);
  validasiAtlet_(data);

  var fotoId = data.foto_id || '';
  if (foto && foto.data) fotoId = unggahFoto_(foto, data.nama, fotoId);

  var baris = {
    id_atlet: data.id_atlet || idBaru_(SH.ATLET, 'ATL'),
    nama: String(data.nama).trim(),
    tempat_lahir: data.tempat_lahir || '',
    tanggal_lahir: data.tanggal_lahir ? new Date(data.tanggal_lahir) : '',
    gender: data.gender,
    asal_daerah: data.asal_daerah || '',
    tingkatan: data.tingkatan || '',
    foto_id: fotoId,
    status: data.status || 'Aktif',
    tahun_bergabung: data.tahun_bergabung || new Date().getFullYear(),
    catatan: data.catatan || ''
  };

  var sh = sheet_(SH.ATLET);
  var row = data.id_atlet ? cariBaris_(SH.ATLET, data.id_atlet) : -1;
  var nilai = [objKeBaris_(KOLOM.DB_ATLET, baris)];

  if (row > 0) sh.getRange(row, 1, 1, KOLOM.DB_ATLET.length).setValues(nilai);
  else sh.appendRow(nilai[0]);

  return bungkusAtlet_(baris);
}

/**
 * Unggah berkas hasil pilih di browser (foto atlet, bukti prestasi, logo).
 * Berkas lama (bila ada) dipindahkan ke sampah agar folder tidak menumpuk.
 */
function unggahFoto_(foto, namaBerkasDasar, berkasLamaId) {
  if (!FOLDER_FOTO_ID || FOLDER_FOTO_ID.indexOf('ISI_ID') === 0) {
    throw new Error('FOLDER_FOTO_ID di Config.gs belum diisi, berkas tidak dapat disimpan.');
  }
  if (String(foto.mimeType).indexOf('image/') !== 0) {
    throw new Error('Berkas harus berupa gambar (JPG atau PNG).');
  }

  var bytes = Utilities.base64Decode(foto.data);
  if (bytes.length > MAKS_FOTO_MB * 1024 * 1024) {
    throw new Error('Ukuran berkas melebihi ' + MAKS_FOTO_MB + ' MB.');
  }

  var ext = foto.mimeType === 'image/png' ? '.png' : '.jpg';
  var namaBerkas = String(namaBerkasDasar || 'berkas').replace(/[^\w\s-]/g, '').trim() + '_' +
                   Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') + ext;

  var blob = Utilities.newBlob(bytes, foto.mimeType, namaBerkas);
  var folder = DriveApp.getFolderById(FOLDER_FOTO_ID);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  if (berkasLamaId) {
    try { DriveApp.getFileById(berkasLamaId).setTrashed(true); } catch (e) {}
  }
  return file.getId();
}

/** Atlet tidak dihapus permanen, hanya dinonaktifkan agar riwayatnya tetap utuh. */
function hapusAtlet(token, id) {
  cekPeran_(token, ['Admin']);
  var row = cariBaris_(SH.ATLET, id);
  if (row < 0) throw new Error('Atlet tidak ditemukan.');
  sheet_(SH.ATLET).getRange(row, KOLOM.DB_ATLET.indexOf('status') + 1).setValue('Non-aktif');
  return true;
}
