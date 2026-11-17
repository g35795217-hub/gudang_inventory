// Halaman-halaman aplikasi (port dari index.php, modul.php, barang.php, laporan.php, riwayat.php, master_sn.php, import.php)
import { VALTYPE, BULAN, STOK_AWAL_TANGGAL as CUT, MOD, modSheets, KOLOM_BARANG, mkey, snList, unit, iso, num, tglNorm, tglTampil, pad, hariIni, akhirBulan, hariDalamBulan,
  stokBaris, stokNama, stokTotalPada, riwayat, dupMap, agregatHarian, jumlahRentang, daftarTahun, pgDaftar, pgData, cmpText } from './logic.js';
import { SKEMA, KUNCI, barisKeObjek } from './schema.js';
import { $, $$, h, nf, nl2br, DB, DB_VER, ctx, mutate, patchRows, muatUlang, flash, bd, fmTgl, fmBadge, fmStok, ikonAksi, mountTable, bukaForm, tampilDetail, cetakHalaman, muatXlsx } from './core.js';
import * as Core from './core.js';

const charts = []; export const hapusGrafik = () => { while (charts.length) charts.pop().destroy(); };
const memo = (fn) => { let v = -1, r; return () => { if (v !== Core.DB_VER) { r = fn(); v = Core.DB_VER; } return r; }; };
const stokMemo = memo(() => stokBaris(ctx()));
const riwayatMemo = memo(() => riwayat(DB));

// ---------- bagian bersama: tambah / ubah / hapus ----------
function fieldsModul(m, tambah) {
  const f = [];
  for (const c of m.kolom) {
    if (c === 'no') continue;
    const lab = m.lab[c], req = m.wajib.includes(c);
    if (c === 'tgl') f.push({ nama: 'tgl', label: lab, tipe: 'date', wajib: true, nilai: hariIni() });
    else if (c === 'valtype') f.push({ nama: 'valtype', label: lab, tipe: 'select', opsi: VALTYPE, wajib: req });
    else if (c === 'sn') {
      f.push({ nama: 'sn', label: m.qty ? 'SN' : 'SN / Serial Number', tipe: 'text', ph: m.qty && tambah ? 'Beberapa SN: pisahkan dengan koma' : '' });
      if (tambah && m.qty) f.push({ nama: 'jumlah', label: 'Jumlah (isi bila tanpa SN)', tipe: 'number', nilai: 1 });
    } else f.push({ nama: c, label: lab, tipe: 'text', wajib: req, ph: c === m.mat && m.arah !== 0 ? 'Ketik deskripsi' : '' });
  }
  return f;
}
const valtypeMap = () => {
  const MV = {}; for (const x of [...DB.Barang_Masuk].reverse()) if (x.valtype && mkey(x.nama)) MV[mkey(x.nama)] = x.valtype;
  for (const x of DB.Data_Barang) if (x.valtype && mkey(x.nama)) MV[mkey(x.nama)] = x.valtype; return MV;
};
export function formTambahModul(m, selesai) {
  const MV = m.key === 'masuk' ? valtypeMap() : null;
  bukaForm({
    judul: 'Tambah ' + m.judul, fields: fieldsModul(m, true),
    setup(f) { if (MV) { const nm = f.elements.nama, vt = f.elements.valtype, cek = () => { const v = MV[mkey(nm.value)]; if (v) { if (![...vt.options].some(o => o.value === v)) vt.add(new Option(v, v)); vt.value = v; } }; nm.addEventListener('input', cek); nm.addEventListener('change', cek); } },
    async onSubmit(d) {
      const sns = snList(d.sn), qty = sns.length || Math.max(1, parseInt(d.jumlah, 10) || 1), nm = (d[m.mat] || '').trim();
      if (qty > 500) throw new Error('Jumlah maksimal 500 unit per input. Pisahkan menjadi beberapa input.');
      if (m.key === 'masuk' && !d.valtype && nm) d.valtype = valtypeMap()[mkey(nm)] || '';
      let warn = '';
      if (m.arah === -1 && nm && tglNorm(d.tgl) > CUT) {
        const st = stokNama(ctx(), nm);
        if (st === null) warn = `Material "${nm}" belum terdaftar di Data Material, stoknya tidak dapat diperiksa.`;
        else if (st < qty) throw new Error(`Stok ${nm} tidak cukup. Tersedia ${st}, diminta ${qty}.`);
      }
      const r = await mutate({ aksi: 'add', sheet: m.sheet, data: d });
      patchRows(m.sheet, { tambah: r.rows });
      flash((r.count > 1 ? r.count + ' unit berhasil ditambahkan.' : 'Data berhasil ditambahkan.') + (warn ? ' Catatan: ' + warn : '')); selesai && selesai();
    },
  });
}
export function formUbahModul(m, row, selesai) {
  bukaForm({ judul: 'Ubah ' + m.judul, fields: fieldsModul(m, false), vals: row, async onSubmit(d) {
    const r = await mutate({ aksi: 'save', sheet: m.sheet, data: d, _r: row._r, _s: row._s }); patchRows(m.sheet, { ubah: r.row }); flash('Perubahan berhasil disimpan.'); selesai && selesai();
  } });
}
async function hapusBaris(sheet, row, label, selesai) {
  if (!confirm(`Hapus ${label.trim()}? Baris juga dihapus dari database.`)) return;
  await mutate({ aksi: 'del', sheet, _r: row._r, _s: row._s }); patchRows(sheet, { hapus: row._r }); flash('Data berhasil dihapus.'); selesai && selesai();
}
async function kosongSn(m, row, selesai) {
  if (!confirm(`Kosongkan SN pada ${((row[m.mat] || '') + ' ' + (row.sn || '')).trim()}? Baris tetap ada sebagai unit tanpa SN.`)) return;
  const r = await mutate({ aksi: 'kosongsn', sheet: m.sheet, _r: row._r, _s: row._s }); patchRows(m.sheet, { ubah: r.row }); flash('SN dikosongkan. Baris tetap tercatat sebagai unit tanpa SN.'); selesai && selesai();
}
function cetakBukti(m, x) {
  let t = `<h3>Bukti ${h(m.judul)}</h3><table>` + Object.entries(m.kol).map(([k, l]) => `<tr><th style="width:30%">${h(l)}</th><td>${(nl2br(k === 'tgl' ? tglTampil(x[k]) : x[k] ?? '')) || '-'}</td></tr>`).join('') + '</table>';
  const pihak = m.arah === 1 ? 'Penyerah' : 'Yang Mengambil', nama = x.pengambil || x.nama || '';
  t += `<div class="sg"><div>${pihak}<br><br><br><br>(${nama ? h(nama) : '................'})</div><div>Petugas Gudang<br><br><br><br>(................)</div></div>`;
  cetakHalaman(t);
}
const detailModul = m => r => { const o = {}; for (const [c, l] of Object.entries(m.kol)) o[l] = c === 'tgl' ? tglTampil(r[c]) : r[c] ?? ''; return o; };

