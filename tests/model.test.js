'use strict';
// Tes model proyek SAW: contoh, sub-kriteria, penilai, impor tabel, tautan. Jalankan: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../assets/js/saw-core.js');
const M = require('../assets/js/model.js');
const X = require('../assets/js/export.js');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 1e-12), `${msg || ''} ${a} ≠ ${b}`);
const byName = (list, nm) => list.find((x) => x.name === nm);

test('semua contoh dapat dihitung; nilai kunci sesuai hitungan manual', () => {
  for (const s of M.SAMPLE_INFO) {
    const p = M.sampleProject(s.id);
    const c = M.compute(p);
    assert.ok(c.ok, s.id + ' ' + JSON.stringify(c.errors));
    close(T.sum(c.res.w), 1);
  }
  const sp = M.sampleProject('supplier');
  const sc = M.compute(sp);
  close(sc.res.S[2], 0.4 * 7 / 9 + 0.35 + 0.25);
  assert.deepEqual(sc.res.order.map((i) => sp.alternatives[i].name), ['Supplier C', 'Supplier B', 'Supplier A']);
  // beasiswa: Dimas (IPK 3,65 → 5; penghasilan 3,0 → 3; tanggungan 5; Provinsi 3; Pengurus 3)
  const bp = M.sampleProject('beasiswa');
  const bc = M.compute(bp);
  const di = bp.alternatives.findIndex((a) => a.name === 'Dimas');
  assert.deepEqual(bc.X[di], [5, 3, 5, 3, 3]);
  close(bc.res.S[di], 0.3 * 1 + 0.25 * (1 / 3) + 0.2 * 1 + 0.15 * (3 / 5) + 0.1 * (3 / 4));
  assert.equal(bc.res.rank[di], 1);
  // karyawan: 3 penilai, label → angka → rata-rata
  const kp = M.sampleProject('karyawan');
  const kc = M.compute(kp);
  assert.equal(kc.experts, 3);
  close(kc.X[0][0], (5 + 4 + 4) / 3);
  assert.ok(kc.weights.info.CR < 0.1, 'CR contoh AHP konsisten');
});

test('konversi sub-kriteria: rentang, label, angka yang sama dengan nilai label, sel tidak cocok', () => {
  const p = M.sampleProject('beasiswa');
  const ipk = byName(p.criteria, 'IPK'), pres = byName(p.criteria, 'Prestasi non-akademik');
  assert.deepEqual(M.rating(ipk, 3.51), { status: 'ok', value: 5, idx: 0 });
  assert.deepEqual(M.rating(ipk, 3.5), { status: 'ok', value: 4, idx: 1 });
  assert.equal(M.rating(ipk, 3.505).status, 'nomatch');
  assert.equal(M.rating(ipk, 'tiga').status, 'text');
  assert.equal(M.rating(ipk, null).status, 'empty');
  assert.deepEqual(M.rating(pres, ' nasional ').value, 4);
  assert.deepEqual(M.rating(pres, 3).value, 3, 'angka rating sama dengan nilai sub-kriteria');
  assert.equal(M.rating(pres, 'Juara RT').status, 'nomatch');
  const a0 = p.alternatives[0];
  M.setValue(p, null, a0.id, ipk.id, 3.505);
  const c = M.compute(p);
  assert.equal(c.ok, false);
  assert.match(c.errors.join(' '), /tidak masuk rentang/);
  assert.equal(M.rangeText({ min: 3.01, max: 3.5 }, ','), '3,01 – 3,5');
  assert.equal(M.rangeText({ min: null, max: 2.5 }, ','), '≤ 2,5');
  assert.equal(M.rangeText({ min: 5, max: null }, '.'), '≥ 5');
});

test('masalah konfigurasi sub-kriteria dilaporkan', () => {
  const p = M.sampleProject('beasiswa');
  const ipk = byName(p.criteria, 'IPK');
  ipk.crips.items[1].min = 3.6;   // 3,6 – 3,5 terbalik
  ipk.crips.items[0].value = null;
  const org = byName(p.criteria, 'Keaktifan organisasi');
  org.crips.items[1].label = 'pengurus INTI';
  const c = M.compute(p);
  const txt = c.errors.join(' | ');
  assert.match(txt, /belum memiliki nilai/);
  assert.match(txt, /batas bawah lebih besar/);
  assert.match(txt, /dipakai lebih dari sekali/);
  const q = M.sampleProject('beasiswa');
  byName(q.criteria, 'IPK').crips.items[1].max = 3.6;   // tumpang tindih dengan ≥ 3,51
  assert.match(M.compute(q).warnings.join(' '), /tumpang tindih/);
});

test('penilai: agregasi aritmetik/geometrik, sel kosong per penilai, hapus penilai', () => {
  const p = M.sampleProject('karyawan');
  p.settings.aggregation = 'geo';
  const c = M.compute(p);
  close(c.X[0][0], Math.cbrt(5 * 4 * 4));
  const e2 = p.experts[1];
  M.setValue(p, e2.id, p.alternatives[2].id, p.criteria[1].id, null);
  const c2 = M.compute(p);
  assert.equal(c2.ok, false);
  assert.match(c2.errors[0], /^Supervisor: 1 sel/);
  p.experts.splice(1, 1);
  M.prune(p);
  assert.equal(p.values[e2.id], undefined);
  const c3 = M.compute(p);
  assert.ok(c3.ok);
  close(c3.X[0][0], Math.sqrt(5 * 4));
});

