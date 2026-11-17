import { send, handler, store, SHEETS, Galat } from './_lib.js';

// GET /api/data?sheet=Barang_Keluar&after=0&limit=5000  -> { rows, next }
export default handler(async (req, res) => {
  const u = new URL(req.url, 'http://x'), sheet = u.searchParams.get('sheet') || '';
  if (!SHEETS.includes(sheet)) throw new Galat('Sheet tidak dikenal.');
  const after = Math.max(0, Number(u.searchParams.get('after')) || 0), limit = Math.min(6000, Math.max(1, Number(u.searchParams.get('limit')) || 5000));
  const rows = await (await store()).list(sheet, after, limit);
  send(res, 200, { ok: true, rows, next: rows.length === limit ? rows[rows.length - 1]._r : null });
});