// ---------- halaman transaksi generik ----------
export function halamanModul(el, key) {
  const m = MOD[key], grup = m.arah === -1 ? modSheets(-1) : key === 'masuk' ? ['Barang_Masuk'] : [];
  el.innerHTML = '<div id="host"></div>'; let T;
  const dup = () => (grup.length && m.kolom.includes('sn') ? dupMap(DB, grup) : null);
  let dupM = dup(); const ulang = () => { dupM = dup(); T.segarkan(); };
  const lbl = r => ((r[m.mat] || '') + ' ' + (r.sn || ''));
  T = mountTable($('#host', el), {
    id: key, judul: m.judul, cols: m.kol, rows: () => DB[m.sheet], filter: m.filter, tanggal: true, balik: true,
    fmt: { tgl: fmTgl, sn: (v) => { const t = nl2br(v); return dupM && snList(v).some(x => (dupM.get(x.toUpperCase()) || 0) > 1) ? `<span class="dup" title="SN tercatat lebih dari satu kali">${t}</span>` : t; } },
    detail: detailModul(m), tambah: { label: 'Tambah ' + m.judul, onClick: () => formTambahModul(m, ulang) },
    aksi: r => ikonAksi.det + ikonAksi.edit + ikonAksi.cetak + (m.qty && (r.sn || '').trim() ? ikonAksi.ksn : '') + ikonAksi.del,
    onAksi: { edit: r => formUbahModul(m, r, ulang), cetak: r => cetakBukti(m, r), ksn: r => kosongSn(m, r, ulang), del: r => hapusBaris(m.sheet, r, lbl(r), ulang) },
  });
}

// ---------- Data Material ----------
export function halamanBarang(el) {
  el.innerHTML = '<div id="host"></div>';
  const f = [{ nama: 'nama', label: 'Nama Material', wajib: true }, { nama: 'valtype', label: 'Valtype', tipe: 'select', opsi: VALTYPE, wajib: true }, { nama: 'satuan', label: 'Satuan', nilai: 'Unit' },
    { nama: 'awal', label: 'Stok Awal (saldo per ' + tglTampil(CUT) + ')', tipe: 'number0', nilai: 0 }, { nama: 'min', label: 'Stok Minimum', tipe: 'number0', nilai: 0 }, { nama: 'ket', label: 'Keterangan', tipe: 'textarea' }];
  let T; const ulang = () => T.segarkan();
  const tambah = (vals = {}) => bukaForm({ judul: 'Tambah Material', fields: f, vals, async onSubmit(d) { const r = await mutate({ aksi: 'add', sheet: 'Data_Barang', data: d }); patchRows('Data_Barang', { tambah: r.rows }); flash('Data berhasil ditambahkan.'); ulang(); } });
  T = mountTable($('#host', el), {
    id: 'barang', judul: 'Data Material', cols: KOLOM_BARANG, rows: stokMemo, nomor: true, filter: { valtype: 'Semua valtype', status: 'Semua status' },
    fmt: { stok: fmStok, status: fmBadge }, tambah: { label: 'Tambah Material', onClick: () => tambah() },
    detail: r => {
      const k = mkey(r.nama) + '|' + mkey(r.valtype), l = ctx().mv.filter(m => m[1] === k).sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)).slice(0, 8);
      const t = l.map(m => `${tglTampil(m[0])}  ${m[3]}  ${m[2] > 0 ? '+' : ''}${m[2]}${m[4] ? '  SN ' + String(m[4]).replace(/\n/g, ', ') : ''}`);
      return { 'Nama Material': r.nama, Valtype: r.valtype, Satuan: r.satuan, ['Stok Awal (per ' + tglTampil(CUT) + ')']: r.awal, 'Masuk (sesudah stok awal)': r.masuk, 'Keluar / pengambilan (sesudah stok awal)': r.keluar, 'Stok Akhir': r.stok, 'Stok Minimum': r.min, Status: r.status, Keterangan: r.ket, 'Pergerakan terbaru': t.length ? t.join('\n') : 'Belum ada pergerakan sesudah stok awal' };
    },
    aksi: r => (r.master ? ikonAksi.det + ikonAksi.edit + ikonAksi.del : ikonAksi.det + Core.ib('daftar', 'plus-circle', 'Daftarkan ke Data Material')),
    onAksi: {
      daftar: r => tambah({ nama: r.nama, valtype: r.valtype, satuan: 'Unit', awal: 0, min: 0 }),
      edit: r => bukaForm({ judul: 'Ubah Data Material', fields: f, vals: r, async onSubmit(d) { const x = await mutate({ aksi: 'save', sheet: 'Data_Barang', data: d, _r: r._r, _s: r._s }); patchRows('Data_Barang', { ubah: x.row }); flash('Perubahan berhasil disimpan.'); ulang(); } }),
      del: r => hapusBaris('Data_Barang', r, r.nama + ' ' + r.valtype, ulang),
    },
  });
}

