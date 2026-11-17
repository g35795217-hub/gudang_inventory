// Inti aplikasi: API, data, tabel (cari/filter/urut/halaman/ekspor), formulir, dialog.
import { SHEETS, VALTYPE, iso, tglNorm, tglTampil, stokCtx, cmpText } from './logic.js';

export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => [].slice.call((r || document).querySelectorAll(s));
export const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nf = v => Number(v).toLocaleString('id-ID');
export const nl2br = s => h(s).replace(/\n/g, '<br>');

// ---------- API ----------
let TOKEN = ''; try { TOKEN = localStorage.getItem('gdg_token') || ''; } catch (e) {}
export const setToken = t => { TOKEN = t; try { t ? localStorage.setItem('gdg_token', t) : localStorage.removeItem('gdg_token'); } catch (e) {} };
export class AuthError extends Error {}
export async function api(path, body) {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  let j; try { j = await r.json(); } catch (e) { throw new Error('Server tidak merespons dengan benar (HTTP ' + r.status + ').'); }
  if (r.status === 401) throw new AuthError(j.error || 'Perlu masuk.');
  if (!r.ok || j.ok === false) throw new Error(j.error || 'Permintaan gagal (HTTP ' + r.status + ').');
  return j;
}

// ---------- data ----------
export const DB = {}; export let DB_VER = 0; export let DB_AT = 0;
const bump = () => { DB_VER++; _ctx = null; document.dispatchEvent(new Event('datachanged')); };
let _ctx = null;
export const ctx = () => _ctx || (_ctx = stokCtx(DB));
const normalisasi = rows => { for (const x of rows) if ('tgl' in x) x.tgl = tglNorm(x.tgl); return rows; };
export async function muatSheet(sheet) {
  const all = []; let after = 0;
  for (;;) { const j = await api(`/api/data?sheet=${sheet}&after=${after}&limit=5000`); all.push(...j.rows); if (j.next == null) break; after = j.next; }
  DB[sheet] = normalisasi(all);
}
export async function muatSemua(onProgress) {
  let n = 0; onProgress && onProgress(0, SHEETS.length);
  // Material Keluar paling besar: mulai lebih dulu, lainnya paralel
  await Promise.all(SHEETS.slice().sort((a, b) => (a === 'Barang_Keluar' ? -1 : b === 'Barang_Keluar' ? 1 : 0)).map(async s => { await muatSheet(s); onProgress && onProgress(++n, SHEETS.length); }));
  DB_AT = Date.now(); bump();
}
export async function muatUlang(sheets) { await Promise.all((sheets || SHEETS).map(muatSheet)); DB_AT = Date.now(); bump(); }
export function patchRows(sheet, { tambah = [], ubah = null, hapus = null }) {
  const a = DB[sheet] || (DB[sheet] = []);
  if (hapus != null) { const i = a.findIndex(r => r._r === hapus); if (i >= 0) a.splice(i, 1); }
  if (ubah) { normalisasi([ubah]); const i = a.findIndex(r => r._r === ubah._r); if (i >= 0) a[i] = ubah; }
  if (tambah.length) a.push(...normalisasi(tambah));
  bump();
}
export const mutate = body => api('/api/mutate', body);

// ---------- umpan balik ----------
export function flash(msg, tipe = 'ok') {
  $('.fl')?.remove();
  const d = document.createElement('div'); d.className = 'fl' + (tipe === 'err' ? ' e' : '');
  d.innerHTML = `<i class="bi bi-${tipe === 'err' ? 'x-circle' : 'check-circle'}"></i> ${h(msg)}`;
  const m = $('main'); m.prepend(d); window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 500); }, 7000);
}
export const bd = v => { const m = { Tersedia: 'g', Menipis: 'o', Habis: 'r', Masuk: 'g', Keluar: 'o', Ritel: 'b', 'Belum terdaftar': 'o' }; return `<span class="bd ${m[v] || 'b'}">${h(v)}</span>`; };
export const fmTgl = v => h(tglTampil(v));
export const fmBadge = v => bd(v);
export const fmStok = v => `<b${v < 0 ? ' style="color:#b91c1c"' : ''}>${h(v)}</b>`;
export const ib = (act, ico, t, extra = '') => `<button type="button" class="ib ${extra}" data-act="${act}" title="${h(t)}"><i class="bi bi-${ico}"></i></button>`;
export const unik = (rows, k, maks = 300) => [...new Set(rows.map(r => String(r[k] ?? '').trim()).filter(x => x.length))].sort(cmpText).slice(0, maks);

// ---------- dialog detail ----------
export function tampilDetail(d) {
  const dl = $('#fdl'); dl.innerHTML = '';
  for (const k of Object.keys(d)) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = d[k] === '' || d[k] == null ? '-' : d[k]; dl.append(dt, dd); }
  $('#fd').showModal();
}

