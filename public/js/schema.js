// Skema kolom tiap sheet: [kunci, judul-judul yang dikenali di Excel (judul pertama = resmi)]
export const SKEMA = {
  Data_Barang: [['nama', 'Nama Material'], ['valtype', 'Valtype'], ['satuan', 'Satuan'], ['awal', 'Stok Awal'], ['min', 'Stok Minimum'], ['ket', 'Keterangan']],
  Barang_Masuk: [['no', 'No'], ['tgl', 'Tanggal'], ['nama', 'Nama Material', 'Material', 'Deskripsi', 'Nama Deskripsi'], ['valtype', 'Valtype'], ['sn', 'SN', 'SN (Qty)', 'Serial Number'], ['ket', 'Keterangan', 'Ket'], ['divisi', 'Divisi']],
  Barang_Keluar: [['tgl', 'Tanggal'], ['pengambil', 'Yang Mengambil', 'Pengambil'], ['material', 'Material', 'Nama Material', 'Deskripsi', 'Nama Deskripsi'], ['sn', 'SN', 'SN (Qty)', 'Serial Number'], ['ket', 'Keterangan', 'Ket'], ['mitra', 'Mitra']],
  Pengambilan_Ritel: [['no', 'No'], ['tgl', 'Tanggal'], ['mitra', 'Mitra'], ['bidang', 'Bidang'], ['nama', 'Nama'], ['material', 'Material', 'Nama Material', 'Deskripsi'], ['sn', 'SN', 'SN (Qty)', 'Serial Number'], ['lokasi', 'Lokasi'], ['ket', 'Keterangan', 'Ket']],
  Pengambilan_Ggn: [['no', 'No'], ['tgl', 'Tanggal'], ['mitra', 'Mitra'], ['bidang', 'Bidang'], ['nama', 'Nama'], ['material', 'Material', 'Nama Material', 'Deskripsi'], ['sn', 'SN', 'SN (Qty)', 'Serial Number'], ['lokasi', 'Lokasi'], ['ket', 'Keterangan', 'Ket']],
  Pengambilan_ICRM: [['no', 'No'], ['tgl', 'Tanggal'], ['wo', 'WO'], ['mitra', 'Mitra'], ['nama', 'Nama'], ['lokasi', 'Lokasi'], ['perangkat', 'Perangkat'], ['sn', 'SN', 'SN (Qty)', 'Serial Number']],
  Pengambilan_Aktivasi: [['no', 'No'], ['tgl', 'Tanggal'], ['pa', 'PA'], ['mitra', 'Mitra'], ['bidang', 'Bidang'], ['sn', 'SN', 'SN (Qty)', 'Serial Number']],
  Pengambilan_HAR: [['no', 'No'], ['tgl', 'Tanggal'], ['pengambil', 'Yang Mengambil', 'Pengambil'], ['bidang', 'Bidang'], ['nama', 'Nama'], ['material', 'Material', 'Nama Material', 'Deskripsi'], ['sn', 'SN', 'SN (Qty)', 'Serial Number'], ['lokasi', 'Lokasi'], ['ket', 'Keterangan', 'Ket']],
  Pengambilan_Pembangunan: [['no', 'No'], ['tgl', 'Tanggal'], ['bidang', 'Bidang'], ['nama', 'Nama'], ['material', 'Material', 'Nama Material', 'Deskripsi'], ['sn', 'SN', 'SN (Qty)', 'Serial Number'], ['lokasi', 'Lokasi'], ['ket', 'Keterangan', 'Ket']],
  Master_SN: [['kode', 'Kode Material', 'Material'], ['nama', 'Deskripsi Material', 'Material Description'], ['valtype', 'Valtype', 'Batch'], ['plnt', 'Plnt'], ['sloc', 'SLoc'], ['sn', 'Serial Number', 'SN'], ['ket', 'Keterangan', 'Ket'], ['lokasi', 'Lokasi']],
};
export const SHEET_NAMES = Object.keys(SKEMA);
export const KUNCI = s => SKEMA[s].map(c => c[0]);
const nk = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const pad = n => String(n).padStart(2, '0');

/** Ubah baris-baris sheet Excel (array of array, baris pertama = judul) menjadi array objek sesuai skema. Tanggal -> YYYY-MM-DD. */
export function barisKeObjek(sheet, aoa) {
  if (!aoa.length) return [];
  const peta = new Map(); // kolom -> kunci
  aoa[0].forEach((h, i) => { for (const [k, ...al] of SKEMA[sheet]) if (al.some(a => nk(a) === nk(h)) && ![...peta.values()].includes(k)) { peta.set(i, k); break; } });
  const out = [];
  for (const r of aoa.slice(1)) {
    const o = {}; let isi = false;
    for (const k of KUNCI(sheet)) o[k] = '';
    peta.forEach((k, i) => {
      let v = r[i];
      if (v instanceof Date) v = `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
      else if (v === null || v === undefined) v = '';
      else v = String(v).replace(/\r/g, '').trim();
      if (k === 'sn' || k === 'wo' || k === 'pa' || k === 'kode') v = String(v).split('\n').map(x => x.trim()).filter(Boolean).join('\n');
      o[k] = v; if (v !== '' && k !== 'no') isi = true;
    });
    if (isi) out.push(o);
  }
  return out;
}