// ---------- Master SN ----------
export function halamanMasterSN(el) {
  el.innerHTML = '<p class="ring" style="margin:0 0 12px">Daftar serial number dari SAP (sheet Sheet1-3 pada Excel). Hanya untuk dilihat dan dicari; diperbarui lewat menu Import Excel.</p><div id="host"></div>';
  mountTable($('#host', el), { id: 'msn', judul: 'Master SN (daftar serial SAP)', per: 20, cols: { kode: 'Kode Material', nama: 'Deskripsi Material', valtype: 'Valtype', plnt: 'Plnt', sloc: 'SLoc', sn: 'Serial Number', ket: 'Keterangan', lokasi: 'Lokasi' },
    rows: () => DB.Master_SN, filter: { valtype: 'Semua valtype', ket: 'Semua keterangan' }, aksi: () => ikonAksi.det,
    detail: r => ({ 'Kode Material': r.kode, Deskripsi: r.nama, 'Valtype / Batch': r.valtype, Plnt: r.plnt, SLoc: r.sloc, 'Serial Number': r.sn, Keterangan: r.ket, Lokasi: r.lokasi }) });
}

// ---------- Riwayat ----------
export function halamanRiwayat(el) {
  el.innerHTML = '<div id="host"></div>'; let T;
  T = mountTable($('#host', el), {
    id: 'riwayat', judul: 'Riwayat Transaksi', per: 20, terbaru: true, tanggal: true, rows: riwayatMemo,
    cols: { tgl: 'Tanggal', jenis: 'Jenis', material: 'Material', valtype: 'Valtype', sn: 'SN', oleh: 'Pihak Terkait', ket: 'Keterangan' },
    filter: { jenis: 'Semua jenis', valtype: 'Semua valtype' }, fmt: { tgl: fmTgl, jenis: fmBadge, sn: v => nl2br(v) },
    detail: r => { const m = MOD[r._m], o = { 'Jenis transaksi': m.judul }; for (const [c, l] of Object.entries(m.kol)) o[l] = c === 'tgl' ? tglTampil(r._row[c]) : r._row[c] ?? ''; return o; },
    aksi: () => ikonAksi.det + ikonAksi.edit + ikonAksi.del,
    onAksi: { edit: r => formUbahModul(MOD[r._m], r._row, () => T.segarkan()), del: r => hapusBaris(MOD[r._m].sheet, r._row, MOD[r._m].judul + ' ' + r.material + ' ' + r.sn, () => T.segarkan()) },
  });
}

