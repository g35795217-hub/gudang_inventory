// Pustaka bersama fungsi serverless: database (Neon Postgres), autentikasi, util respons.
import crypto from 'node:crypto';
import { SHEET_NAMES } from '../public/js/schema.js';

export const SHEETS = SHEET_NAMES;
export const send = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };
export class Galat extends Error { constructor(m, code = 401) { super(m); this.code = code; } }
export async function bodyJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const bufs = []; for await (const c of req) bufs.push(c);
  const t = Buffer.concat(bufs).toString('utf8'); return t ? JSON.parse(t) : {};
}

// ---------- autentikasi sederhana (kata sandi bersama) ----------
const rahasia = () => process.env.AUTH_SECRET || process.env.APP_PASSWORD || '';
export const authAktif = () => !!process.env.APP_PASSWORD;
const hmac = s => crypto.createHmac('sha256', rahasia()).update(s).digest('base64url');
export function buatToken() { const exp = Date.now() + 7 * 864e5; return exp + '.' + hmac(String(exp)); }
export function cekPassword(p) {
  const a = crypto.createHash('sha256').update(String(p ?? '')).digest(), b = crypto.createHash('sha256').update(process.env.APP_PASSWORD || '').digest();
  return crypto.timingSafeEqual(a, b);
}
export function wajibLogin(req) {
  if (!authAktif()) return;
  const t = String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), [exp, sig] = t.split('.');
  let ok = false;
  if (exp && sig && Number(exp) > Date.now()) { const w = hmac(exp); ok = w.length === sig.length && crypto.timingSafeEqual(Buffer.from(w), Buffer.from(sig)); }
  if (!ok) throw new Galat('Sesi berakhir. Silakan masuk kembali.', 401);
}

// ---------- penyimpanan ----------
let _store;
export const setQuery = q => { _store = makeStore(q); };   // dipakai tes (PGlite)
export async function store() {
  if (_store) return _store;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url && process.env.USE_MEMORY === '1') { _store = (await import('./_memory.js')).default; return _store; }
  if (!url) throw new Galat('DATABASE_URL belum diatur. Hubungkan database Postgres (Neon) pada proyek Vercel.', 500);
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  return (_store = makeStore((t, p = []) => sql.query(t, p)));
}
function makeStore(q) {
  let siap = false;
  const ensure = async () => {
    if (siap) return;
    await q(`CREATE TABLE IF NOT EXISTS inventory_records (
      id BIGSERIAL PRIMARY KEY, sheet_name TEXT NOT NULL, payload JSONB NOT NULL,
      ver INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await q('CREATE INDEX IF NOT EXISTS idx_inv_sheet_id ON inventory_records(sheet_name, id)');
    siap = true;
  };
  const baris = r => ({ ...r.payload, _r: Number(r.id), _s: String(r.ver) });
  return {
    async list(sheet, after, limit) {
      await ensure();
      const r = await q('SELECT id, ver, payload FROM inventory_records WHERE sheet_name=$1 AND id>$2 ORDER BY id LIMIT $3', [sheet, after, limit]);
      return r.map(baris);
    },
    async insertMany(sheet, list) {
      await ensure(); if (!list.length) return [];
      const r = await q('INSERT INTO inventory_records(sheet_name, payload) SELECT $1, x FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS t(x, n) ORDER BY n RETURNING id', [sheet, JSON.stringify(list)]);
      return r.map(x => Number(x.id));
    },
    async get(sheet, id) {
      await ensure(); const r = await q('SELECT id, ver, payload FROM inventory_records WHERE sheet_name=$1 AND id=$2', [sheet, id]);
      return r[0] ? baris(r[0]) : null;
    },
    async update(sheet, id, ver, payload) {
      await ensure();
      const r = await q('UPDATE inventory_records SET payload=$4::jsonb, ver=ver+1, updated_at=now() WHERE sheet_name=$1 AND id=$2 AND ($3::int IS NULL OR ver=$3::int) RETURNING id', [sheet, id, ver, JSON.stringify(payload)]);
      return r.length > 0;
    },
    async del(sheet, id, ver) {
      await ensure(); const r = await q('DELETE FROM inventory_records WHERE sheet_name=$1 AND id=$2 AND ($3::int IS NULL OR ver=$3::int) RETURNING id', [sheet, id, ver]);
      return r.length > 0;
    },
    async maxNo(sheet) {
      await ensure();
      const r = await q(`SELECT COALESCE(MAX(CASE WHEN payload->>'no' ~ '^[0-9]{1,9}$' THEN (payload->>'no')::int END),0) AS m FROM inventory_records WHERE sheet_name=$1`, [sheet]);
      return Number(r[0].m);
    },
    async snAda(sheets, sn, kecuali) {
      await ensure();
      const r = await q(`SELECT sheet_name FROM inventory_records WHERE sheet_name = ANY($1::text[]) AND upper(btrim(payload->>'sn'))=upper($2) AND ($3::bigint IS NULL OR id<>$3::bigint) LIMIT 1`, [sheets, sn, kecuali]);
      return r[0]?.sheet_name || null;
    },
    async hitung() { await ensure(); const r = await q('SELECT sheet_name, count(*)::int AS n FROM inventory_records GROUP BY 1'); return Object.fromEntries(r.map(x => [x.sheet_name, x.n])); },
    async ensureSyncMap() {
      await ensure();
      await q(`CREATE TABLE IF NOT EXISTS inventory_sync_map (
        sheet_name TEXT NOT NULL,
        row_number INTEGER NOT NULL,
        record_id BIGINT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (sheet_name, row_number),
        UNIQUE (sheet_name, record_id)
      )`);
    },
    async syncMapGet(sheet, rowNumber) {
      await this.ensureSyncMap();
      const r = await q('SELECT record_id FROM inventory_sync_map WHERE sheet_name=$1 AND row_number=$2', [sheet, rowNumber]);
      return r[0] || null;
    },
    async syncMapSet(sheet, rowNumber, recordId) {
      await this.ensureSyncMap();
      await q(`INSERT INTO inventory_sync_map(sheet_name,row_number,record_id)
        VALUES($1,$2,$3)
        ON CONFLICT(sheet_name,row_number) DO UPDATE
        SET record_id=EXCLUDED.record_id, updated_at=now()`, [sheet, rowNumber, recordId]);
    },
  };
}

// pembungkus handler: autentikasi + penanganan galat seragam
export const handler = (fn, { publik = false } = {}) => async (req, res) => {
  try { if (!publik) wajibLogin(req); await fn(req, res); }
  catch (e) { send(res, e.code || 500, { ok: false, error: e.message || 'Galat server' }); }
};
