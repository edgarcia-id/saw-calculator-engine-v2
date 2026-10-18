/*!
 * SAW Calculator Engine — model proyek, sub-kriteria, penilai, contoh kasus, impor data, perhitungan proyek
 * (c) 2026 Alfredo Garcia — MIT License
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./saw-core.js'));
  else root.SawModel = factory(root.SawCore);
}(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';

  const APP_ID = 'saw-calculator-engine';
  const VERSION = 2;
  const STORAGE_KEY = 'saw-engine:v2:project';
  const LIMITS = { criteria: 60, alternatives: 500, experts: 20, crips: 20 };

  const WEIGHT_METHODS = {
    manual: { label: 'Manual', short: 'manual', text: 'Isi bobot sendiri (angka bebas, misalnya 40, 35, 25, atau 0,3). Bobot dinormalisasi otomatis agar totalnya 100%.' },
    equal: { label: 'Sama rata', short: 'sama rata', text: 'Semua kriteria dianggap sama penting.' },
    entropy: { label: 'Entropy', short: 'entropy', text: 'Bobot objektif dari keragaman data: kriteria yang nilainya paling bervariasi antar alternatif mendapat bobot terbesar.' },
    critic: { label: 'CRITIC', short: 'CRITIC', text: 'Bobot objektif dari kontras (simpangan baku) dan konflik (korelasi) antar kriteria.' },
    ahp: { label: 'AHP', short: 'AHP (perbandingan berpasangan)', text: 'Bandingkan kepentingan kriteria berpasangan dengan skala Saaty 1–9. Cocok untuk metode hibrida AHP-SAW.' }
  };

  const CRIPS_MODES = {
    none: { label: 'Angka langsung', text: 'Nilai matriks dipakai apa adanya (misalnya skor 1–5, harga, atau jarak).' },
    range: { label: 'Rentang nilai', text: 'Data mentah berupa angka dikonversi ke rating menurut rentang, misalnya IPK ≥ 3,51 → 5.' },
    label: { label: 'Pilihan (label)', text: 'Data berupa pilihan teks, misalnya Sangat Baik = 5, Baik = 4, Cukup = 3.' }
  };

  const DEFAULT_SETTINGS = { normalization: 'classic', decimals: 4, decimalSep: ',', aggregation: 'mean' };

  let counter = 0;
  function uid(prefix) {
    counter = (counter + 1) % 1e6;
    return (prefix || 'x') + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6) + counter.toString(36);
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ------------------------------------------------------------------ *
   * Struktur proyek
   * ------------------------------------------------------------------ */

  function crit(name, type, weight, unit, id) {
    return { id: id || uid('k'), name, type: type === 'cost' ? 'cost' : 'benefit', weight: weight === undefined ? 1 : weight, unit: unit || '', crips: { mode: 'none', items: [] } };
  }
  function alt(name, id) { return { id: id || uid('a'), name }; }
  function expert(name, id) { return { id: id || uid('e'), name }; }
  function cripsItem(label, value, min, max, id) {
    return { id: id || uid('s'), label: label || '', value: typeof value === 'number' && isFinite(value) ? value : null, min: typeof min === 'number' && isFinite(min) ? min : null, max: typeof max === 'number' && isFinite(max) ? max : null };
  }

  function newProject() {
    const now = new Date().toISOString();
    const cs = [crit('Kriteria 1', 'benefit', 1), crit('Kriteria 2', 'benefit', 1), crit('Kriteria 3', 'cost', 1)];
    const as = [alt('Alternatif 1'), alt('Alternatif 2'), alt('Alternatif 3')];
    const ex = expert('Penilai 1');
    return {
      app: APP_ID, version: VERSION,
      meta: { title: 'Proyek SAW', author: '', description: '', createdAt: now, updatedAt: now },
      criteria: cs, alternatives: as, experts: [ex], values: { [ex.id]: {} },
      weighting: { method: 'manual', ahp: {} },
      settings: Object.assign({}, DEFAULT_SETTINGS)
    };
  }

  function str(v, max, fallback) {
    const s = typeof v === 'string' ? v : (v === null || v === undefined ? '' : String(v));
    return (s.trim() ? s : (fallback || '')).slice(0, max || 160);
  }
  const numOrNull = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

  function normalizeCrips(src) {
    const mode = src && CRIPS_MODES[src.mode] ? src.mode : 'none';
    const items = Array.isArray(src && src.items) ? src.items.slice(0, LIMITS.crips).map((it) => cripsItem(str(it && it.label, 80), numOrNull(it && it.value), numOrNull(it && it.min), numOrNull(it && it.max), typeof (it && it.id) === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(it.id) ? it.id : undefined)) : [];
    return { mode, items };
  }

  /**
   * Validasi & lengkapi proyek dari JSON (berkas, penyimpanan, tautan).
   * Juga menerima proyek TOPSIS Decision Engine (nilai satu penilai).
   */
  function normalizeProject(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Berkas proyek tidak valid.');
    const fromTopsis = obj.app === 'topsis-decision-engine';
    if (obj.app && obj.app !== APP_ID && !fromTopsis) {
      if (obj.app === 'ahp-decision-engine' || Array.isArray(obj.nodes)) throw new Error('Ini berkas proyek AHP. Gunakan "Impor bobot dari proyek AHP" di langkah Kriteria & bobot.');
      throw new Error('Berkas ini bukan proyek SAW Calculator Engine.');
    }
    if (!Array.isArray(obj.criteria) || !Array.isArray(obj.alternatives)) throw new Error('Berkas proyek tidak memuat daftar kriteria dan alternatif.');
    const seen = new Set();
    const okId = (id, prefix) => { let s = typeof id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : uid(prefix); while (seen.has(s)) s = uid(prefix); seen.add(s); return s; };
    const p = newProject();
    p.meta = {
      title: str(obj.meta && obj.meta.title, 160, 'Proyek SAW'),
      author: str(obj.meta && obj.meta.author, 120),
      description: str(obj.meta && obj.meta.description, 1000),
      createdAt: (obj.meta && obj.meta.createdAt) || p.meta.createdAt,
      updatedAt: (obj.meta && obj.meta.updatedAt) || p.meta.updatedAt
    };
    p.criteria = obj.criteria.slice(0, LIMITS.criteria).map((c, j) => {
      const w = Number(c && c.weight);
      const k = crit(str(c && c.name, 160, 'Kriteria ' + (j + 1)), c && c.type, isFinite(w) && w >= 0 ? w : 1, str(c && c.unit, 40), okId(c && c.id, 'k'));
      k.crips = normalizeCrips(c && c.crips);
      return k;
    });
    p.alternatives = obj.alternatives.slice(0, LIMITS.alternatives).map((a, i) => alt(str(a && a.name, 160, 'Alternatif ' + (i + 1)), okId(a && a.id, 'a')));
    const srcExperts = !fromTopsis && Array.isArray(obj.experts) && obj.experts.length ? obj.experts.slice(0, LIMITS.experts) : [{ name: 'Penilai 1' }];
    p.experts = srcExperts.map((e, k) => expert(str(e && e.name, 80, 'Penilai ' + (k + 1)), okId(e && e.id, 'e')));
    const srcValues = obj.values && typeof obj.values === 'object' ? obj.values : {};
    p.values = {};
    p.experts.forEach((e, k) => {
      const block = fromTopsis || !Array.isArray(obj.experts) ? srcValues : (srcValues[srcExperts[k] && srcExperts[k].id] || {});
      const out = {};
      for (const a of p.alternatives) {
        const row = block[a.id];
        if (!row || typeof row !== 'object') continue;
        for (const c of p.criteria) {
          const v = row[c.id];
          if (typeof v === 'number' && isFinite(v)) (out[a.id] = out[a.id] || {})[c.id] = v;
          else if (typeof v === 'string' && v.trim()) (out[a.id] = out[a.id] || {})[c.id] = v.trim().slice(0, 80);
        }
      }
      p.values[e.id] = out;
    });
    const wm = obj.weighting && WEIGHT_METHODS[obj.weighting.method] ? obj.weighting.method : 'manual';
    p.weighting = { method: wm, ahp: {} };
    const ids = new Set(p.criteria.map((c) => c.id));
    const srcAhp = obj.weighting && obj.weighting.ahp && typeof obj.weighting.ahp === 'object' ? obj.weighting.ahp : {};
    for (const key of Object.keys(srcAhp)) {
      const [a, b] = key.split('>');
      const v = Number(srcAhp[key]);
      if (ids.has(a) && ids.has(b) && a !== b && v > 0 && isFinite(v)) p.weighting.ahp[key] = v;
    }
    const s = obj.settings || {};
    p.settings = {
      normalization: T.NORMALIZATIONS[s.normalization] ? s.normalization : DEFAULT_SETTINGS.normalization,
      decimals: [2, 3, 4, 5, 6].includes(Number(s.decimals)) ? Number(s.decimals) : DEFAULT_SETTINGS.decimals,
      decimalSep: s.decimalSep === '.' ? '.' : ',',
      aggregation: T.AGGREGATIONS[s.aggregation] ? s.aggregation : DEFAULT_SETTINGS.aggregation
    };
    return p;
  }

  function serialize(p) { return JSON.stringify(p, null, 2); }

  function saveLocal(p, storage) {
    try { (storage || localStorage).setItem(STORAGE_KEY, JSON.stringify(p)); return true; } catch (e) { return false; }
  }
  function loadLocal(storage) {
    try {
      const s = (storage || localStorage).getItem(STORAGE_KEY);
      return s ? normalizeProject(JSON.parse(s)) : null;
    } catch (e) { return null; }
  }

  /* ------------------------------------------------------------------ *
   * Nilai matriks, sub-kriteria, penilaian AHP
   * ------------------------------------------------------------------ */

  const firstExpert = (p) => p.experts[0].id;
  function getValue(p, expertId, altId, critId) {
    const block = p.values[expertId || firstExpert(p)];
    const row = block ? block[altId] : null;
    const v = row ? row[critId] : undefined;
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string' && v.trim()) return v;
    return null;
  }
  function setValue(p, expertId, altId, critId, v) {
    const eId = expertId || firstExpert(p);
    const block = p.values[eId] = p.values[eId] || {};
    const empty = v === null || v === undefined || (typeof v === 'number' && !isFinite(v)) || (typeof v === 'string' && !v.trim());
    if (empty) {
      if (block[altId]) { delete block[altId][critId]; if (!Object.keys(block[altId]).length) delete block[altId]; }
      return;
    }
    (block[altId] = block[altId] || {})[critId] = typeof v === 'string' ? v.trim().slice(0, 80) : v;
  }

  /**
   * Konversi nilai mentah menjadi rating sesuai sub-kriteria kriteria k.
   * @returns {{status:'ok'|'empty'|'nomatch'|'text', value?:number, idx?:number}}
   */
  function rating(k, raw) {
    if (raw === null || raw === undefined || raw === '') return { status: 'empty' };
    const mode = k.crips ? k.crips.mode : 'none';
    const items = k.crips ? k.crips.items : [];
    if (mode === 'label') {
      let idx = T.matchLabel(raw, items);
      if (idx < 0) {
        const v = typeof raw === 'number' ? raw : parseNumber(raw, '.');
        if (typeof v === 'number' && isFinite(v)) idx = items.findIndex((it) => it.value !== null && Math.abs(it.value - v) < 1e-12);
      }
      if (idx < 0) return { status: 'nomatch' };
      const val = items[idx].value;
      return val === null ? { status: 'nomatch', idx } : { status: 'ok', value: val, idx };
    }
    if (typeof raw !== 'number') return { status: 'text' };
    if (mode === 'range') {
      const idx = T.matchRange(raw, items);
      if (idx < 0 || items[idx].value === null) return { status: 'nomatch', idx };
      return { status: 'ok', value: items[idx].value, idx };
    }
    return { status: 'ok', value: raw };
  }

  /** Teks rentang sub-kriteria, mis. "≥ 3,51", "3,01 – 3,50", "≤ 2,50". */
  function rangeText(it, sep) {
    const f = (x) => { const s = String(+x.toPrecision(12)); return sep === ',' ? s.replace('.', ',') : s; };
    if (it.min !== null && it.max !== null) return it.min === it.max ? f(it.min) : `${f(it.min)} – ${f(it.max)}`;
    if (it.min !== null) return `≥ ${f(it.min)}`;
    if (it.max !== null) return `≤ ${f(it.max)}`;
    return 'semua nilai';
  }
  function cripsItemText(k, it, sep) {
    if (k.crips.mode === 'range') return (it.label ? it.label + ' (' + rangeText(it, sep) + ')' : rangeText(it, sep));
    return it.label;
  }

  /** Masalah konfigurasi sub-kriteria: {errors, warnings}. */
  function cripsProblems(p) {
    const errors = [], warnings = [];
    p.criteria.forEach((k) => {
      const mode = k.crips.mode, items = k.crips.items;
      if (mode === 'none') return;
      const nm = `Sub-kriteria "${k.name}"`;
      if (!items.length) { errors.push(`${nm}: tambahkan minimal satu sub-kriteria atau pilih "Angka langsung".`); return; }
      const noVal = items.filter((it) => it.value === null).length;
      if (noVal) errors.push(`${nm}: ${noVal} sub-kriteria belum memiliki nilai (rating).`);
      if (mode === 'label') {
        const empty = items.filter((it) => !it.label.trim()).length;
        if (empty) errors.push(`${nm}: ${empty} sub-kriteria belum diberi nama/label.`);
        const seen = new Set();
        for (const it of items) { const t = T.normText(it.label); if (t && seen.has(t)) { errors.push(`${nm}: label "${it.label}" dipakai lebih dari sekali.`); break; } seen.add(t); }
      } else {
        const iss = T.rangeIssues(items);
        if (iss.inverted.length) errors.push(`${nm}: batas bawah lebih besar dari batas atas pada ${iss.inverted.length} sub-kriteria.`);
        if (iss.overlaps.length) warnings.push(`${nm}: ada rentang yang tumpang tindih; nilai di daerah tumpang tindih memakai sub-kriteria yang tercantum lebih dulu.`);
      }
    });
    return { errors, warnings };
  }

  /**
   * Matriks setiap penilai: nilai mentah, rating hasil konversi, sel kosong, sel tidak cocok sub-kriteria.
   * @returns {{byExpert:{id,name,raw,X,missing,invalid}[], missing:{e,i,j}[], invalid:{e,i,j,raw}[]}}
   */
  function matrices(p) {
    const byExpert = [], missing = [], invalid = [];
    p.experts.forEach((e, ek) => {
      const eMissing = [], eInvalid = [];
      const raw = p.alternatives.map((a) => p.criteria.map((k) => getValue(p, e.id, a.id, k.id)));
      const X = raw.map((row, i) => row.map((v, j) => {
        const r = rating(p.criteria[j], v);
        if (r.status === 'empty') { eMissing.push({ e: ek, i, j }); return null; }
        if (r.status !== 'ok') { eInvalid.push({ e: ek, i, j, raw: v, status: r.status }); return null; }
        return r.value;
      }));
      missing.push(...eMissing); invalid.push(...eInvalid);
      byExpert.push({ id: e.id, name: e.name, raw, X, missing: eMissing, invalid: eInvalid });
    });
    return { byExpert, missing, invalid };
  }

  function getJudgment(p, a, b) {
    const J = p.weighting.ahp;
    if (J[a + '>' + b] !== undefined) return J[a + '>' + b];
    if (J[b + '>' + a] !== undefined) return 1 / J[b + '>' + a];
    return null;
  }
  function setJudgment(p, a, b, v) {
    const J = p.weighting.ahp;
    delete J[b + '>' + a];
    if (v === null || v === undefined || !(v > 0)) delete J[a + '>' + b];
    else J[a + '>' + b] = v;
  }
  function ahpMatrix(p) {
    return p.criteria.map((a) => p.criteria.map((b) => (a.id === b.id ? 1 : getJudgment(p, a.id, b.id))));
  }

  /** Hapus nilai & penilaian yang merujuk kriteria/alternatif/penilai yang sudah tidak ada. */
  function prune(p) {
    const cids = new Set(p.criteria.map((c) => c.id));
    const aids = new Set(p.alternatives.map((a) => a.id));
    const eids = new Set(p.experts.map((e) => e.id));
    for (const eId of Object.keys(p.values)) {
      if (!eids.has(eId)) { delete p.values[eId]; continue; }
      const block = p.values[eId];
      for (const aId of Object.keys(block)) {
        if (!aids.has(aId)) { delete block[aId]; continue; }
        for (const cId of Object.keys(block[aId])) if (!cids.has(cId)) delete block[aId][cId];
        if (!Object.keys(block[aId]).length) delete block[aId];
      }
    }
    for (const e of p.experts) if (!p.values[e.id]) p.values[e.id] = {};
    for (const key of Object.keys(p.weighting.ahp)) {
      const [a, b] = key.split('>');
      if (!cids.has(a) || !cids.has(b)) delete p.weighting.ahp[key];
    }
  }

  /* ------------------------------------------------------------------ *
   * Perhitungan proyek
   * ------------------------------------------------------------------ */

  function weightsFor(p, X, complete) {
    const n = p.criteria.length;
    const method = p.weighting.method;
    const out = { method, w: null, info: null, errors: [], warnings: [] };
    const equal = () => new Array(n).fill(n ? 1 / n : 0);
    if (!n) { out.w = []; return out; }
    if (method === 'equal') { out.w = equal(); return out; }
    if (method === 'entropy' || method === 'critic') {
      const label = WEIGHT_METHODS[method].label;
      const minAlt = method === 'critic' ? 3 : 2;
      if (!complete) { out.errors.push(`Bobot ${label} dihitung dari matriks keputusan. Lengkapi semua nilai di langkah 2 terlebih dahulu.`); out.w = equal(); return out; }
      if (X.length < minAlt) { out.errors.push(`Bobot ${label} membutuhkan minimal ${minAlt} alternatif.`); out.w = equal(); return out; }
      if (method === 'entropy') {
        const e = T.entropyWeights(X);
        if (e.negative) { out.errors.push('Bobot Entropy membutuhkan nilai ≥ 0 pada semua sel. Ubah data atau pilih metode bobot lain.'); out.w = equal(); return out; }
        if (e.degenerate) out.warnings.push('Tidak ada kriteria yang nilainya bervariasi; bobot Entropy dibuat sama rata.');
        out.w = e.w; out.info = e;
      } else {
        const k = T.criticWeights(X, p.criteria.map((c) => c.type));
        if (k.degenerate) out.warnings.push('Tidak ada kriteria yang nilainya bervariasi; bobot CRITIC dibuat sama rata.');
        out.w = k.w; out.info = k;
      }
      return out;
    }
    if (method === 'ahp') {
      const r = T.ahpWeights(ahpMatrix(p));
      out.w = r.w; out.info = r;
      if (r.missing === r.total && r.total > 0) out.warnings.push('Perbandingan berpasangan AHP belum diisi; sementara semua kriteria dianggap sama penting.');
      else if (r.missing) out.warnings.push(`${r.missing} dari ${r.total} perbandingan AHP masih kosong dan dilengkapi otomatis (metode Harker).`);
      if (r.CR > 0.1 + 1e-12) out.warnings.push(`Rasio konsistensi AHP (CR) = ${r.CR.toFixed(3).replace('.', p.settings.decimalSep)} melebihi 0,10. Tinjau ulang perbandingan berpasangan.`);
      return out;
    }
    const raw = p.criteria.map((c) => (c.weight > 0 ? c.weight : 0));
    if (!(T.sum(raw) > 0)) { out.errors.push('Isi bobot minimal satu kriteria dengan angka lebih dari 0.'); out.w = equal(); return out; }
    out.w = T.normalizeWeights(raw);
    return out;
  }

  /** Hitung seluruh proyek. Hasil `res` hanya ada bila tidak ada galat. */
  function compute(p) {
    const errors = [], warnings = [];
    const n = p.criteria.length, m = p.alternatives.length, K = p.experts.length;
    if (n < 2) errors.push('Tambahkan minimal 2 kriteria.');
    if (m < 2) errors.push('Tambahkan minimal 2 alternatif.');
    const cp = cripsProblems(p);
    errors.push(...cp.errors);
    warnings.push(...cp.warnings);
    const mats = matrices(p);
    const who = (e) => (K > 1 ? `${p.experts[e].name}: ` : '');
    p.experts.forEach((e, ek) => {
      const me = mats.byExpert[ek];
      if (me.missing.length) errors.push(`${who(ek)}${me.missing.length} sel matriks keputusan masih kosong.`);
      if (me.invalid.length) {
        const f = me.invalid[0];
        const k = p.criteria[f.j];
        const why = f.status === 'text' ? 'bukan angka' : (k.crips.mode === 'label' ? 'tidak ada di daftar sub-kriteria' : 'tidak masuk rentang sub-kriteria mana pun');
        errors.push(`${who(ek)}${me.invalid.length} sel tidak dapat dikonversi, mis. ${p.alternatives[f.i].name} — ${k.name}: "${f.raw}" ${why}.`);
      }
    });
    const complete = !mats.missing.length && !mats.invalid.length && m > 0 && n > 0;
    const agg = p.settings.aggregation;
    let X = null;
    if (complete) {
      if (K === 1) X = mats.byExpert[0].X.map((r) => r.slice());
      else {
        const a = T.aggregate(mats.byExpert.map((e) => e.X), agg);
        if (!a.ok) errors.push(a.msg); else X = a.X;
      }
    }
    const weights = weightsFor(p, X, !!X);
    for (const e of weights.errors) if (!errors.includes(e)) errors.push(e);
    warnings.push(...weights.warnings);
    const types = p.criteria.map((c) => c.type);
    const norm = p.settings.normalization;
    if (X) {
      const probs = T.checkDomain(X, types, norm);
      for (const q of probs) errors.push(`Normalisasi ${T.NORMALIZATIONS[norm].short}: "${p.criteria[q.j].name}" — ${q.msg}. Ubah data/sub-kriteria atau pilih normalisasi min–maks.`);
      p.criteria.forEach((c, j) => {
        const col = X.map((r) => r[j]);
        if (col.length > 1 && Math.max(...col) - Math.min(...col) <= T.EPS) warnings.push(`Nilai kriteria "${c.name}" sama untuk semua alternatif sehingga tidak memengaruhi peringkat.`);
      });
    }
    let res = null;
    if (!errors.length && X) res = T.saw(X, weights.w, types, { normalization: norm });
    return {
      ok: !errors.length && !!res, errors, warnings, X, mats, missing: mats.missing, invalid: mats.invalid, types, weights, res,
      normalization: norm, aggregation: agg, experts: K, hasCrips: p.criteria.some((k) => k.crips.mode !== 'none')
    };
  }

  /* ------------------------------------------------------------------ *
   * Angka & impor tabel (tempel dari Excel, CSV, XLSX)
   * ------------------------------------------------------------------ */

  function parseNumber(s, sep) {
    if (s === null || s === undefined) return null;
    if (typeof s === 'number') return isFinite(s) ? s : NaN;
    let t = String(s).trim().replace(/[\s  ]/g, '').replace(/^Rp\.?/i, '').replace(/^\$/, '').replace(/%$/, '').replace(/^\((.*)\)$/, '-$1').replace(/^−/, '-');
    if (t === '' || t === '-') return null;
    const hasDot = t.includes('.'), hasComma = t.includes(',');
    if (hasDot && hasComma) {
      t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    } else if (hasComma) {
      if (/^-?[1-9]\d{0,2}(,\d{3}){2,}$/.test(t) || (sep === '.' && /^-?[1-9]\d{0,2}(,\d{3})+$/.test(t))) t = t.replace(/,/g, '');
      else t = t.replace(',', '.');
    } else if (hasDot) {
      if (/^-?[1-9]\d{0,2}(\.\d{3}){2,}$/.test(t) || (sep === ',' && /^-?[1-9]\d{0,2}(\.\d{3})+$/.test(t))) t = t.replace(/\./g, '');
    }
    if (!/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
    const v = Number(t);
    return isFinite(v) ? v : NaN;
  }

  /** Tebak pemisah desimal dari sekumpulan sel teks. */
  function detectDecimal(cells, fallback) {
    let comma = 0, dot = 0;
    for (const c of cells) {
      const t = String(c || '').trim();
      if (/^-?\d+,\d{1,2}$/.test(t) || /^-?\d+,\d{4,}$/.test(t) || /\.\d{3},\d+$/.test(t)) comma++;
      if (/^-?\d+\.\d{1,2}$/.test(t) || /^-?\d+\.\d{4,}$/.test(t) || /,\d{3}\.\d+$/.test(t)) dot++;
    }
    if (comma > dot) return ',';
    if (dot > comma) return '.';
    return fallback || ',';
  }

  /** Teks tabel (tab dari Excel/Sheets, atau ; , ) → baris sel. */
  function parseGrid(text) {
    text = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const lines = text.split('\n');
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length) return [];
    let sep = '\t';
    // Satu kolom dari Excel berbahasa Indonesia ("3,5") tidak boleh dipecah sebagai CSV.
    if (!text.includes('\t') && !text.includes(';') && lines.every((l) => /^\s*-?[\d.]*\d(,\d+)?\s*%?\s*$/.test(l) || !l.includes(','))) {
      return lines.map((l) => [l.trim()]);
    }
    if (!text.includes('\t')) {
      const first = lines.slice(0, 5).join('\n');
      const semi = (first.match(/;/g) || []).length;
      const comma = (first.match(/,/g) || []).length;
      sep = semi > 0 && semi >= comma / 3 ? ';' : (comma > 0 ? ',' : /\s{2,}/.test(first) ? 'ws' : '\t');
      if (sep === ',' || sep === ';') return parseDelimited(text, sep);
    }
    return lines.map((l) => (sep === 'ws' ? l.trim().split(/\s{2,}/) : l.split('\t')).map((c) => c.replace(/^"(.*)"$/s, '$1').trim()));
  }

  function parseDelimited(text, sep) {
    const rows = [];
    let row = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') inQ = false; else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === sep) { row.push(cur.trim()); cur = ''; }
      else if (c === '\n') { row.push(cur.trim()); cur = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
      else cur += c;
    }
    row.push(cur.trim());
    if (row.some((x) => x !== '')) rows.push(row);
    return rows;
  }

  const TYPE_ROW = /^(jenis|tipe|type|atribut|attribute|sifat|kategori|benefit\s*\/\s*cost|cost\s*\/\s*benefit)$/i;
  const WEIGHT_ROW = /^(bobot|weight|weights|w|bobot\s*\(%\)|bobot\s*%)$/i;
  const UNIT_ROW = /^(satuan|unit)$/i;
  function parseType(s) {
    const t = String(s || '').trim().toLowerCase();
    if (/^(cost|biaya|c|min|minimal|minimize|minimum|negatif|-)$/.test(t) || /cost|biaya/.test(t)) return 'cost';
    if (/^(benefit|keuntungan|manfaat|b|max|maksimal|maximize|maksimum|positif|\+)$/.test(t) || /benefit|untung|manfaat/.test(t)) return 'benefit';
    return null;
  }


  /**
   * Tafsirkan tabel menjadi kriteria, alternatif, dan nilai.
   * Mengenali baris judul (nama kriteria), kolom nama alternatif, serta baris "Jenis"/"Bobot"/"Satuan" opsional.
   * Sel teks (mis. "Sangat Baik") dipertahankan sebagai teks untuk sub-kriteria berlabel.
   */
  function interpretGrid(grid, fallbackSep) {
    let rows = grid.map((r) => r.map((c) => (typeof c === 'number' ? c : (c === null || c === undefined ? '' : String(c).trim()))));
    rows = rows.filter((r) => r.some((c) => c !== ''));
    if (!rows.length) throw new Error('Tabel kosong.');
    let width = Math.max(...rows.map((r) => r.length));
    while (width > 0 && rows.every((r) => r[width - 1] === '' || r[width - 1] === undefined)) width--;
    rows = rows.map((r) => { const x = r.slice(0, width); while (x.length < width) x.push(''); return x; });
    const numericCells = [];
    rows.forEach((r) => r.forEach((c) => { if (typeof c === 'string' && /\d/.test(c)) numericCells.push(c); }));
    const sep = detectDecimal(numericCells, fallbackSep);
    const isNum = (c) => c !== '' && !Number.isNaN(parseNumber(c, sep)) && parseNumber(c, sep) !== null;

    const special = (r) => TYPE_ROW.test(r[0]) || WEIGHT_ROW.test(r[0]) || UNIT_ROW.test(r[0]);
    const dataLike = rows.filter((r) => !special(r));
    const hasNameCol = dataLike.slice(1).some((r) => r[0] !== '' && !isNum(r[0])) || rows.some(special) || (dataLike.length === 1 && !isNum(dataLike[0][0]));
    const c0 = hasNameCol ? 1 : 0;
    let header = null;
    const first = rows.findIndex((r) => !special(r));
    // Baris judul: baris pertama non-khusus yang sel kriterianya memuat teks
    if (first >= 0 && rows[first].slice(c0).some((c) => c !== '' && !isNum(c))) header = first;

    const n = width - c0;
    if (n < 1) throw new Error('Tidak ada kolom nilai kriteria.');
    const names = [];
    for (let j = 0; j < n; j++) names.push(header !== null && rows[header][c0 + j] !== '' ? String(rows[header][c0 + j]) : 'Kriteria ' + (j + 1));
    let types = null, weights = null, units = null;
    const alts = [];
    let text = 0;
    rows.forEach((r, ri) => {
      if (ri === header) return;
      if (hasNameCol && TYPE_ROW.test(r[0])) { types = r.slice(c0).map(parseType); return; }
      if (hasNameCol && WEIGHT_ROW.test(r[0])) { weights = r.slice(c0).map((c) => { const v = parseNumber(c, sep); return v === null || Number.isNaN(v) ? null : v; }); return; }
      if (hasNameCol && UNIT_ROW.test(r[0])) { units = r.slice(c0).map(String); return; }
      const values = r.slice(c0).map((c) => {
        const v = parseNumber(c, sep);
        if (Number.isNaN(v)) { text++; return String(c).slice(0, 80); }
        return v;
      });
      alts.push({ name: hasNameCol && r[0] !== '' ? String(r[0]) : 'Alternatif ' + (alts.length + 1), values });
    });
    if (!alts.length) throw new Error('Tidak ada baris alternatif yang terbaca.');
    // kolom yang seluruh isinya teks → kandidat sub-kriteria berlabel
    const textCols = names.map((_, j) => { const col = alts.map((a) => a.values[j]).filter((v) => v !== null && v !== ''); return col.length > 0 && col.every((v) => typeof v === 'string'); });
    return { names, types, weights, units, alts, text, bad: 0, textCols, hasHeader: header !== null, hasNameCol, decimalSep: sep };
  }

  /**
   * Terapkan hasil interpretGrid ke proyek (mengganti tabel untuk satu penilai). Kriteria/alternatif bernama sama
   * dipertahankan id-nya sehingga jenis, bobot, sub-kriteria, dan penilaian AHP tidak hilang.
   * Kolom teks pada kriteria tanpa sub-kriteria diubah menjadi sub-kriteria berlabel (nilai rating diisi pengguna).
   */
  function applyGrid(p, g, expertId) {
    const eId = expertId && p.experts.some((e) => e.id === expertId) ? expertId : firstExpert(p);
    const byName = (list, name) => list.find((x) => x.name.trim().toLowerCase() === String(name).trim().toLowerCase());
    let criteria;
    if (!g.hasHeader && g.names.length === p.criteria.length) criteria = p.criteria.slice();
    else {
      const used = new Set();
      criteria = g.names.map((name) => {
        const ex = byName(p.criteria.filter((c) => !used.has(c.id)), name);
        if (ex) { used.add(ex.id); return ex; }
        return crit(name.slice(0, 160), 'benefit', 1);
      });
    }
    let newLabelCrit = 0;
    criteria.forEach((c, j) => {
      if (g.types && g.types[j]) c.type = g.types[j];
      if (g.weights && g.weights[j] !== null && g.weights[j] !== undefined && g.weights[j] >= 0) c.weight = g.weights[j];
      if (g.units && g.units[j] !== undefined && g.units[j] !== '') c.unit = String(g.units[j]).slice(0, 40);
      if (g.textCols && g.textCols[j] && c.crips.mode !== 'label') {
        const seen = new Map();
        g.alts.forEach((a) => { const v = a.values[j]; if (typeof v === 'string' && v.trim() && !seen.has(T.normText(v))) seen.set(T.normText(v), v.trim()); });
        c.crips = { mode: 'label', items: Array.from(seen.values()).slice(0, LIMITS.crips).map((lab) => cripsItem(lab.slice(0, 80), null)) };
        newLabelCrit++;
      }
    });
    const usedA = new Set();
    const alternatives = g.alts.map((a) => {
      const ex = byName(p.alternatives.filter((x) => !usedA.has(x.id)), a.name);
      if (ex) { usedA.add(ex.id); return ex; }
      return alt(String(a.name).slice(0, 160));
    });
    let bad = 0;
    const block = {};
    g.alts.forEach((a, i) => {
      a.values.forEach((v, j) => {
        if (j >= criteria.length || v === null || v === '') return;
        if (typeof v === 'string' && criteria[j].crips.mode !== 'label') { bad++; return; }
        (block[alternatives[i].id] = block[alternatives[i].id] || {})[criteria[j].id] = v;
      });
    });
    p.criteria = criteria;
    p.alternatives = alternatives;
    p.values[eId] = block;
    if (g.weights && g.weights.some((v) => v > 0) && p.weighting.method === 'equal') p.weighting.method = 'manual';
    prune(p);
    return { criteria: criteria.length, alternatives: alternatives.length, bad, labelCriteria: newLabelCrit };
  }

  /** Baris tabel data satu penilai yang bisa diimpor kembali (CSV / sheet "Data"). */
  function dataRows(p, expertId) {
    const eId = expertId || firstExpert(p);
    const rows = [];
    rows.push(['Alternatif'].concat(p.criteria.map((c) => c.name)));
    rows.push(['Jenis'].concat(p.criteria.map((c) => (c.type === 'cost' ? 'Cost' : 'Benefit'))));
    rows.push(['Bobot'].concat(p.criteria.map((c) => c.weight)));
    rows.push(['Satuan'].concat(p.criteria.map((c) => c.unit || '')));
    for (const a of p.alternatives) rows.push([a.name].concat(p.criteria.map((c) => { const v = getValue(p, eId, a.id, c.id); return v === null ? '' : v; })));
    return rows;
  }

  /* ------------------------------------------------------------------ *
   * Impor bobot dari proyek AHP Decision Engine
   * ------------------------------------------------------------------ */

  function importAhpProject(p, ahpProject, AHPModel) {
    const c = AHPModel.compute(ahpProject, 'combined');
    const leaves = c.synth.leaves;
    if (leaves.length < 2) throw new Error('Proyek AHP harus memiliki minimal 2 kriteria penilai.');
    const byName = (list, name) => list.find((x) => x.name.trim().toLowerCase() === String(name).trim().toLowerCase());
    const used = new Set();
    const criteria = leaves.map((id) => {
      const node = AHPModel.nodeById(ahpProject, id);
      const ex = byName(p.criteria.filter((x) => !used.has(x.id)), node.name);
      const cr = ex || crit(node.name.slice(0, 160), node.dataType === 'cost' ? 'cost' : 'benefit', 1, node.unit || '');
      used.add(cr.id);
      if (node.mode === 'data') { cr.type = node.dataType === 'cost' ? 'cost' : 'benefit'; if (node.unit) cr.unit = String(node.unit).slice(0, 40); }
      cr.weight = +(c.synth.global[id] * 100).toFixed(6);
      return { cr, id, node };
    });
    let altsReplaced = false;
    const eId = firstExpert(p);
    if (ahpProject.alternatives.length >= 2) {
      const usedA = new Set();
      p.alternatives = ahpProject.alternatives.map((a) => {
        const ex = byName(p.alternatives.filter((x) => !usedA.has(x.id)), a.name);
        const out = ex || alt(a.name.slice(0, 160));
        usedA.add(out.id);
        return { out, src: a };
      }).map((x) => {
        for (const { cr, id, node } of criteria) {
          if (node.mode !== 'data') continue;
          const row = ahpProject.data[id] || {};
          const v = row[x.src.id];
          if (typeof v === 'number' && isFinite(v) && getValue(p, eId, x.out.id, cr.id) === null) setValue(p, eId, x.out.id, cr.id, v);
        }
        return x.out;
      });
      altsReplaced = true;
    }
    p.criteria = criteria.map((x) => x.cr);
    p.weighting.method = 'manual';
    prune(p);
    const inconsistent = c.issues.filter((x) => x.type === 'inconsistent').length;
    return { criteria: criteria.length, alternatives: altsReplaced ? p.alternatives.length : 0, inconsistent, title: ahpProject.meta.title };
  }

  /* ------------------------------------------------------------------ *
   * Tautan proyek (tanpa server)
   * ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ *
   * Tautan proyek (tanpa server)
   * ------------------------------------------------------------------ */

  function b64urlFromBytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function bytesFromB64url(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function streamBytes(stream) {
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }
  async function encodePayload(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === 'function') {
      try {
        const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        return 'z' + b64urlFromBytes(await streamBytes(cs));
      } catch (e) { /* fallback */ }
    }
    return 'j' + b64urlFromBytes(bytes);
  }
  async function decodePayload(code) {
    code = String(code || '').trim();
    const m = code.match(/[#&?]proyek=([A-Za-z0-9_-]+)/);
    if (m) code = m[1];
    const kind = code[0];
    const bytes = bytesFromB64url(code.slice(1));
    let text;
    if (kind === 'z') {
      if (typeof DecompressionStream !== 'function') throw new Error('Browser ini belum mendukung dekompresi. Gunakan Chrome, Edge, Firefox, atau Safari terbaru.');
      const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      text = new TextDecoder().decode(await streamBytes(ds));
    } else if (kind === 'j') text = new TextDecoder().decode(bytes);
    else throw new Error('Tautan tidak dikenali.');
    return JSON.parse(text);
  }

  /* ------------------------------------------------------------------ *
   * Contoh kasus
   * ------------------------------------------------------------------ */

  function build(spec) {
    const p = newProject();
    p.meta.title = spec.title;
    p.meta.description = spec.description || '';
    p.criteria = spec.criteria.map(([name, type, weight, unit, cr]) => {
      const k = crit(name, type, weight, unit);
      if (cr) k.crips = { mode: cr.mode, items: cr.items.map((it) => (cr.mode === 'range' ? cripsItem(it[0], it[1], it[2], it[3]) : cripsItem(it[0], it[1]))) };
      return k;
    });
    const altNames = spec.alternatives.map((a) => a[0]);
    p.alternatives = altNames.map((nm) => alt(nm));
    const experts = spec.experts || [{ name: 'Penilai 1', rows: spec.alternatives.map((a) => a[1]) }];
    p.experts = experts.map((e) => expert(e.name));
    p.values = {};
    experts.forEach((e, k) => {
      p.values[p.experts[k].id] = {};
      e.rows.forEach((vals, i) => vals.forEach((v, j) => setValue(p, p.experts[k].id, p.alternatives[i].id, p.criteria[j].id, v)));
    });
    p.weighting.method = spec.method || 'manual';
    if (spec.ahp) for (const [a, b, v] of spec.ahp) setJudgment(p, p.criteria[a].id, p.criteria[b].id, v);
    if (spec.aggregation) p.settings.aggregation = spec.aggregation;
    return p;
  }

  const SKALA5 = { mode: 'label', items: [['Sangat Baik', 5], ['Baik', 4], ['Cukup', 3], ['Kurang', 2], ['Sangat Kurang', 1]] };
  const L5 = ['', 'Sangat Kurang', 'Kurang', 'Cukup', 'Baik', 'Sangat Baik'];

  const SAMPLES = {
    supplier: () => build({
      title: 'Pemilihan supplier',
      description: 'Tiga supplier dinilai dari kualitas, ketepatan pengiriman, dan harga. Data sama dengan contoh kalkulator TOPSIS sehingga hasil kedua metode bisa dibandingkan.',
      criteria: [['Kualitas', 'benefit', 40, 'skor 1–10'], ['Ketepatan pengiriman', 'benefit', 35, 'skor 1–10'], ['Harga', 'cost', 25, 'juta rupiah']],
      alternatives: [['Supplier A', [8, 7, 10]], ['Supplier B', [9, 8, 12]], ['Supplier C', [7, 9, 9]]]
    }),
    beasiswa: () => build({
      title: 'Seleksi penerima beasiswa',
      description: 'Contoh khas skripsi sistem pendukung keputusan: data mentah (IPK, penghasilan, tanggungan, prestasi, organisasi) dikonversi ke nilai sub-kriteria (crips) sebelum dihitung dengan SAW.',
      criteria: [
        ['IPK', 'benefit', 30, 'skala 4', { mode: 'range', items: [['Sangat memuaskan', 5, 3.51, null], ['Memuaskan', 4, 3.01, 3.5], ['Cukup', 3, 2.76, 3.0], ['Kurang', 2, 2.51, 2.75], ['Sangat kurang', 1, null, 2.5]] }],
        ['Penghasilan orang tua', 'cost', 25, 'juta/bulan', { mode: 'range', items: [['Sangat rendah', 1, null, 1], ['Rendah', 2, 1.01, 2.5], ['Sedang', 3, 2.51, 4], ['Tinggi', 4, 4.01, 6], ['Sangat tinggi', 5, 6.01, null]] }],
        ['Jumlah tanggungan', 'benefit', 20, 'orang', { mode: 'range', items: [['1 orang', 1, null, 1], ['2 orang', 2, 2, 2], ['3 orang', 3, 3, 3], ['4 orang', 4, 4, 4], ['≥ 5 orang', 5, 5, null]] }],
        ['Prestasi non-akademik', 'benefit', 15, 'tingkat', { mode: 'label', items: [['Internasional', 5], ['Nasional', 4], ['Provinsi', 3], ['Kabupaten/Kota', 2], ['Tidak ada', 1]] }],
        ['Keaktifan organisasi', 'benefit', 10, '', { mode: 'label', items: [['Pengurus inti', 4], ['Pengurus', 3], ['Anggota', 2], ['Tidak aktif', 1]] }]
      ],
      alternatives: [
        ['Andi', [3.45, 4.5, 3, 'Provinsi', 'Anggota']],
        ['Bunga', [3.8, 7.0, 2, 'Nasional', 'Pengurus']],
        ['Citra', [3.2, 2.2, 4, 'Kabupaten/Kota', 'Pengurus inti']],
        ['Dimas', [3.65, 3.0, 5, 'Provinsi', 'Pengurus']],
        ['Eka', [3.9, 9.5, 1, 'Internasional', 'Pengurus inti']],
        ['Fajar', [3.05, 1.8, 3, 'Tidak ada', 'Anggota']],
        ['Gita', [2.9, 0.9, 6, 'Kabupaten/Kota', 'Tidak aktif']],
        ['Hadi', [3.55, 2.8, 4, 'Nasional', 'Anggota']]
      ]
    }),
    karyawan: () => {
      const names = ['Ayu', 'Bagus', 'Cahya', 'Dewi', 'Erik', 'Fitri'];
      const raters = [
        ['Manajer', [[5, 4, 4, 3, 5], [4, 5, 3, 4, 4], [3, 4, 5, 5, 3], [4, 4, 4, 4, 4], [5, 3, 3, 4, 5], [3, 5, 4, 3, 4]]],
        ['Supervisor', [[4, 4, 5, 3, 4], [5, 5, 4, 3, 4], [3, 3, 5, 5, 4], [4, 5, 4, 4, 3], [5, 4, 3, 5, 5], [4, 4, 4, 3, 3]]],
        ['Rekan kerja', [[4, 5, 4, 4, 4], [4, 4, 4, 4, 5], [4, 4, 5, 4, 3], [5, 4, 5, 3, 4], [4, 3, 4, 4, 4], [3, 4, 5, 4, 4]]]
      ];
      return build({
        title: 'Karyawan terbaik (AHP-SAW, 3 penilai)',
        description: 'Tiga penilai memberi nilai Sangat Kurang–Sangat Baik; nilai digabung dengan rata-rata, bobot kriteria dari perbandingan berpasangan AHP, peringkat dari SAW.',
        method: 'ahp',
        criteria: [['Kualitas kerja', 'benefit', 1, '', SKALA5], ['Kedisiplinan', 'benefit', 1, '', SKALA5], ['Kerja sama tim', 'benefit', 1, '', SKALA5], ['Inisiatif', 'benefit', 1, '', SKALA5], ['Tanggung jawab', 'benefit', 1, '', SKALA5]],
        ahp: [[0, 1, 2], [0, 2, 3], [0, 3, 3], [0, 4, 1], [1, 2, 2], [1, 3, 2], [1, 4, 1 / 2], [2, 3, 1], [2, 4, 1 / 3], [3, 4, 1 / 3]],
        alternatives: names.map((nm) => [nm]),
        experts: raters.map(([nm, rows]) => ({ name: nm, rows: rows.map((r) => r.map((v) => L5[v])) }))
      });
    },
    lokasi: () => build({
      title: 'Lokasi usaha baru (Entropy-SAW)',
      description: 'Bobot dihitung objektif dari data dengan metode Entropy, lalu diperingkat dengan SAW (Entropy-SAW).',
      method: 'entropy',
      criteria: [['Harga sewa', 'cost', 1, 'juta/tahun'], ['Luas bangunan', 'benefit', 1, 'm²'], ['Kepadatan penduduk', 'benefit', 1, 'jiwa/km²'], ['Jarak ke pemasok', 'cost', 1, 'km'], ['Akses jalan', 'benefit', 1, 'skor 1–5']],
      alternatives: [['Ruko Jalan Merdeka', [85, 120, 9800, 12, 5]], ['Ruko Pasar Baru', [60, 90, 12500, 8, 4]], ['Gudang Tanjung', [45, 200, 3100, 3, 3]], ['Kios Stasiun', [70, 60, 15200, 15, 4]], ['Ruko Perumahan Asri', [55, 110, 6400, 10, 3]]]
    })
  };

  const SAMPLE_INFO = [
    { id: 'beasiswa', title: 'Seleksi penerima beasiswa (dengan sub-kriteria)', text: '5 kriteria, 8 mahasiswa. Data mentah IPK, penghasilan, tanggungan dikonversi lewat rentang; prestasi dan organisasi lewat pilihan label.' },
    { id: 'supplier', title: 'Pemilihan supplier', text: '3 kriteria (2 benefit, 1 cost), 3 supplier, bobot 40/35/25. Data sama dengan contoh TOPSIS.' },
    { id: 'karyawan', title: 'Karyawan terbaik (AHP-SAW, 3 penilai)', text: '5 kriteria berskala Sangat Kurang–Sangat Baik, 6 karyawan, 3 penilai digabung rata-rata, bobot AHP.' },
    { id: 'lokasi', title: 'Lokasi usaha baru (Entropy-SAW)', text: '5 kriteria, 5 lokasi, bobot objektif dari data dengan metode Entropy.' }
  ];

  function sampleProject(id) { return (SAMPLES[id] || SAMPLES.beasiswa)(); }

  return {
    APP_ID, VERSION, STORAGE_KEY, LIMITS, WEIGHT_METHODS, CRIPS_MODES, DEFAULT_SETTINGS, SAMPLE_INFO,
    uid, clone, crit, alt, expert, cripsItem, newProject, normalizeProject, serialize, saveLocal, loadLocal,
    getValue, setValue, rating, rangeText, cripsItemText, cripsProblems, matrices, getJudgment, setJudgment, ahpMatrix, prune,
    weightsFor, compute, parseNumber, detectDecimal, parseGrid, parseDelimited, interpretGrid, applyGrid, dataRows, parseType,
    importAhpProject, encodePayload, decodePayload, sampleProject
  };
}));
