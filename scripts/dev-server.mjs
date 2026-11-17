// Server lokal untuk uji: menyajikan public/ dan menjalankan fungsi api/*.js.
// Tanpa DATABASE_URL, data dimuat dari data/inventory.xlsx ke memori (hilang saat berhenti).   npm run dev
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 3000;
if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  process.env.USE_MEMORY = '1';
  const { store } = await import(pathToFileURL(path.join(root, 'api/_lib.js')));
  const { SKEMA, barisKeObjek } = await import(pathToFileURL(path.join(root, 'public/js/schema.js')));
  const XLSX = createRequire(import.meta.url)('xlsx'), db = await store();
  const wb = XLSX.read(fs.readFileSync(path.join(root, 'data/inventory.xlsx')), { cellDates: true });
  for (const s of Object.keys(SKEMA)) if (wb.Sheets[s]) await db.insertMany(s, barisKeObjek(s, XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: true, cellDates: true, defval: null })));
  console.log('Data dimuat ke memori:', await db.hitung());
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const f = path.join(root, 'api', path.basename(u.pathname) + '.js');
    if (!fs.existsSync(f) || path.basename(f).startsWith('_')) { res.statusCode = 404; return res.end('{"ok":false}'); }
    return (await import(pathToFileURL(f))).default(req, res);
  }
  let p = path.join(root, 'public', u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
  if (!p.startsWith(path.join(root, 'public')) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end('Tidak ditemukan'); }
  res.setHeader('Content-Type', mime[path.extname(p)] || 'application/octet-stream'); fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}`));
