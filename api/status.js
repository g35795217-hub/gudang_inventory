import { send, handler, store } from './_lib.js';
// GET /api/status -> koneksi database & jumlah baris per sheet (untuk pemeriksaan setelah deploy)
export default handler(async (req, res) => {
  const t = Date.now(), n = await (await store()).hitung();
  send(res, 200, { ok: true, ms: Date.now() - t, total: Object.values(n).reduce((a, b) => a + b, 0), sheets: n });
});