test('normalisasi klasik menolak data yang tidak memenuhi syarat dengan pesan jelas', () => {
  const p = M.sampleProject('supplier');
  M.setValue(p, null, p.alternatives[0].id, p.criteria[2].id, 0);
  const c = M.compute(p);
  assert.equal(c.ok, false);
  assert.match(c.errors[0], /Harga.*cost membutuhkan semua nilai > 0/);
  p.settings.normalization = 'minmax';
  assert.ok(M.compute(p).ok);
});

test('simpan → buka mempertahankan proyek; proyek TOPSIS bisa dibuka', () => {
  for (const s of M.SAMPLE_INFO) {
    const p = M.sampleProject(s.id);
    const q = M.normalizeProject(JSON.parse(M.serialize(p)));
    assert.deepEqual(q, p, s.id);
  }
  const topsisProject = { app: 'topsis-decision-engine', version: 2, meta: { title: 'Dari TOPSIS' }, criteria: [{ id: 'k1', name: 'A', type: 'benefit', weight: 2 }, { id: 'k2', name: 'B', type: 'cost', weight: 1 }], alternatives: [{ id: 'a1', name: 'X' }, { id: 'a2', name: 'Y' }], values: { a1: { k1: 3, k2: 4 }, a2: { k1: 5, k2: 2 } }, weighting: { method: 'manual', ahp: {} }, settings: { normalization: 'vector' } };
  const t = M.normalizeProject(topsisProject);
  assert.equal(t.experts.length, 1);
  assert.equal(M.getValue(t, null, 'a2', 'k1'), 5);
  assert.equal(t.settings.normalization, 'classic');
  assert.ok(M.compute(t).ok);
  assert.throws(() => M.normalizeProject({ app: 'ahp-decision-engine', nodes: [] }), /proyek AHP/);
  assert.throws(() => M.normalizeProject({ app: 'lain' }), /bukan proyek SAW/);
});

test('tempel tabel: judul, jenis, bobot, teks label menjadi sub-kriteria, angka format Indonesia', () => {
  const p = M.newProject();
  const grid = M.parseGrid('Alternatif\tIPK\tPrestasi\tPenghasilan\nJenis\tBenefit\tBenefit\tCost\nBobot\t50\t30\t20\nAni\t3,75\tNasional\t1.250.000\nBudi\t3,20\tProvinsi\t2.500.000\nCici\t3,90\tNasional\t900.000\n');
  const g = M.interpretGrid(grid, ',');
  assert.deepEqual(g.names, ['IPK', 'Prestasi', 'Penghasilan']);
  assert.deepEqual(g.textCols, [false, true, false]);
  const r = M.applyGrid(p, g);
  assert.equal(r.labelCriteria, 1);
  const pres = p.criteria[1];
  assert.equal(pres.crips.mode, 'label');
  assert.deepEqual(pres.crips.items.map((it) => it.label), ['Nasional', 'Provinsi']);
  assert.equal(M.getValue(p, null, p.alternatives[0].id, p.criteria[2].id), 1250000);
  assert.equal(p.criteria[2].type, 'cost');
  let c = M.compute(p);
  assert.match(c.errors.join(' '), /belum memiliki nilai/);
  pres.crips.items[0].value = 4; pres.crips.items[1].value = 3;
  c = M.compute(p);
  assert.ok(c.ok, JSON.stringify(c.errors));
  assert.deepEqual(c.X.map((row) => row[1]), [4, 3, 4]);
  // data teks pada kriteria angka → dihitung sebagai sel salah
  const q = M.sampleProject('supplier');
  const r2 = M.applyGrid(q, M.interpretGrid(M.parseGrid('Alternatif;Kualitas;Ketepatan pengiriman;Harga\nSupplier A;8;tujuh;10\n'), ','));
  assert.equal(r2.bad, 0, 'kolom teks penuh dijadikan label');
  assert.equal(byName(q.criteria, 'Ketepatan pengiriman').crips.mode, 'label');
  const rows = M.dataRows(q);
  assert.deepEqual(rows[0], ['Alternatif', 'Kualitas', 'Ketepatan pengiriman', 'Harga']);
  assert.deepEqual(rows[4], ['Supplier A', 8, 'tujuh', 10]);
});

test('tautan berbagi bolak-balik', async () => {
  const p = M.sampleProject('karyawan');
  const code = await M.encodePayload(p);
  assert.match(code, /^[zj][A-Za-z0-9_-]+$/);
  const back = M.normalizeProject(await M.decodePayload('https://contoh.test/#proyek=' + code));
  assert.deepEqual(back, p);
});

test('ekspor: CSV, nama berkas, CRC32', () => {
  assert.equal(X.crc32(new TextEncoder().encode('123456789')) >>> 0, 0xCBF43926);
  const csv = X.csvString([['a;b', 0.5], [1, 2.25]], ',');
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('"a;b";0,5'));
  assert.equal(X.safeFileName('Seleksi beasiswa: 2026!', 'pdf'), 'seleksi-beasiswa-2026.pdf');
});
