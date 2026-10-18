'use strict';
// Jalankan: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../assets/js/saw-core.js');
const FX = require('./fixtures-numpy.json');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 1e-10), `${msg || ''} ${a} ≠ ${b}`);
const closeArr = (a, b, tol, msg) => { assert.equal(a.length, b.length, msg); a.forEach((v, i) => close(v, b[i], tol, `${msg || ''}[${i}]`)); };

test('contoh supplier: hitungan manual SAW klasik', () => {
  const r = T.saw([[8, 7, 10], [9, 8, 12], [7, 9, 9]], [40, 35, 25], ['benefit', 'benefit', 'cost']);
  closeArr(r.w, [0.4, 0.35, 0.25]);
  closeArr(r.R[0], [8 / 9, 7 / 9, 9 / 10]);
  closeArr(r.R[1], [1, 8 / 9, 9 / 12]);
  closeArr(r.R[2], [7 / 9, 1, 1]);
  closeArr(r.S, [0.4 * 8 / 9 + 0.35 * 7 / 9 + 0.25 * 0.9, 0.4 + 0.35 * 8 / 9 + 0.25 * 0.75, 0.4 * 7 / 9 + 0.35 + 0.25], 1e-14);
  assert.deepEqual(r.rank, [3, 2, 1]);
  assert.deepEqual(r.order, [2, 1, 0]);
  close(r.info[2].min, 9);
  close(r.info[0].max, 9);
  assert.equal(r.problems.length, 0);
});

test('cocok dengan numpy: SAW 3 normalisasi, WP, TOPSIS, Spearman (31 kasus)', () => {
  for (const c of FX.cases) {
    for (const mth of ['classic', 'minmax', 'sum']) {
      const r = T.saw(c.X, c.w, c.types, { normalization: mth });
      const ref = c.saw[mth];
      const tag = `${c.name}/${mth}`;
      assert.equal(r.problems.length, 0, tag);
      r.R.forEach((row, i) => closeArr(row, ref.R[i], 1e-12, tag + ' R'));
      r.V.forEach((row, i) => closeArr(row, ref.V[i], 1e-12, tag + ' V'));
      closeArr(r.S, ref.S, 1e-12, tag + ' S');
      const ev = T.evaluator(c.X, c.types, { normalization: mth });
      closeArr(ev(r.w), ref.S, 1e-12, tag + ' evaluator');
    }
    const p = T.wp(c.X, c.w, c.types);
    closeArr(p.Svec, c.wp.Svec, 1e-9, c.name + ' WP S');
    closeArr(p.V, c.wp.V, 1e-12, c.name + ' WP V');
    closeArr(T.topsis(c.X, c.w, c.types).C, c.topsis.C, 1e-12, c.name + ' TOPSIS');
    const cm = T.compareMethods(c.X, c.w, c.types, 'classic');
    close(cm[0].rho, 1, 1e-12);
    close(cm[1].rho, c.rho.wp, 1e-12, c.name + ' rho wp');
    close(cm[2].rho, c.rho.topsis, 1e-12, c.name + ' rho topsis');
  }
});

test('titik pergantian peringkat 1 sama dengan perhitungan analitik garis lurus', () => {
  let n = 0;
  for (const c of FX.cases) {
    const ev = T.evaluator(c.X, c.types, { normalization: 'classic' });
    const w = T.normalizeWeights(c.w);
    for (let j = 0; j < c.types.length; j++) {
      const got = T.topSwitches(ev, w, j);
      const ref = c.switches[String(j)];
      assert.equal(got.length, ref.length, `${c.name} kriteria ${j}: ${JSON.stringify(got)} vs ${JSON.stringify(ref)}`);
      got.forEach((s, k) => { close(s.x, ref[k].x, 1e-12, `${c.name}/${j} x`); assert.equal(s.from, ref[k].frm); assert.equal(s.to, ref[k].to); n++; });
      const st = T.stabilityInterval(ev, w, j);
      assert.ok(st.lo <= st.x0 + 1e-12 && st.x0 <= st.hi + 1e-12);
    }
  }
  assert.ok(n > 50, 'jumlah titik teruji ' + n);
});

test('uji rank reversal sama dengan numpy; normalisasi klasik memang bisa membalik urutan', () => {
  let flipped = 0;
  for (const c of FX.cases) {
    const rr = T.rankReversal(c.X, c.w, c.types, { normalization: 'classic' });
    assert.deepEqual(rr.map((r) => r.flips.length), c.rr, c.name);
    flipped += rr.filter((r) => r.changed).length;
  }
  assert.ok(flipped > 0);
});