// ---------- formulir ----------
// field: {nama, label, tipe: text|date|number|number0|select|textarea, opsi, wajib, nilai, ph}
const fieldHtml = (f, val) => {
  const rq = f.wajib ? ' required' : '', t = f.tipe || 'text'; let inp;
  if (t === 'textarea') inp = `<textarea name="${h(f.nama)}" rows="3"${rq}>${h(val)}</textarea>`;
  else if (t === 'select') { const o = [...(f.opsi || [])]; if (val !== '' && !o.includes(val)) o.push(val); inp = `<select name="${h(f.nama)}"${rq}><option value="">Pilih ${h(f.label)}</option>${o.map(v => `<option${String(v) === String(val) ? ' selected' : ''}>${h(v)}</option>`).join('')}</select>`; }
  else if (t === 'number0') inp = `<input name="${h(f.nama)}" type="number" value="${h(val)}" min="0" step="1">`;
  else inp = `<input name="${h(f.nama)}" type="${t}" value="${h(val)}" autocomplete="off"${t === 'text' ? ' autocapitalize="off" spellcheck="false"' : ''}${f.ph ? ` placeholder="${h(f.ph)}"` : ''}${rq}${t === 'number' ? ' min="1" step="1" max="500"' : ''}>`;
  return `<label class="${t === 'textarea' ? 'full' : ''}">${h(f.label)}${f.wajib ? ' *' : ''}${inp}</label>`;
};
export function bukaForm({ judul, fields, vals = {}, onSubmit, setup }) {
  const dlg = $('#fm');
  dlg.innerHTML = `<form autocomplete="off"><h3>${h(judul)}</h3><div class="fg">${fields.map(f => fieldHtml(f, vals[f.nama] ?? f.nilai ?? '')).join('')}</div><div class="mf"><button type="button" class="btn" data-tutup>Batal</button><button class="btn y"><i class="bi bi-check2"></i> Simpan</button></div></form>`;
  const form = $('form', dlg);
  const sn = $('input[name=sn]', form), jm = $('input[name=jumlah]', form);
  if (sn && jm) { const t = () => { const ada = sn.value.trim() !== ''; jm.disabled = ada; if (ada) jm.value = 1; }; sn.addEventListener('input', t); t(); }
  setup && setup(form);
  form.addEventListener('submit', async e => {
    e.preventDefault(); const b = $('button.y', form); b.disabled = true;
    const d = {}; for (const f of fields) { const el = form.elements[f.nama]; if (el) d[f.nama] = el.disabled ? '' : el.value; }
    try { await onSubmit(d); dlg.close(); } catch (er) { flash(er.message, 'err'); dlg.close(); } finally { b.disabled = false; }
  });
  dlg.showModal();
}

