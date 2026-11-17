// Logika bisnis (port dari fungsi.php + pergerakan_lib.php). Murni, tanpa DOM: dipakai browser dan tes Node.
export const VALTYPE = ['EX-PROJECT', 'DISMANTLE', 'RUSAK-L', 'RUSAK-TL', 'BAIK'];
export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
// Tanggal snapshot Kartu Gantung (SAP). Transaksi <= tanggal ini hanya riwayat; sesudahnya mengubah stok.
export const STOK_AWAL_TANGGAL = '2026-11-03';
export const SHEETS = ['Data_Barang', 'Barang_Masuk', 'Barang_Keluar', 'Pengambilan_Ritel', 'Pengambilan_Ggn', 'Pengambilan_ICRM', 'Pengambilan_Aktivasi', 'Pengambilan_HAR', 'Pengambilan_Pembangunan', 'Master_SN'];

// ---------- umum ----------
export const mkey = s => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
export const snList = s => String(s ?? '').split(/[\r\n,;]+/).map(x => x.trim()).filter(x => x.length);
export const unit = s => Math.max(1, snList(s).length);
export const iso = t => /^\d{4}-\d{2}-\d{2}$/.test(String(t ?? ''));
export const num = x => { const v = Number(x); return x !== '' && x !== null && x !== undefined && Number.isFinite(v) ? v : 0; };
export const pad = (n, l = 2) => String(n).padStart(l, '0');
export const tglTampil = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v ?? ''); };
export function tglNorm(s) {
  s = String(s ?? '').trim();
  if (s === '' || iso(s)) return s;
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3], d = a > 12 ? a : b, mo = a > 12 ? b : a;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) return `${y}-${pad(mo)}-${pad(d)}`;
  }
  const t = Date.parse(s);
  if (!isNaN(t)) { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  return s;
}
// tanggal (UTC) helper
export const dt = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const fmt = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDays = (s, n) => { const d = dt(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
export const akhirBulan = (y, m) => fmt(new Date(Date.UTC(y, m, 0)));       // m = 1..12
export const hariDalamBulan = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const hariIni = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const cmp = (a, b) => { a = String(a).toLowerCase(); b = String(b).toLowerCase(); return a < b ? -1 : a > b ? 1 : 0; };
export const cmpText = cmp;

// ---------- registri modul transaksi ----------
const L = { no: 'No', tgl: 'Tanggal', nama: 'Nama', material: 'Material', sn: 'SN', ket: 'Keterangan', mitra: 'Mitra', bidang: 'Bidang', lokasi: 'Lokasi', pengambil: 'Yang Mengambil', valtype: 'Valtype', divisi: 'Divisi', wo: 'WO', pa: 'PA', perangkat: 'Perangkat' };
const RAW = {
  masuk: { sheet: 'Barang_Masuk', judul: 'Material Masuk', route: 'masuk', jenis: 'Masuk', ikon: 'box-arrow-in-down', mat: 'nama', arah: 1, qty: true, kolom: ['no', 'tgl', 'nama', 'valtype', 'sn', 'ket', 'divisi'], label: { nama: 'Deskripsi' }, wajib: ['tgl', 'nama', 'valtype'], filter: { valtype: 'Semua valtype', divisi: 'Semua divisi' }, oleh: 'divisi' },
  keluar: { sheet: 'Barang_Keluar', judul: 'Material Keluar', route: 'keluar', jenis: 'Keluar', ikon: 'box-arrow-up', mat: 'material', arah: -1, qty: true, kolom: ['tgl', 'pengambil', 'material', 'sn', 'ket', 'mitra'], label: { material: 'Deskripsi' }, wajib: ['tgl', 'pengambil', 'material'], filter: { pengambil: 'Semua pengambil', mitra: 'Semua mitra' }, oleh: 'pengambil' },
  ritel: { sheet: 'Pengambilan_Ritel', judul: 'Pengambilan Ritel', route: 'ritel', jenis: 'Ritel', ikon: 'shop', mat: 'material', arah: -1, qty: true, kolom: ['no', 'tgl', 'mitra', 'bidang', 'nama', 'material', 'sn', 'lokasi', 'ket'], label: {}, wajib: ['tgl', 'mitra', 'material'], filter: { mitra: 'Semua mitra', bidang: 'Semua bidang' }, oleh: 'mitra' },
  ggn: { sheet: 'Pengambilan_Ggn', judul: 'Pengambilan Gangguan', route: 'ggn', jenis: 'Gangguan', ikon: 'exclamation-diamond', mat: 'material', arah: -1, qty: true, kolom: ['no', 'tgl', 'mitra', 'bidang', 'nama', 'material', 'sn', 'lokasi', 'ket'], label: {}, wajib: ['tgl', 'material'], filter: { mitra: 'Semua mitra', bidang: 'Semua bidang' }, oleh: 'mitra' },
  icrm: { sheet: 'Pengambilan_ICRM', judul: 'Pengambilan Aktivasi ICRM', route: 'icrm', jenis: 'ICRM', ikon: 'router', mat: 'perangkat', arah: 0, qty: false, kolom: ['no', 'tgl', 'wo', 'mitra', 'nama', 'lokasi', 'perangkat', 'sn'], label: {}, wajib: ['tgl', 'wo', 'perangkat'], filter: { mitra: 'Semua mitra' }, oleh: 'mitra' },
  aktivasi: { sheet: 'Pengambilan_Aktivasi', judul: 'Pengambilan Aktivasi', route: 'aktivasi', jenis: 'Aktivasi', ikon: 'lightning-charge', mat: 'pa', arah: 0, qty: false, kolom: ['no', 'tgl', 'pa', 'mitra', 'bidang', 'sn'], label: {}, wajib: ['tgl', 'pa'], filter: { mitra: 'Semua mitra', bidang: 'Semua bidang' }, oleh: 'mitra' },
  har: { sheet: 'Pengambilan_HAR', judul: 'Pengambilan HAR', route: 'har', jenis: 'HAR', ikon: 'tools', mat: 'material', arah: -1, qty: true, kolom: ['no', 'tgl', 'pengambil', 'bidang', 'nama', 'material', 'sn', 'lokasi', 'ket'], label: {}, wajib: ['tgl', 'material'], filter: { pengambil: 'Semua pengambil', bidang: 'Semua bidang' }, oleh: 'pengambil' },
  pembangunan: { sheet: 'Pengambilan_Pembangunan', judul: 'Pengambilan Pembangunan', route: 'pembangunan', jenis: 'Pembangunan', ikon: 'building', mat: 'material', arah: -1, qty: true, kolom: ['no', 'tgl', 'bidang', 'nama', 'material', 'sn', 'lokasi', 'ket'], label: {}, wajib: ['tgl', 'material'], filter: { bidang: 'Semua bidang' }, oleh: 'nama' },
};
export const MOD = {};
for (const [k, m] of Object.entries(RAW)) {
  const lab = { ...L, ...m.label }; const kol = {};
  for (const c of m.kolom) kol[c] = lab[c];
  MOD[k] = { ...m, key: k, lab, kol };
}
export const modSheets = arah => Object.values(MOD).filter(m => arah === undefined || m.arah === arah).map(m => m.sheet);
export const modBySheet = sheet => Object.values(MOD).find(m => m.sheet === sheet) || null;
export const KOLOM_BARANG = { nama: 'Nama Material', valtype: 'Valtype', satuan: 'Satuan', awal: 'Stok Awal', masuk: 'Masuk', keluar: 'Keluar', stok: 'Stok Akhir', min: 'Stok Minimum', status: 'Status', ket: 'Keterangan' };

// ---------- stok ----------
// Stok = Stok Awal (Data_Barang, Kartu Gantung per STOK_AWAL_TANGGAL) + masuk - keluar SESUDAH tanggal itu.
export function stokCtx(D) {
  const rows = new Map(), byName = new Map();
  const addName = (nm, k) => { if (!byName.has(nm)) byName.set(nm, []); byName.get(nm).push(k); };
  for (const b of D.Data_Barang || []) {
    const nm = mkey(b.nama); if (nm === '') continue;
    const k = nm + '|' + mkey(b.valtype); if (rows.has(k)) continue;
    rows.set(k, { nama: String(b.nama).trim(), valtype: b.valtype || '', satuan: b.satuan !== '' && b.satuan != null ? b.satuan : 'Unit', awal: num(b.awal), min: num(b.min), ket: b.ket || '', master: true, _r: b._r, _s: b._s });
    addName(nm, k);
  }
  const baru = (nama, vt) => {
    const nm = mkey(nama), k = nm + '|' + mkey(vt);
    if (!rows.has(k)) { rows.set(k, { nama: String(nama).trim(), valtype: vt || '', satuan: 'Unit', awal: 0, min: 0, ket: '', master: false, _r: '', _s: '' }); addName(nm, k); }
    return k;
  };
  const snvt = new Map(), mv = [];
  for (const b of D.Barang_Masuk || []) {
    if (mkey(b.nama) === '') continue;
    const k = baru(b.nama, b.valtype);
    for (const s of snList(b.sn)) snvt.set(s.toUpperCase(), mkey(b.valtype));
    if (iso(b.tgl)) mv.push([b.tgl, k, unit(b.sn), 'Masuk', b.sn || '']);
  }
  const best = new Map();
  for (const m of Object.values(MOD)) {
    if (m.arah !== -1) continue;
    for (const b of D[m.sheet] || []) {
      const nm = mkey(b[m.mat] ?? ''); if (nm === '') continue;
      let k = null; const l = snList(b.sn);
      if (l.length && snvt.has(l[0].toUpperCase()) && rows.has(nm + '|' + snvt.get(l[0].toUpperCase()))) k = nm + '|' + snvt.get(l[0].toUpperCase());
      else if (byName.get(nm)?.length) {
        if (!best.has(nm)) { const ks = byName.get(nm); let bk = ks[0]; for (const kk of ks) if (rows.get(kk).awal > rows.get(bk).awal) bk = kk; best.set(nm, bk); }
        k = best.get(nm);
      } else k = baru(b[m.mat], '');
      if (iso(b.tgl)) mv.push([b.tgl, k, -unit(b.sn), m.jenis, b.sn || '']);
    }
  }
  return { rows, mv, byName, D };
}
export function stokBaris(C, tgl = null, semuaDerived = false, cut = STOK_AWAL_TANGGAL) {
  const akhir = tgl ?? '9999-12-31', R = new Map();
  for (const [k, r] of C.rows) R.set(k, { ...r, masuk: 0, keluar: 0, net: 0 });
  for (const m of C.mv) {
    const t = m[0], r = R.get(m[1]);
    if (akhir >= cut) { if (t > cut && t <= akhir) { r.net += m[2]; if (m[2] > 0) r.masuk += m[2]; else r.keluar -= m[2]; } }
    else if (t > akhir && t <= cut) r.net -= m[2];
  }
  const o = [];
  for (const r of R.values()) {
    if (!r.master && !semuaDerived && r.masuk + r.keluar === 0) continue;
    r.stok = r.awal + r.net;
    r.status = !r.master ? 'Belum terdaftar' : (r.stok <= 0 ? 'Habis' : (r.min > 0 && r.stok <= r.min ? 'Menipis' : 'Tersedia'));
    o.push(r);
  }
  o.sort((a, b) => cmp(a.nama, b.nama) || cmp(a.valtype, b.valtype));
  return o;
}
// stok semua valtype untuk satu nama; null = belum terdaftar
export function stokNama(C, nama) {
  const nm = mkey(nama), ks = C.byName.get(nm);
  if (!ks || !ks.some(k => C.rows.get(k).master)) return null;
  let s = 0; for (const r of stokBaris(C)) if (mkey(r.nama) === nm) s += r.stok;
  return s;
}
export function stokTotalPada(C, tgl, cut = STOK_AWAL_TANGGAL) {
  let s = 0; for (const r of C.rows.values()) if (r.master) s += r.awal;
  for (const m of C.mv) {
    if (tgl >= cut) { if (m[0] > cut && m[0] <= tgl) s += m[2]; } else if (m[0] > tgl && m[0] <= cut) s -= m[2];
  }
  return s;
}

// ---------- riwayat & duplikat ----------
export function riwayat(D) {
  const o = [];
  for (const [k, m] of Object.entries(MOD)) {
    for (const x of D[m.sheet] || []) {
      const p1 = m.key === 'masuk' ? ((x.divisi ?? '') !== '' ? 'Divisi ' + x.divisi : '') : (x[m.oleh] ?? '');
      const p2 = m.key === 'keluar' ? (x.mitra ?? '') : (m.key === 'ritel' || m.key === 'ggn' ? (x.nama ?? '') : '');
      o.push({ tgl: x.tgl || '', jenis: m.jenis, material: x[m.mat] ?? '', valtype: x.valtype ?? '', sn: x.sn ?? '', oleh: [p1, p2].filter(v => String(v).length).join(' / ').trim(), ket: x.ket ?? x.lokasi ?? x.perangkat ?? '', _m: k, _r: x._r, _s: x._s, _row: x });
    }
  }
  o.sort((a, b) => (a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : 0) || (b._r - a._r));
  return o;
}
export function dupMap(D, sheets) {
  const c = new Map();
  for (const s of sheets) for (const x of D[s] || []) for (const sn of snList(x.sn)) { const k = sn.toUpperCase(); c.set(k, (c.get(k) || 0) + 1); }
  return c;
}

// ---------- agregasi dashboard ----------
export function agregatHarian(rows) {
  const o = {};
  for (const x of rows) { const k = iso(x.tgl) ? x.tgl : '0000-00-00'; o[k] = (o[k] || 0) + unit(x.sn); }
  return o;
}
export const jumlahRentang = (map, a, b) => { let s = 0; for (const k in map) if (k >= a && k <= b) s += map[k]; return s; };
export function daftarTahun(sets) {
  const now = new Date().getFullYear(), th = new Set([now, 2024]);
  for (const rows of sets) for (const x of rows) { const m = /^(\d{4})-/.exec(x.tgl || ''); if (m && +m[1] > 1990 && +m[1] <= now) th.add(+m[1]); }
  const a = [...th]; const mx = Math.max(...a), mn = Math.min(...a), o = [];
  for (let y = mx; y >= mn; y--) o.push(y);
  return o;
}

// ---------- pergerakan stok per kelompok material standar ----------
const PG_DEFS = {
  'ONT FIBERHOME NEW': ['ont', 'FIBERHOME', 'BAIK'], 'ONT FIBERHOME DISMANTLE': ['ont', 'FIBERHOME', 'DISMANTLE'],
  'ONT HUAWEI NEW': ['ont', 'HUAWEI', 'BAIK'], 'ONT HUAWEI DISMANTLE': ['ont', 'HUAWEI', 'DISMANTLE'],
  'ONT RAISECOM': ['ont', 'RAISECOM', 'BAIK'], 'ONT RAISECOM DISMANTLE': ['ont', 'RAISECOM', 'DISMANTLE'],
  'ONT ZTE DISMANTLE': ['ont', 'ZTE', 'DISMANTLE'],
  'DW 100M': ['dw', '100', ''], 'DW 150M': ['dw', '150', ''], 'DW 250M': ['dw', '250', ''],
};
export const pgDaftar = () => Object.keys(PG_DEFS);
const pgNorm = n => mkey(n).replace(/[\u00A0\t]/g, ' ').replace(/\s+/g, ' ').trim();
export function pgAlias(nama) {
  const u = pgNorm(nama);
  if (['ONT FIBERHOME NEW', 'ONT FIBERHOME', 'ONT FIBER HOME', 'ONT FH', 'ONT 100M', 'ONT 100 M', 'ONT 100M FH', 'ONT 100 M FH', 'ONT 100 M FIBERHOME', 'ONT 100M FIBERHOME', 'ONT 150M', 'ONT 150 M', 'ONT 150 M FIBERHOME', 'ONT 150M FIBERHOME', 'ONT 250M FIBERHOME', 'ONTY FIBERHOME', 'ONT RIBERHOME'].includes(u)) return 'ONT FIBERHOME NEW';
  if (['ONT FIBERHOME DISMANTLE', 'ONT FIBERHOME DISMEN', 'ONT FIBERHOME DISMENT', 'ONT FIBERHOME DISMENTLE'].includes(u)) return 'ONT FIBERHOME DISMANTLE';
  if (['ONT HUAWEI', 'ONT HUWAEI', 'ONT HUWEI', 'ONT HW', 'ONU HUAWEI'].includes(u)) return 'ONT HUAWEI NEW';
  if (u === 'ONT HUAWEI DISMANTLE') return 'ONT HUAWEI DISMANTLE';
  if (['ONT RAISECOM', 'ONT RAISE COM', 'ONT RAISECOME', 'ONT RAISECOMM', 'ONT RC', 'ON RAISECOM', 'RAISECOM'].includes(u)) return 'ONT RAISECOM';
  if (['ONT RAISECOM DISMANTLE', 'ONT RASECOM DISMANTLE', 'ONT RAISECOM DISMEN', 'ONT RAISECOM DISMENT', 'ONT RAISECOM DISMENTLE', 'ONT RISCOM DISMANTLE', 'ONT RISECOM DISMEN', 'DISMANTLE RAISECOM'].includes(u)) return 'ONT RAISECOM DISMANTLE';
  if (u === 'ONT ZTE DISMANTLE') return 'ONT ZTE DISMANTLE';
  let v = u.replace(/15OM/g, '150M').replace(/150W/g, '150M');
  v = v.replace(/\b100\s*M?(?=\s|$)/g, '100M').replace(/\b150\s*M?(?=\s|$)/g, '150M').replace(/\b250\s*M?(?=\s|$)/g, '250M');
  if (/^(?:(?:KABEL\s+)?(?:DW\s*)?100M\b|DW\s+100\s+FIBERART\b|100M\s+YOFC\b|YOFC\s+100M\b|DW\s+(?:YOFC|YFC|ZTT)\s+100M\b)/.test(v)) return 'DW 100M';
  if (/^(?:(?:KABEL\s+)?(?:DW\s*)?150M\b|150M\s+YOFC\b|YOFC\s+150M\b|DW\s+(?:YOFC|ZTT)\s+150M\b)/.test(v)) return 'DW 150M';
  if (/^(?:(?:KABEL\s+)?(?:DW\s*)?250M\b|250M\s+YOFC\b|YOFC\s+250M\b|DW\s+(?:YOFC|ZTT)\s+250M\b)/.test(v)) return 'DW 250M';
  if (/^KABEL\s+100M\b/.test(v)) return 'DW 100M';
  if (/^KABEL\s+150M\b/.test(v)) return 'DW 150M';
  if (/^KABEL\s+250M\b/.test(v)) return 'DW 250M';
  return null;
}
export function pgCocok(r, label) {
  const nama = pgNorm(r.nama ?? ''), vt = String(r.valtype ?? '').trim().toUpperCase(), d = PG_DEFS[label];
  if (!d) return false;
  if (d[0] === 'ont' && nama.startsWith('GPON,ONT')) return nama.includes(d[1]) && vt === d[2];
  if (d[0] === 'dw' && nama.startsWith('FOC,') && nama.includes('DROP') && new RegExp('(?:,|\\b)' + d[1] + '\\s*M(?:,|\\b)', 'i').test(nama)) return true;
  return pgAlias(nama) === label;
}
export function pgData(C, label, per, dari, sampai, cut = STOK_AWAL_TANGGAL) {
  // bagi rentang menjadi periode
  const b = []; let d = dari;
  while (d <= sampai && b.length < 800) {
    let s, f, l; const D = dt(d), mi = BULAN[D.getUTCMonth()].slice(0, 3);
    if (per === 'harian') { s = f = d; l = pad(D.getUTCDate()) + ' ' + mi; }
    else if (per === 'mingguan') { const wd = (D.getUTCDay() + 6) % 7; s = addDays(d, -wd); f = addDays(s, 6); const S = dt(s); l = pad(S.getUTCDate()) + ' ' + BULAN[S.getUTCMonth()].slice(0, 3); }
    else if (per === 'bulanan') { s = fmt(new Date(Date.UTC(D.getUTCFullYear(), D.getUTCMonth(), 1))); f = akhirBulan(D.getUTCFullYear(), D.getUTCMonth() + 1); l = mi + ' ' + String(D.getUTCFullYear()).slice(2); }
    else { s = `${D.getUTCFullYear()}-01-01`; f = `${D.getUTCFullYear()}-12-31`; l = String(D.getUTCFullYear()); }
    b.push([s < dari ? dari : s, f > sampai ? sampai : f, l]);
    d = addDays(f, 1);
  }
  let awal = 0;
  const memo = new Map(), ok = m => { if (label === null) return true; if (!memo.has(m[1])) { const r = C.rows.get(m[1]); memo.set(m[1], r ? pgCocok(r, label) : false); } return memo.get(m[1]); };
  for (const r of C.rows.values()) if (r.master && (label === null || pgCocok(r, label))) awal += r.awal;
  const net = {}, inn = {}, out = {};
  for (const m of C.mv) {
    if (!ok(m)) continue; const t = m[0], v = m[2];
    net[t] = (net[t] || 0) + v; if (v > 0) inn[t] = (inn[t] || 0) + v; else if (v < 0) out[t] = (out[t] || 0) - v;
  }
  const tg = Object.keys(net).sort(), n = tg.length, cn = [], ci = [], co = [];
  let a = 0, ai = 0, ao = 0;
  tg.forEach((t, i) => { a += net[t]; cn[i] = a; ai += inn[t] || 0; ci[i] = ai; ao += out[t] || 0; co[i] = ao; });
  const kum = (arr, x) => { let lo = 0, hi = n - 1, r = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (tg[mid] <= x) { r = mid; lo = mid + 1; } else hi = mid - 1; } return r < 0 ? 0 : arr[r]; };
  const kutCum = kum(cn, cut), o = { l: [], stok: [], masuk: [], keluar: [] };
  for (const x of b) {
    const p = addDays(x[0], -1);
    o.l.push(x[2]); o.masuk.push(kum(ci, x[1]) - kum(ci, p)); o.keluar.push(kum(co, x[1]) - kum(co, p));
    o.stok.push(x[1] >= cut ? awal + kum(cn, x[1]) - kutCum : awal - (kutCum - kum(cn, x[1])));
  }
  return o;
}
