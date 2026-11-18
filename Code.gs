/**
 * GUDANG INVENTORY — sinkronisasi dua arah Google Sheets <-> Vercel API <-> Neon.
 * Mendukung 10 sheet. Neon menjadi sumber data utama (single source of truth).
 * Website -> Neon langsung; perubahan website disalin ke Spreadsheet oleh trigger 5 menit.
 * Perubahan Spreadsheet -> Neon langsung melalui onEdit.
 *
 * Script Properties wajib:
 * VERCEL_API_URL = https://gudanginventory-rouge.vercel.app
 * SYNC_SECRET    = nilai yang SAMA dengan Vercel SHEETS_SYNC_SECRET
 *
 * Catatan keamanan data:
 * - Jangan hapus kolom tersembunyi _WEB_ID.
 * - Jangan menghapus baris manual; hapus data melalui website agar konsisten.
 * - Jangan aktifkan import awal sebelum ID lama direkonsiliasi.
 */
const SHEETS = ['Data_Barang','Barang_Masuk','Barang_Keluar','Pengambilan_Ritel','Pengambilan_Ggn','Pengambilan_ICRM','Pengambilan_Aktivasi','Pengambilan_HAR','Pengambilan_Pembangunan','Master_SN'];
const META = '_WEB_ID';
const API_PATH = '/api/sheets-sync';
const BATCH = 500;

