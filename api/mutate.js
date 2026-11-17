import { send, bodyJson, handler, store, SHEETS, Galat } from './_lib.js';
import { KUNCI } from '../public/js/schema.js';

// Aturan per sheet transaksi (selaras dengan MOD() pada versi PHP)
const KELUAR = ['Barang_Keluar', 'Pengambilan_Ritel', 'Pengambilan_Ggn', 'Pengambilan_HAR', 'Pengambilan_Pembangunan'];
const QTY = ['Barang_Masuk', ...KELUAR];           // satu SN = satu baris; tanpa SN = isi Jumlah
const BERNOMOR = ['Barang_Masuk', 'Pengambilan_Ritel', 'Pengambilan_Ggn', 'Pengambilan_HAR', 'Pengambilan_Pembangunan'];
const grupSN = s => (s === 'Barang_Masuk' ? ['Barang_Masuk'] : KELUAR.includes(s) ? KELUAR : []);
const mkey = s => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
const snList = s => String(s ?? '').split(/[\r\n,;]+/).map(x => x.trim()).filter(Boolean);
const dapat = sheet => (sheet === 'Master_SN' ? [] : KUNCI(sheet).filter(k => k !== 'no'));
const bersih = (sheet, src) => { const d = {}; for (const k of dapat(sheet)) d[k] = String(src?.[k] ?? '').replace(/\r/g, '').trim(); return d; };

