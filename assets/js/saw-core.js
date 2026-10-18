/*!
 * SAW Calculator Engine — mesin hitung (tanpa pustaka, tanpa DOM)
 * (c) 2026 Alfredo Garcia — MIT License
 *
 * Isi:
 *  - normalisasi SAW searah benefit/cost: klasik (x/maks, min/x), min–maks, jumlah
 *  - SAW: matriks ternormalisasi R, kontribusi w·r, nilai preferensi V, peringkat
 *  - pembanding: Weighted Product (WP) dan TOPSIS (normalisasi vektor), korelasi Spearman
 *  - sub-kriteria (crips): konversi label atau rentang nilai menjadi rating
 *  - agregasi beberapa penilai: rata-rata aritmetik atau geometrik
 *  - pembobotan objektif Entropy dan CRITIC; pembobotan AHP (vektor eigen, metode Harker)
 *  - sensitivitas bobot, rentang stabil, uji rank reversal, perbandingan normalisasi
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SawCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 1e-12;
  const TIE = 1e-10;

  /** Normalisasi SAW. Semua metode mengubah kriteria cost menjadi searah benefit (makin besar makin baik). */
  const NORMALIZATIONS = {
    classic: {
      label: 'SAW klasik (maks/min)', short: 'klasik',
      benefit: 'r_ij = x_ij / maks_i x_ij', cost: 'r_ij = min_i x_ij / x_ij'
    },
    minmax: {
      label: 'Min–maks (interval)', short: 'min–maks',
      benefit: 'r_ij = (x_ij − min_i x_ij) / (maks_i x_ij − min_i x_ij)', cost: 'r_ij = (maks_i x_ij − x_ij) / (maks_i x_ij − min_i x_ij)'
    },
    sum: {
      label: 'Jumlah (proporsi)', short: 'jumlah',
      benefit: 'r_ij = x_ij / Σ_i x_ij', cost: 'r_ij = (1/x_ij) / Σ_i (1/x_ij)'
    }
  };

  const AGGREGATIONS = {
    mean: { label: 'Rata-rata aritmetik', formula: 'x_ij = (1/K) Σ_k x_ij^(k)' },
    geo: { label: 'Rata-rata geometrik', formula: 'x_ij = (Π_k x_ij^(k))^(1/K)' }
  };

  const RI_TABLE = [0, 0, 0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49, 1.51, 1.48, 1.56, 1.57, 1.59];

  /* ------------------------------------------------------------------ *
   * Utilitas
   * ------------------------------------------------------------------ */

  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const column = (X, j) => X.map((r) => r[j]);
  const near = (a, b) => Math.abs(a - b) <= TIE * Math.max(1, Math.abs(a), Math.abs(b));

  /** Peringkat menurun dengan seri (1, 2, 2, 4) seperti RANK() di Excel. */
  function rankDesc(values) {
    return values.map((v) => 1 + values.filter((u) => u > v && !near(u, v)).length);
  }

  /** Peringkat rata-rata (untuk Spearman bila ada seri). */
  function averageRanks(values) {
    const idx = values.map((_, i) => i).sort((a, b) => values[b] - values[a]);
    const out = new Array(values.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && near(values[idx[j + 1]], values[idx[i]])) j++;
      const r = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) out[idx[k]] = r;
      i = j + 1;
    }
    return out;
  }

  function pearson(a, b) {
    const n = a.length;
    if (n < 2) return 0;
    const ma = sum(a) / n, mb = sum(b) / n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
    if (saa <= EPS || sbb <= EPS) return saa <= EPS && sbb <= EPS ? 1 : 0;
    return sab / Math.sqrt(saa * sbb);
  }

  /** Korelasi Spearman antar dua vektor skor (memakai peringkat rata-rata). */
  function spearman(scoresA, scoresB) {
    return pearson(averageRanks(scoresA), averageRanks(scoresB));
  }

  function argmax(a) {
    let k = 0;
    for (let i = 1; i < a.length; i++) if (a[i] > a[k] && !near(a[i], a[k])) k = i;
    return k;
  }

  function orderOf(S) { return S.map((_, i) => i).sort((a, b) => (near(S[a], S[b]) ? a - b : S[b] - S[a])); }

  function normalizeWeights(raw) {
    const w = raw.map((x) => (x > 0 && isFinite(x) ? x : 0));
    const s = sum(w);
    return s > EPS ? w.map((x) => x / s) : raw.map(() => 1 / raw.length);
  }

  /* ------------------------------------------------------------------ *
   * Normalisasi SAW
   * ------------------------------------------------------------------ */

  /**
   * Syarat data tiap metode normalisasi.
   * @returns {{j:number, msg:string}[]} masalah per kriteria (kosong = data memenuhi syarat)
   */
  function checkDomain(X, types, method) {
    const out = [];
    const n = types.length;
    for (let j = 0; j < n; j++) {
      const col = column(X, j);
      const cost = types[j] === 'cost';
      if (method === 'minmax') continue;
      if (cost) {
        if (col.some((x) => !(x > 0))) out.push({ j, msg: 'kriteria cost membutuhkan semua nilai > 0 (rumus memakai pembagian dengan x)' });
      } else if (col.some((x) => x < 0)) out.push({ j, msg: 'kriteria benefit membutuhkan nilai ≥ 0' });
      else if (!(Math.max(...col) > 0)) out.push({ j, msg: method === 'sum' ? 'jumlah nilai kriteria benefit harus > 0' : 'nilai maksimum kriteria benefit harus > 0' });
    }
    return out;
  }

  /**
   * @param {number[][]} X matriks keputusan m×n (lengkap)
   * @param {string[]} types 'benefit' | 'cost'
   * @param {string} method classic | minmax | sum
   * @returns {{R:number[][], info:object[], method:string, problems:{j,msg}[]}}
   * info[j]: {max, min, sum, sumInv, range, constant}
   */
  function normalize(X, types, method) {
    method = NORMALIZATIONS[method] ? method : 'classic';
    const m = X.length, n = types.length;
    const R = X.map(() => new Array(n).fill(0));
    const info = [];
    const problems = checkDomain(X, types, method);
    const bad = new Set(problems.map((q) => q.j));
    for (let j = 0; j < n; j++) {
      const col = column(X, j);
      const max = Math.max(...col), min = Math.min(...col), range = max - min;
      const s = sum(col);
      const sumInv = col.every((x) => x > 0) ? sum(col.map((x) => 1 / x)) : NaN;
      const constant = !(range > EPS * Math.max(1, Math.abs(max)));
      info.push({ max, min, sum: s, sumInv, range, constant });
      if (bad.has(j)) continue;
      const cost = types[j] === 'cost';
      for (let i = 0; i < m; i++) {
        const x = X[i][j];
        let r;
        if (method === 'classic') r = cost ? min / x : x / max;
        else if (method === 'minmax') r = constant ? 1 : (cost ? (max - x) / range : (x - min) / range);
        else r = cost ? (1 / x) / sumInv : x / s;
        R[i][j] = r;
      }
    }
    return { R, info, method, problems };
  }

  /* ------------------------------------------------------------------ *
   * SAW
   * ------------------------------------------------------------------ */

  /**
   * SAW lengkap.
   * @param {number[][]} X matriks keputusan (rating) m×n
   * @param {number[]} w bobot (dinormalisasi berjumlah 1)
   * @param {string[]} types
   * @param {{normalization?:string}} opts
   * @returns {{normalization, R, info, problems, w, V, S, rank, order}}  V = w·r (kontribusi), S = Σ V (nilai preferensi)
   */
  function saw(X, w, types, opts) {
    opts = opts || {};
    const W = normalizeWeights(w);
    const norm = normalize(X, types, opts.normalization || 'classic');
    const V = norm.R.map((row) => row.map((r, j) => r * W[j]));
    const S = V.map((row) => sum(row));
    return { normalization: norm.method, R: norm.R, info: norm.info, problems: norm.problems, w: W, V, S, rank: rankDesc(S), order: orderOf(S) };
  }

  /**
   * Evaluator cepat untuk banyak vektor bobot: normalisasi dihitung sekali.
   * Bobot yang diberikan dianggap sudah berjumlah 1.
   * @returns {(w:number[]) => number[]} fungsi bobot → nilai preferensi
   */
  function evaluator(X, types, opts) {
    const R = normalize(X, types, (opts && opts.normalization) || 'classic').R;
    return function (w) { return R.map((row) => row.reduce((s, r, j) => s + r * w[j], 0)); };
  }

  /* ------------------------------------------------------------------ *
   * Pembanding: Weighted Product dan TOPSIS
   * ------------------------------------------------------------------ */

  /**
   * Weighted Product: S_i = Π_j x_ij^(±w_j) (pangkat negatif untuk cost), V_i = S_i / Σ S.
   * Membutuhkan semua x > 0. Mengembalikan null bila syarat tidak terpenuhi.
   */
  function wp(X, w, types) {
    if (!X.length || X.some((r) => r.some((x) => !(x > 0)))) return null;
    const W = normalizeWeights(w);
    const exps = W.map((x, j) => (types[j] === 'cost' ? -x : x));
    const Svec = X.map((row) => row.reduce((p, x, j) => p * Math.pow(x, exps[j]), 1));
    const total = sum(Svec);
    const V = Svec.map((s) => s / total);
    return { w: W, exps, Svec, V, rank: rankDesc(V), order: orderOf(V) };
  }

  /** TOPSIS klasik (normalisasi vektor, jarak Euclidean). Mengembalikan null bila kolom bernilai nol semua. */
  function topsis(X, w, types) {
    const W = normalizeWeights(w);
    const m = X.length, n = types.length;
    const div = [];
    for (let j = 0; j < n; j++) div.push(Math.sqrt(sum(column(X, j).map((x) => x * x))));
    if (div.some((d) => !(d > EPS))) return null;
    const V = X.map((row) => row.map((x, j) => W[j] * x / div[j]));
    const Apos = [], Aneg = [];
    for (let j = 0; j < n; j++) {
      const col = column(V, j);
      const mx = Math.max(...col), mn = Math.min(...col);
      if (types[j] === 'cost') { Apos.push(mn); Aneg.push(mx); } else { Apos.push(mx); Aneg.push(mn); }
    }
    const dist = (row, t) => Math.sqrt(row.reduce((s, v, j) => s + (v - t[j]) * (v - t[j]), 0));
    const Dpos = V.map((row) => dist(row, Apos)), Dneg = V.map((row) => dist(row, Aneg));
    const C = Dpos.map((dp, i) => (dp + Dneg[i] > EPS ? Dneg[i] / (dp + Dneg[i]) : 0.5));
    void m;
    return { V, Apos, Aneg, Dpos, Dneg, C, rank: rankDesc(C), order: orderOf(C) };
  }

  /**
   * Bandingkan SAW (normalisasi yang dipilih) dengan WP dan TOPSIS pada bobot yang sama.
   * @returns {{methods: {id,label,score,rank,order,rho,available,note}[]}}
   */
  function compareMethods(X, w, types, normalization) {
    const s = saw(X, w, types, { normalization });
    const out = [{ id: 'saw', label: 'SAW', score: s.S, rank: s.rank, order: s.order, available: !s.problems.length }];
    const p = wp(X, w, types);
    out.push(p ? { id: 'wp', label: 'WP', score: p.V, rank: p.rank, order: p.order, available: true } : { id: 'wp', label: 'WP', available: false, note: 'WP membutuhkan semua nilai > 0' });
    const t = topsis(X, w, types);
    out.push(t ? { id: 'topsis', label: 'TOPSIS', score: t.C, rank: t.rank, order: t.order, available: true } : { id: 'topsis', label: 'TOPSIS', available: false, note: 'TOPSIS membutuhkan setiap kriteria memiliki nilai bukan nol' });
    for (const mth of out) mth.rho = mth.available ? spearman(s.S, mth.score) : null;
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Sub-kriteria (crips) dan agregasi penilai
   * ------------------------------------------------------------------ */

  const normText = (s) => String(s === null || s === undefined ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase();

  /** Indeks sub-kriteria label yang cocok (tanpa membedakan huruf besar/kecil), −1 bila tidak ada. */
  function matchLabel(raw, items) {
    const t = normText(raw);
    if (!t) return -1;
    return items.findIndex((it) => normText(it.label) === t);
  }

  /** Indeks rentang pertama yang memuat x (batas inklusif; batas kosong = tak terbatas), −1 bila tidak ada. */
  function matchRange(x, items) {
    if (typeof x !== 'number' || !isFinite(x)) return -1;
    return items.findIndex((it) => (it.min === null || it.min === undefined || x >= it.min - EPS) && (it.max === null || it.max === undefined || x <= it.max + EPS));
  }

  /** Rentang tumpang tindih (pasangan indeks) dan rentang terbalik (min > maks). */
  function rangeIssues(items) {
    const lo = (it) => (it.min === null || it.min === undefined ? -Infinity : it.min);
    const hi = (it) => (it.max === null || it.max === undefined ? Infinity : it.max);
    const inverted = [], overlaps = [];
    items.forEach((it, k) => { if (lo(it) > hi(it)) inverted.push(k); });
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        if (inverted.includes(a) || inverted.includes(b)) continue;
        if (Math.max(lo(items[a]), lo(items[b])) <= Math.min(hi(items[a]), hi(items[b]))) overlaps.push([a, b]);
      }
    }
    return { inverted, overlaps };
  }

  /**
   * Agregasi matriks beberapa penilai (semua lengkap, ukuran sama).
   * @param {number[][][]} mats
   * @param {'mean'|'geo'} method
   * @returns {{X:number[][], ok:boolean, msg?:string}}
   */
  function aggregate(mats, method) {
    if (!mats.length) return { X: [], ok: false, msg: 'Tidak ada penilai.' };
    const K = mats.length;
    if (method === 'geo' && mats.some((Mx) => Mx.some((r) => r.some((x) => !(x > 0))))) return { X: null, ok: false, msg: 'Rata-rata geometrik membutuhkan semua nilai penilai > 0.' };
    const X = mats[0].map((row, i) => row.map((_, j) => {
      if (method === 'geo') return Math.exp(sum(mats.map((Mx) => Math.log(Mx[i][j]))) / K);
      return sum(mats.map((Mx) => Mx[i][j])) / K;
    }));
    return { X, ok: true };
  }

  /* ------------------------------------------------------------------ *
   * Pembobotan objektif
   * ------------------------------------------------------------------ */

  /**
   * Bobot Entropy (Shannon). p_ij = x_ij / Σ_i x_ij;  e_j = −k Σ p ln p, k = 1/ln m;  d_j = 1 − e_j;  w_j = d_j / Σ d.
   * Membutuhkan nilai ≥ 0. Kolom yang seluruhnya nol dianggap tidak membawa informasi (e = 1).
   */
  function entropyWeights(X) {
    const m = X.length, n = m ? X[0].length : 0;
    const k = m > 1 ? 1 / Math.log(m) : 0;
    const P = X.map(() => new Array(n).fill(0));
    const E = [], D = [], colSum = [];
    let negative = false;
    for (let j = 0; j < n; j++) {
      const col = column(X, j);
      if (col.some((x) => x < 0)) negative = true;
      const s = sum(col);
      colSum.push(s);
      let h = 0;
      if (s > EPS) {
        for (let i = 0; i < m; i++) {
          const p = X[i][j] / s;
          P[i][j] = p;
          if (p > 0) h += p * Math.log(p);
        }
        E.push(-k * h);
      } else E.push(1);
      D.push(1 - E[j]);
    }
    const sD = sum(D);
    const w = sD > EPS ? D.map((d) => d / sD) : new Array(n).fill(1 / n);
    return { P, E, D, w, k, colSum, negative, degenerate: !(sD > EPS) };
  }

  /**
   * Bobot CRITIC (Diakoulaki dkk., 1995).
   * N: normalisasi min–maks searah (cost dibalik), σ_j simpangan baku sampel kolom N,
   * r_jk korelasi Pearson antar kolom, C_j = σ_j Σ_k (1 − r_jk), w_j = C_j / Σ C.
   */
  function criticWeights(X, types) {
    const m = X.length, n = m ? X[0].length : 0;
    const N = X.map(() => new Array(n).fill(0));
    const mins = [], maxs = [];
    for (let j = 0; j < n; j++) {
      const col = column(X, j);
      const min = Math.min(...col), max = Math.max(...col), range = max - min;
      mins.push(min); maxs.push(max);
      for (let i = 0; i < m; i++) N[i][j] = range > EPS ? (types[j] === 'cost' ? (max - X[i][j]) / range : (X[i][j] - min) / range) : 0;
    }
    const sigma = [];
    for (let j = 0; j < n; j++) {
      const col = column(N, j);
      const mean = sum(col) / m;
      sigma.push(m > 1 ? Math.sqrt(sum(col.map((x) => (x - mean) * (x - mean))) / (m - 1)) : 0);
    }
    const corr = [];
    for (let j = 0; j < n; j++) {
      corr.push([]);
      for (let k = 0; k < n; k++) corr[j].push(j === k ? 1 : (sigma[j] > EPS && sigma[k] > EPS ? pearson(column(N, j), column(N, k)) : 0));
    }
    const Cj = sigma.map((s, j) => s * sum(corr[j].map((r) => 1 - r)));
    const sC = sum(Cj);
    const w = sC > EPS ? Cj.map((c) => c / sC) : new Array(n).fill(1 / n);
    return { N, mins, maxs, sigma, corr, C: Cj, w, degenerate: !(sC > EPS) };
  }

  /* ------------------------------------------------------------------ *
   * Pembobotan AHP (perbandingan berpasangan kriteria)
   * ------------------------------------------------------------------ */

  function principalEigen(B) {
    const n = B.length;
    let x = new Array(n).fill(1 / n);
    for (let it = 0; it < 2000; it++) {
      const y = B.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
      const s = sum(y);
      const nx = y.map((v) => v / s);
      let diff = 0;
      for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(nx[i] - x[i]));
      x = nx;
      if (diff < 1e-14) break;
    }
    return x;
  }

  function connected(A) {
    const n = A.length;
    const seen = new Array(n).fill(false);
    const stack = [0];
    seen[0] = true;
    while (stack.length) {
      const i = stack.pop();
      for (let j = 0; j < n; j++) if (!seen[j] && A[i][j] !== null) { seen[j] = true; stack.push(j); }
    }
    return seen.every(Boolean);
  }

  /**
   * @param {(number|null)[][]} A matriks perbandingan n×n; A[i][j] = seberapa penting i dibanding j; null = kosong.
   * Penilaian kosong dilengkapi dengan metode Harker (1987). Bobot = vektor eigen utama.
   */
  function ahpWeights(A) {
    const n = A.length;
    if (n === 0) return null;
    if (n === 1) return { w: [1], lambdaMax: 1, CI: 0, RI: 0, CR: 0, full: [[1]], colSums: [1], normalized: [[1]], nca: [1], Aw: [1], cv: [1], missing: 0, total: 0, disconnected: false };
    let missing = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (A[i][j] === null || A[i][j] === undefined) missing++;
    const Mx = A.map((row, i) => row.map((v, j) => (i === j ? 1 : (v === null || v === undefined ? null : v))));
    const disconnected = missing > 0 && !connected(Mx);
    let w;
    if (disconnected) {
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (Mx[i][j] === null) Mx[i][j] = 1;
      w = principalEigen(Mx);
    } else {
      const B = Mx.map((row, i) => {
        const miss = row.filter((v, j) => j !== i && v === null).length;
        return row.map((v, j) => (i === j ? 1 + miss : (v === null ? 0 : v)));
      });
      w = principalEigen(B);
    }
    const full = Mx.map((row, i) => row.map((v, j) => (v === null ? w[i] / w[j] : v)));
    const colSums = [];
    for (let j = 0; j < n; j++) colSums.push(sum(full.map((r) => r[j])));
    const normalized = full.map((row) => row.map((v, j) => v / colSums[j]));
    const nca = normalized.map((row) => sum(row) / n);
    const Aw = full.map((row) => row.reduce((s, v, j) => s + v * w[j], 0));
    const cv = Aw.map((v, i) => v / w[i]);
    const lambdaMax = sum(cv) / n;
    const CI = n > 2 ? Math.max(0, (lambdaMax - n) / (n - 1)) : 0;
    const RI = RI_TABLE[n] !== undefined ? RI_TABLE[n] : 1.59;
    const CR = RI > 0 ? CI / RI : 0;
    return { w, lambdaMax, CI, RI, CR, full, colSums, normalized, nca, Aw, cv, missing, total: n * (n - 1) / 2, disconnected };
  }

  /** "3", "1/3", "0,5", "2.5" → angka; '' → null; tidak valid → NaN */
  function parseJudgment(s) {
    if (s === null || s === undefined) return null;
    const t = String(s).trim().replace(/\s+/g, '').replace(',', '.');
    if (t === '') return null;
    const m = t.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (m) { const a = Number(m[1]), b = Number(m[2]); return a > 0 && b > 0 ? a / b : NaN; }
    const v = Number(t);
    return isFinite(v) && v > 0 ? v : NaN;
  }

  /** 0.3333 → "1/3", 3 → "3", 2.5 → "2.5" */
  function formatJudgment(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    const nr = (a, b) => Math.abs(a - b) < 1e-6;
    for (let k = 1; k <= 9; k++) { if (nr(v, k)) return String(k); if (nr(v, 1 / k)) return '1/' + k; }
    if (v < 1) { const inv = 1 / v; if (nr(inv, Math.round(inv * 100) / 100)) return '1/' + +(inv.toFixed(2)); }
    return String(+v.toFixed(digits === undefined ? 3 : digits));
  }

  /* ------------------------------------------------------------------ *
   * Sensitivitas
   * ------------------------------------------------------------------ */

  /** Ubah bobot kriteria idx menjadi x; bobot lain diskalakan proporsional agar total tetap 1. */
  function adjustWeights(w0, idx, x) {
    const n = w0.length;
    x = Math.max(0, Math.min(1, x));
    const rest = 1 - w0[idx];
    return w0.map((w, k) => (k === idx ? x : (rest > EPS ? w * (1 - x) / rest : (1 - x) / (n - 1))));
  }

  /** Kurva nilai preferensi tiap alternatif ketika bobot kriteria idx bergerak 0 → 1. */
  function gradientCurves(ev, w0, idx, steps) {
    steps = steps || 100;
    const xs = [], series = [];
    for (let s = 0; s <= steps; s++) {
      const x = s / steps;
      xs.push(x);
      const V = ev(adjustWeights(w0, idx, x));
      V.forEach((v, k) => { (series[k] = series[k] || []).push(v); });
    }
    return { xs, series };
  }

  /**
   * Titik-titik bobot (0..1) tempat alternatif peringkat pertama berganti, diperhalus dengan bisection.
   * Pada SAW nilai preferensi linear terhadap bobot sehingga titik ini eksak hingga presisi bisection (≈1e-12).
   * @returns {{x:number, from:number, to:number}[]}
   */
  function topSwitches(ev, w0, idx, step) {
    step = step || 0.0025;
    // Peringkat 1 "lengket": bila seri dengan peringkat 1 sebelumnya, yang lama dipertahankan (seri bukan pergantian).
    const topAt = (x, keep) => {
      const S = ev(adjustWeights(w0, idx, x));
      const k = argmax(S);
      return keep !== undefined && keep !== k && near(S[keep], S[k]) ? keep : k;
    };
    const out = [];
    let prevX = 0, prevTop = topAt(0);
    const N = Math.round(1 / step);
    for (let s = 1; s <= N; s++) {
      const x = s / N;
      const t = topAt(x, prevTop);
      if (t !== prevTop) {
        let lo = prevX, hi = x;
        for (let it = 0; it < 44; it++) { const mid = (lo + hi) / 2; if (topAt(mid, prevTop) === prevTop) lo = mid; else hi = mid; }
        const to = topAt(hi, prevTop);
        // Satu langkah secant pada selisih skor: eksak bila skor linear terhadap bobot (SAW, WP-log tidak).
        const gap = (xx) => { const S = ev(adjustWeights(w0, idx, xx)); return S[to] - S[prevTop]; };
        const g0 = gap(prevX), g1 = gap(x);
        let xs = (lo + hi) / 2;
        if (g1 !== g0) { const cand = prevX - g0 * (x - prevX) / (g1 - g0); if (cand >= prevX && cand <= x && Math.abs(cand - xs) < 1e-6) xs = cand; }
        out.push({ x: xs, from: prevTop, to });
      }
      prevX = x; prevTop = t;
    }
    return out;
  }

  /**
   * Rentang bobot kriteria idx yang mempertahankan alternatif teratas saat ini.
   * @returns {{x0, top, lo, hi, loBy, hiBy, switches}}
   */
  function stabilityInterval(ev, w0, idx) {
    const x0 = w0[idx];
    const top = argmax(ev(w0));
    const switches = topSwitches(ev, w0, idx);
    let lo = 0, hi = 1, loBy = null, hiBy = null;
    for (const s of switches) {
      if (s.x <= x0) { lo = s.x; loBy = s.from; } else if (hiBy === null) { hi = s.x; hiBy = s.to; }
    }
    return { x0, top, lo, hi, loBy, hiBy, switches };
  }

  /* ------------------------------------------------------------------ *
   * Uji rank reversal & perbandingan normalisasi
   * ------------------------------------------------------------------ */

  /**
   * Hapus satu alternatif bergantian, hitung ulang, dan periksa apakah urutan alternatif lain berubah.
   * Pada normalisasi klasik, menghapus alternatif bernilai maks/min dapat mengubah pembagi sehingga urutan bisa berubah.
   */
  function rankReversal(X, w, types, opts) {
    const m = X.length;
    const base = saw(X, w, types, opts).S;
    const out = [];
    if (m < 3) return out;
    for (let r = 0; r < m; r++) {
      const keep = X.map((_, i) => i).filter((i) => i !== r);
      const res = saw(keep.map((i) => X[i]), w, types, opts);
      if (res.problems.length) { out.push({ removed: r, S: null, order: [], flips: [], changed: false, topChanged: false, invalid: true }); continue; }
      const newS = new Array(m).fill(null);
      keep.forEach((i, t) => { newS[i] = res.S[t]; });
      const flips = [];
      for (let a = 0; a < keep.length; a++) {
        for (let b = a + 1; b < keep.length; b++) {
          const i = keep[a], k = keep[b];
          const d0 = base[i] - base[k], d1 = newS[i] - newS[k];
          if ((d0 > TIE && d1 < -TIE) || (d0 < -TIE && d1 > TIE)) flips.push([i, k]);
        }
      }
      const order = keep.slice().sort((a, b) => (near(newS[a], newS[b]) ? a - b : newS[b] - newS[a]));
      out.push({ removed: r, S: newS, order, flips, changed: flips.length > 0, topChanged: argmax(keep.map((i) => base[i])) !== argmax(keep.map((i) => newS[i])) });
    }
    return out;
  }

  /** SAW dengan setiap metode normalisasi pada bobot yang sama; metode yang syaratnya tidak terpenuhi ditandai. */
  function compareNormalizations(X, w, types, methods, refMethod) {
    methods = methods || Object.keys(NORMALIZATIONS);
    const res = {};
    for (const mth of methods) {
      const t = saw(X, w, types, { normalization: mth });
      res[mth] = t.problems.length ? { available: false, problems: t.problems } : { available: true, S: t.S, rank: t.rank, order: t.order };
    }
    const refKey = refMethod && res[refMethod] && res[refMethod].available ? refMethod : methods.find((k) => res[k].available);
    for (const mth of methods) res[mth].rho = res[mth].available && refKey ? spearman(res[refKey].S, res[mth].S) : null;
    return { methods, by: res, ref: refKey || null };
  }

  return {
    EPS, TIE, NORMALIZATIONS, AGGREGATIONS, RI_TABLE,
    sum, column, rankDesc, averageRanks, pearson, spearman, argmax, orderOf, normalizeWeights,
    checkDomain, normalize, saw, evaluator, wp, topsis, compareMethods,
    normText, matchLabel, matchRange, rangeIssues, aggregate,
    entropyWeights, criticWeights, ahpWeights, parseJudgment, formatJudgment,
    adjustWeights, gradientCurves, topSwitches, stabilityInterval, rankReversal, compareNormalizations
  };
}));
