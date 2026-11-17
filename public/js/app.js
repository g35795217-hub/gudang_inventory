// Router, menu, login, dan inisialisasi aplikasi.
import { MOD, BULAN, stokBaris, hariIni, tglTampil } from './logic.js';
import { $, $$, h, api, setToken, AuthError, DB, DB_AT, muatSemua, muatUlang, flash } from './core.js';
import { halamanDashboard, halamanModul, halamanBarang, halamanMasterSN, halamanRiwayat, halamanLaporan, halamanImport, hapusGrafik } from './pages.js';
import { ctx } from './core.js';

const NAV = [
  ['Transaksi Gudang', 'boxes', [['masuk', 'Material Masuk', 'box-arrow-in-down'], ['keluar', 'Material Keluar', 'box-arrow-up']]],
  ['Pengambilan Material', 'clipboard-check', [['ritel', 'Pengambilan Ritel', 'shop'], ['ggn', 'Pengambilan Gangguan', 'exclamation-triangle'], ['icrm', 'Aktivasi ICRM', 'router'], ['aktivasi', 'Pengambilan Aktivasi', 'lightning-charge'], ['har', 'Pengambilan HAR', 'wrench-adjustable'], ['pembangunan', 'Pengambilan Pembangunan', 'buildings']]],
  ['Data & Laporan', 'bar-chart-line', [['barang', 'Data Material', 'box-seam'], ['master_sn', 'Master SN', 'upc-scan'], ['riwayat', 'Riwayat Transaksi', 'clock-history'], ['laporan', 'Laporan', 'file-earmark-bar-graph'], ['import', 'Import Excel', 'file-earmark-arrow-up']]],
];
const JUDUL = { dashboard: 'Dashboard', barang: 'Data Material', master_sn: 'Master SN', riwayat: 'Riwayat Transaksi', laporan: 'Laporan', import: 'Import Excel' };
for (const m of Object.values(MOD)) JUDUL[m.key] = m.judul;
const HALAMAN = { dashboard: halamanDashboard, barang: halamanBarang, master_sn: halamanMasterSN, riwayat: halamanRiwayat, laporan: halamanLaporan, import: halamanImport };

let ngSimpan = {}; try { ngSimpan = JSON.parse(localStorage.getItem('ng') || '{}'); } catch (e) {}
let adaAuth = false, siap = false;
const rute = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard');

function gambarNav(aktif) {
  $('#nav').innerHTML = `<a href="#/dashboard" class="${aktif === 'dashboard' ? 'on' : ''}"><i class="bi bi-house-door"></i><span>Dashboard</span></a>` + NAV.map((g, gi) => {
    const buka = g[2].some(m => m[0] === aktif) || ngSimpan[gi];
    return `<div class="ng${buka ? ' open' : ''}" data-g="${gi}"><button type="button" class="ngh" aria-expanded="${buka}"><i class="bi bi-${g[1]}"></i><span>${h(g[0])}</span><i class="bi bi-chevron-down ngc"></i></button><div class="ngb"><div>${g[2].map(m => `<a href="#/${m[0]}" class="sub ${aktif === m[0] ? 'on' : ''}"><i class="bi bi-${m[2]}"></i><span>${h(m[1])}</span>${m[0] === 'barang' ? '<em class="nb" id="nbm" hidden></em>' : ''}</a>`).join('')}</div></div></div>`;
  }).join('');
  hitungNotif();
}
function hitungNotif() {
  if (!siap) return; const n = stokBaris(ctx()).filter(x => x.master && x.status !== 'Tersedia').length;
  const a = $('#nbd'), b = $('#nbm'); if (a) { a.hidden = !n; a.textContent = n; } if (b) { b.hidden = !n; b.textContent = n; }
}
function render() {
  if (!siap) return;
  const r = rute(), el = $('#main'); hapusGrafik();
  const fn = MOD[r] ? el2 => halamanModul(el2, r) : HALAMAN[r] || halamanDashboard, ak = (MOD[r] || HALAMAN[r]) ? r : 'dashboard';
  $('#jd').textContent = JUDUL[ak]; $('#bc').textContent = 'Beranda / ' + JUDUL[ak]; document.title = JUDUL[ak] + ' - PLN Icon Plus Gudang Inventory';
  gambarNav(ak); $('#sb').classList.remove('open'); el.innerHTML = '';
  try { fn(el); } catch (e) { console.error(e); el.innerHTML = `<div class="fatal"><h2>Terjadi kesalahan</h2><p>${h(e.message)}</p></div>`; }
  window.scrollTo(0, 0);
}
async function mulai() {
  const boot = $('#boot'), bt = $('#boot-t'), bp = $('#boot-p');
  try {
    $('#login').hidden = true; boot.hidden = false;
    await muatSemua((n, t) => { bt.textContent = `Memuat data... (${n}/${t})`; bp.max = t; bp.value = n; });
    siap = true; boot.hidden = true; $('#keluar').hidden = !adaAuth; render();
  } catch (e) {
    if (e instanceof AuthError) { boot.hidden = true; $('#login').hidden = false; $('#login input').focus(); return; }
    bt.textContent = ''; boot.querySelector('.boot-box').innerHTML = `<h3>Tidak dapat memuat data</h3><p>${h(e.message)}</p><p class="mu">Pastikan database sudah dihubungkan dan diisi (lihat README), lalu <a href="">muat ulang</a>.</p>`;
  }
}

// ---------- peristiwa ----------
document.addEventListener('click', e => {
  if (e.target.matches('dialog')) e.target.close();
  if (e.target.closest('[data-tutup]')) e.target.closest('dialog').close();
  const gh = e.target.closest('.ngh'); if (gh) { const g = gh.parentElement, o = g.classList.toggle('open'); gh.setAttribute('aria-expanded', o); ngSimpan[g.dataset.g] = o; try { localStorage.setItem('ng', JSON.stringify(ngSimpan)); } catch (x) {} }
});
$('#hb').onclick = () => $('#sb').classList.toggle('open');
$('#reload').onclick = async () => { const b = $('#reload'); b.disabled = true; try { await muatUlang(); render(); flash('Data dimuat ulang dari database.'); } catch (e) { flash(e.message, 'err'); } finally { b.disabled = false; } };
$('#keluar').onclick = () => { setToken(''); location.reload(); };
$('#tg').textContent = tglTampil(hariIni());
window.addEventListener('hashchange', render);
document.addEventListener('datachanged', () => { clearTimeout(hitungNotif.t); hitungNotif.t = setTimeout(hitungNotif, 50); });
$('#lg').onsubmit = async e => {
  e.preventDefault(); const f = e.target, er = $('#lg-e'); er.hidden = true;
  try { const j = await api('/api/login', { password: f.elements.password.value }); setToken(j.token); f.reset(); mulai(); }
  catch (x) { er.textContent = x.message; er.hidden = false; }
};
// segarkan diam-diam bila tab kembali aktif setelah lama ditinggal (data bisa berubah oleh pengguna lain)
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !siap || Date.now() - DB_AT < 120000 || $('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
  try { await muatUlang(); render(); } catch (e) {}
});

try { adaAuth = (await api('/api/login')).auth; } catch (e) {}
mulai();