// ---------- Laporan ----------
const LAP = { jenis: 'stok', dari: '', sampai: '', mat: '', vt: '' };
export function laporanStok(C, dari, sampai, mat, vt, cut = CUT) {
  const A = new Map(), Z = new Map(), awal = stokBaris(C, (d => { const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) - 1)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; })(dari), true, cut);
  for (const r of awal) A.set(mkey(r.nama) + '|' + mkey(r.valtype), r);
  for (const r of stokBaris(C, sampai, true, cut)) Z.set(mkey(r.nama) + '|' + mkey(r.valtype), r);
  const mi = {}, ko = {};
  for (const x of C.mv) if (x[0] >= dari && x[0] <= sampai) { if (x[2] > 0) mi[x[1]] = (mi[x[1]] || 0) + x[2]; else ko[x[1]] = (ko[x[1]] || 0) - x[2]; }
  const rows = [];
  for (const [k, r] of C.rows) {
    const masuk = mi[k] || 0, keluar = ko[k] || 0;
    if (!r.master && masuk + keluar === 0) continue;
    if (mat && !r.nama.toLowerCase().includes(mat.toLowerCase())) continue; if (vt && r.valtype !== vt) continue;
    rows.push({ nama: r.nama, valtype: r.valtype, satuan: r.satuan, awal: r.master ? A.get(k).stok : '', masuk, keluar, stok: r.master ? Z.get(k).stok : '', status: r.master ? Z.get(k).status : 'Belum terdaftar' });
  }
  rows.sort((a, b) => cmpText(a.nama, b.nama)); return rows;
}
export function halamanLaporan(el) {
  const J = { stok: 'Laporan Stok (stok awal, masuk, keluar, stok akhir)' }; for (const [k, m] of Object.entries(MOD)) J[k] = 'Laporan ' + m.judul;
  if (!LAP.dari) { LAP.dari = hariIni().slice(0, 8) + '01'; LAP.sampai = hariIni(); }
  const gambar = () => {
    el.innerHTML = `<form class="card" id="lf" style="margin-bottom:16px"><div class="ch"><h3>Filter laporan</h3><div class="tools">
      <select name="jenis">${Object.entries(J).map(([k, l]) => `<option value="${k}"${k === LAP.jenis ? ' selected' : ''}>${h(l)}</option>`).join('')}</select>
      ${LAP.jenis === 'stok' ? `<label class="inl">Dari <input type="date" name="dari" value="${h(LAP.dari)}"></label><label class="inl">Sampai <input type="date" name="sampai" value="${h(LAP.sampai)}"></label>` : ''}
      <input name="material" autocomplete="off" placeholder="Cari material" value="${h(LAP.mat)}" style="width:170px">
      <select name="valtype"><option value="">Semua valtype</option>${VALTYPE.map(v => `<option${v === LAP.vt ? ' selected' : ''}>${h(v)}</option>`).join('')}</select>
      <button class="btn y"><i class="bi bi-funnel"></i> Terapkan</button></div></div></form><div id="host"></div><p class="ring" id="lcat"></p>`;
    const f = $('#lf', el);
    const fe = f.elements;
    f.onsubmit = e => { e.preventDefault(); LAP.jenis = fe.jenis.value; LAP.mat = fe.material.value.trim(); LAP.vt = fe.valtype.value; if (fe.dari) { LAP.dari = fe.dari.value || LAP.dari; LAP.sampai = fe.sampai.value || LAP.sampai; } gambar(); };
    fe.jenis.onchange = () => f.requestSubmit();
    if (LAP.jenis === 'stok') {
      const rows = laporanStok(ctx(), LAP.dari, LAP.sampai, LAP.mat, LAP.vt);
      mountTable($('#host', el), { id: 'lap-stok', judul: `Laporan Stok ${tglTampil(LAP.dari)} - ${tglTampil(LAP.sampai)}`, per: 20, nomor: true, rows: () => rows, cols: { nama: 'Nama Material', valtype: 'Valtype', satuan: 'Satuan', awal: 'Stok Awal', masuk: 'Masuk', keluar: 'Keluar', stok: 'Stok Akhir', status: 'Status' }, fmt: { status: fmBadge, stok: fmStok } });
      $('#lcat', el).textContent = 'Stok awal Data Material per ' + tglTampil(CUT) + ' (Kartu gantung). Material yang belum terdaftar di Data Material hanya menampilkan pergerakan.';
    } else {
      const m = MOD[LAP.jenis];
      const rows = DB[m.sheet].filter(x => !(LAP.mat && !String(x[m.mat] ?? '').toLowerCase().includes(LAP.mat.toLowerCase())) && !(LAP.vt && (x.valtype ?? '') !== LAP.vt));
      mountTable($('#host', el), { id: 'lap-' + m.key, judul: J[m.key], per: 20, tanggal: true, balik: true, rows: () => rows, cols: m.kol, filter: m.filter, fmt: { tgl: fmTgl, sn: v => nl2br(v) } });
      $('#lcat', el).innerHTML = `Total unit pada laporan ini: <b>${nf(rows.reduce((s, x) => s + unit(x.sn), 0))}</b> (${nf(rows.length)} baris sesuai pencarian)`;
    }
  };
  gambar();
}