// ---------- ekspor ----------
let xlsxMuat = null;
export const muatXlsx = () => xlsxMuat || (xlsxMuat = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'assets/vendor/xlsx.mini.min.js'; s.onload = () => ok(window.XLSX); s.onerror = () => no(new Error('Pustaka Excel gagal dimuat.')); document.head.append(s); }));
const unduh = (blob, nama) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nama; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); };
export function cetakHalaman(isi) {
  const w = window.open('', '_blank'); if (!w) { flash('Izinkan pop-up untuk mencetak.', 'err'); return; }
  w.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>PLN Gudang Inventory</title><style>body{font:13px Arial;padding:28px;color:#111}h2{margin:0}.hd{border-bottom:4px solid #035B71;padding-bottom:10px;margin-bottom:16px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top}th{background:#035B71;color:#fff}.sg{display:flex;justify-content:space-around;margin-top:60px;text-align:center}</style></head><body><div class="hd"><h2>PLN Gudang Inventory</h2></div>${isi}<script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
}
const matriks = (cols, rows) => rows.map(r => Object.keys(cols).map(k => (k === 'tgl' ? tglTampil(r[k]) : String(r[k] ?? ''))));
async function ekspor(tipe, cols, rows, judul) {
  const nama = String(judul || 'Data').replace(/[^A-Za-z0-9_-]+/g, '-') + '-' + new Date().toISOString().slice(0, 10), head = Object.values(cols), mat = matriks(cols, rows);
  if (tipe === 'csv') { const e = v => /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; unduh(new Blob(['\uFEFF' + [head, ...mat].map(l => l.map(e).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), nama + '.csv'); return; }
  if (tipe === 'xls') {
    const X = await muatXlsx(), numK = ['no', 'awal', 'masuk', 'keluar', 'stok', 'min'], keys = Object.keys(cols);
    const aoa = [head, ...rows.map(r => keys.map(k => (numK.includes(k) && r[k] !== '' && r[k] != null && !isNaN(r[k]) ? Number(r[k]) : k === 'tgl' ? tglTampil(r[k]) : String(r[k] ?? ''))))];
    const ws = X.utils.aoa_to_sheet(aoa); ws['!cols'] = head.map((t, i) => ({ wch: Math.min(45, Math.max(10, t.length + 2, ...mat.slice(0, 500).map(l => Math.max(...String(l[i]).split('\n').map(x => x.length)) + 2))) }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, (String(judul).replace(/[^A-Za-z0-9 _-]+/g, ' ').trim() || 'Data').slice(0, 31));
    unduh(new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nama + '.xlsx'); return;
  }
  const cut = mat.length > 3000, m = cut ? mat.slice(0, 3000) : mat;
  cetakHalaman(`<h3>${h(judul)}</h3><p>Dicetak ${new Date().toLocaleString('id-ID')}</p><table><tr>${head.map(l => `<th>${h(l)}</th>`).join('')}</tr>${m.map(l => `<tr>${l.map(v => `<td>${nl2br(v)}</td>`).join('')}</tr>`).join('')}${cut ? '<tr><td colspan="99"><i>Tampilan cetak dibatasi 3000 baris pertama; gunakan Excel untuk seluruh data.</i></td></tr>' : ''}</table>`);
}

// ---------- tabel ----------
const STATE = {};
/** cfg: {id, judul, cols, rows:()=>[], filter:{k:label}, tanggal, balik, terbaru, nomor, per, fmt:{}, aksi:(r)=>html, detail:(r)=>obj, tambah:{label,onClick}, onAksi:{edit,del,...}}  */
export function mountTable(host, cfg) {
  const st = STATE[cfg.id] || (STATE[cfg.id] = { q: '', f: {}, dari: '', sampai: '', sort: '', dir: 'asc', p: 1 });
  const per = cfg.per || 15, cols = cfg.cols;
  let page = [], all = [], timer;
  const hitung = () => {
    let rows = cfg.rows(); const opsi = {};
    for (const k of Object.keys(cfg.filter || {})) { opsi[k] = unik(rows, k); const sel = st.f[k]; if (sel) rows = rows.filter(r => String(r[k] ?? '') === sel); }
    if (cfg.tanggal && (st.dari || st.sampai)) rows = rows.filter(r => iso(r.tgl) && (!st.dari || r.tgl >= st.dari) && (!st.sampai || r.tgl <= st.sampai));
    if (st.q) { const q = st.q.toLowerCase(); rows = rows.filter(r => { for (const k in r) { if (k[0] === '_') continue; const v = r[k]; if ((typeof v === 'string' || typeof v === 'number') && String(v).toLowerCase().includes(q)) return true; } return false; }); }
    const urut = st.sort && cols[st.sort];
    if (urut) { rows = rows.slice().sort((a, b) => { const x = a[st.sort] ?? '', y = b[st.sort] ?? ''; const c = (x !== '' && y !== '' && !isNaN(x) && !isNaN(y)) ? Number(x) - Number(y) : cmpText(x, y); return st.dir === 'desc' ? -c : c; }); }
    else if (cfg.balik) rows = rows.slice().reverse();
    return { rows, opsi, urut: !!urut };
  };
  const isiTabel = () => {
    const H = hitung(); all = H.rows;
    const total = all.length, hal = Math.max(1, Math.ceil(total / per)); st.p = Math.min(Math.max(1, st.p), hal); page = all.slice((st.p - 1) * per, st.p * per);
    const ths = (cfg.nomor ? '<th>No</th>' : '') + Object.entries(cols).map(([k, l]) => `<th><a href="#" data-act="sort" data-k="${k}">${h(l)}${st.sort === k ? (st.dir === 'asc' ? ' ▲' : ' ▼') : ''}</a></th>`).join('') + (cfg.aksi ? '<th class="aksi">Aksi</th>' : '');
    const trs = page.map((r, i) => `<tr data-i="${i}">${cfg.nomor ? `<td>${(st.p - 1) * per + i + 1}</td>` : ''}${Object.keys(cols).map(k => `<td>${cfg.fmt && cfg.fmt[k] ? cfg.fmt[k](r[k], r) : nl2br(r[k])}</td>`).join('')}${cfg.aksi ? `<td class="ac">${cfg.aksi(r)}</td>` : ''}</tr>`).join('');
    $('#tb-area', host).innerHTML = `<div class="tw"><table><thead><tr>${ths}</tr></thead><tbody>${trs || '<tr><td colspan="99" class="em">Belum ada data.</td></tr>'}</tbody></table></div><div class="pg"><span>${nf(total)} data</span><div>${st.p > 1 ? `<button class="btn" data-act="hal" data-p="${st.p - 1}"><i class="bi bi-chevron-left"></i></button>` : '<span class="btn dis"><i class="bi bi-chevron-left"></i></span>'} Hal ${st.p}/${hal} ${st.p < hal ? `<button class="btn" data-act="hal" data-p="${st.p + 1}"><i class="bi bi-chevron-right"></i></button>` : '<span class="btn dis"><i class="bi bi-chevron-right"></i></span>'}</div></div>`;
    return H.opsi;
  };
  const kerangka = () => {
    host.innerHTML = `<div class="card" id="tbl"><div class="ch"><h3>${h(cfg.judul)}</h3><div class="tools"><form data-cari>
      <div class="srw"><i class="bi bi-search"></i><input class="srch" type="search" name="q" autocomplete="off" placeholder="Cari..." value="${h(st.q)}"></div>
      ${cfg.tanggal ? `<input type="date" name="dari" value="${h(st.dari)}" title="Dari tanggal"><input type="date" name="sampai" value="${h(st.sampai)}" title="Sampai tanggal">` : ''}
      ${Object.entries(cfg.filter || {}).map(([k, l]) => `<select name="f_${k}"><option value="">${h(l)}</option></select>`).join('')}
      <button class="btn">Cari</button></form>${cfg.tambah ? `<button type="button" class="btn y" data-act="tambah"><i class="bi bi-plus-lg"></i> ${h(cfg.tambah.label)}</button>` : ''}
      <button type="button" class="btn" data-act="export" data-t="xls"><i class="bi bi-file-earmark-excel"></i> Excel</button><button type="button" class="btn" data-act="export" data-t="pdf"><i class="bi bi-file-earmark-pdf"></i> PDF</button></div></div><div id="tb-area"></div></div>`;
    const opsi = isiTabel();
    for (const k of Object.keys(cfg.filter || {})) { const s = $(`select[name=f_${k}]`, host); for (const v of opsi[k]) s.add(new Option(v, v)); s.value = st.f[k] || ''; }
  };
  const segarkan = () => isiTabel();
  const ambil = e => { const t = e.target.closest('[data-act]'); if (!t || !host.contains(t)) return null; const tr = t.closest('tr[data-i]'); return { t, act: t.dataset.act, r: tr ? page[+tr.dataset.i] : null }; };
  host.onclick = async e => {
    const a = ambil(e); if (!a) return; e.preventDefault();
    const { act, t, r } = a;
    if (act === 'sort') { st.dir = st.sort === t.dataset.k && st.dir === 'asc' ? 'desc' : 'asc'; st.sort = t.dataset.k; st.p = 1; segarkan(); }
    else if (act === 'hal') { st.p = +t.dataset.p; segarkan(); $('#tbl', host).scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    else if (act === 'export') {
      const rows = all.slice(); if (!(st.sort && cols[st.sort]) && (cfg.balik || cfg.terbaru)) rows.reverse();   // web: terbaru di atas; ekspor: lama di atas
      try { await ekspor(t.dataset.t, cols, rows, cfg.judul); } catch (er) { flash(er.message, 'err'); }
    }
    else if (act === 'tambah') cfg.tambah.onClick();
    else if (act === 'det' && r && cfg.detail) tampilDetail(cfg.detail(r));
    else if (r && cfg.onAksi && cfg.onAksi[act]) { try { await cfg.onAksi[act](r); } catch (er) { flash(er.message, 'err'); } }
  };
  host.onsubmit = e => { if (!e.target.matches('[data-cari]')) return; e.preventDefault(); lembar(); };
  const lembar = () => { const f = $('[data-cari]', host); if (!f) return; const el = f.elements; st.q = el.q.value.trim(); if (el.dari) { st.dari = el.dari.value; st.sampai = el.sampai.value; } for (const k of Object.keys(cfg.filter || {})) st.f[k] = el['f_' + k].value; st.p = 1; segarkan(); };
  host.oninput = e => { if (e.target.name === 'q') { clearTimeout(timer); timer = setTimeout(lembar, 250); } };
  host.onchange = e => { if (e.target.matches('select, input[type=date]') && e.target.closest('[data-cari]')) lembar(); };
  kerangka();
  return { segarkan: () => { segarkan(); }, ulang: kerangka };
}
export const ikonAksi = { det: ib('det', 'eye', 'Detail'), edit: ib('edit', 'pencil-square', 'Ubah'), cetak: ib('cetak', 'printer', 'Cetak bukti'), ksn: ib('ksn', 'eraser', 'Kosongkan SN'), del: ib('del', 'trash3', 'Hapus', 'd') };
