"""Implementasi acuan independen (numpy) untuk memeriksa saw-core.js.
Menghasilkan tests/fixtures-numpy.json: kasus acak + contoh, berisi SAW (3 normalisasi), WP, TOPSIS,
Entropy, CRITIC, AHP (numpy.linalg.eig), agregasi penilai, titik pergantian peringkat 1 (dihitung
analitik dari garis lurus, bukan bisection), dan uji rank reversal."""
import json, os
import numpy as np
from itertools import combinations

rng = np.random.default_rng(20261018)


def saw(X, w, types, method):
    X = np.asarray(X, float); w = np.asarray(w, float); w = w / w.sum()
    cost = np.array([t == 'cost' for t in types])
    mx, mn = X.max(0), X.min(0)
    if method == 'classic':
        R = np.where(cost, mn / X, X / mx)
    elif method == 'minmax':
        rngv = mx - mn
        safe = np.where(rngv > 1e-12, rngv, 1)
        R = np.where(rngv > 1e-12, np.where(cost, (mx - X) / safe, (X - mn) / safe), 1.0)
    else:
        R = np.where(cost, (1 / X) / (1 / X).sum(0), X / X.sum(0))
    V = R * w
    S = V.sum(1)
    return dict(R=R.tolist(), V=V.tolist(), S=S.tolist())


def wp(X, w, types):
    X = np.asarray(X, float); w = np.asarray(w, float); w = w / w.sum()
    e = np.where([t == 'cost' for t in types], -w, w)
    Svec = np.prod(X ** e, axis=1)
    return dict(Svec=Svec.tolist(), V=(Svec / Svec.sum()).tolist())


def topsis(X, w, types):
    X = np.asarray(X, float); w = np.asarray(w, float); w = w / w.sum()
    V = X / np.sqrt((X ** 2).sum(0)) * w
    ben = np.array([t != 'cost' for t in types])
    Ap = np.where(ben, V.max(0), V.min(0)); An = np.where(ben, V.min(0), V.max(0))
    Dp = np.sqrt(((V - Ap) ** 2).sum(1)); Dn = np.sqrt(((V - An) ** 2).sum(1))
    return dict(C=(Dn / (Dp + Dn)).tolist())


def ranks_avg(v):
    v = np.asarray(v, float)
    order = np.argsort(-v, kind='stable')
    r = np.empty(len(v))
    i = 0
    while i < len(v):
        j = i
        while j + 1 < len(v) and abs(v[order[j + 1]] - v[order[i]]) <= 1e-10 * max(1, abs(v[order[i]])):
            j += 1
        r[order[i:j + 1]] = (i + j) / 2 + 1
        i = j + 1
    return r


def spearman(a, b):
    ra, rb = ranks_avg(a), ranks_avg(b)
    if ra.std() == 0 or rb.std() == 0:
        return 1.0 if ra.std() == 0 and rb.std() == 0 else 0.0
    return float(np.corrcoef(ra, rb)[0, 1])


def entropy(X):
    X = np.asarray(X, float); m = X.shape[0]
    P = X / X.sum(0)
    L = np.where(P > 0, P * np.log(np.where(P > 0, P, 1)), 0)
    E = -L.sum(0) / np.log(m); D = 1 - E
    return dict(E=E.tolist(), w=(D / D.sum()).tolist())


def critic(X, types):
    X = np.asarray(X, float)
    mn, mx = X.min(0), X.max(0)
    N = np.where([t == 'cost' for t in types], (mx - X) / (mx - mn), (X - mn) / (mx - mn))
    s = N.std(0, ddof=1)
    r = np.corrcoef(N, rowvar=False)
    C = s * (1 - r).sum(1)
    return dict(w=(C / C.sum()).tolist())


def ahp(A):
    A = np.asarray(A, float)
    vals, vecs = np.linalg.eig(A)
    k = np.argmax(vals.real)
    w = np.abs(vecs[:, k].real); w = w / w.sum()
    n = len(A); lam = vals[k].real
    RI = [0, 0, 0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49][n]
    return dict(w=w.tolist(), lambdaMax=float(lam), CR=float((lam - n) / (n - 1) / RI))


