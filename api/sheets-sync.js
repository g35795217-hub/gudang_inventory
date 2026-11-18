import crypto from 'node:crypto';
import { send, bodyJson, store, SHEETS, Galat } from './_lib.js';
import { SKEMA } from '../public/js/schema.js';

const norm = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function verifySignature(req, body) {
  const secret = process.env.SHEETS_SYNC_SECRET || '';
  const supplied = String(req.headers['x-inventory-signature'] || '').trim().toLowerCase();
  if (!secret || !/^[a-f0-9]{64}$/.test(supplied)) return false;

  // Apps Script menandatangani JSON.stringify(payload). Vercel mengurai body
  // menjadi object; urutan properti JSON dipertahankan saat diserialisasi ulang.
  const expected = crypto.createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(supplied, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function convertRow(sheet, headers, data) {
  const schema = SKEMA[sheet];
  if (!schema) throw new Galat('Skema sheet tidak ditemukan: ' + sheet);
  const headerList = Array.isArray(headers) ? headers : [];
  const source = data && typeof data === 'object' ? data : {};
  const result = {};

  for (const [key, ...aliases] of schema) {
    const header = headerList.find(h =>
      h && aliases.some(alias => norm(alias) === norm(h))
    );
    result[key] = header ? String(source[header] ?? '').replace(/\r/g, '').trim() : '';
  }
  return result;
}

function validRowNumber(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2) throw new Galat('Nomor baris tidak valid.');
  return n;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      throw new Galat('Endpoint sinkronisasi hanya menerima POST. Jangan diuji dengan membuka URL langsung di browser.', 405);
    }

    const body = await bodyJson(req);
    if (!verifySignature(req, body)) {
      throw new Galat('Tanda tangan sinkronisasi tidak valid. Periksa SHEETS_SYNC_SECRET dan SYNC_SECRET.', 401);
    }

    const sheet = String(body.sheet || '');
    if (!SHEETS.includes(sheet)) throw new Galat('Nama sheet tidak dikenal: ' + sheet);

    const db = await store();
    await db.ensureSyncMap();

    async function saveOne(item) {
      const rowNumber = validRowNumber(item.rowNumber);
      const payload = convertRow(sheet, item.headers, item.data);
      const mapped = await db.syncMapGet(sheet, rowNumber);
      let recordId;

      if (mapped) {
        recordId = Number(mapped.record_id);
        const updated = await db.update(sheet, recordId, null, payload);
        if (!updated) {
          throw new Galat(`Pemetaan ${sheet} baris ${rowNumber} menunjuk data yang tidak ditemukan. Perlu rekonsiliasi.`, 409);
        }
      } else {
        const counts = await db.hitung();
        if (Number(counts[sheet] || 0) > 0) {
          throw new Galat(
            `Data ${sheet} sudah ada di Neon, tetapi baris ${rowNumber} belum memiliki pemetaan. Jangan jalankan bootstrap berulang; data perlu direkonsiliasi agar tidak duplikat.`,
            409
          );
        }
        const ids = await db.insertMany(sheet, [payload]);
        recordId = Number(ids[0]);
        await db.syncMapSet(sheet, rowNumber, recordId);
      }

      return { rowNumber, webId: String(recordId) };
    }

    if (body.action === 'upsert') {
      const result = await saveOne(body);
      return send(res, 200, { ok: true, ...result });
    }

    if (body.action === 'bootstrap') {
      if (!Array.isArray(body.rows) || body.rows.length > 100) {
        throw new Galat('Batch bootstrap harus berisi maksimal 100 baris.');
      }
      const results = [];
      for (const row of body.rows) results.push(await saveOne(row));
      return send(res, 200, { ok: true, count: results.length, rows: results });
    }

    throw new Galat('Aksi sinkronisasi tidak dikenal.');
  } catch (error) {
    return send(res, error.code || 500, {
      ok: false,
      error: error.message || 'Galat server'
    });
  }
}
