/*!
 * SAW Calculator Engine — ekspor & impor berkas: XLSX (tanpa pustaka, rumus hidup), CSV, PNG/SVG, PDF (jsPDF), DOCX
 * (c) 2026 Alfredo Garcia — MIT License
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./saw-core.js'), require('./model.js'));
  else root.SawExport = factory(root.SawCore, root.SawModel);
}(typeof self !== 'undefined' ? self : this, function (T, M) {
  'use strict';

  const TOOL_URL = 'https://edgarcia-id.github.io/saw-calculator-engine-v2/';
  const TOOL_NAME = 'SAW Calculator Engine';

  /* ------------------------------------------------------------------ *
   * Unduh berkas
   * ------------------------------------------------------------------ */

  function download(filename, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function safeFileName(s, ext) {
    const base = String(s || 'saw').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'saw';
    return base + (ext ? '.' + ext : '');
  }

  /* ------------------------------------------------------------------ *
   * CSV
   * ------------------------------------------------------------------ */

  /** CSV dengan BOM. Pemisah ';' bila desimal koma (Excel Indonesia), ',' bila desimal titik. */
  function csvString(rows, decimalSep) {
    const sep = decimalSep === ',' ? ';' : ',';
    const q = (v) => {
      if (v === null || v === undefined) return '';
      let s = typeof v === 'number' ? (isFinite(v) ? String(+v.toPrecision(15)) : '') : String(v);
      if (typeof v === 'number' && decimalSep === ',') s = s.replace('.', ',');
      return new RegExp('["\\n\\r' + sep + ']').test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '﻿' + rows.map((r) => r.map(q).join(sep)).join('\r\n') + '\r\n';
  }

  function resultRows(R) {
    const p = R.project, res = R.comp.res;
    const rows = [['Peringkat', 'Alternatif', 'V'].concat(p.criteria.map((k) => 'w·r ' + k.name))];
    res.order.forEach((i) => rows.push([res.rank[i], p.alternatives[i].name, res.S[i]].concat(res.V[i])));
    return rows;
  }

  /* ------------------------------------------------------------------ *
   * ZIP (store) + XLSX minimal
   * ------------------------------------------------------------------ */

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zip(files) {
    const enc = new TextEncoder();
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const locals = [], centrals = [];
    let offset = 0;
    for (const file of files) {
      const name = enc.encode(file.name);
      const data = typeof file.data === 'string' ? enc.encode(file.data) : file.data;
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      locals.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      centrals.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = centrals.reduce((s, b) => s + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const parts = locals.concat(centrals, [new Uint8Array(end.buffer)]);
    const total = parts.reduce((s, b) => s + b.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const b of parts) { out.set(b, o); o += b.length; }
    return out;
  }
  const S = { normal: 0, bold: 1, title: 2, note: 3, th: 4, num: 5, pct: 6, td: 7, numb: 8, pctb: 9, n4: 10, int: 11, tdb: 12, inNum: 13, inPct: 14, inTxt: 15 };

  function stylesXml(decimals) {
    const d = Math.max(0, Math.min(6, decimals === undefined ? 2 : decimals));
    const numFmt = '#,##0' + (d ? '.' + '0'.repeat(d) : '');
    const pctFmt = '0' + (d ? '.' + '0'.repeat(d) : '') + '%';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<numFmts count="3"><numFmt numFmtId="164" formatCode="${numFmt}"/><numFmt numFmtId="165" formatCode="${pctFmt}"/><numFmt numFmtId="166" formatCode="0.000000"/></numFmts>` +
      '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="14"/><color rgb="FF312E81"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/></font></fonts>' +
      '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE0E7FF"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFD1FAE5"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="16">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
      '<xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="165" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
      '<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="165" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>' +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  }

  function xmlEsc(s) {
    return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function colName(i) {
    let s = '';
    i += 1;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  function ref(r, c, absCol, absRow) { return (absCol ? '$' : '') + colName(c) + (absRow ? '$' : '') + (r + 1); }

  function sheetXml(sheet) {
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    xml += sheet.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    if (sheet.cols && sheet.cols.length) xml += '<cols>' + sheet.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
    xml += '<sheetData>';
    sheet.rows.forEach((row, r) => {
      if (!row || !row.length) return;
      let cells = '';
      row.forEach((cell, c) => {
        if (cell === null || cell === undefined || cell === '') return;
        const o = typeof cell === 'object' ? cell : { v: cell };
        const at = ref(r, c);
        const st = o.s !== undefined ? ` s="${o.s}"` : (typeof o.v === 'number' ? ' s="0"' : '');
        if (o.f) {
          const isStr = typeof o.v === 'string';
          const v = typeof o.v === 'number' && isFinite(o.v) ? `<v>${o.v}</v>` : isStr ? `<v>${xmlEsc(o.v)}</v>` : '';
          cells += `<c r="${at}"${st}${isStr ? ' t="str"' : ''}><f>${xmlEsc(o.f)}</f>${v}</c>`;
        } else if (typeof o.v === 'number') {
          if (isFinite(o.v)) cells += `<c r="${at}"${st}><v>${o.v}</v></c>`;
        } else if (o.v !== undefined && o.v !== null && o.v !== '') {
          cells += `<c r="${at}"${st} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(o.v)}</t></is></c>`;
        } else if (o.s !== undefined) cells += `<c r="${at}"${st}/>`;
      });
      if (cells) xml += `<row r="${r + 1}">${cells}</row>`;
    });
    xml += '</sheetData>';
    if (sheet.validations && sheet.validations.length) {
      xml += `<dataValidations count="${sheet.validations.length}">` + sheet.validations.map((v) => `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="${xmlEsc(v.title || 'Pilih nilai')}" error="${xmlEsc(v.error || 'Pilih salah satu nilai dari daftar atau kosongkan sel.')}" sqref="${v.sqref}"><formula1>${v.range ? v.range : xmlEsc('"' + v.list.join(',') + '"')}</formula1></dataValidation>`).join('') + '</dataValidations>';
    }
    xml += '</worksheet>';
    return xml;
  }

  function uniqueSheetName(name, used) {
    let base = String(name).replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
    let n = base, k = 2;
    while (used.has(n.toLowerCase())) { const suf = ' (' + k++ + ')'; n = base.slice(0, 31 - suf.length) + suf; }
    used.add(n.toLowerCase());
    return n;
  }

  function buildXlsx(sheets) {
    const used = new Set();
    const named = sheets.map((s) => Object.assign({}, s, { name: uniqueSheetName(s.name, used) }));
    const files = [];
    files.push({
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        named.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>'
    });
    files.push({
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'
    });
    files.push({
      name: 'docProps/core.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:title>${xmlEsc(sheets.title || 'Analisis SAW')}</dc:title><dc:creator>${TOOL_NAME}</dc:creator>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`
    });
    files.push({
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<bookViews><workbookView/></bookViews><sheets>' +
        named.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'
    });
    files.push({
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        named.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
    });
    files.push({ name: 'xl/styles.xml', data: stylesXml(sheets.decimals) });
    named.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) }));
    return zip(files);
  }

  /* ------------------------------------------------------------------ *
   * Baca .xlsx (untuk impor data) — ZIP + DecompressionStream, tanpa pustaka
   * ------------------------------------------------------------------ */

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') throw new Error('Browser ini belum bisa membaca .xlsx. Simpan sebagai CSV atau salin-tempel tabelnya.');
    const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(ds).arrayBuffer());
  }

  function unzipIndex(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Berkas bukan .xlsx yang valid.');
    const count = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const files = {};
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true);
      const nlen = dv.getUint16(off + 28, true), elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
      files[dec.decode(u8.subarray(off + 46, off + 46 + nlen))] = { method, csize, lho };
      off += 46 + nlen + elen + clen;
    }
    async function read(name) {
      const f = files[name];
      if (!f) return null;
      const start = f.lho + 30 + dv.getUint16(f.lho + 26, true) + dv.getUint16(f.lho + 28, true);
      const data = u8.subarray(start, start + f.csize);
      if (f.method === 0) return dec.decode(data);
      if (f.method === 8) return dec.decode(await inflateRaw(data));
      throw new Error('Metode kompresi .xlsx tidak didukung.');
    }
    return { files, read };
  }

  /** Baca sheet "Data" (atau sheet pertama) sebagai grid. Sel angka tetap number. */
  async function readXlsx(buf) {
    const z = unzipIndex(buf);
    const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
    const tags = (doc, name) => Array.from(doc.getElementsByTagNameNS('*', name));
    const wbText = await z.read('xl/workbook.xml');
    if (!wbText) throw new Error('Berkas bukan .xlsx yang valid.');
    const wb = parse(wbText);
    const rels = parse((await z.read('xl/_rels/workbook.xml.rels')) || '<Relationships/>');
    const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const sheets = tags(wb, 'sheet').map((s) => ({ name: s.getAttribute('name') || '', rid: s.getAttributeNS(R_NS, 'id') || s.getAttribute('r:id') }));
    if (!sheets.length) throw new Error('Tidak ada sheet di berkas ini.');
    const target = (rid) => {
      const r = tags(rels, 'Relationship').find((x) => x.getAttribute('Id') === rid);
      let t = r ? r.getAttribute('Target') : null;
      if (!t) return null;
      t = t.replace(/^\//, '');
      return t.startsWith('xl/') ? t : 'xl/' + t;
    };
    const pick = sheets.find((s) => /^\s*(data|matriks|matriks keputusan)\s*$/i.test(s.name)) || sheets.find((s) => /^data\b/i.test(s.name)) || sheets[0];
    const ssText = await z.read('xl/sharedStrings.xml');
    const shared = ssText ? tags(parse(ssText), 'si').map((si) => tags(si, 't').map((t) => t.textContent).join('')) : [];
    const path = target(pick.rid) || 'xl/worksheets/sheet1.xml';
    const sheetText = await z.read(path);
    if (!sheetText) throw new Error('Sheet "' + pick.name + '" tidak dapat dibaca.');
    const grid = [];
    for (const c of tags(parse(sheetText), 'c')) {
      const m = /^([A-Z]+)(\d+)$/.exec(c.getAttribute('r') || '');
      if (!m) continue;
      const col = m[1].split('').reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1, row = Number(m[2]) - 1;
      const t = c.getAttribute('t');
      const vEl = tags(c, 'v')[0];
      const v = vEl ? vEl.textContent : null;
      let val;
      if (t === 's') val = shared[Number(v)] || '';
      else if (t === 'inlineStr') val = tags(c, 't').map((x) => x.textContent).join('');
      else if (t === 'str' || t === 'e') val = v || '';
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else val = v === null || v === '' ? '' : Number(v);
      (grid[row] = grid[row] || [])[col] = val;
    }
    const out = [];
    for (let i = 0; i < grid.length; i++) {
      const r = grid[i] || [];
      const row = [];
      for (let j = 0; j < r.length; j++) row.push(r[j] === undefined ? '' : r[j]);
      out.push(row);
    }
    return { sheet: pick.name, sheets: sheets.map((s) => s.name), grid: out };
  }

  /* ------------------------------------------------------------------ *
   * Isi workbook dari laporan (rumus hidup)
   * ------------------------------------------------------------------ */

  const th = (v) => ({ v, s: S.th });
  const td = (v) => ({ v, s: S.td });
  const tdb = (v) => ({ v, s: S.tdb });
  const nm = (v) => ({ v, s: S.num });
  const fx = (f, v, s) => ({ f, v, s: s === undefined ? S.num : s });
  const qs = (name) => "'" + String(name).replace(/'/g, "''") + "'";
  const sref = (sheet, r, c, aC, aR) => qs(sheet) + '!' + ref(r, c, aC, aR);
  const rng = (r1, c1, r2, c2, abs) => ref(r1, c1, abs, abs) + ':' + ref(r2, c2, abs, abs);
  const srng = (sheet, r1, c1, r2, c2) => qs(sheet) + '!' + rng(r1, c1, r2, c2, true);
  const typeTxt = (k) => (k.type === 'cost' ? 'Cost' : 'Benefit');

  const NORM_XL = {
    classic: 'Normalisasi SAW klasik: benefit r = x / maks x; cost r = min x / x',
    minmax: 'Normalisasi min–maks: benefit r = (x − min)/(maks − min); cost r = (maks − x)/(maks − min)',
    sum: 'Normalisasi jumlah: benefit r = x / Σx; cost r = (1/x) / Σ(1/x)'
  };

  function workbookFromReport(R) {
    const p = R.project, c = R.comp, res = c.res, wInfo = c.weights;
    const crit = p.criteria, alts = p.alternatives, experts = p.experts;
    const n = crit.length, m = alts.length, K = experts.length;
    const X = c.X, w = res.w;
    const method = wInfo.method;
    const sheets = [];
    sheets.decimals = p.settings.decimals;
    const used = new Set();
    const nameOf = (s) => uniqueSheetName(s, used);
    const bestIdx = res.order[0];
    const header = (corner, extra) => [th(corner)].concat(crit.map((k) => th(k.name)), (extra || []).map(th));

    // Nama sheet ditetapkan lebih dulu agar rumus lintas sheet konsisten.
    const SUM_SH = nameOf('Ringkasan');
    const dataNames = experts.map((e, k) => nameOf(K === 1 ? 'Data' : `Data P${k + 1} ${e.name}`));
    const SUB = c.hasCrips ? nameOf('Sub-kriteria') : null;
    const RAT = c.hasCrips || K > 1 ? nameOf(K > 1 ? 'Rating & gabungan' : 'Rating') : null;
    const WSH = method === 'entropy' ? nameOf('Bobot Entropy') : method === 'critic' ? nameOf('Bobot CRITIC') : method === 'ahp' ? nameOf('Bobot AHP') : null;
    const CALC = nameOf('Perhitungan');
    const DATA0 = dataNames[0];
    const dataType = (j) => sref(DATA0, 1, 1 + j, true, true);

    // --- Ringkasan (statis)
    const rs = [];
    rs.push([{ v: p.meta.title, s: S.title }]);
    rs.push([{ v: 'Laporan SAW (Simple Additive Weighting) — ' + R.dateLabel, s: S.note }]);
    rs.push([]);
    const meta = [];
    if (p.meta.author) meta.push(['Disusun oleh', p.meta.author]);
    meta.push(['Metode bobot', M.WEIGHT_METHODS[method].short], ['Normalisasi', T.NORMALIZATIONS[res.normalization].label], ['Jumlah kriteria', n], ['Jumlah alternatif', m]);
    if (K > 1) meta.push(['Penilai', `${K} (${experts.map((e) => e.name).join(', ')}) — ${T.AGGREGATIONS[c.aggregation].label.toLowerCase()}`]);
    if (method === 'ahp' && wInfo.info) meta.push(['CR perbandingan AHP', +wInfo.info.CR.toFixed(6)]);
    meta.forEach(([k, v]) => rs.push([{ v: k, s: S.bold }, typeof v === 'number' ? { v, s: S.normal } : v]));
    rs.push([]);
    rs.push([{ v: R.conclusion, s: S.bold }]);
    rs.push([]);
    rs.push([th('Peringkat'), th('Alternatif'), th('V')]);
    res.order.forEach((i) => {
      const best = i === bestIdx;
      rs.push([{ v: res.rank[i], s: S.int }, best ? tdb(alts[i].name) : td(alts[i].name), { v: res.S[i], s: best ? S.numb : S.num }]);
    });
    rs.push([{ v: `Nilai di sheet ini statis (saat diunduh). Perhitungan lengkap dengan rumus ada di sheet "${CALC}"; ubah nilai di sheet "${DATA0}"${SUB ? ` atau "${SUB}"` : ''} untuk menghitung ulang.`, s: S.note }]);
    rs.push([]);
    rs.push([th('Kriteria'), th('Jenis'), th('Satuan'), th('Sub-kriteria'), th('Bobot (w)')]);
    crit.forEach((k, j) => rs.push([td(k.name), td(typeTxt(k)), td(k.unit || ''), td(k.crips.mode === 'none' ? '–' : `${k.crips.items.length} (${k.crips.mode === 'range' ? 'rentang' : 'label'})`), { v: w[j], s: S.pct }]));
    rs.push([]);
    rs.push([{ v: `Dihitung dengan ${TOOL_NAME} — ${TOOL_URL}`, s: S.note }]);
    sheets.push({ name: SUM_SH, rows: rs, cols: [26, 34, 16, 18, 14] });

    // --- Sub-kriteria (isian kuning; rumus Rating merujuk ke sini)
    const subRef = {};
    let subSheet = null;
    if (SUB) {
      const ss = [];
      ss.push([{ v: 'Tabel sub-kriteria (crips)', s: S.title }]);
      ss.push([{ v: 'Sel kuning dapat diubah. Rentang: batas inklusif; kosong = tanpa batas; bila tumpang tindih, baris yang lebih atas dipakai. Label: teks harus sama dengan isi sheet Data (huruf besar/kecil tidak dibedakan).', s: S.note }]);
      ss.push([]);
      crit.forEach((k, j) => {
        if (k.crips.mode === 'none') return;
        const isR = k.crips.mode === 'range';
        ss.push([{ v: `C${j + 1} ${k.name}`, s: S.bold }, { v: isR ? 'konversi rentang nilai' : 'konversi pilihan (label)', s: S.note }]);
        ss.push([th('No'), th(isR ? 'Keterangan' : 'Label'), th('Batas bawah (≥)'), th('Batas atas (≤)'), th('Nilai')]);
        const r0 = ss.length;
        k.crips.items.forEach((it, s) => ss.push([{ v: s + 1, s: S.int }, { v: it.label || '', s: isR ? S.td : S.inTxt },
          isR ? { v: it.min === null ? undefined : it.min, s: S.inNum } : td(''), isR ? { v: it.max === null ? undefined : it.max, s: S.inNum } : td(''), { v: it.value, s: S.inNum }]));
        subRef[j] = { r0, r1: ss.length - 1, mode: k.crips.mode };
        ss.push([]);
      });
      subSheet = { name: SUB, rows: ss, cols: [8, 30, 16, 16, 12] };
    }

    // --- Data per penilai (bisa diimpor kembali)
    const labelValidation = (j, r0, r1) => {
      const sr = subRef[j];
      return { sqref: `${ref(r0, 1 + j)}:${ref(r1, 1 + j)}`, range: srng(SUB, sr.r0, 1, sr.r1, 1), title: 'Pilih sub-kriteria', error: 'Pilih salah satu label dari sheet Sub-kriteria atau kosongkan sel.' };
    };
    experts.forEach((e, ek) => {
      const me = c.mats.byExpert[ek];
      const ds = [];
      const first = ek === 0;
      ds.push([th('Alternatif')].concat(crit.map((k) => th(k.name))));
      ds.push([tdb('Jenis')].concat(crit.map((k) => ({ v: typeTxt(k), s: first ? S.inTxt : S.td }))));
      ds.push([tdb('Bobot')].concat(crit.map((k, j) => ({ v: method === 'manual' ? k.weight : +(w[j] * 100).toPrecision(12), s: first && method === 'manual' ? S.inNum : S.td }))));
      ds.push([tdb('Satuan')].concat(crit.map((k) => td(k.unit || ''))));
      alts.forEach((a, i) => ds.push([td(a.name)].concat(crit.map((k, j) => { const v = me.raw[i][j]; return { v: v === null ? undefined : v, s: typeof v === 'string' ? S.inTxt : S.inNum }; }))));
      const validations = [];
      if (first) validations.push({ sqref: `${ref(1, 1)}:${ref(1, n)}`, list: ['Benefit', 'Cost'], title: 'Jenis kriteria', error: 'Isi Benefit atau Cost.' });
      crit.forEach((k, j) => { if (k.crips.mode === 'label' && subRef[j]) validations.push(labelValidation(j, 4, 3 + m)); });
      sheets.push({ name: dataNames[ek], rows: ds, cols: [28].concat(crit.map(() => 18)), validations, freeze: 1 });
    });
    if (subSheet) sheets.push(subSheet);

    // --- Rating (konversi sub-kriteria) dan gabungan penilai
    let xBlock = { sheet: DATA0, r0: 4 };
    if (RAT) {
      const rr = [];
      rr.push([{ v: K > 1 ? 'Rating setiap penilai dan matriks gabungan' : 'Rating hasil konversi sub-kriteria', s: S.title }]);
      rr.push([{ v: 'Semua sel berisi rumus dari sheet Data' + (SUB ? ' dan Sub-kriteria' : '') + '. Bila sel menampilkan galat N/A, nilai data tidak cocok dengan sub-kriteria mana pun.', s: S.note }]);
      rr.push([]);
      const blocks = [];
      experts.forEach((e, ek) => {
        const me = c.mats.byExpert[ek];
        if (K > 1) rr.push([{ v: `Penilai ${ek + 1}: ${e.name}`, s: S.bold }]);
        rr.push(header('Alternatif'));
        const r0 = rr.length;
        alts.forEach((a, i) => rr.push([{ f: sref(dataNames[ek], 4 + i, 0), v: a.name, s: S.td }].concat(crit.map((k, j) => {
          const x = sref(dataNames[ek], 4 + i, 1 + j);
          const val = me.X[i][j];
          const sr = subRef[j];
          if (!sr) return fx(x, val);
          const V = srng(SUB, sr.r0, 4, sr.r1, 4), L = srng(SUB, sr.r0, 1, sr.r1, 1);
          if (sr.mode === 'label') return fx(`IF(${x}="","",IFERROR(INDEX(${V},MATCH(${x},${L},0)),IF(ISNUMBER(MATCH(${x},${V},0)),${x},NA())))`, val);
          let f = 'NA()';
          for (let s = sr.r1; s >= sr.r0; s--) {
            const mn = sref(SUB, s, 2, true, true), mx = sref(SUB, s, 3, true, true), vv = sref(SUB, s, 4, true, true);
            f = `IF(AND(OR(${mn}="",${x}>=${mn}),OR(${mx}="",${x}<=${mx})),${vv},${f})`;
          }
          return fx(`IF(${x}="","",${f})`, val);
        }))));
        blocks.push(r0);
        rr.push([]);
      });
      if (K > 1) {
        const geo = c.aggregation === 'geo';
        rr.push([{ v: `Matriks gabungan (${T.AGGREGATIONS[c.aggregation].label.toLowerCase()})`, s: S.bold }]);
        rr.push(header('Alternatif'));
        const r0 = rr.length;
        alts.forEach((a, i) => rr.push([{ f: ref(blocks[0] + i, 0), v: a.name, s: S.td }].concat(crit.map((_, j) => fx(`${geo ? 'GEOMEAN' : 'AVERAGE'}(${blocks.map((b) => ref(b + i, 1 + j)).join(',')})`, X[i][j], S.numb)))));
        xBlock = { sheet: RAT, r0 };
      } else xBlock = { sheet: RAT, r0: blocks[0] };
      sheets.push({ name: RAT, rows: rr, cols: [28].concat(crit.map(() => 16)) });
    }
    const xCell = (i, j) => sref(xBlock.sheet, xBlock.r0 + i, 1 + j);
    const xCol = (j) => srng(xBlock.sheet, xBlock.r0, 1 + j, xBlock.r0 + m - 1, 1 + j);
    const xLabel = xBlock.sheet === DATA0 ? `sheet ${DATA0}` : `sheet ${xBlock.sheet}`;

    // --- Lembar bobot (rumus) bila metode objektif / AHP
    let weightRef = null, rawLabel = `Bobot awal (sheet ${DATA0})`;
    if (method === 'entropy') {
      const e = wInfo.info;
      const rows = [];
      rows.push([{ v: 'Pembobotan Entropy (Shannon)', s: S.title }]);
      rows.push([{ v: `p = x / Σx;  e = −(1/ln m) Σ p·ln p;  d = 1 − e;  w = d / Σd.  Nilai x diambil dari ${xLabel}.`, s: S.note }]);
      rows.push([]);
      rows.push([{ v: '1. Jumlah nilai per kriteria', s: S.bold }]);
      rows.push(header(''));
      const rSum = rows.length;
      rows.push([td('Σx')].concat(crit.map((_, j) => fx(`SUM(${xCol(j)})`, e.colSum[j]))));
      rows.push([]);
      rows.push([{ v: '2. Proporsi p = x / Σx', s: S.bold }]);
      rows.push(header('Alternatif'));
      const rP0 = rows.length;
      alts.forEach((a, i) => rows.push([td(a.name)].concat(crit.map((_, j) => { const s = ref(rSum, 1 + j, false, true); return fx(`IF(${s}=0,0,${xCell(i, j)}/${s})`, e.P[i][j], S.n4); }))));
      rows.push([]);
      rows.push([{ v: '3. p · ln p', s: S.bold }]);
      rows.push(header('Alternatif'));
      const rL0 = rows.length;
      alts.forEach((a, i) => rows.push([td(a.name)].concat(crit.map((_, j) => { const pc0 = ref(rP0 + i, 1 + j); const pv = e.P[i][j]; return fx(`IF(${pc0}<=0,0,${pc0}*LN(${pc0}))`, pv > 0 ? pv * Math.log(pv) : 0, S.n4); }))));
      rows.push([]);
      rows.push([{ v: '4. Entropi, derajat divergensi, dan bobot', s: S.bold }]);
      rows.push(header(''));
      const rE = rows.length;
      rows.push([td('e = −Σ(p ln p) / ln m')].concat(crit.map((_, j) => fx(`IF(${ref(rSum, 1 + j)}=0,1,-SUM(${rng(rL0, 1 + j, rL0 + m - 1, 1 + j)})/LN(${m}))`, e.E[j], S.n4))));
      const rD = rows.length;
      rows.push([td('d = 1 − e')].concat(crit.map((_, j) => fx(`1-${ref(rE, 1 + j)}`, e.D[j], S.n4))));
      const rWe = rows.length;
      const dRow = rng(rD, 1, rD, n, true);
      rows.push([tdb('w = d / Σd')].concat(crit.map((_, j) => fx(`IF(SUM(${dRow})=0,1/${n},${ref(rD, 1 + j)}/SUM(${dRow}))`, w[j], S.numb))));
      sheets.push({ name: WSH, rows, cols: [26].concat(crit.map(() => 16)) });
      weightRef = (j) => sref(WSH, rWe, 1 + j);
      rawLabel = `Bobot Entropy (sheet ${WSH})`;
    } else if (method === 'critic') {
      const k = wInfo.info;
      const rows = [];
      rows.push([{ v: 'Pembobotan CRITIC (Diakoulaki dkk., 1995)', s: S.title }]);
      rows.push([{ v: 'N = (x − min)/(maks − min) untuk benefit, (maks − x)/(maks − min) untuk cost; σ = simpangan baku sampel; r = korelasi Pearson; C = σ·Σ(1 − r); w = C / ΣC.', s: S.note }]);
      rows.push([]);
      rows.push([{ v: '1. Nilai minimum dan maksimum', s: S.bold }]);
      rows.push(header(''));
      const rMin = rows.length;
      rows.push([td('min')].concat(crit.map((_, j) => fx(`MIN(${xCol(j)})`, k.mins[j]))));
      const rMax = rows.length;
      rows.push([td('maks')].concat(crit.map((_, j) => fx(`MAX(${xCol(j)})`, k.maxs[j]))));
      rows.push([]);
      rows.push([{ v: '2. Matriks ternormalisasi N', s: S.bold }]);
      rows.push(header('Alternatif'));
      const rN0 = rows.length;
      alts.forEach((a, i) => rows.push([td(a.name)].concat(crit.map((_, j) => {
        const mn = ref(rMin, 1 + j, false, true), mx = ref(rMax, 1 + j, false, true), x = xCell(i, j);
        return fx(`IF(${mx}-${mn}=0,0,IF(${dataType(j)}="Cost",(${mx}-${x})/(${mx}-${mn}),(${x}-${mn})/(${mx}-${mn})))`, k.N[i][j], S.n4);
      }))));
      const nCol = (j) => rng(rN0, 1 + j, rN0 + m - 1, 1 + j, true);
      rows.push([]);
      rows.push([{ v: '3. Simpangan baku (σ)', s: S.bold }]);
      rows.push(header(''));
      const rSig = rows.length;
      rows.push([td('σ')].concat(crit.map((_, j) => fx(`STDEV(${nCol(j)})`, k.sigma[j], S.n4))));
      rows.push([]);
      rows.push([{ v: '4. Matriks korelasi (r) dan konflik Σ(1 − r)', s: S.bold }]);
      rows.push(header('', ['Σ(1 − r)']));
      const rC0 = rows.length;
      crit.forEach((kk, j) => rows.push([td(kk.name)].concat(crit.map((_, l) => fx(`IFERROR(CORREL(${nCol(j)},${nCol(l)}),0)`, k.corr[j][l], S.n4)), [fx(`${n}-SUM(${rng(rC0 + j, 1, rC0 + j, n)})`, T.sum(k.corr[j].map((r) => 1 - r)), S.n4)])));
      rows.push([]);
      rows.push([{ v: '5. Jumlah informasi (C) dan bobot', s: S.bold }]);
      rows.push(header(''));
      const rCj = rows.length;
      rows.push([td('C = σ · Σ(1 − r)')].concat(crit.map((_, j) => fx(`${ref(rSig, 1 + j)}*${ref(rC0 + j, 1 + n)}`, k.C[j], S.n4))));
      const rWc = rows.length;
      const cRow = rng(rCj, 1, rCj, n, true);
      rows.push([tdb('w = C / ΣC')].concat(crit.map((_, j) => fx(`IF(SUM(${cRow})=0,1/${n},${ref(rCj, 1 + j)}/SUM(${cRow}))`, w[j], S.numb))));
      sheets.push({ name: WSH, rows, cols: [26].concat(crit.map(() => 16), [14]) });
      weightRef = (j) => sref(WSH, rWc, 1 + j);
      rawLabel = `Bobot CRITIC (sheet ${WSH})`;
    } else if (method === 'ahp') {
      const a = wInfo.info;
      const rows = [];
      rows.push([{ v: 'Pembobotan AHP (perbandingan berpasangan kriteria)', s: S.title }]);
      rows.push([{ v: 'Segitiga atas = penilaian skala Saaty 1–9; segitiga bawah = 1/nilai (rumus). Bobot w = vektor eigen utama (nilai dari aplikasi); NCA, λ maks, CI, dan CR dihitung dengan rumus.' + (a.missing ? ` ${a.missing} penilaian kosong dilengkapi metode Harker.` : ''), s: S.note }]);
      rows.push([]);
      rows.push([{ v: '1. Matriks perbandingan berpasangan A', s: S.bold }]);
      rows.push(header(''));
      const rA0 = rows.length;
      crit.forEach((kk, i) => rows.push([td(kk.name)].concat(crit.map((_, j) => (i === j ? { v: 1, s: S.td } : i < j ? { v: a.full[i][j], s: S.n4 } : fx(`1/${ref(rA0 + j, 1 + i)}`, a.full[i][j], S.n4))))));
      const rSum = rows.length;
      rows.push([tdb('Jumlah kolom')].concat(crit.map((_, j) => fx(`SUM(${rng(rA0, 1 + j, rA0 + n - 1, 1 + j)})`, a.colSums[j], S.n4))));
      rows.push([]);
      rows.push([{ v: '2. Normalisasi kolom dan rata-rata baris (NCA)', s: S.bold }]);
      rows.push(header('', ['Rata-rata baris']));
      const rN0 = rows.length;
      crit.forEach((kk, i) => rows.push([td(kk.name)].concat(crit.map((_, j) => fx(`${ref(rA0 + i, 1 + j)}/${ref(rSum, 1 + j, false, true)}`, a.normalized[i][j], S.n4)), [fx(`AVERAGE(${rng(rN0 + i, 1, rN0 + i, n)})`, a.nca[i], S.n4)])));
      rows.push([]);
      rows.push([{ v: '3. Vektor eigen utama (w) dan uji konsistensi', s: S.bold }]);
      rows.push(header(''));
      const rW = rows.length;
      rows.push([tdb('w (vektor eigen)')].concat(crit.map((_, j) => ({ v: a.w[j], s: S.numb }))));
      rows.push([]);
      rows.push([th('Kriteria'), th('A·w'), th('(A·w)/w')]);
      const rAw0 = rows.length;
      const wRowAbs = rng(rW, 1, rW, n, true);
      crit.forEach((kk, i) => rows.push([td(kk.name), fx(`SUMPRODUCT(${rng(rA0 + i, 1, rA0 + i, n)},${wRowAbs})`, a.Aw[i], S.n4), fx(`${ref(rAw0 + i, 1)}/${ref(rW, 1 + i, false, true)}`, a.cv[i], S.n4)]));
      const rLam = rows.length;
      rows.push([tdb('λ maks'), fx(`AVERAGE(${rng(rAw0, 2, rAw0 + n - 1, 2)})`, a.lambdaMax, S.n4)]);
      const rCI = rows.length;
      rows.push([tdb('CI = (λ maks − n)/(n − 1)'), fx(n > 2 ? `MAX(0,(${ref(rLam, 1)}-${n})/(${n}-1))` : '0', a.CI, S.n4)]);
      const rRI = rows.length;
      rows.push([tdb('RI (Saaty)'), { v: a.RI, s: S.n4 }]);
      rows.push([tdb('CR = CI / RI'), fx(`IF(${ref(rRI, 1)}=0,0,${ref(rCI, 1)}/${ref(rRI, 1)})`, a.CR, S.numb)]);
      rows.push([{ v: 'Penilaian dianggap konsisten bila CR ≤ 0,10.', s: S.note }]);
      sheets.push({ name: WSH, rows, cols: [30].concat(crit.map(() => 15), [15]) });
      weightRef = (j) => sref(WSH, rW, 1 + j);
      rawLabel = `Bobot AHP (sheet ${WSH})`;
    }

    // --- Perhitungan (rumus hidup)
    const cs = [];
    const norm = res.normalization;
    cs.push([{ v: 'Langkah perhitungan SAW', s: S.title }]);
    cs.push([{ v: `${NORM_XL[norm]}. Sel berisi rumus: ubah nilai di sheet ${DATA0}${SUB ? ` atau ${SUB}` : ''}, seluruh langkah dihitung ulang otomatis.`, s: S.note }]);
    cs.push([]);
    cs.push([{ v: '1. Bobot kriteria', s: S.bold }]);
    cs.push(header('Kriteria'));
    const rType = cs.length;
    cs.push([td('Jenis')].concat(crit.map((k, j) => ({ f: dataType(j), v: typeTxt(k), s: S.td }))));
    const rRaw = cs.length;
    cs.push([td(method === 'equal' ? 'Bobot awal (sama rata)' : rawLabel)].concat(crit.map((k, j) => {
      if (method === 'manual') return { f: sref(DATA0, 2, 1 + j), v: k.weight, s: S.td };
      if (method === 'equal') return { v: 1, s: S.td };
      return fx(weightRef(j), w[j]);
    })));
    const rW = cs.length;
    const rawRow = rng(rRaw, 1, rRaw, n, true);
    cs.push([tdb('Bobot ternormalisasi w')].concat(crit.map((_, j) => fx(`${ref(rRaw, 1 + j)}/SUM(${rawRow})`, w[j], S.numb))));
    cs.push([]);

    cs.push([{ v: '2. Matriks keputusan X' + (xBlock.sheet !== DATA0 ? ` (dari sheet ${xBlock.sheet})` : ''), s: S.bold }]);
    cs.push([th('Alternatif')].concat(crit.map((k) => th(k.name + (k.unit && k.crips.mode === 'none' ? ` (${k.unit})` : '')))));
    const rX0 = cs.length;
    alts.forEach((a, i) => cs.push([{ f: sref(DATA0, 4 + i, 0), v: a.name, s: S.td }].concat(crit.map((_, j) => fx(xCell(i, j), X[i][j])))));
    const colX = (j) => rng(rX0, 1 + j, rX0 + m - 1, 1 + j, true);
    const info = res.info;
    let rA = -1, rB = -1;
    if (norm === 'classic') {
      rA = cs.length; cs.push([tdb('maks')].concat(crit.map((_, j) => fx(`MAX(${colX(j)})`, info[j].max))));
      rB = cs.length; cs.push([tdb('min')].concat(crit.map((_, j) => fx(`MIN(${colX(j)})`, info[j].min))));
    } else if (norm === 'minmax') {
      rA = cs.length; cs.push([tdb('min')].concat(crit.map((_, j) => fx(`MIN(${colX(j)})`, info[j].min))));
      rB = cs.length; cs.push([tdb('maks')].concat(crit.map((_, j) => fx(`MAX(${colX(j)})`, info[j].max))));
    } else {
      rA = cs.length; cs.push([tdb('Σx')].concat(crit.map((_, j) => fx(`SUM(${colX(j)})`, info[j].sum))));
      rB = cs.length; cs.push([tdb('Σ(1/x)')].concat(crit.map((_, j) => fx(`IFERROR(SUMPRODUCT(1/${colX(j)}),0)`, isFinite(info[j].sumInv) ? info[j].sumInv : 0))));
    }
    cs.push([]);

    cs.push([{ v: '3. Matriks ternormalisasi R', s: S.bold }]);
    cs.push(header('Alternatif'));
    const rR0 = cs.length;
    alts.forEach((a, i) => cs.push([{ f: ref(rX0 + i, 0), v: a.name, s: S.td }].concat(crit.map((_, j) => {
      const x = ref(rX0 + i, 1 + j), cost = `${ref(rType, 1 + j, false, true)}="Cost"`;
      const A = ref(rA, 1 + j, false, true), B = ref(rB, 1 + j, false, true);
      let f;
      if (norm === 'classic') f = `IF(${cost},${B}/${x},${x}/${A})`;
      else if (norm === 'minmax') f = `IF(${B}-${A}=0,1,IF(${cost},(${B}-${x})/(${B}-${A}),(${x}-${A})/(${B}-${A})))`;
      else f = `IF(${cost},(1/${x})/${B},${x}/${A})`;
      return fx(f, res.R[i][j]);
    }))));
    cs.push([]);

    cs.push([{ v: '4. Nilai preferensi V = Σ w × r dan peringkat', s: S.bold }]);
    cs.push(header('Alternatif', ['V', 'Peringkat']));
    const rV0 = cs.length;
    alts.forEach((a, i) => {
      const r = cs.length;
      const best = i === bestIdx;
      cs.push([{ f: ref(rX0 + i, 0), v: a.name, s: best ? S.tdb : S.td }].concat(
        crit.map((_, j) => fx(`${ref(rR0 + i, 1 + j)}*${ref(rW, 1 + j, false, true)}`, res.V[i][j])),
        [fx(`SUM(${rng(r, 1, r, n)})`, res.S[i], best ? S.numb : S.num), fx(`RANK(${ref(r, 1 + n)},${rng(rV0, 1 + n, rV0 + m - 1, 1 + n, true)},0)`, res.rank[i], S.int)]));
    });
    cs.push([{ v: 'Sel kriteria = w × r (kontribusi). V = jumlah kontribusi; peringkat 1 = V terbesar.', s: S.note }]);
    sheets.push({ name: CALC, rows: cs, cols: [30].concat(crit.map(() => 15), [14, 11]) });

    // --- Sensitivitas (statis)
    if (R.sensitivity && R.sensitivity.length) {
      const ss = [];
      ss.push([{ v: 'Analisis sensitivitas bobot', s: S.title }]);
      ss.push([{ v: 'Bobot satu kriteria diubah 0–100%, bobot lain diskalakan proporsional. Rentang stabil = rentang bobot ketika alternatif peringkat 1 tidak berubah.', s: S.note }]);
      ss.push([]);
      ss.push([th('Kriteria'), th('Bobot saat ini'), th('Peringkat 1'), th('Batas bawah'), th('Batas atas'), th('Di bawah batas'), th('Di atas batas')]);
      for (const s of R.sensitivity) {
        const t = s.stability;
        ss.push([td(s.name), { v: t.x0, s: S.pct }, td(alts[t.top].name), { v: t.lo, s: S.pct }, { v: t.hi, s: S.pct }, td(t.loBy !== null ? alts[t.loBy].name : '—'), td(t.hiBy !== null ? alts[t.hiBy].name : '—')]);
      }
      for (const s of R.sensitivity) {
        ss.push([]);
        ss.push([{ v: `Nilai V terhadap bobot ${s.name}`, s: S.bold }]);
        ss.push([th('Bobot')].concat(alts.map((a) => th(a.name))));
        for (let x = 0; x <= 20; x++) {
          const V = R.evaluate(T.adjustWeights(w, s.idx, x / 20));
          ss.push([{ v: x / 20, s: S.pct }].concat(V.map((v) => nm(v))));
        }
      }
      sheets.push({ name: nameOf('Sensitivitas'), rows: ss, cols: [26, 14, 24, 13, 13, 24, 24].concat(alts.map(() => 14)) });
    }

    // --- Uji ketahanan (statis)
    const us = [];
    us.push([{ v: 'Uji ketahanan hasil', s: S.title }]);
    us.push([]);
    if (R.methodCompare) {
      const av = R.methodCompare.filter((x) => x.available);
      us.push([{ v: '1. Perbandingan metode (bobot dan data sama)', s: S.bold }]);
      us.push([th('Alternatif')].concat(av.map((x) => th(x.id === 'topsis' ? 'C* TOPSIS' : 'V ' + x.label)), av.map((x) => th('Peringkat ' + x.label))));
      alts.forEach((a, i) => us.push([td(a.name)].concat(av.map((x) => nm(x.score[i])), av.map((x) => ({ v: x.rank[i], s: S.int })))));
      us.push([tdb('Korelasi Spearman vs SAW')].concat(av.map((x) => nm(x.rho))));
      for (const x of R.methodCompare.filter((y) => !y.available)) us.push([{ v: `${x.label} tidak dihitung: ${x.note}.`, s: S.note }]);
      us.push([]);
    }
    if (R.normCompare) {
      const nc = R.normCompare, av = nc.methods.filter((k) => nc.by[k].available);
      us.push([{ v: '2. Perbandingan metode normalisasi SAW', s: S.bold }]);
      us.push([th('Alternatif')].concat(av.map((k) => th('V ' + T.NORMALIZATIONS[k].label)), av.map((k) => th('Peringkat ' + T.NORMALIZATIONS[k].short))));
      alts.forEach((a, i) => us.push([td(a.name)].concat(av.map((k) => nm(nc.by[k].S[i])), av.map((k) => ({ v: nc.by[k].rank[i], s: S.int })))));
      us.push([tdb(`Korelasi Spearman vs ${T.NORMALIZATIONS[nc.ref].short}`)].concat(av.map((k) => nm(nc.by[k].rho))));
      us.push([]);
    }
    if (R.rankReversal && R.rankReversal.length) {
      us.push([{ v: '3. Uji rank reversal (hapus satu alternatif, bobot tetap)', s: S.bold }]);
      us.push([th('Alternatif dihapus'), th('Urutan baru'), th('Pasangan bertukar'), th('Peringkat 1 berubah?')]);
      for (const r of R.rankReversal) us.push([td(alts[r.removed].name), td(r.invalid ? 'tidak dapat dihitung' : r.order.map((i) => alts[i].name).join(' > ')), { v: r.flips.length, s: S.int }, td(r.topChanged ? 'Ya' : 'Tidak')]);
    }
    sheets.push({ name: nameOf('Uji ketahanan'), rows: us, cols: [30, 16, 16, 16, 14, 14, 14] });
    sheets.title = p.meta.title;
    return sheets;
  }

  /* ------------------------------------------------------------------ *
   * SVG → PNG
   * ------------------------------------------------------------------ */

  function svgToPng(svg, width, height, scale) {
    scale = scale || 2;
    return new Promise((resolve, reject) => {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          const dataUrl = canvas.toDataURL('image/png');
          canvas.toBlob((b) => resolve({ blob: b, dataUrl, width: canvas.width, height: canvas.height }), 'image/png');
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gagal merender diagram ke PNG.')); };
      img.src = url;
    });
  }

  /* ------------------------------------------------------------------ *
   * Isi laporan (PDF & Word): daftar blok
   * ------------------------------------------------------------------ */

  const NORM_TXT = {
    classic: ['rᵢⱼ = xᵢⱼ / maksᵢ xᵢⱼ  (benefit)', 'rᵢⱼ = minᵢ xᵢⱼ / xᵢⱼ  (cost)'],
    minmax: ['rᵢⱼ = (xᵢⱼ − minᵢ xᵢⱼ) / (maksᵢ xᵢⱼ − minᵢ xᵢⱼ)  (benefit)', 'rᵢⱼ = (maksᵢ xᵢⱼ − xᵢⱼ) / (maksᵢ xᵢⱼ − minᵢ xᵢⱼ)  (cost)'],
    sum: ['rᵢⱼ = xᵢⱼ / Σᵢ xᵢⱼ  (benefit)', 'rᵢⱼ = (1/xᵢⱼ) / Σᵢ (1/xᵢⱼ)  (cost)']
  };

  function reportBlocks(R) {
    const p = R.project, c = R.comp, res = c.res, wInfo = c.weights, f = R.fmt;
    const crit = p.criteria, alts = p.alternatives, K = p.experts.length;
    const n = crit.length;
    const D = p.settings.decimals;
    const v = (x) => f.num(x, D);
    const Bk = [];
    const h1 = (text) => Bk.push({ t: 'h1', text });
    const h2 = (text) => Bk.push({ t: 'h2', text });
    const para = (text, style) => Bk.push({ t: 'p', text, style });
    const formula = (text) => Bk.push({ t: 'formula', text });
    const table = (caption, head, rows, opts) => Bk.push(Object.assign({ t: 'table', caption, head, rows }, opts || {}));
    const img = (chart, caption, opts) => { if (chart) Bk.push(Object.assign({ t: 'img', chart, caption }, opts || {})); };
    const altNames = alts.map((a) => a.name);
    /** Tabel alternatif × kriteria dipecah per 6 kolom; extra = baris tambahan (tebal); tail = kolom tambahan di kanan. */
    const matrix = (caption, corner, rowNames, getter, extra, tail) => {
      const per = tail ? 5 : 6;
      for (let s0 = 0; s0 < n; s0 += per) {
        const part = crit.slice(s0, s0 + per);
        const last = s0 + per >= n;
        const rows = rowNames.map((nm0, i) => [nm0].concat(part.map((_, jj) => getter(i, s0 + jj)), last && tail ? tail.get(i) : []));
        const bold = [];
        for (const er of (extra || [])) { bold.push(rows.length); rows.push([er.label].concat(part.map((_, jj) => er.get(s0 + jj)), last && tail ? tail.head.map(() => '') : [])); }
        table(caption + (n > per ? ` (kriteria ${s0 + 1}–${s0 + part.length})` : ''), [corner].concat(part.map((k, jj) => `C${s0 + jj + 1} ${k.name}`), last && tail ? tail.head : []), rows, { bold: (tail && tail.bold ? tail.bold : []).concat(bold), fontSize: part.length + (last && tail ? tail.head.length : 0) > 6 ? 7.5 : 8.5 });
      }
    };
    const typeRow = { label: 'Jenis', get: (j) => (crit[j].type === 'cost' ? 'Cost' : 'Benefit') };
    const ex = R.examples;
    const topIdx = res.order.filter((i) => res.rank[i] === 1);

    // 1. Hasil
    h1('Hasil peringkat');
    para(R.conclusion, 'strong');
    for (const wmsg of c.warnings) para('Catatan: ' + wmsg, 'bad');
    table('Peringkat alternatif berdasarkan nilai preferensi V', ['Peringkat', 'Alternatif', 'V'], res.order.map((i) => [res.rank[i], alts[i].name, v(res.S[i])]), { bold: topIdx.map((_, k) => k), widths: [0.18, 0.52, 0.3] });
    para('Nilai preferensi V adalah jumlah terbobot nilai ternormalisasi (0–1 pada normalisasi klasik dan min–maks). Makin besar V, makin baik alternatif menurut kriteria dan bobot yang ditetapkan; nilai ini relatif terhadap alternatif yang dibandingkan, bukan probabilitas.', 'muted');
    img(R.charts.scores, 'Nilai preferensi V tiap alternatif');
    img(R.charts.contribution, 'Kontribusi setiap kriteria (w × r) terhadap nilai preferensi');

    // 2. Kriteria dan bobot
    h1('Kriteria dan bobot');
    const rawW = wInfo.method === 'manual';
    table('Kriteria, jenis, sub-kriteria, dan bobot', ['Kode', 'Kriteria', 'Jenis', 'Satuan', 'Sub-kriteria'].concat(rawW ? ['Bobot awal'] : [], ['Bobot w']),
      crit.map((k, j) => [`C${j + 1}`, k.name, k.type === 'cost' ? 'Cost' : 'Benefit', k.unit || '–', k.crips.mode === 'none' ? '–' : `${k.crips.items.length} ${k.crips.mode === 'range' ? 'rentang' : 'label'}`].concat(rawW ? [f.raw(k.weight)] : [], [`${v(res.w[j])} (${f.pct(res.w[j], 2)})`])), { fontSize: 8 });
    para(M.WEIGHT_METHODS[wInfo.method].text, 'muted');
    img(R.charts.weights, 'Bobot kriteria');
    if (wInfo.method === 'entropy' && wInfo.info) {
      const e = wInfo.info;
      h2('Rincian bobot Entropy');
      formula('pᵢⱼ = xᵢⱼ / Σᵢ xᵢⱼ;   eⱼ = −(1/ln m) Σᵢ pᵢⱼ ln pᵢⱼ;   dⱼ = 1 − eⱼ;   wⱼ = dⱼ / Σd');
      matrix('Proporsi p dan bobot Entropy', 'p', altNames, (i, j) => f.num(e.P[i][j], D), [{ label: 'Σx', get: (j) => f.raw(e.colSum[j]) }, { label: 'e', get: (j) => v(e.E[j]) }, { label: 'd = 1 − e', get: (j) => v(e.D[j]) }, { label: 'w', get: (j) => v(e.w[j]) }]);
    } else if (wInfo.method === 'critic' && wInfo.info) {
      const k = wInfo.info;
      h2('Rincian bobot CRITIC');
      formula('Nᵢⱼ = (x − min)/(maks − min) untuk benefit, (maks − x)/(maks − min) untuk cost;   Cⱼ = σⱼ Σₖ (1 − rⱼₖ);   wⱼ = Cⱼ / ΣC');
      matrix('Matriks ternormalisasi N dan bobot CRITIC', 'N', altNames, (i, j) => v(k.N[i][j]), [{ label: 'σ', get: (j) => v(k.sigma[j]) }, { label: 'Σ(1 − r)', get: (j) => v(T.sum(k.corr[j].map((r) => 1 - r))) }, { label: 'C', get: (j) => v(k.C[j]) }, { label: 'w', get: (j) => v(k.w[j]) }]);
      matrix('Matriks korelasi r antar kriteria', 'r', crit.map((x, j) => `C${j + 1} ${x.name}`), (i, j) => f.num(k.corr[i][j], 3));
    } else if (wInfo.method === 'ahp' && wInfo.info) {
      const a = wInfo.info;
      h2('Rincian bobot AHP');
      formula('w = vektor eigen utama matriks A;   λmaks = rata-rata (A·w)ᵢ / wᵢ;   CI = (λmaks − n)/(n − 1);   CR = CI / RI');
      matrix('Matriks perbandingan berpasangan kriteria', 'A', crit.map((x, j) => `C${j + 1} ${x.name}`), (i, j) => f.judg(a.full[i][j]), [{ label: 'Jumlah', get: (j) => f.num(a.colSums[j], 4) }]);
      table('Bobot AHP dan uji konsistensi', ['Kriteria', 'Rata-rata baris (NCA)', 'w (eigen)', 'A·w', '(A·w)/w'], crit.map((x, i) => [x.name, v(a.nca[i]), v(a.w[i]), v(a.Aw[i]), v(a.cv[i])]), { fontSize: 8 });
      para(`λmaks = ${v(a.lambdaMax)}; CI = ${v(a.CI)}; RI = ${f.num(a.RI, 2)}; CR = ${v(a.CR)} → ${a.CR <= 0.1 ? 'konsisten (CR ≤ 0,10)' : 'belum konsisten (CR > 0,10)'}.${a.missing ? ` ${a.missing} penilaian kosong dilengkapi metode Harker.` : ''}`, a.CR <= 0.1 ? 'good' : 'bad');
    }

    // 3. Sub-kriteria
    if (c.hasCrips) {
      h1('Sub-kriteria (crips)');
      para('Data mentah dikonversi menjadi nilai rating menurut tabel sub-kriteria berikut sebelum dinormalisasi. Batas rentang bersifat inklusif.', 'muted');
      crit.forEach((k, j) => {
        if (k.crips.mode === 'none') return;
        const isR = k.crips.mode === 'range';
        table(`Sub-kriteria C${j + 1} ${k.name}`, isR ? ['Rentang', 'Keterangan', 'Nilai'] : ['Pilihan', 'Nilai'],
          k.crips.items.map((it) => (isR ? [M.rangeText(it, p.settings.decimalSep), it.label || '–', f.raw(it.value)] : [it.label, f.raw(it.value)])), { widths: isR ? [0.4, 0.4, 0.2] : [0.7, 0.3] });
      });
      if (ex && ex.crips) para('Contoh: ' + ex.crips, 'muted');
    }

    // 4. Data penilaian
    h1('Data penilaian');
    if (K === 1) {
      const me = c.mats.byExpert[0];
      matrix(c.hasCrips ? 'Data alternatif dan hasil konversi (data → rating)' : 'Data alternatif', 'Alternatif', altNames, (i, j) => (crit[j].crips.mode === 'none' ? f.raw(me.raw[i][j]) : `${f.raw(me.raw[i][j])} → ${f.raw(me.X[i][j])}`));
    } else {
      para(`${K} penilai memberi nilai; nilai setiap penilai dikonversi ke rating lalu digabung dengan ${T.AGGREGATIONS[c.aggregation].label.toLowerCase()}.`, 'muted');
      p.experts.forEach((e, ek) => {
        const me = c.mats.byExpert[ek];
        matrix(`Penilaian ${e.name}${c.hasCrips ? ' (data → rating)' : ''}`, 'Alternatif', altNames, (i, j) => (crit[j].crips.mode === 'none' ? f.raw(me.raw[i][j]) : `${f.raw(me.raw[i][j])} → ${f.raw(me.X[i][j])}`));
      });
      formula(c.aggregation === 'geo' ? 'xᵢⱼ = (Πₖ xᵢⱼ⁽ᵏ⁾)^(1/K)' : 'xᵢⱼ = (1/K) Σₖ xᵢⱼ⁽ᵏ⁾');
      if (ex && ex.agg) para('Contoh: ' + ex.agg, 'muted');
      matrix('Matriks gabungan semua penilai', 'Alternatif', altNames, (i, j) => v(c.X[i][j]));
    }

    // 5. Langkah perhitungan
    h1('Langkah perhitungan SAW');
    h2('Langkah 1 — Matriks keputusan (X) dan bobot');
    matrix('Matriks keputusan', 'Alternatif', altNames, (i, j) => (K > 1 ? v(c.X[i][j]) : f.raw(c.X[i][j])), [typeRow, { label: 'Bobot w', get: (j) => v(res.w[j]) }]);
    h2(`Langkah 2 — Normalisasi matriks (R), ${T.NORMALIZATIONS[res.normalization].label}`);
    formula(NORM_TXT[res.normalization].join(';   '));
    if (ex) para('Contoh: ' + ex.norm, 'muted');
    const divRows = res.normalization === 'classic'
      ? [{ label: 'maks (benefit) / min (cost)', get: (j) => f.raw(crit[j].type === 'cost' ? res.info[j].min : res.info[j].max) }]
      : res.normalization === 'minmax'
        ? [{ label: 'min', get: (j) => f.raw(res.info[j].min) }, { label: 'maks', get: (j) => f.raw(res.info[j].max) }]
        : [{ label: 'Σx (benefit) / Σ(1/x) (cost)', get: (j) => v(crit[j].type === 'cost' ? res.info[j].sumInv : res.info[j].sum) }];
    matrix('Matriks ternormalisasi R', 'Alternatif', altNames, (i, j) => v(res.R[i][j]), divRows);
    h2('Langkah 3 — Nilai preferensi (V)');
    formula('Vᵢ = Σⱼ wⱼ · rᵢⱼ');
    if (ex) para('Contoh: ' + ex.pref, 'muted');
    matrix('Kontribusi w × r dan nilai preferensi V', 'Alternatif', altNames, (i, j) => v(res.V[i][j]), [{ label: 'Bobot w', get: (j) => v(res.w[j]) }],
      { head: ['V', 'Peringkat'], get: (i) => [v(res.S[i]), String(res.rank[i])], bold: alts.map((_, i) => i).filter((i) => res.rank[i] === 1) });
    h2('Langkah 4 — Perangkingan');
    table('Urutan alternatif dari nilai V terbesar', ['Peringkat', 'Alternatif', 'V'], res.order.map((i) => [res.rank[i], alts[i].name, v(res.S[i])]), { bold: topIdx.map((_, k) => k), widths: [0.18, 0.52, 0.3] });

    // 6. Profil
    h1('Profil alternatif per kriteria');
    para('Nilai sel = r / maks r pada setiap kriteria: 1 berarti alternatif itu yang terbaik pada kriteria tersebut.', 'muted');
    img(R.charts.heatmap, 'Peta panas nilai ternormalisasi (baris diurutkan menurut peringkat)');
    img(R.charts.radar, 'Radar nilai ternormalisasi alternatif teratas');

    // 7. Sensitivitas
    if (R.sensitivity && R.sensitivity.length) {
      h1('Analisis sensitivitas bobot');
      para('Bobot satu kriteria diubah dari 0% sampai 100% sementara bobot kriteria lain diskalakan proporsional. Pada SAW nilai V berubah linear sehingga titik pergantian peringkat dihitung eksak. Rentang stabil adalah rentang bobot ketika alternatif peringkat pertama tidak berubah.', 'muted');
      table('Rentang stabil bobot tiap kriteria', ['Kriteria', 'Bobot saat ini', 'Peringkat 1', 'Rentang stabil', 'Pengganti di batas'], R.sensitivity.map((s) => {
        const t = s.stability;
        const repl = [t.loBy !== null ? `< ${f.pct(t.lo, 1)}: ${alts[t.loBy].name}` : null, t.hiBy !== null ? `> ${f.pct(t.hi, 1)}: ${alts[t.hiBy].name}` : null].filter(Boolean).join('; ') || 'Tidak berubah pada 0–100%';
        return [s.name, f.pct(t.x0, 1), alts[t.top].name, `${f.pct(t.lo, 1)} – ${f.pct(t.hi, 1)}`, repl];
      }), { fontSize: 8, widths: [0.22, 0.13, 0.2, 0.17, 0.28] });
      for (const s of R.sensitivity) img(s.chart, `Sensitivitas V terhadap bobot ${s.name}; area biru muda = rentang stabil`);
    }

    // 8. Uji ketahanan
    h1('Uji ketahanan hasil');
    if (R.methodCompare) {
      const av = R.methodCompare.filter((x) => x.available);
      h2('Perbandingan SAW dengan WP dan TOPSIS');
      para('Data dan bobot yang sama dihitung dengan Weighted Product (perkalian berpangkat bobot; cost berpangkat negatif) dan TOPSIS (normalisasi vektor, jarak Euclidean ke solusi ideal). Korelasi Spearman 1 berarti urutan identik dengan SAW.', 'muted');
      table('Peringkat (dan skor) pada setiap metode', ['Alternatif'].concat(av.map((x) => x.label)), alts.map((a, i) => [a.name].concat(av.map((x) => `${x.rank[i]} (${f.num(x.score[i], 4)})`))).concat([['Spearman vs SAW'].concat(av.map((x) => f.num(x.rho, 3)))]), { bold: [alts.length], fontSize: 8 });
      for (const x of R.methodCompare.filter((y) => !y.available)) para(`${x.label} tidak dihitung: ${x.note}.`, 'muted');
      img(R.charts.methods, 'Peringkat alternatif pada SAW, WP, dan TOPSIS');
    }
    if (R.normCompare) {
      const nc = R.normCompare, av = nc.methods.filter((k) => nc.by[k].available);
      h2('Perbandingan metode normalisasi SAW');
      table('Peringkat (dan V) pada setiap metode normalisasi', ['Alternatif'].concat(av.map((k) => T.NORMALIZATIONS[k].label)), alts.map((a, i) => [a.name].concat(av.map((k) => `${nc.by[k].rank[i]} (${f.num(nc.by[k].S[i], 4)})`))).concat([[`Spearman vs ${T.NORMALIZATIONS[nc.ref].short}`].concat(av.map((k) => f.num(nc.by[k].rho, 3)))]), { bold: [alts.length], fontSize: 8 });
      for (const k of nc.methods.filter((x) => !nc.by[x].available)) para(`${T.NORMALIZATIONS[k].label} tidak dapat dipakai pada data ini: ${nc.by[k].problems.map((q) => `${crit[q.j].name} — ${q.msg}`).join('; ')}.`, 'muted');
      img(R.charts.bump, 'Peringkat alternatif pada setiap metode normalisasi');
    }
    if (R.rankReversal && R.rankReversal.length) {
      h2('Uji rank reversal');
      para('Satu alternatif dihapus bergantian lalu SAW dihitung ulang dengan bobot yang sama. "Pasangan bertukar" menghitung pasangan alternatif tersisa yang urutannya terbalik.', 'muted');
      table('Uji rank reversal (hapus satu alternatif, bobot tetap)', ['Alternatif dihapus', 'Urutan baru', 'Pasangan bertukar', 'Peringkat 1 berubah?'], R.rankReversal.map((r) => [alts[r.removed].name, r.invalid ? 'tidak dapat dihitung' : r.order.map((i) => alts[i].name).join(' > '), String(r.flips.length), r.topChanged ? 'Ya' : 'Tidak']), { fontSize: 8, widths: [0.22, 0.5, 0.13, 0.15] });
    }

    h1('Rujukan');
    for (const ref0 of R.references) para(ref0, 'ref');
    para(`Dihitung dengan ${TOOL_NAME} (${TOOL_URL}). Semua perhitungan berjalan di browser pengguna.`, 'muted');
    return Bk;
  }

  function metaRows(R) {
    const p = R.project, c = R.comp, res = c.res;
    const crit = p.criteria;
    const rows = [
      ['Tanggal', R.dateLabel],
      ['Metode', 'Simple Additive Weighting (SAW)'],
      ['Metode bobot', M.WEIGHT_METHODS[c.weights.method].short],
      ['Normalisasi', T.NORMALIZATIONS[res.normalization].label],
      ['Kriteria / alternatif', `${crit.length} kriteria (${crit.filter((k) => k.type === 'benefit').length} benefit, ${crit.filter((k) => k.type === 'cost').length} cost) / ${p.alternatives.length} alternatif`]
    ];
    if (c.hasCrips) rows.push(['Sub-kriteria', `${crit.filter((k) => k.crips.mode !== 'none').length} kriteria memakai konversi crips`]);
    if (p.experts.length > 1) rows.push(['Penilai', `${p.experts.length} (${p.experts.map((e) => e.name).join(', ')}); ${T.AGGREGATIONS[c.aggregation].label.toLowerCase()}`]);
    if (p.meta.author) rows.unshift(['Disusun oleh', p.meta.author]);
    return rows;
  }

  const isNumText = (t) => /^[-−]?[\d.,]+%?( \*)?$/.test(String(t).trim());
  function numCol(rows, i) {
    if (i === 0 || !rows.length) return false;
    const cells = rows.map((r) => String(r[i] === undefined || r[i] === null ? '' : r[i]).trim());
    return cells.some((c) => c && isNumText(c)) && cells.every((c) => !c || c === '–' || isNumText(c));
  }

  /* ------------------------------------------------------------------ *
   * PDF
   * ------------------------------------------------------------------ */

  function pdfText(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[₀-₉]+/g, (m) => '_' + Array.from(m).map((ch) => String(ch.charCodeAt(0) - 0x2080)).join(''))
      .replace(/⁽ᵏ⁾/g, '^(k)').replace(/ᵢⱼ/g, '_ij').replace(/ᵢ/g, '_i').replace(/ⱼ/g, '_j').replace(/ₖ/g, '_k').replace(/√/g, 'akar').replace(/λ/g, 'lambda').replace(/σ/g, 'sigma').replace(/Π/g, 'prod ').replace(/Σ/g, 'jumlah ').replace(/jumlah _/g, 'jumlah_').replace(/∂/g, 'd').replace(/θ/g, 'theta').replace(/α/g, 'alpha').replace(/β/g, 'beta').replace(/γ/g, 'gamma').replace(/δ/g, 'delta').replace(/Δ/g, 'Delta')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/→/g, '->').replace(/←/g, '<-').replace(/[↑↓]/g, '').replace(/−/g, '-').replace(/×/g, 'x').replace(/›/g, '>').replace(/‚/g, ',')
      .replace(/[●◎◐]/g, '').replace(/ | /g, ' ')
      .replace(/[^\u0009\u000a\u000d -~ -ÿ–—‘’“”•…]/g, '?');
  }

  const NAVY = [55, 48, 163], INK = [24, 34, 48], MUTED = [100, 116, 139], LINE = [226, 232, 240], BRAND = [79, 70, 229], GOOD = [6, 95, 70];

  async function buildPdf(R, onProgress) {
    if (!(typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF)) throw new Error('Pustaka PDF belum termuat. Muat ulang halaman lalu coba lagi.');
    const { jsPDF } = window.jspdf;
    const autoTable = window.autoTable || (window.jspdf_autotable && window.jspdf_autotable.autoTable) || null;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const p = R.project;
    const PW = 210, PH = 297, MG = 16, CW = PW - 2 * MG, BOTTOM = PH - 16;
    let y = MG;
    const tick = (msg) => { if (onProgress) onProgress(msg); };
    doc.setProperties({ title: p.meta.title, subject: 'Laporan analisis SAW', creator: TOOL_NAME + ' — ' + TOOL_URL });
    const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage('a4', 'portrait'); y = MG; } };
    const setFont = (size, style, color) => { doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size); doc.setTextColor.apply(doc, color || INK); };
    let secNo = 0;
    const heading = (t) => {
      ensure(48);
      secNo++;
      y += 2;
      setFont(13, 'bold', NAVY);
      doc.text(pdfText(`${secNo}. ${t}`), MG, y + 4);
      doc.setDrawColor.apply(doc, BRAND);
      doc.setLineWidth(0.6);
      doc.line(MG, y + 6.5, MG + 14, y + 6.5);
      y += 11;
    };
    const sub = (t) => { ensure(40); setFont(10.5, 'bold', INK); doc.text(pdfText(t), MG, y + 3.5); y += 7; };
    const PSTYLE = { muted: [8.5, 'normal', MUTED], strong: [10.5, 'bold', NAVY], good: [9, 'bold', GOOD], bad: [9, 'normal', [176, 40, 40]], ref: [8.5, 'normal', INK] };
    const para = (t, style) => {
      const [size, fstyle, color] = PSTYLE[style] || [9.5, 'normal', INK];
      setFont(size, fstyle, color);
      const lines = doc.splitTextToSize(pdfText(t), CW);
      const lh = size * 0.42;
      for (const l of lines) { ensure(lh + 1); doc.text(l, MG, y + lh * 0.8); y += lh; }
      y += 2;
    };
    const formula = (t) => {
      setFont(9, 'italic', [49, 46, 129]);
      const lines = doc.splitTextToSize(pdfText(t), CW - 8);
      const h = lines.length * 4 + 4;
      ensure(h + 2);
      doc.setFillColor(238, 242, 255);
      doc.roundedRect(MG, y, CW, h, 1.5, 1.5, 'F');
      doc.text(lines, MG + 4, y + 4.6);
      y += h + 3;
    };
    const table = (b) => {
      ensure(Math.min(46, 16 + Math.min(b.rows.length, 3) * 6.5));
      setFont(8.5, 'bold', MUTED);
      const capLines = doc.splitTextToSize(pdfText(b.caption), CW);
      doc.text(capLines, MG, y + 3);
      y += capLines.length * 3.6 + 1.5;
      const colStyles = {};
      b.head.forEach((_, i) => { if (numCol(b.rows, i)) colStyles[i] = { halign: 'right' }; });
      if (b.widths) b.widths.forEach((w, i) => { colStyles[i] = Object.assign(colStyles[i] || {}, { cellWidth: CW * w }); });
      const conf = {
        startY: y, head: [b.head.map(pdfText)],
        body: b.rows.map((r, ri) => r.map((cell) => ((b.bold || []).includes(ri) ? { content: pdfText(cell), styles: { fontStyle: 'bold', fillColor: [236, 253, 245] } } : pdfText(cell)))),
        margin: { left: MG, right: MG, bottom: 18 }, theme: 'grid',
        styles: { font: 'helvetica', fontSize: b.fontSize || 8.5, cellPadding: 1.5, lineColor: LINE, lineWidth: 0.15, textColor: INK, overflow: 'linebreak' },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [247, 249, 252] },
        columnStyles: colStyles, rowPageBreak: 'avoid'
      };
      if (autoTable) autoTable(doc, conf); else doc.autoTable(conf);
      y = doc.lastAutoTable.finalY + 5;
    };
    const caption = (t, cx, width) => { setFont(8, 'italic', MUTED); const lines = doc.splitTextToSize(pdfText(t), width); doc.text(lines, cx, y + 2.5, { align: 'center' }); y += lines.length * 3.4 + 3; };
    const image = async (b) => {
      const chart = b.chart;
      const png = await svgToPng(chart.svg, chart.width, chart.height, chart.width > 1400 ? 1.5 : 2);
      if (b.tree && chart.width > 980 && chart.width / chart.height > 1.15) {
        doc.addPage('a4', 'landscape');
        const LW = 297, LH = 210;
        let w = LW - 2 * MG, h = w * chart.height / chart.width;
        const lim = LH - 2 * MG - 14;
        if (h > lim) { w = w * lim / h; h = lim; }
        y = MG;
        doc.addImage(png.dataUrl, 'PNG', MG + (LW - 2 * MG - w) / 2, y, w, h, undefined, 'FAST');
        y += h + 2;
        caption(b.caption, LW / 2, LW - 2 * MG);
        doc.addPage('a4', 'portrait');
        y = MG;
        return;
      }
      let w = CW, h = CW * chart.height / chart.width;
      const limit = b.maxH || (BOTTOM - MG - 14);
      if (h > limit) { w = w * limit / h; h = limit; }
      // sisa halaman cukup untuk versi sedikit lebih kecil? perkecil daripada meninggalkan halaman kosong
      const room = BOTTOM - y - 10;
      if (h > room && room >= h * 0.65) { w = w * room / h; h = room; }
      ensure(h + 8);
      doc.addImage(png.dataUrl, 'PNG', MG + (CW - w) / 2, y, w, h, undefined, 'FAST');
      y += h + 2;
      caption(b.caption, PW / 2, CW);
    };

    doc.setFillColor.apply(doc, NAVY);
    doc.rect(0, 0, PW, 40, 'F');
    setFont(9, 'normal', [199, 210, 254]);
    doc.text('LAPORAN ANALISIS SAW', MG, 13);
    setFont(17, 'bold', [255, 255, 255]);
    doc.text(doc.splitTextToSize(pdfText(p.meta.title), CW).slice(0, 2), MG, 22);
    setFont(9, 'normal', [224, 231, 255]);
    doc.text('Simple Additive Weighting · langkah perhitungan, diagram, sensitivitas, dan perbandingan metode', MG, 34);
    y = 48;
    table({ caption: 'Identitas analisis', head: ['Keterangan', 'Nilai'], rows: metaRows(R), widths: [0.3, 0.7] });
    if (p.meta.description) para(p.meta.description, 'muted');

    for (const b of reportBlocks(R)) {
      if (b.t === 'h1') { tick(b.text); heading(b.text); } else if (b.t === 'h2') sub(b.text);
      else if (b.t === 'p') para(b.text, b.style);
      else if (b.t === 'formula') formula(b.text);
      else if (b.t === 'table') table(b);
      else if (b.t === 'img') await image(b);
    }

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
      doc.setDrawColor.apply(doc, LINE);
      doc.setLineWidth(0.2);
      doc.line(MG, ph - 12, pw - MG, ph - 12);
      setFont(7.5, 'normal', MUTED);
      doc.text(pdfText(`Dihitung dengan ${TOOL_NAME} — ${TOOL_URL}`), MG, ph - 8);
      doc.text(`${i} / ${pages}`, pw - MG, ph - 8, { align: 'right' });
    }
    return doc.output('blob');
  }

  /* ------------------------------------------------------------------ *
   * Word (.docx)
   * ------------------------------------------------------------------ */

  const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

  const DOCX_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + W_NS + '>' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="312E81"/><w:sz w:val="36"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="312E81"/><w:sz w:val="28"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr><w:rPr><w:i/><w:color w:val="475569"/><w:sz w:val="20"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Rumus"><w:name w:val="Rumus"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="EEF2FF"/><w:spacing w:before="60" w:after="120"/><w:ind w:left="284"/></w:pPr><w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/><w:color w:val="1E1B4B"/><w:sz w:val="22"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Catatan"><w:name w:val="Catatan"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/><w:color w:val="475569"/><w:sz w:val="20"/></w:rPr></w:style>' +
    '<w:style w:type="table" w:styleId="TabelData"><w:name w:val="Tabel Data"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/></w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    '</w:styles>';

  const SECT_PORTRAIT = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1701" w:bottom="1701" w:left="2268" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>';
  const SECT_LANDSCAPE = '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>';

  async function buildDocx(R, onProgress) {
    const p = R.project;
    const tick = (msg) => { if (onProgress) onProgress(msg); };
    const body = [];
    const media = [];
    let figNo = 0, tabNo = 0, secNo = 0;
    const run = (t, o) => {
      o = o || {};
      const pr = (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') + (o.color ? `<w:color w:val="${o.color}"/>` : '') + (o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : '');
      return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
    };
    const para = (t, o) => { o = o || {}; body.push(`<w:p>${o.style || o.jc ? `<w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>` : ''}${run(t, o)}</w:p>`); };
    const PSTYLE = { muted: { color: '475569', sz: 22 }, strong: { b: true, color: '312E81' }, good: { b: true, color: '065F46' }, bad: { color: 'B42318' }, ref: {} };
    const table = (b) => {
      tabNo++;
      para(`Tabel ${tabNo}. ${b.caption}`, { style: 'Caption' });
      const head = b.head, rows = b.rows;
      const TOTAL = 7937;
      const widths = b.widths ? b.widths.map((w) => Math.round(TOTAL * w)) : null;
      let ci = 0;
      const cell = (t, hdr, right, bold) => `<w:tc><w:tcPr>${widths ? `<w:tcW w:w="${widths[ci++ % widths.length]}" w:type="dxa"/>` : ''}${hdr ? '<w:shd w:val="clear" w:color="auto" w:fill="3730A3"/>' : bold ? '<w:shd w:val="clear" w:color="auto" w:fill="ECFDF5"/>' : ''}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/>${right ? '<w:jc w:val="right"/>' : ''}</w:pPr>${run(String(t), hdr ? { b: true, color: 'FFFFFF', sz: 18 } : { sz: 18, b: bold })}</w:p></w:tc>`;
      let x = `<w:tbl><w:tblPr><w:tblStyle w:val="TabelData"/>${widths ? `<w:tblW w:w="${TOTAL}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` : '<w:tblW w:w="5000" w:type="pct"/>'}<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`;
      x += `<w:tblGrid>${head.map((_, i) => (widths ? `<w:gridCol w:w="${widths[i]}"/>` : '<w:gridCol/>')).join('')}</w:tblGrid>`;
      const colRight = head.map((_, i) => numCol(rows, i));
      x += `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${head.map((h, i) => cell(h, true, colRight[i])).join('')}</w:tr>`;
      rows.forEach((r, ri) => { const bold = (b.bold || []).includes(ri); x += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((t, i) => cell(t, false, colRight[i], bold)).join('')}</w:tr>`; });
      x += '</w:tbl>';
      body.push(x);
      body.push('<w:p><w:pPr><w:spacing w:after="60"/></w:pPr></w:p>');
    };
    const image = async (b) => {
      const chart = b.chart;
      const png = await svgToPng(chart.svg, chart.width, chart.height, chart.width > 1400 ? 1.5 : 2);
      const bytes = new Uint8Array(await png.blob.arrayBuffer());
      media.push(bytes);
      const id = media.length;
      const landscape = b.tree && chart.width > 980 && chart.width / chart.height > 1.15;
      const maxW = landscape ? 24.5 : 15, maxH = landscape ? 15 : 20;
      let cx = Math.round(maxW * 360000), cy = Math.round(cx * chart.height / chart.width);
      const maxCy = Math.round(maxH * 360000);
      if (cy > maxCy) { cx = Math.round(cx * maxCy / cy); cy = maxCy; }
      if (landscape) body.push(`<w:p><w:pPr>${SECT_PORTRAIT}</w:pPr></w:p>`);
      body.push(`<w:p><w:pPr><w:keepNext/><w:jc w:val="center"/><w:spacing w:before="120" w:after="40"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Gambar ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="gambar${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
      figNo++;
      if (landscape) body.push(`<w:p><w:pPr><w:pStyle w:val="Caption"/>${SECT_LANDSCAPE}</w:pPr>${run(`Gambar ${figNo}. ${b.caption}`)}</w:p>`);
      else para(`Gambar ${figNo}. ${b.caption}`, { style: 'Caption' });
    };

    para(p.meta.title, { style: 'Title' });
    para('Laporan analisis SAW (Simple Additive Weighting)', { color: '475569' });
    table({ caption: 'Identitas analisis', head: ['Keterangan', 'Nilai'], rows: metaRows(R), widths: [0.3, 0.7] });
    if (p.meta.description) para(p.meta.description);

    for (const b of reportBlocks(R)) {
      if (b.t === 'h1') { tick(b.text); secNo++; para(b.text === 'Rujukan' ? b.text : `${secNo}. ${b.text}`, { style: 'Heading1' }); } else if (b.t === 'h2') para(b.text, { style: 'Heading2' });
      else if (b.t === 'p') para(b.text, PSTYLE[b.style] || {});
      else if (b.t === 'formula') para(b.text, { style: 'Rumus' });
      else if (b.t === 'table') table(b);
      else if (b.t === 'img') await image(b);
    }

    const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + W_NS + '><w:body>' + body.join('') + SECT_PORTRAIT + '</w:body></w:document>';
    const files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
      { name: 'docProps/core.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' + `<dc:title>${xmlEsc(p.meta.title)}</dc:title><dc:creator>${xmlEsc(p.meta.author || TOOL_NAME)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>` },
      { name: 'word/document.xml', data: docXml },
      { name: 'word/styles.xml', data: DOCX_STYLES },
      { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' + media.map((_, k) => `<Relationship Id="rIdImg${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/gambar${k + 1}.png"/>`).join('') + '</Relationships>' }
    ];
    media.forEach((bytes, k) => files.push({ name: `word/media/gambar${k + 1}.png`, data: bytes }));
    return zip(files);
  }

  return {
    TOOL_URL, TOOL_NAME, download, safeFileName, csvString, resultRows,
    crc32, zip, buildXlsx, readXlsx, unzipIndex, workbookFromReport, reportBlocks, metaRows, svgToPng, buildPdf, buildDocx, pdfText
  };
}));