// ---------- Dashboard ----------
const DS = { per: 'bulanan', bln: new Date().getMonth() + 1, thn: new Date().getFullYear(), pgPer: 'bulanan', pgMat: 'semua', pgA: '', pgB: '' };
export function halamanDashboard(el) {
  const C = ctx(), D = C.D, Ot = [].concat(...['Pengambilan_Ggn', 'Pengambilan_ICRM', 'Pengambilan_Aktivasi', 'Pengambilan_HAR', 'Pengambilan_Pembangunan'].map(s => DB[s]));
  const In = D.Barang_Masuk, Out = D.Barang_Keluar, Rt = D.Pengambilan_Ritel;
  const tahunList = daftarTahun([In, Out, Rt, Ot]); if (!tahunList.includes(DS.thn)) DS.thn = new Date().getFullYear();
  const { per, bln, thn } = DS; let a, b, label;
  if (per === 'harian') { a = `${thn}-${pad(bln)}-01`; b = akhirBulan(thn, bln); label = BULAN[bln - 1] + ' ' + thn; }
  else if (per === 'bulanan') { a = `${thn}-01-01`; b = `${thn}-12-31`; label = 'Tahun ' + thn; }
  else { a = '0000-00-00'; b = '9999-12-31'; label = `Semua tahun (${Math.min(...tahunList)} - ${Math.max(...tahunList)})`; }
  const M = agregatHarian(In), K = agregatHarian(Out), R = agregatHarian(Rt), O = agregatHarian(Ot);
  const St = stokBaris(C, per === 'tahunan' ? null : b).filter(x => x.master);
  let totStok = St.reduce((s, x) => s + x.stok, 0); if (per !== 'tahunan' && b < CUT) totStok = stokTotalPada(C, b);
  const habis = St.filter(x => x.status === 'Habis'), tipis = St.filter(x => x.status === 'Menipis');
  const sum = o => Object.values(o).reduce((s, v) => s + v, 0);
  const Cd = [
    ['Total Jenis Material', St.length, 'material terdaftar', 'boxes', 'c1'], ['Total Stok Material', totStok, per !== 'tahunan' && b < CUT ? 'perkiraan akhir periode' : 'stok ' + (per === 'tahunan' ? 'saat ini' : 'akhir periode'), 'stack', 'c2'],
    ['Total Material Masuk', jumlahRentang(M, a, b), 'keseluruhan ' + nf(sum(M)), 'box-arrow-in-down', 'c3'], ['Total Material Keluar', jumlahRentang(K, a, b), 'keseluruhan ' + nf(sum(K)), 'box-arrow-up', 'c4'],
    ['Total Pengambilan Ritel', jumlahRentang(R, a, b), 'keseluruhan ' + nf(sum(R)), 'shop', 'c5'], ['Pengambilan Lainnya', jumlahRentang(O, a, b), 'ggn, ICRM, aktivasi, HAR, pembangunan', 'collection', 'c8'],
    ['Stok Menipis', tipis.length, 'di bawah stok minimum', 'exclamation-triangle', 'c6'], ['Stok Habis', habis.length, 'stok sama dengan nol', 'x-octagon', 'c7']];
  const pm = {}, py = {};
  for (const [src, z] of [[M, 'm'], [K, 'k'], [R, 'r'], [O, 'o']]) for (const k in src) { const mo = k.slice(0, 7), y = k.slice(0, 4); (pm[mo] ||= {})[z] = (pm[mo][z] || 0) + src[k]; (py[y] ||= {})[z] = (py[y][z] || 0) + src[k]; }
  const hari = hariDalamBulan(thn, bln), Hh = { l: [], m: [], k: [], r: [], o: [] }, Bb = { l: [], m: [], k: [], r: [], o: [] }, Yy = { l: [], m: [], k: [], r: [], o: [] };
  for (let d = 1; d <= hari; d++) { const k = `${thn}-${pad(bln)}-${pad(d)}`; Hh.l.push(d); Hh.m.push(M[k] || 0); Hh.k.push(K[k] || 0); Hh.r.push(R[k] || 0); Hh.o.push(O[k] || 0); }
  for (let i = 1; i <= 12; i++) { const k = `${thn}-${pad(i)}`; Bb.l.push(BULAN[i - 1].slice(0, 3)); for (const z of ['m', 'k', 'r', 'o']) Bb[z].push(pm[k]?.[z] || 0); }
  for (const y of [...tahunList].reverse()) { Yy.l.push(String(y)); for (const z of ['m', 'k', 'r', 'o']) Yy[z].push(py[y]?.[z] || 0); }
  const vt = {}; for (const x of St) { const k = x.valtype || 'Tanpa Valtype'; vt[k] = (vt[k] || 0) + Math.max(0, x.stok); }
  const mt = {}; for (const x of Rt) if (per === 'tahunan' || (iso(x.tgl) && x.tgl >= a && x.tgl <= b)) { const k = x.mitra || '-'; mt[k] = (mt[k] || 0) + unit(x.sn); }
  const mtL = Object.entries(mt).sort((x, y) => y[1] - x[1]).slice(0, 10);
  const terbaru = riwayatMemo().filter(x => per === 'tahunan' || (iso(x.tgl) && x.tgl >= a && x.tgl <= b)).slice(0, 8), perhatian = [...habis, ...tipis].slice(0, 10);
  const sel = (v, c) => (v == c ? ' selected' : '');
  if (!DS.pgA) { DS.pgA = `${new Date().getFullYear()}-01-01`; DS.pgB = hariIni(); }
  hapusGrafik();
  el.innerHTML = `<section class="hero" aria-label="PLN Icon Plus Gudang Inventory"><div class="hero-sky" aria-hidden="true"><i class="cl c1"></i><i class="cl c2"></i><i class="cl c3"></i></div>
  <div class="hero-img" aria-hidden="true"><img src="assets/gedung.jpg" alt="" loading="eager"></div><div class="hero-shine" aria-hidden="true"></div><div class="hero-px" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
  <div class="hero-tx"><div class="hero-bolt"><i class="bi bi-lightning-charge-fill"></i></div><h1>PLN Icon Plus</h1><h2>Gudang Inventory Medan</h2><p>Solusi inventori, mendukung konektivitas negeri</p><span class="hero-bar"></span></div>
  <svg class="hero-wv" viewBox="0 0 1200 60" preserveAspectRatio="none" aria-hidden="true"><path class="w1" d="M0 30 Q150 6 300 30 T600 30 T900 30 T1200 30 V60 H0Z"/><path class="w2" d="M0 38 Q150 14 300 38 T600 38 T900 38 T1200 38 V60 H0Z"/><path class="w3" d="M0 46 Q150 24 300 46 T600 46 T900 46 T1200 46 V60 H0Z"/></svg></section>
  <form class="card fbar" id="fp"><div class="fb-t"><i class="bi bi-funnel"></i> Periode data: <b>${h(label)}</b></div><div class="tools">
    <select name="periode" title="Periode"><option value="harian"${sel(per, 'harian')}>Harian</option><option value="bulanan"${sel(per, 'bulanan')}>Bulanan</option><option value="tahunan"${sel(per, 'tahunan')}>Tahunan</option></select>
    <select name="bulan" title="Bulan" class="${per === 'harian' ? '' : 'mute'}">${BULAN.map((n, i) => `<option value="${i + 1}"${sel(bln, i + 1)}>${n}</option>`).join('')}</select>
    <select name="tahun" title="Tahun" class="${per === 'tahunan' ? 'mute' : ''}">${tahunList.map(y => `<option${sel(thn, y)}>${y}</option>`).join('')}</select></div></form>
  <div class="cards">${Cd.map(c => `<div class="sc ${c[4]}"><div><small>${h(c[0])}</small><b class="cnt" data-v="${Math.round(c[1])}">${nf(Math.round(c[1]))}</b><span>${h(c[2])}</span></div><div class="sc-i"><i class="bi bi-${c[3]}"></i></div></div>`).join('')}</div>
  <div class="g2"><div class="card"><h3 class="ct">Aktivitas Harian</h3><div class="cv"><canvas id="c1"></canvas></div></div><div class="card"><h3 class="ct">Grafik Bulanan</h3><div class="cv"><canvas id="c2"></canvas></div></div></div>
  <div class="g2"><div class="card"><h3 class="ct">Perbandingan Tahunan</h3><div class="cv"><canvas id="c3"></canvas></div></div><div class="card"><h3 class="ct">Stok Berdasarkan Valtype</h3><div class="cv"><canvas id="c5"></canvas></div>${Object.keys(vt).length ? '' : '<p class="em">Belum ada data.</p>'}</div></div>
  <div class="card pgx" id="pg"><div class="pg-h"><h3 class="ct"><i class="bi bi-graph-up-arrow"></i> Pergerakan Stok</h3><div class="seg" id="pg-per">${['harian', 'mingguan', 'bulanan', 'tahunan'].map(p => `<button type="button" data-p="${p}"${DS.pgPer === p ? ' class="on"' : ''}>${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div></div>
    <div class="pg-f"><label class="pg-fm">Material <select id="pg-m"><option value="semua">Semua Material</option>${pgDaftar().map(n => `<option${DS.pgMat === n ? ' selected' : ''}>${h(n)}</option>`).join('')}</select></label>
    <label>Dari <input type="date" id="pg-a" value="${DS.pgA}"></label><label>Sampai <input type="date" id="pg-b" value="${DS.pgB}"></label></div>
    <div class="cv"><canvas id="c4"></canvas></div><p class="em" id="pg-e" hidden>Tidak ada data pada rentang ini.</p></div>
  <div class="g2"><div class="card"><h3 class="ct">Pengambilan Ritel per Mitra</h3><div class="cv"><canvas id="c6"></canvas></div>${mtL.length ? '' : '<p class="em">Tidak ada pengambilan ritel pada periode ini.</p>'}</div>
    <div class="card" id="peringatan"><h3 class="ct">Peringatan Stok</h3>${perhatian.map(x => { const w = x.min > 0 ? Math.min(100, Math.max(3, Math.round(x.stok / x.min * 100))) : 3, hb = x.status === 'Habis'; return `<div class="bar"><div><span><i class="bi bi-exclamation-triangle-fill" style="color:${hb ? '#FF0000' : '#e0a100'}"></i> ${h(x.nama)} <small>${h(x.valtype)}</small></span><b>${h(x.stok)} / ${h(x.min)}</b></div><i><u style="width:${w}%;background:${hb ? '#FF0000' : '#f5b800'}"></u></i></div>`; }).join('') || '<p class="em">Semua stok aman.</p>'}</div></div>
  <div class="card"><h3 class="ct">Aktivitas Transaksi Terbaru</h3><div class="tw"><table class="mini"><thead><tr><th>Tanggal</th><th>Jenis</th><th>Material</th><th>SN</th><th>Pihak</th></tr></thead><tbody>
    ${terbaru.map(x => `<tr><td>${h(tglTampil(x.tgl))}</td><td>${bd(x.jenis)}</td><td>${h(x.material)}</td><td>${h(String(x.sn).split('\n')[0])}</td><td>${h(x.oleh)}</td></tr>`).join('') || '<tr><td colspan="5" class="em">Tidak ada transaksi pada periode ini.</td></tr>'}</tbody></table></div><p class="ring"><a href="#/riwayat">Lihat seluruh riwayat</a></p></div>`;

  // filter periode
  const fp = $('#fp', el).elements; $('#fp', el).onchange = () => { DS.per = fp.periode.value; DS.bln = +fp.bulan.value; DS.thn = +fp.tahun.value; halamanDashboard(el); };
  // animasi angka
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) $$('.cnt', el).forEach(e => { const v = +e.dataset.v || 0, t0 = performance.now(); (function f(t) { const k = Math.min(1, (t - t0) / 450); e.textContent = nf(Math.round(v * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(f); })(t0); });
  // grafik
  if (!window.Chart) { $$('.cv', el).forEach(c => c.insertAdjacentHTML('afterend', '<p class="em">Pustaka grafik belum termuat.</p>')); return; }
  const Ch = window.Chart, DK = '#035B71', TL = '#00A2B9', YL = '#f2d600', RD = '#FF0000', GR = '#9aa7ad';
  Ch.defaults.font.family = 'Poppins, system-ui, sans-serif'; Ch.defaults.maintainAspectRatio = false; Ch.defaults.animation.duration = 300;
  const ints = { beginAtZero: true, ticks: { precision: 0, callback: v => nf(v) } };
  const mk = (id, cfg) => { const c = new Ch($('#' + id, el), cfg); charts.push(c); return c; };
  const grup = (id, S) => mk(id, { type: 'bar', data: { labels: S.l, datasets: [{ label: 'Masuk', data: S.m, backgroundColor: DK, borderRadius: 3 }, { label: 'Keluar', data: S.k, backgroundColor: TL, borderRadius: 3 }, { label: 'Ritel', data: S.r, backgroundColor: YL, borderRadius: 3 }, { label: 'Lainnya', data: S.o, backgroundColor: GR, borderRadius: 3 }] }, options: { scales: { y: ints, x: { grid: { display: false } } }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } } });
  grup('c1', Hh); grup('c2', Bb); grup('c3', Yy);
  const nice = arr => { let m = Math.max(0, ...arr); if (m <= 0) return 4; m *= 1.1; const e = Math.pow(10, Math.floor(Math.log10(m))), f = m / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; };
  let pg = null;
  const pgMuat = () => {
    let dari = $('#pg-a', el).value || DS.pgA, sampai = $('#pg-b', el).value || DS.pgB; if (dari > sampai) [dari, sampai] = [sampai, dari];
    DS.pgA = dari; DS.pgB = sampai; DS.pgMat = $('#pg-m', el).value;
    const j = pgData(C, DS.pgMat === 'semua' ? null : DS.pgMat, DS.pgPer, dari, sampai); $('#pg-e', el).hidden = j.l.length > 0;
    const pr = j.l.length > 20 ? 0 : 3;
    if (pg) { pg.destroy(); charts.splice(charts.indexOf(pg), 1); }
    pg = mk('c4', { type: 'line', data: { labels: j.l, datasets: [
      { label: 'Stok Total', data: j.stok, yAxisID: 'y', borderColor: DK, backgroundColor: 'rgba(0,162,185,.16)', fill: true, tension: .3, borderWidth: 3, pointRadius: pr, pointBackgroundColor: '#fff', pointBorderColor: DK },
      { label: 'Masuk', data: j.masuk, yAxisID: 'y2', borderColor: TL, tension: .3, borderWidth: 2, pointRadius: pr }, { label: 'Keluar', data: j.keluar, yAxisID: 'y2', borderColor: '#f08c00', tension: .3, borderWidth: 2, pointRadius: pr }] },
      options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, min: 0, max: nice(j.stok), ticks: { precision: 0, callback: v => nf(v) }, grid: { color: 'rgba(3,91,113,.08)' }, title: { display: true, text: 'Stok' } }, y2: { position: 'right', beginAtZero: true, min: 0, max: nice(j.masuk.concat(j.keluar)), ticks: { precision: 0, callback: v => nf(v) }, grid: { display: false }, title: { display: true, text: 'Masuk / Keluar' } }, x: { grid: { display: false } } }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + nf(c.parsed.y) + ' unit' } } } } });
  };
  const pgAtur = { harian: 30, mingguan: 84, bulanan: 365, tahunan: 365 * 5 };
  $$('#pg-per button', el).forEach(btn => btn.onclick = () => {
    $$('#pg-per button', el).forEach(x => x.classList.toggle('on', x === btn)); DS.pgPer = btn.dataset.p;
    const e = new Date($('#pg-b', el).value || Date.now()); let s = new Date(e - pgAtur[DS.pgPer] * 864e5);
    if (DS.pgPer === 'bulanan') s = new Date(e.getFullYear(), 0, 1); if (DS.pgPer === 'tahunan') s = new Date(e.getFullYear() - 4, 0, 1);
    $('#pg-a', el).value = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`; pgMuat();
  });
  ['#pg-m', '#pg-a', '#pg-b'].forEach(x => $(x, el).addEventListener('change', pgMuat)); pgMuat();
  if (Object.keys(vt).length) mk('c5', { type: 'doughnut', data: { labels: Object.keys(vt), datasets: [{ data: Object.values(vt), backgroundColor: [DK, TL, YL, RD, '#7fb6c2', GR], borderWidth: 2 }] }, options: { cutout: '60%', plugins: { legend: { position: 'bottom' } } } });
  if (mtL.length) mk('c6', { type: 'bar', data: { labels: mtL.map(x => x[0]), datasets: [{ label: 'Pengambilan', data: mtL.map(x => x[1]), backgroundColor: TL, borderRadius: 3 }] }, options: { indexAxis: 'y', scales: { x: ints }, plugins: { legend: { display: false } } } });
}

