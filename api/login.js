import { send, bodyJson, handler, authAktif, cekPassword, buatToken, Galat } from './_lib.js';

export default handler(async (req, res) => {
  if (req.method === 'GET') return send(res, 200, { ok: true, auth: authAktif() });
  if (req.method !== 'POST') throw new Galat('Metode tidak didukung.', 405);
  if (!authAktif()) return send(res, 200, { ok: true, token: '', auth: false });
  const b = await bodyJson(req);
  if (!cekPassword(b.password)) { await new Promise(r => setTimeout(r, 700)); throw new Galat('Kata sandi salah.', 401); }
  send(res, 200, { ok: true, token: buatToken(), auth: true });
}, { publik: true });
