import crypto from 'node:crypto';
import { send, bodyJson, store, SHEETS, Galat } from './_lib.js';
import { SKEMA } from '../public/js/schema.js';

const norm = v => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
function signed(req, body) {
  const secret = process.env.SHEETS_SYNC_SECRET || '';
  const got = String(req.headers['x-inventory-signature'] || '').toLowerCase();
  if (!secret || !/^[a-f0-9]{64}$/.test(got)) return false;
  const want = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
  const a = Buffer.from(want, 'hex'), b = Buffer.from(got, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function convert(sheet, headers, data) {
  const schema = SKEMA[sheet];
  if (!schema) throw new Galat('Skema sheet tidak ditemukan: ' + sheet);
  const result = {};
  for (const [key, ...aliases] of schema) {
    const h = (headers || []).find(x => aliases.some(a => norm(a) === norm(x)));
    result[key] = h ? String(data?.[h] ?? '').replace(/\r/g, '').trim() : '';
  }
  return result;
}
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new Galat('Gunakan POST dari Google Apps Script.', 405);
    const body = await bodyJson(req);
    if (!signed(req, body)) throw new Galat('Signature tidak cocok. Samakan SYNC_SECRET dan SHEETS_SYNC_SECRET.', 401);
    const sheet = String(body.sheet || '');
    if (!SHEETS.includes(sheet)) throw new Galat('Sheet tidak dikenal: ' + sheet);
    const db = await store();

    if (body.action === 'upsert') {
      const payload = convert(sheet, body.headers, body.data);
      const id = Number(body.webId || 0);
      if (id > 0) {
        const old = await db.get(sheet, id);
        if (!old) throw new Galat('ID baris tidak ditemukan di Neon. Jangan buat ulang otomatis; perlu rekonsiliasi.', 409);
        const ok = await db.update(sheet, id, null, payload);
        if (!ok) throw new Galat('Gagal memperbarui data Neon.', 500);
        return send(res, 200, { ok: true, webId: String(id), action: 'updated' });
      }
      const counts = await db.hitung();
      if (Number(counts[sheet] || 0) > 0) {
        throw new Galat('Sheet ini sudah memiliki data di Neon tetapi baris Spreadsheet belum memiliki _WEB_ID. Hentikan sinkronisasi untuk mencegah data ganda.', 409);
      }
      const ids = await db.insertMany(sheet, [payload]);
      return send(res, 200, { ok: true, webId: String(ids[0]), action: 'inserted' });
    }

    if (body.action === 'export') {
      const after = Math.max(0, Number(body.after) || 0);
      const limit = Math.min(1000, Math.max(1, Number(body.limit) || 500));
      const rows = await db.list(sheet, after, limit);
      return send(res, 200, { ok: true, rows: rows.map(r => {
        const { _r, _s, ...data } = r;
        return { webId: String(_r), data };
      }), next: rows.length === limit ? rows[rows.length - 1]._r : null });
    }
    throw new Galat('Aksi tidak dikenal.');
  } catch (e) {
    return send(res, e.code || 500, { ok: false, error: e.message || 'Galat server' });
  }
}
