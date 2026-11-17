// Penyimpanan di memori: hanya untuk uji lokal (USE_MEMORY=1). Data hilang saat proses berhenti.
const T = []; let nextId = 1;
const cari = (sheet, id) => T.find(r => r.sheet === sheet && r.id === Number(id));
export default {
  async list(sheet, after, limit) { return T.filter(r => r.sheet === sheet && r.id > after).slice(0, limit).map(r => ({ ...r.payload, _r: r.id, _s: String(r.ver) })); },
  async insertMany(sheet, list) { return list.map(p => { const r = { id: nextId++, sheet, payload: { ...p }, ver: 1 }; T.push(r); return r.id; }); },
  async get(sheet, id) { const r = cari(sheet, id); return r ? { ...r.payload, _r: r.id, _s: String(r.ver) } : null; },
  async update(sheet, id, ver, payload) { const r = cari(sheet, id); if (!r || (ver != null && r.ver !== ver)) return false; r.payload = { ...payload }; r.ver++; return true; },
  async del(sheet, id, ver) { const r = cari(sheet, id); if (!r || (ver != null && r.ver !== ver)) return false; T.splice(T.indexOf(r), 1); return true; },
  async maxNo(sheet) { return T.filter(r => r.sheet === sheet).reduce((m, r) => /^\d{1,9}$/.test(String(r.payload.no)) ? Math.max(m, +r.payload.no) : m, 0); },
  async snAda(sheets, sn, kecuali) { const u = sn.trim().toUpperCase(); const r = T.find(r => sheets.includes(r.sheet) && String(r.payload.sn || '').trim().toUpperCase() === u && r.id !== kecuali); return r ? r.sheet : null; },
  async hitung() { const o = {}; for (const r of T) o[r.sheet] = (o[r.sheet] || 0) + 1; return o; },
};