test('bobot Entropy, CRITIC, dan AHP cocok dengan numpy', () => {
  let ne = 0, nc = 0;
  for (const c of FX.cases) {
    if (c.entropy) { const e = T.entropyWeights(c.X); closeArr(e.E, c.entropy.E, 1e-10); closeArr(e.w, c.entropy.w, 1e-10); ne++; }
    if (c.critic) { closeArr(T.criticWeights(c.X, c.types).w, c.critic.w, 1e-9, c.name + ' critic'); nc++; }
  }
  assert.ok(ne > 20 && nc > 20);
  for (const a of FX.ahp) {
    const r = T.ahpWeights(a.A);
    closeArr(r.w, a.res.w, 1e-9);
    close(r.lambdaMax, a.res.lambdaMax, 1e-8);
    close(r.CR, a.res.CR, 1e-8);
  }
});

test('agregasi penilai: rata-rata aritmetik dan geometrik', () => {
  for (const c of FX.cases) {
    const m = T.aggregate(c.experts, 'mean');
    const g = T.aggregate(c.experts, 'geo');
    assert.ok(m.ok && g.ok);
    m.X.forEach((row, i) => closeArr(row, c.agg.mean[i], 1e-12));
    g.X.forEach((row, i) => closeArr(row, c.agg.geo[i], 1e-12));
  }
  const bad = T.aggregate([[[1, 0]], [[2, 3]]], 'geo');
  assert.equal(bad.ok, false);
  assert.match(bad.msg, /geometrik/);
});

test('syarat data tiap normalisasi', () => {
  const X = [[0, 5], [3, 0], [4, 2]];
  const t = ['benefit', 'cost'];
  assert.deepEqual(T.checkDomain(X, t, 'classic').map((q) => q.j), [1]);
  assert.deepEqual(T.checkDomain(X, t, 'sum').map((q) => q.j), [1]);
  assert.deepEqual(T.checkDomain(X, t, 'minmax'), []);
  assert.deepEqual(T.checkDomain([[-1, 2], [3, 4]], ['benefit', 'cost'], 'classic').map((q) => q.j), [0]);
  assert.deepEqual(T.checkDomain([[0, 2], [0, 4]], ['benefit', 'cost'], 'classic').map((q) => q.j), [0]);
  // min–maks: kolom konstan bernilai 1 untuk semua (tidak memengaruhi urutan)
  const r = T.saw([[5, 1], [5, 3]], [1, 1], ['benefit', 'cost'], { normalization: 'minmax' });
  assert.deepEqual(r.R.map((x) => x[0]), [1, 1]);
  assert.deepEqual(r.R.map((x) => x[1]), [1, 0]);
  assert.equal(T.wp([[1, 0]], [1, 1], ['benefit', 'cost']), null);
  const cn = T.compareNormalizations(X, [1, 1], t, null, 'classic');
  assert.equal(cn.by.classic.available, false);
  assert.equal(cn.ref, 'minmax');
  assert.equal(cn.by.minmax.rho, 1);
});

test('sub-kriteria: cocok label dan rentang (batas inklusif, yang pertama menang)', () => {
  const labels = [{ label: 'Sangat Baik', value: 5 }, { label: 'Baik', value: 4 }, { label: 'Cukup', value: 3 }];
  assert.equal(T.matchLabel('  sangat   baik ', labels), 0);
  assert.equal(T.matchLabel('BAIK', labels), 1);
  assert.equal(T.matchLabel('Kurang', labels), -1);
  assert.equal(T.matchLabel('', labels), -1);
  const ranges = [{ min: 3.51, max: null, value: 5 }, { min: 3.01, max: 3.5, value: 4 }, { min: 2.51, max: 3.0, value: 3 }, { min: null, max: 2.5, value: 2 }];
  assert.equal(T.matchRange(3.8, ranges), 0);
  assert.equal(T.matchRange(3.51, ranges), 0);
  assert.equal(T.matchRange(3.5, ranges), 1);
  assert.equal(T.matchRange(3.505, ranges), -1, 'celah antar rentang');
  assert.equal(T.matchRange(1, ranges), 3);
  assert.equal(T.matchRange(NaN, ranges), -1);
  const ov = [{ min: 1, max: 3 }, { min: 3, max: 5 }, { min: 6, max: 4 }];
  const iss = T.rangeIssues(ov);
  assert.deepEqual(iss.overlaps, [[0, 1]]);
  assert.deepEqual(iss.inverted, [2]);
  assert.equal(T.matchRange(3, ov), 0);
});

test('peringkat seri dan Spearman', () => {
  assert.deepEqual(T.rankDesc([0.5, 0.7, 0.5, 0.1]), [2, 1, 2, 4]);
  assert.deepEqual(T.averageRanks([0.5, 0.7, 0.5, 0.1]), [2.5, 1, 2.5, 4]);
  close(T.spearman([1, 2, 3], [3, 2, 1]), -1);
  close(T.spearman([1, 1, 1], [2, 2, 2]), 1);
  assert.deepEqual(T.orderOf([0.2, 0.9, 0.9]), [1, 2, 0]);
  close(T.sum(T.adjustWeights([0.5, 0.3, 0.2], 1, 0.6)), 1, 1e-15);
  closeArr(T.adjustWeights([0.5, 0.3, 0.2], 1, 0.6), [0.5 * 0.4 / 0.7, 0.6, 0.2 * 0.4 / 0.7]);
});