export default handler(async (req, res) => {
  if (req.method !== 'POST') throw new Galat('Metode tidak didukung.', 405);
  const b = await bodyJson(req), aksi = String(b.aksi || ''), sheet = String(b.sheet || '');
  if (!SHEETS.includes(sheet)) throw new Galat('Sheet tidak dikenal.');
  const db = await store();
  const ver = b._s === undefined || b._s === '' || b._s === null ? null : Number(b._s);
  const rid = Number(b._r) || 0;

  if (aksi === 'del') {
    if (!(await db.del(sheet, rid, ver))) throw new Galat('Data tidak ditemukan atau sudah berubah. Muat ulang halaman.', 409);
    return send(res, 200, { ok: true });
  }

  if (aksi === 'import') {   // dipanggil bertahap oleh halaman Import Excel (maks 2000 baris per panggilan)
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (rows.length > 2000) throw new Galat('Terlalu banyak baris dalam satu panggilan.');
    const kunci = KUNCI(sheet); let baru = 0, ubah = 0; const tambah = [];
    let ada = null;
    if (b.mode === 'upsert' && sheet === 'Data_Barang') { ada = new Map(); let after = 0; for (;;) { const p = await db.list(sheet, after, 5000); p.forEach(x => ada.set(mkey(x.nama) + '|' + mkey(x.valtype), x)); if (p.length < 5000) break; after = p[p.length - 1]._r; } }
    for (const r of rows) {
      const o = {}; for (const k of kunci) o[k] = String(r?.[k] ?? '');
      if (ada) {
        const old = ada.get(mkey(o.nama) + '|' + mkey(o.valtype));
        if (old) { const { _r, _s, ...p } = old; p.awal = o.awal !== '' ? o.awal : p.awal; if (!p.ket && o.ket) p.ket = o.ket; await db.update(sheet, _r, null, p); ubah++; continue; }
      }
      tambah.push(o);
    }
    if (tambah.length) { await db.insertMany(sheet, tambah); baru = tambah.length; }
    return send(res, 200, { ok: true, baru, ubah });
  }

  if (aksi === 'kosongsn') {
    const old = await db.get(sheet, rid);
    if (!old || (ver !== null && String(ver) !== old._s)) throw new Galat('Data sudah berubah. Muat ulang halaman lalu coba lagi.', 409);
    const { _r, _s, ...p } = old; if (!QTY.includes(sheet)) throw new Galat('Aksi tidak berlaku untuk menu ini.');
    if (!p.tgl) throw new Galat('Baris ini belum punya tanggal. Isi tanggal lewat tombol Ubah terlebih dahulu.');
    p.sn = ''; await db.update(sheet, rid, null, p);
    return send(res, 200, { ok: true, row: await db.get(sheet, rid) });
  }

  if (aksi !== 'add' && aksi !== 'save') throw new Galat('Aksi tidak dikenal.');
  if (!dapat(sheet).length) throw new Galat('Sheet ini tidak dapat diubah dari web. Gunakan menu Import Excel.');
  const d = bersih(sheet, b.data);
  if ('tgl' in d && !/^\d{4}-\d{2}-\d{2}$/.test(d.tgl)) throw new Galat('Tanggal tidak valid.');

  if (sheet === 'Data_Barang') {
    if (!d.nama) throw new Galat('Nama Material wajib diisi.');
    for (const k of ['awal', 'min']) { const v = Number(d[k] || 0); if (!Number.isFinite(v) || v < 0) throw new Galat('Stok harus berupa angka 0 atau lebih.'); d[k] = String(Math.trunc(v)); }
    if (!d.satuan) d.satuan = 'Unit';
    let after = 0;
    for (;;) { const p = await db.list(sheet, after, 5000); for (const o of p) if (mkey(o.nama) === mkey(d.nama) && mkey(o.valtype) === mkey(d.valtype) && (aksi !== 'save' || o._r !== rid)) throw new Galat('Material dengan Valtype tersebut sudah ada.'); if (p.length < 5000) break; after = p[p.length - 1]._r; }
  }

  if (aksi === 'save') {
    const old = await db.get(sheet, rid);
    if (!old || (ver !== null && String(ver) !== old._s)) throw new Galat('Data sudah berubah atau dihapus. Muat ulang halaman lalu coba lagi.', 409);
    if ('no' in old) d.no = old.no;
    if (QTY.includes(sheet) && d.sn && snList(d.sn).length === 1 && d.sn.toUpperCase() !== String(old.sn || '').trim().toUpperCase()) {
      const g = grupSN(sheet), dup = g.length ? await db.snAda(g, d.sn, rid) : null;
      if (dup) throw new Galat(`SN "${d.sn}" sudah tercatat di ${dup.replace('_', ' ')} (duplikat).`);
    }
    if (!(await db.update(sheet, rid, null, d))) throw new Galat('Data tidak ditemukan.', 409);
    return send(res, 200, { ok: true, count: 1, row: await db.get(sheet, rid) });
  }

  // ---- tambah ----
  const sns = QTY.includes(sheet) ? snList(d.sn) : [];
  let qty = 1, daftar = [d];
  if (QTY.includes(sheet)) {
    if (sns.length) { daftar = sns.map(s => ({ ...d, sn: s })); qty = sns.length; }
    else { qty = Math.max(1, Math.min(500, parseInt(b.data?.jumlah, 10) || 1)); daftar = Array.from({ length: qty }, () => ({ ...d, sn: '' })); }
    if (sns.length > 500) throw new Galat('Jumlah maksimal 500 unit per input.');
  }
  const g = grupSN(sheet);
  if (g.length) {
    const lihat = new Set();
    for (const s of sns) { const u = s.toUpperCase(); if (lihat.has(u)) throw new Galat(`SN "${s}" diisi dua kali.`); lihat.add(u); const dup = await db.snAda(g, s, null); if (dup) throw new Galat(`SN "${s}" sudah tercatat di ${dup.replace('_', ' ')} (duplikat).`); }
  }
  if (BERNOMOR.includes(sheet)) { let n = await db.maxNo(sheet); for (const r of daftar) r.no = String(++n); }
  const ids = await db.insertMany(sheet, daftar);
  send(res, 200, { ok: true, count: qty, rows: daftar.map((r, i) => ({ ...r, _r: ids[i], _s: '1' })) });
});