// ---------- Import Excel ----------
const normFp = (sheet, r) => KUNCI(sheet).filter(k => k !== 'no').map(k => String(r[k] ?? '').trim().toUpperCase().replace(/\s+/g, ' ')).join('\x1F');
const URUT = ['Barang_Masuk', 'Pengambilan_Ritel', 'Pengambilan_Ggn', 'Pengambilan_HAR', 'Pengambilan_Pembangunan'];
export function rencanaImport(data, ada) {
  const plan = {};
  for (const [sheet, rows] of Object.entries(data)) {
    const p = { mode: 'tambah', file: rows.length, baru: 0, ubah: 0, ada: 0, ganda: 0, kirim: [] }, ex = ada[sheet] || [];
    if (sheet === 'Data_Barang') {
      p.mode = 'upsert'; const idx = new Map(ex.map(x => [mkey(x.nama) + '|' + mkey(x.valtype), x]));
      for (const r of rows) { const o = idx.get(mkey(r.nama) + '|' + mkey(r.valtype)); if (!o) { p.baru++; p.kirim.push(r); } else if (Math.trunc(num(o.awal)) !== Math.trunc(num(r.awal))) { p.ubah++; p.kirim.push(r); } else p.ada++; }
    } else if (sheet === 'Master_SN') {
      const have = new Set(ex.map(x => String(x.sn).toUpperCase())); for (const r of rows) { if (have.has(String(r.sn).toUpperCase())) p.ada++; else { p.baru++; p.kirim.push(r); } }
    } else {
      const cnt = new Map(); let max = 0; for (const x of ex) { const fp = normFp(sheet, x); cnt.set(fp, (cnt.get(fp) || 0) + 1); max = Math.max(max, parseInt(x.no, 10) || 0); }
      const seen = new Map();
      for (const r of rows) {
        const fp = normFp(sheet, r); seen.set(fp, (seen.get(fp) || 0) + 1); const ad = cnt.get(fp) || 0;
        if (String(r.sn ?? '').trim() !== '') { if (seen.get(fp) > 1) { p.ganda++; continue; } if (ad > 0) { p.ada++; continue; } }
        else if (seen.get(fp) <= ad) { p.ada++; continue; }
        p.kirim.push(r);
      }
      if (URUT.includes(sheet)) p.kirim.forEach((r, i) => { r.no = String(max + i + 1); });
      p.baru = p.kirim.length;
    }
    plan[sheet] = p;
  }
  return plan;
}
export function halamanImport(el) {
  el.innerHTML = `<div class="card"><div class="ch"><h3>Import Excel</h3></div><div style="padding:16px 18px">
    <p>Unggah file <b>inventory.xlsx</b> (10 sheet: Data_Barang, Barang_Masuk, Barang_Keluar, dst.). Langkah: <b>Periksa file</b> (pratinjau, belum menulis apa pun) lalu <b>Mulai import</b>.
    Data yang sudah ada tidak digandakan dan tidak ditimpa, kecuali Stok Awal pada Data_Barang yang diperbarui bila angkanya berubah. Mengimpor file yang sama dua kali menambah 0 baris.</p>
    <p class="mu">File mentah "List Pengambilan Material Gudang" dikonversi terlebih dahulu dengan <code>scripts/buat_inventory_xlsx.py</code> (lihat README).</p>
    <div class="tools" style="margin-top:12px"><input type="file" id="fi" accept=".xlsx,.xlsm"><button class="btn" id="cek"><i class="bi bi-search"></i> Periksa file</button><button class="btn y" id="go" disabled><i class="bi bi-cloud-arrow-up"></i> Mulai import</button></div>
    <div id="ir" style="margin-top:16px"></div></div></div>`;
  let plan = null; const ir = $('#ir', el);
  $('#cek', el).onclick = async () => {
    const f = $('#fi', el).files[0]; if (!f) { flash('Pilih file .xlsx terlebih dahulu.', 'err'); return; }
    ir.innerHTML = '<p>Membaca file...</p>'; $('#go', el).disabled = true;
    try {
      const X = await muatXlsx(), wb = X.read(await f.arrayBuffer(), { cellDates: true }), data = {};
      for (const s of Object.keys(SKEMA)) if (wb.Sheets[s]) data[s] = barisKeObjek(s, X.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: true, cellDates: true, defval: null }));
      if (!Object.keys(data).length) throw new Error('Tidak ada sheet yang dikenali (nama sheet harus seperti Data_Barang, Barang_Keluar, dst.).');
      await muatUlang(); plan = rencanaImport(data, DB);
      ir.innerHTML = `<div class="tw"><table class="mini"><thead><tr><th>Sheet</th><th>Baris di file</th><th>Baru</th><th>Diperbarui</th><th>Sudah ada</th><th>SN ganda di file</th></tr></thead><tbody>${Object.entries(plan).map(([s, p]) => `<tr><td>${h(s)}</td><td>${nf(p.file)}</td><td><b>${nf(p.baru)}</b></td><td>${nf(p.ubah)}</td><td>${nf(p.ada)}</td><td>${nf(p.ganda)}</td></tr>`).join('')}</tbody></table></div>`;
      $('#go', el).disabled = !Object.values(plan).some(p => p.kirim.length);
      if ($('#go', el).disabled) ir.insertAdjacentHTML('beforeend', '<p class="ring">Tidak ada data baru untuk diimpor.</p>');
    } catch (e) { ir.innerHTML = ''; flash(e.message, 'err'); }
  };
  $('#go', el).onclick = async () => {
    if (!plan) return; $('#go', el).disabled = true; $('#cek', el).disabled = true; let baru = 0, ubah = 0;
    const total = Object.values(plan).reduce((s, p) => s + p.kirim.length, 0); let selesai = 0;
    try {
      for (const [sheet, p] of Object.entries(plan)) for (let i = 0; i < p.kirim.length; i += 800) {
        const r = await mutate({ aksi: 'import', sheet, mode: p.mode, rows: p.kirim.slice(i, i + 800) }); baru += r.baru; ubah += r.ubah; selesai += Math.min(800, p.kirim.length - i);
        ir.innerHTML = `<p>Mengimpor ${sheet}... ${nf(selesai)} / ${nf(total)}</p><progress max="${total}" value="${selesai}" style="width:100%"></progress>`;
      }
      await muatUlang(); ir.innerHTML = `<p><b>Selesai.</b> ${nf(baru)} baris baru ditambahkan, ${nf(ubah)} baris diperbarui.</p>`; flash(`Import selesai: ${nf(baru)} baris baru, ${nf(ubah)} diperbarui.`); plan = null;
    } catch (e) { flash(e.message, 'err'); await muatUlang().catch(() => {}); ir.insertAdjacentHTML('beforeend', '<p class="ring">Import terhenti. Periksa file lagi lalu ulangi: baris yang sudah masuk tidak akan digandakan.</p>'); }
    finally { $('#cek', el).disabled = false; }
  };
}
export { stokMemo };
