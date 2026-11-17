import crypto from 'node:crypto';
import { send, bodyJson, store, SHEETS, Galat } from './_lib.js';
import { SKEMA } from '../public/js/schema.js';

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
function verify(req, raw) {
  const secret = process.env.SHEETS_SYNC_SECRET || '';
  const supplied = String(req.headers['x-inventory-signature'] || '');
  if (!secret || !supplied) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a,b);
}
function toPayload(sheet, headers, data) {
  const out = {};
  const cols = SKEMA[sheet];
  for (const [key, ...aliases] of cols) {
    const h = headers.find(x => aliases.some(a => norm(a) === norm(x)));
    out[key] = h ? String(data[h] ?? '').replace(/\r/g,'').trim() : '';
  }
  return out;
}
export default async function handler(req,res) {
  try {
    if (req.method !== 'POST') throw new Galat('Metode tidak didukung.',405);
    const b = await bodyJson(req);
    const raw = JSON.stringify(b);
    if (!verify(req, raw)) throw new Galat('Tanda tangan sinkronisasi tidak valid.',401);
    if (!SHEETS.includes(String(b.sheet || ''))) throw new Galat('Sheet tidak dikenal.');
    const db = await store();
    await db.ensureSyncMap();
    const sheet = String(b.sheet);
    const counts = await db.hitung();
    const upsert = async item => {
      const rowNo = Number(item.rowNumber);
      if (!Number.isInteger(rowNo) || rowNo < 2) throw new Galat('Nomor baris tidak valid.');
      const payload = toPayload(sheet, item.headers || [], item.data || {});
      const existing = await db.syncMapGet(sheet,rowNo);
      let id, webId;
      // Existing seeded/imported records must be mapped before allowing an unmapped row
      // to insert; otherwise bootstrap could duplicate the whole inventory.
      if (!existing && Number(counts[sheet] || 0) > 0) {
        throw new Galat(`Sheet ${sheet} sudah memiliki data di Neon tetapi pemetaan baris belum dibuat. Sinkronisasi awal dihentikan agar tidak menggandakan data. Perlu rekonsiliasi ID terlebih dahulu.`, 409);
      }
      if (existing) {
        const ok = await db.update(sheet, existing.record_id, null, payload);
        if (!ok) throw new Galat('Record pemetaan tidak ditemukan; perlu rekonsiliasi.',409);
        id = existing.record_id;
      } else {
        const ids = await db.insertMany(sheet,[payload]);
        id = ids[0];
        await db.syncMapSet(sheet,rowNo,id);
      }
      return {rowNumber:rowNo, webId:String(id)};
    };
    if (b.action === 'upsert') {
      const result = await upsert(b);
      return send(res,200,{ok:true,...result});
    }
    if (b.action === 'bootstrap') {
      if (!Array.isArray(b.rows) || b.rows.length > 100) throw new Galat('Batch harus berisi maksimal 100 baris.');
      const result = [];
      for (const item of b.rows) result.push(await upsert(item));
      return send(res,200,{ok:true,count:result.length,rows:result});
    }
    throw new Galat('Aksi sinkronisasi tidak dikenal.');
  } catch(e) { send(res,e.code || 500,{ok:false,error:e.message || 'Galat server'}); }
}