def switches(X, w, types, method, idx):
    """Titik bobot kriteria idx (0..1) tempat peringkat 1 SAW berganti — analitik.
    S_i(x) = a_i + b_i x dengan bobot lain diskalakan proporsional."""
    R = np.asarray(saw(X, np.ones(len(types)), types, method)['R'])
    w = np.asarray(w, float); w = w / w.sum()
    rest = 1 - w[idx]
    others = [j for j in range(len(w)) if j != idx]
    a = (R[:, others] * w[others]).sum(1) / rest      # nilai saat bobot idx = 0
    b = R[:, idx] - a                                  # S_i(x) = a_i + b_i x
    pts = {0.0, 1.0}
    for i, k in combinations(range(len(a)), 2):
        if abs(b[i] - b[k]) > 1e-15:
            x = (a[k] - a[i]) / (b[i] - b[k])
            if 0 < x < 1:
                pts.add(float(x))
    pts = sorted(pts)

    def top(x):
        s = a + b * x
        best = 0
        for i in range(1, len(s)):
            if s[i] > s[best] and abs(s[i] - s[best]) > 1e-10 * max(1, abs(s[i]), abs(s[best])):
                best = i
        return best
    out = []
    # pindai segmen: peringkat 1 pada titik tengah setiap segmen
    mids = [(p0 + p1) / 2 for p0, p1 in zip(pts[:-1], pts[1:]) if p1 - p0 > 1e-9]
    bounds = [p1 for p0, p1 in zip(pts[:-1], pts[1:]) if p1 - p0 > 1e-9]
    prev = top(mids[0])
    for mid, bnd in zip(mids[1:], bounds[:-1]):
        t = top(mid)
        if t != prev:
            out.append(dict(x=bnd, frm=prev, to=t))
        prev = t
    return out


def rank_reversal(X, w, types, method):
    X = np.asarray(X, float)
    base = np.asarray(saw(X, w, types, method)['S'])
    res = []
    for r in range(len(X)):
        keep = [i for i in range(len(X)) if i != r]
        S = np.asarray(saw(X[keep], w, types, method)['S'])
        flips = 0
        for a_, b_ in combinations(range(len(keep)), 2):
            d0 = base[keep[a_]] - base[keep[b_]]; d1 = S[a_] - S[b_]
            if (d0 > 1e-10 and d1 < -1e-10) or (d0 < -1e-10 and d1 > 1e-10):
                flips += 1
        res.append(flips)
    return res


cases = []
cases.append(dict(name='supplier', X=[[8, 7, 10], [9, 8, 12], [7, 9, 9]], w=[40, 35, 25], types=['benefit', 'benefit', 'cost']))
for t in range(30):
    m = int(rng.integers(3, 9)); n = int(rng.integers(2, 7))
    X = np.round(rng.uniform(1, 100, (m, n)), 3)
    if t % 5 == 0:
        X = np.round(rng.integers(1, 6, (m, n)).astype(float), 0)   # rating 1–5 dengan banyak seri
    w = np.round(rng.uniform(1, 10, n), 2)
    types = ['cost' if rng.random() < 0.4 else 'benefit' for _ in range(n)]
    cases.append(dict(name=f'acak{t}', X=X.tolist(), w=w.tolist(), types=types))

out = []
for c in cases:
    X = np.asarray(c['X'], float)
    row = dict(c)
    row['saw'] = {mth: saw(X, c['w'], c['types'], mth) for mth in ['classic', 'minmax', 'sum']}
    row['wp'] = wp(X, c['w'], c['types'])
    row['topsis'] = topsis(X, c['w'], c['types'])
    row['rho'] = dict(wp=spearman(row['saw']['classic']['S'], row['wp']['V']), topsis=spearman(row['saw']['classic']['S'], row['topsis']['C']))
    if not np.any(X.max(0) - X.min(0) == 0):
        row['entropy'] = entropy(X)
        if len(X) >= 3:
            row['critic'] = critic(X, c['types'])
    row['switches'] = {str(j): switches(X, c['w'], c['types'], 'classic', j) for j in range(X.shape[1])}
    row['rr'] = rank_reversal(X, c['w'], c['types'], 'classic')
    # agregasi 3 penilai
    E = [np.clip(X + rng.normal(0, 3, X.shape), 0.5, None).round(3) for _ in range(3)]
    row['experts'] = [e.tolist() for e in E]
    row['agg'] = dict(mean=np.mean(E, axis=0).tolist(), geo=np.exp(np.mean(np.log(E), axis=0)).tolist())
    out.append(row)

ahps = []
for t in range(8):
    n = int(rng.integers(3, 8))
    A = np.ones((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            v = float(rng.choice([1, 2, 3, 4, 5, 6, 7, 8, 9, 1 / 2, 1 / 3, 1 / 4, 1 / 5]))
            A[i, j] = v; A[j, i] = 1 / v
    ahps.append(dict(A=A.tolist(), res=ahp(A)))

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures-numpy.json')
json.dump(dict(cases=out, ahp=ahps), open(path, 'w'))
print('ditulis', path, len(out), 'kasus')
