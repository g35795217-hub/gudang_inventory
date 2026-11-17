/**
 * Gudang Inventory — Google Apps Script bridge (Arsitektur A)
 * Spreadsheet -> Neon melalui endpoint Vercel.
 *
 * SETUP:
 * 1) Isi VERCEL_API_URL dan SYNC_SECRET pada Script Properties.
 * 2) Jalankan setupInventorySync() sekali dan berikan izin.
 * 3) Jalankan bootstrapSheetsToNeon() sekali untuk kirim isi sheet ke Neon.
 *
 * Catatan: jangan hapus kolom _WEB_ID. Kolom ini dipakai sebagai ID stabil.
 */
const SHEET_NAMES = [
  'Data_Barang','Barang_Masuk','Barang_Keluar','Pengambilan_Ritel',
  'Pengambilan_Ggn','Pengambilan_ICRM','Pengambilan_Aktivasi',
  'Pengambilan_HAR','Pengambilan_Pembangunan','Master_SN'
];
const META_HEADER = '_WEB_ID';

function props_() {
  const p = PropertiesService.getScriptProperties();
  const url = (p.getProperty('VERCEL_API_URL') || '').replace(/\/+$/, '');
  const secret = p.getProperty('SYNC_SECRET') || '';
  if (!url || !secret) throw new Error('Isi VERCEL_API_URL dan SYNC_SECRET di Project Settings > Script Properties.');
  return {url, secret};
}

function setupInventorySync() {
  const ss = SpreadsheetApp.getActive();
  SHEET_NAMES.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) throw new Error('Sheet tidak ditemukan: ' + name);
    const lastCol = Math.max(sh.getLastColumn(), 1);
    const headers = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    if (!headers.includes(META_HEADER)) {
      sh.getRange(1, lastCol + 1).setValue(META_HEADER);
      sh.hideColumns(lastCol + 1);
    }
  });
  // Hindari trigger ganda.
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'inventoryOnEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('inventoryOnEdit').forSpreadsheet(ss).onEdit().create();
  SpreadsheetApp.getUi().alert('Kolom ID dan trigger sinkronisasi berhasil disiapkan. Jalankan bootstrapSheetsToNeon() berikutnya.');
}

function inventoryOnEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  const name = sh.getName();
  if (!SHEET_NAMES.includes(name) || e.range.getRow() === 1) return;
  // Abaikan perubahan pada kolom metadata internal.
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
  const metaCol = headers.indexOf(META_HEADER) + 1;
  if (e.range.getColumn() === metaCol) return;
  const row = e.range.getRow();
  const values = sh.getRange(row, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const data = {};
  headers.forEach((h,i) => { if (h && h !== META_HEADER) data[h] = values[i]; });
  const webId = values[metaCol - 1] || '';
  post_('/api/sheets-sync', {action:'upsert', sheet:name, rowNumber:row, webId:webId, headers:headers, data:data});
}

function bootstrapSheetsToNeon() {
  const ss = SpreadsheetApp.getActive();
  SHEET_NAMES.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) throw new Error('Sheet tidak ditemukan: ' + name);
    const values = sh.getDataRange().getDisplayValues();
    if (values.length < 2) return;
    const headers = values[0];
    const metaCol = headers.indexOf(META_HEADER);
    const rows = [];
    for (let r=1; r<values.length; r++) {
      if (values[r].every(v => String(v).trim() === '')) continue;
      const data = {};
      headers.forEach((h,c) => { if (h && h !== META_HEADER) data[h] = values[r][c]; });
      rows.push({rowNumber:r+1, webId:metaCol >= 0 ? values[r][metaCol] : '', headers:headers, data:data});
    }
    // Batch kecil agar Apps Script tidak melewati batas payload/waktu.
    for (let i=0; i<rows.length; i+=100) {
      post_('/api/sheets-sync', {action:'bootstrap', sheet:name, rows:rows.slice(i,i+100)});
    }
  });
  SpreadsheetApp.getUi().alert('Pengiriman data awal selesai. Periksa log eksekusi dan status API Vercel.');
}

function post_(path, payload) {
  const p = props_();
  const body = JSON.stringify(payload);
  const signature = Utilities.computeHmacSha256Signature(body, p.secret)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
  const response = UrlFetchApp.fetch(p.url + path, {
    method:'post', contentType:'application/json', payload:body,
    headers:{'x-inventory-signature':signature}, muteHttpExceptions:true
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error('Vercel API ' + status + ': ' + response.getContentText());
  return JSON.parse(response.getContentText() || '{}');
}

/** Menu bantuan saat spreadsheet dibuka. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Gudang Inventory Sync')
    .addItem('Siapkan sinkronisasi', 'setupInventorySync')
    .addItem('Kirim data awal ke website', 'bootstrapSheetsToNeon')
    .addToUi();
}