function cfg_() {
  const p = PropertiesService.getScriptProperties();
  const url = String(p.getProperty('VERCEL_API_URL') || '').trim().replace(/\/+$/, '');
  const secret = String(p.getProperty('SYNC_SECRET') || '');
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(url)) throw new Error('Isi VERCEL_API_URL dengan URL HTTPS Vercel tanpa path.');
  if (!secret) throw new Error('Script Property SYNC_SECRET belum diisi.');
  return {url, secret};
}
function sign_(body, secret) {
  return Utilities.computeHmacSha256Signature(body, secret).map(b => ('0'+(b&255).toString(16)).slice(-2)).join('');
}
function api_(payload) {
  const c = cfg_(), body = JSON.stringify(payload);
  const r = UrlFetchApp.fetch(c.url + API_PATH, {method:'post', contentType:'application/json', payload:body,
    headers:{'x-inventory-signature':sign_(body,c.secret)}, muteHttpExceptions:true});
  const status = r.getResponseCode(); let obj;
  try { obj = JSON.parse(r.getContentText() || '{}'); } catch(e) { throw new Error('API bukan JSON (HTTP '+status+'): '+r.getContentText()); }
  if (status < 200 || status >= 300 || obj.ok === false) throw new Error('API HTTP '+status+': '+(obj.error || r.getContentText()));
  return obj;
}
function headers_(sh) {
  const n=sh.getLastColumn();
  if (!n) throw new Error('Header kosong pada '+sh.getName());
  return sh.getRange(1,1,1,n).getDisplayValues()[0].map(x=>String(x).trim());
}
function metaCol_(sh, headers) {
  let i=headers.indexOf(META);
  if (i<0) { i=headers.length; sh.getRange(1,i+1).setValue(META); sh.hideColumns(i+1); }
  return i+1;
}
function hasRowData_(row, metaIndex) { return row.some((v,i)=>i!==metaIndex && String(v).trim()!==''); }
function rowObject_(headers, row) {
  const d={}; headers.forEach((h,i)=>{ if(h && h!==META) d[h]=String(row[i] ?? '').trim(); }); return d;
}
function setupInventorySync() {
  cfg_(); const ss=SpreadsheetApp.getActive();
  SHEETS.forEach(name=>{ const sh=ss.getSheetByName(name); if(!sh) throw new Error('Sheet tidak ditemukan: '+name); const h=headers_(sh); metaCol_(sh,h); });
  ScriptApp.getProjectTriggers().forEach(t=>{ if(['inventoryOnEdit','syncNeonToSheets'].includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('inventoryOnEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('syncNeonToSheets').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getUi().alert('Setup selesai. Edit Spreadsheet dikirim ke Neon; perubahan website ditarik ke Spreadsheet setiap 5 menit.');
}
function inventoryOnEdit(e) {
  if(!e || !e.range) return;
  const sh=e.range.getSheet(), name=sh.getName(); if(!SHEETS.includes(name) || e.range.getRow()===1) return;
  const lock=LockService.getScriptLock(); if(!lock.tryLock(20000)) throw new Error('Sinkronisasi sedang berjalan.');
  try {
    let h=headers_(sh), mc=metaCol_(sh,h); h=headers_(sh);
    const first=Math.max(2,e.range.getRow()), last=e.range.getLastRow();
    for(let r=first;r<=last;r++) {
      const vals=sh.getRange(r,1,1,h.length).getDisplayValues()[0]; if(!hasRowData_(vals,mc-1)) continue;
      const result=api_({action:'upsert',sheet:name,webId:vals[mc-1]||'',headers:h,data:rowObject_(h,vals)});
      if(result.webId && String(vals[mc-1])!==String(result.webId)) sh.getRange(r,mc).setValue(result.webId);
    }
  } finally { lock.releaseLock(); }
}
/** Tarik perubahan Neon ke Spreadsheet. Tidak menghapus baris Spreadsheet secara otomatis. */
function syncNeonToSheets() {
  const lock=LockService.getScriptLock(); if(!lock.tryLock(20000)) return;
  try {
    const ss=SpreadsheetApp.getActive();
    SHEETS.forEach(name=>{
      const sh=ss.getSheetByName(name); if(!sh) throw new Error('Sheet tidak ditemukan: '+name);
      let h=headers_(sh), mc=metaCol_(sh,h); h=headers_(sh);
      const last=sh.getLastRow(), idToRow={};
      if(last>=2) {
        const ids=sh.getRange(2,mc,last-1,1).getDisplayValues();
        ids.forEach((a,i)=>{ if(a[0]) idToRow[String(a[0])]=i+2; });
      }
      let after=0;
      while(true) {
        const page=api_({action:'export',sheet:name,after:after,limit:BATCH});
        (page.rows||[]).forEach(item=>{
          const id=String(item.webId), rowNum=idToRow[id];
          const values=h.map(header=>header===META?id:(item.data && Object.prototype.hasOwnProperty.call(item.data,keyForHeader_(name,header)) ? item.data[keyForHeader_(name,header)] : ''));
          if(rowNum) sh.getRange(rowNum,1,1,h.length).setValues([values]);
          else { const dest=Math.max(2,sh.getLastRow()+1); sh.getRange(dest,1,1,h.length).setValues([values]); }
        });
        if(!page.next) break; after=Number(page.next);
      }
    });
  } finally { lock.releaseLock(); }
}
function keyForHeader_(sheet, header) {
  const aliases={
    Data_Barang:{nama:['Nama Material'],valtype:['Valtype'],satuan:['Satuan'],awal:['Stok Awal'],min:['Stok Minimum'],ket:['Keterangan']},
    Barang_Masuk:{no:['No'],tgl:['Tanggal'],nama:['Nama Material','Material','Deskripsi','Nama Deskripsi'],valtype:['Valtype'],sn:['SN','SN (Qty)','Serial Number'],ket:['Keterangan','Ket'],divisi:['Divisi']},
    Barang_Keluar:{tgl:['Tanggal'],pengambil:['Yang Mengambil','Pengambil'],material:['Material','Nama Material','Deskripsi','Nama Deskripsi'],sn:['SN','SN (Qty)','Serial Number'],ket:['Keterangan','Ket'],mitra:['Mitra']},
    Pengambilan_Ritel:{no:['No'],tgl:['Tanggal'],mitra:['Mitra'],bidang:['Bidang'],nama:['Nama'],material:['Material','Nama Material','Deskripsi'],sn:['SN','SN (Qty)','Serial Number'],lokasi:['Lokasi'],ket:['Keterangan','Ket']},
    Pengambilan_Ggn:{no:['No'],tgl:['Tanggal'],mitra:['Mitra'],bidang:['Bidang'],nama:['Nama'],material:['Material','Nama Material','Deskripsi'],sn:['SN','SN (Qty)','Serial Number'],lokasi:['Lokasi'],ket:['Keterangan','Ket']},
    Pengambilan_ICRM:{no:['No'],tgl:['Tanggal'],wo:['WO'],mitra:['Mitra'],nama:['Nama'],lokasi:['Lokasi'],perangkat:['Perangkat'],sn:['SN','SN (Qty)','Serial Number']},
    Pengambilan_Aktivasi:{no:['No'],tgl:['Tanggal'],pa:['PA'],mitra:['Mitra'],bidang:['Bidang'],sn:['SN','SN (Qty)','Serial Number']},
    Pengambilan_HAR:{no:['No'],tgl:['Tanggal'],pengambil:['Yang Mengambil','Pengambil'],bidang:['Bidang'],nama:['Nama'],material:['Material','Nama Material','Deskripsi'],sn:['SN','SN (Qty)','Serial Number'],lokasi:['Lokasi'],ket:['Keterangan','Ket']},
    Pengambilan_Pembangunan:{no:['No'],tgl:['Tanggal'],bidang:['Bidang'],nama:['Nama'],material:['Material','Nama Material','Deskripsi'],sn:['SN','SN (Qty)','Serial Number'],lokasi:['Lokasi'],ket:['Keterangan','Ket']},
    Master_SN:{kode:['Kode Material','Material'],nama:['Deskripsi Material','Material Description'],valtype:['Valtype','Batch'],plnt:['Plnt'],sloc:['SLoc'],sn:['Serial Number','SN'],ket:['Keterangan','Ket'],lokasi:['Lokasi']}
  };
  const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const map=aliases[sheet]||{};
  for(const [key,list] of Object.entries(map)) if(list.some(x=>norm(x)===norm(header))) return key;
  return '';
}
function onOpen(){ SpreadsheetApp.getUi().createMenu('Gudang Inventory Sync').addItem('Siapkan sinkronisasi dua arah','setupInventorySync').addItem('Tarik data Neon sekarang','syncNeonToSheets').addToUi(); }
