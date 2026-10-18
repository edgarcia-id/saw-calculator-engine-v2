# ⚖️ SAW Calculator Engine

**Kalkulator SAW (Simple Additive Weighting) gratis untuk mahasiswa, dosen, dan peneliti.** Tentukan kriteria benefit/cost dan bobot, konversi data mentah ke nilai sub-kriteria (crips), gabungkan penilaian beberapa orang, lalu lihat peringkat beserta seluruh langkah perhitungan lengkap dengan rumus dan contoh hitung manual. Uji sensitivitas, bandingkan dengan WP dan TOPSIS, lalu unduh laporan PDF, Word, dan Excel dengan rumus hidup yang siap dilampirkan di skripsi. Semuanya berjalan di browser: tanpa akun, tanpa server, tanpa biaya.

*English: a free, browser-only Simple Additive Weighting (SAW) calculator with sub-criteria (crisp) conversion, group assessment, objective (Entropy, CRITIC) and AHP weighting, step-by-step tables, exact weight-sensitivity analysis, comparison with WP and TOPSIS, and PDF/Word/Excel reports with live formulas.*

[![Buka aplikasi](https://img.shields.io/badge/Buka_aplikasi-SAW_Calculator_Engine-4f46e5?style=for-the-badge&logo=githubpages)](https://edgarcia-id.github.io/saw-calculator-engine-v2/)
[![Metode](https://img.shields.io/badge/Metode-SAW_Fishburn_%26_MacCrimmon-10b981?style=for-the-badge)](#metode-dan-rumus)
[![Arsitektur](https://img.shields.io/badge/Arsitektur-100%25_di_browser-f59e0b?style=for-the-badge)](#privasi)
[![Lisensi](https://img.shields.io/badge/Lisensi-MIT-0f172a?style=for-the-badge)](LICENSE)

👉 **[edgarcia-id.github.io/saw-calculator-engine-v2](https://edgarcia-id.github.io/saw-calculator-engine-v2/)**

---

## Fitur

### Input data
- Kriteria dengan **jenis Benefit/Cost**, satuan, dan bobot (angka bebas atau desimal, dinormalisasi otomatis).
- **Sub-kriteria (crips)** per kriteria, seperti tabel sub-kriteria pada skripsi SPK:
  - **Rentang nilai**, misalnya IPK ≥ 3,51 → 5; 3,01–3,50 → 4. Batas inklusif, batas kosong = tanpa batas. Tersedia tombol *Buat 5 kelas dari data*.
  - **Pilihan (label)**, misalnya Sangat Baik = 5, Baik = 4. Tersedia templat skala 5, 4, 3, dan Ya/Tidak, serta *Ambil label dari data*.
  - Sel matriks menampilkan hasil konversi langsung (*3,45 → 4*). Sel yang tidak cocok dengan sub-kriteria mana pun ditandai.
- **Penilaian kelompok**: beberapa penilai (misalnya manajer, supervisor, rekan kerja) mengisi matriks masing-masing, lalu nilainya digabung dengan **rata-rata aritmetik** atau **geometrik**.
- Matriks seperti spreadsheet: **salin blok dari Excel/Google Sheets lalu Ctrl+V** di sel mana pun; kolom berlabel menerima teks.
- **Tempel tabel utuh** (judul kriteria, nama alternatif, baris *Jenis*, *Bobot*, *Satuan*), **impor CSV** dan **impor Excel .xlsx**. Kolom berisi teks otomatis dijadikan sub-kriteria berlabel.
- Angka format Indonesia maupun Inggris dikenali: `3,5`, `1.250.000`, `1,234.5`, `Rp 12.500`, `85%`.
- Empat contoh siap pakai:
  - seleksi beasiswa dengan sub-kriteria;
  - pemilihan supplier (data sama dengan contoh TOPSIS);
  - karyawan terbaik dengan 3 penilai dan bobot AHP (AHP-SAW);
  - lokasi usaha dengan bobot Entropy (Entropy-SAW).
- Bisa membuka berkas proyek **TOPSIS Decision Engine** dan mengimpor bobot dari proyek **AHP Decision Engine**.

### Pembobotan
| Metode | Keterangan |
|---|---|
| Manual | angka bebas (mis. 30, 25, 20 atau 0,3), dinormalisasi otomatis menjadi 100% |
| Sama rata | semua kriteria sama penting |
| **Entropy** | bobot objektif dari keragaman data (Shannon) |
| **CRITIC** | bobot objektif dari kontras dan konflik antar kriteria (Diakoulaki dkk., 1995) |
| **AHP** | perbandingan berpasangan skala Saaty 1–9, vektor eigen utama, CR, metode Harker untuk sel kosong |

### Hasil
- Kesimpulan otomatis dan tabel peringkat nilai preferensi **V**.
- **Langkah perhitungan lengkap**, masing-masing dengan rumus, **contoh hitung manual**, dan tombol *Salin* yang menempel sebagai tabel di Word maupun Excel:
  - tabel sub-kriteria dan konversi data → rating;
  - penggabungan penilai;
  - matriks keputusan dan bobot;
  - normalisasi R, dengan baris maks/min yang dipakai;
  - kontribusi w × r dan nilai preferensi V;
  - perangkingan.
- Rincian bobot Entropy (p, e, d, w), CRITIC (N, σ, korelasi, C, w), atau AHP (normalisasi, NCA, vektor eigen, λ maks, CI, RI, CR).
- Diagram:
  - nilai preferensi V;
  - **kontribusi setiap kriteria bertumpuk**, yang memperlihatkan kriteria mana yang membuat alternatif unggul;
  - peta panas nilai ternormalisasi;
  - radar alternatif teratas;
  - bobot kriteria.

  Setiap diagram bisa diunduh **PNG/SVG** dan dilihat sebagai tabel.

### Uji ketahanan
- **Gradien bobot**: V tiap alternatif saat bobot satu kriteria diubah 0–100%. Karena V linear terhadap bobot, titik pergantian peringkat pertama dihitung eksak, dan **rentang stabil** ditampilkan untuk semua kriteria.
- **Simulasi bobot**: geser slider, peringkat berubah langsung.
- **SAW vs WP vs TOPSIS**: peringkat ketiga metode pada data dan bobot yang sama, dengan korelasi Spearman.
- **Perbandingan normalisasi**: SAW klasik (maks/min), min–maks, dan jumlah.
- **Uji rank reversal**: hapus satu alternatif bergantian, lalu periksa apakah urutan alternatif lain berubah.

### Unduhan
- **Laporan PDF** berisi:
  - identitas dan kesimpulan;
  - hasil dan semua diagram;
  - bobot dan rinciannya, serta sub-kriteria;
  - data penilaian setiap penilai;
  - empat langkah SAW dengan rumus dan contoh;
  - sensitivitas, uji ketahanan, dan rujukan sesuai metode.
- **Laporan Word (.docx)**: isi yang sama dengan PDF dalam bentuk judul, tabel bernomor, dan gambar bernomor yang bisa disunting langsung untuk Bab IV skripsi.
- **Excel (.xlsx) dengan rumus hidup**:
  - sheet *Data* untuk setiap penilai: sel kuning, dropdown Benefit/Cost dan label sub-kriteria, bisa diimpor kembali;
  - *Sub-kriteria*;
  - *Rating* dengan rumus konversi rentang/label dan `AVERAGE`/`GEOMEAN` untuk gabungan penilai;
  - sheet bobot Entropy/CRITIC/AHP;
  - *Perhitungan* dengan `MAX`, `MIN`, `SUM`, dan `RANK`;
  - *Sensitivitas* dan *Uji ketahanan*.

  Ubah satu nilai di sheet Data atau Sub-kriteria, seluruh langkah dihitung ulang.
- **CSV** hasil dan data, **proyek .json**, dan **tautan proyek** (data terkompresi di dalam tautan, tanpa server) untuk dikirim ke dosen pembimbing.

## Cara memakai

1. **Kriteria & bobot**: tulis kriteria, pilih Benefit/Cost, isi bobot atau pilih metode bobot.
2. **Sub-kriteria** (opsional): atur konversi rentang atau label menjadi nilai rating.
3. **Penilaian**: isi data mentah setiap alternatif (ketik, tempel dari Excel, atau impor CSV/XLSX). Tambahkan penilai bila penilaian dilakukan beberapa orang.
4. **Hasil**: peringkat, diagram, dan langkah perhitungan.
5. **Sensitivitas**: gradien bobot, simulasi, perbandingan metode dan normalisasi, rank reversal.
6. **Laporan & unduh**: PDF, Word, Excel, CSV, JSON, tautan.

## Metode dan rumus

0. Bila ada sub-kriteria, data mentah x dikonversi menjadi rating. Bila ada beberapa penilai, rating digabung:
   - aritmetik: x<sub>ij</sub> = (1/K) Σ<sub>k</sub> x<sub>ij</sub><sup>(k)</sup>;
   - geometrik: x<sub>ij</sub> = (Π<sub>k</sub> x<sub>ij</sub><sup>(k)</sup>)<sup>1/K</sup>.
1. Normalisasi SAW klasik (Kusumadewi dkk., 2006):
   - benefit: r<sub>ij</sub> = x<sub>ij</sub> / maks<sub>i</sub> x<sub>ij</sub>;
   - cost: r<sub>ij</sub> = min<sub>i</sub> x<sub>ij</sub> / x<sub>ij</sub>;
   - pilihan lain: min–maks (interval) dan jumlah (cost memakai 1/x).
2. Nilai preferensi: V<sub>i</sub> = Σ<sub>j</sub> w<sub>j</sub> r<sub>ij</sub>, dengan Σw = 1.
3. Peringkat 1 = V terbesar. Nilai seri mendapat peringkat sama, seperti `RANK()` di Excel.

Syarat data normalisasi klasik: benefit ≥ 0 dengan maksimum > 0, dan cost > 0. Aplikasi memberi pesan jelas bila tidak terpenuhi dan menyarankan normalisasi min–maks.

Pembanding:
- **WP**: S<sub>i</sub> = Π<sub>j</sub> x<sub>ij</sub><sup>±w<sub>j</sub></sup> (pangkat negatif untuk cost), V<sub>i</sub> = S<sub>i</sub>/ΣS.
- **TOPSIS**: normalisasi vektor, jarak Euclidean, C* = D⁻/(D⁺ + D⁻).

Sensitivitas: bobot satu kriteria diubah, bobot lain diskalakan proporsional. V<sub>i</sub>(x) linear sehingga titik pergantian ditemukan dengan pemindaian, bisection, lalu satu langkah secant yang eksak.

### Validasi

- 18 unit test (`node --test tests/*.test.js`), termasuk pembanding terhadap implementasi numpy independen untuk 31 kasus:
  - SAW pada tiga normalisasi, WP, TOPSIS, dan korelasi Spearman;
  - bobot Entropy dan CRITIC, serta AHP dengan `numpy.linalg.eig`;
  - agregasi penilai dan uji rank reversal;
  - titik pergantian peringkat, dibandingkan dengan solusi analitik perpotongan garis (selisih maksimum 7×10⁻¹⁶).
- Contoh supplier dihitung manual: C 0,9111; B 0,8986; A 0,8528. Contoh beasiswa: Dimas 0,7483 = 0,3·1 + 0,25·(1/3) + 0,2·1 + 0,15·0,6 + 0,1·0,75.
- Berkas Excel keempat contoh dihitung ulang di LibreOffice. X, w, V, dan peringkat cocok dengan aplikasi hingga 10⁻⁹, tanpa sel galat.
- Mengubah data, label, sub-kriteria, atau bobot langsung di Excel menghasilkan V yang sama dengan model aplikasi atas perubahan yang sama.
- Uji end-to-end di Chromium (desktop dan ponsel 390 px) untuk seluruh alur, termasuk sub-kriteria, penilai, tempel, impor, unduhan, dan tautan.

## Privasi

Semua perhitungan berjalan di browser Anda. Proyek tersimpan otomatis di penyimpanan lokal browser; unduh berkas `.json` untuk cadangan. Tidak ada analitik, tidak ada pelacak, tidak ada data yang dikirim ke server. Font dan pustaka PDF disertakan di repositori sehingga aplikasi tetap berjalan tanpa CDN.

## Untuk pengembang

```text
index.html               kerangka halaman
assets/js/saw-core.js    mesin hitung murni (normalisasi SAW, SAW, WP, TOPSIS, sub-kriteria, agregasi, Entropy, CRITIC, AHP, sensitivitas, rank reversal)
assets/js/model.js       model proyek, sub-kriteria, penilai, contoh, impor tabel (tempel/CSV/XLSX), impor proyek AHP/TOPSIS, tautan
assets/js/charts.js      diagram SVG tanpa pustaka
assets/js/export.js      XLSX dengan rumus & DOCX (penulis ZIP sendiri), pembaca XLSX, CSV, PNG/SVG, PDF (jsPDF)
assets/js/app.js         antarmuka
assets/js/ahp/           modul AHP Decision Engine, dimuat hanya saat mengimpor proyek AHP
assets/vendor/           jsPDF 3.0.4 + jsPDF-AutoTable 5.0.9 (MIT), dimuat saat PDF diminta
assets/fonts/            Inter (SIL OFL)
tests/                   unit test Node + data pembanding numpy (python3 tests/ref_numpy.py untuk membuat ulang)
```

Jalankan lokal tanpa build:

```bash
python3 -m http.server 8000      # lalu buka http://localhost:8000
node --test tests/*.test.js      # unit test
```

> **Laragon/Apache:** bila server lokal memetakan `.html` ke PHP sehingga halaman tampil *Not Found*, tambahkan berkas `.htaccess` berisi `DirectoryIndex index.html index.php` dan `AddType text/html .html .htm` di folder proyek (tidak diperlukan untuk GitHub Pages).

## Cara mengutip

Bila Anda memakai alat ini dalam skripsi, tesis, atau publikasi:

> Tarigan, A. G. E. (2026). *SAW Calculator Engine* (Versi 2.0) [Perangkat lunak]. https://edgarcia-id.github.io/saw-calculator-engine-v2/

Metadata kutipan juga tersedia di [`CITATION.cff`](CITATION.cff) (tombol **Cite this repository** di GitHub).

Rujukan metode:
- Fishburn, P. C. (1967). *Additive Utilities with Incomplete Product Set: Applications to Priorities and Assignments*. Operations Research Society of America.
- MacCrimmon, K. R. (1968). *Decisionmaking among Multiple-Attribute Alternatives: A Survey and Consolidated Approach* (RM-4823-ARPA). RAND Corporation.
- Hwang, C. L., & Yoon, K. (1981). *Multiple Attribute Decision Making: Methods and Applications*. Springer-Verlag.
- Kusumadewi, S., Hartati, S., Harjoko, A., & Wardoyo, R. (2006). *Fuzzy Multi-Attribute Decision Making (Fuzzy MADM)*. Graha Ilmu.
- Shannon, C. E. (1948). A mathematical theory of communication. *Bell System Technical Journal, 27*(3), 379–423.
- Diakoulaki, D., Mavrotas, G., & Papayannakis, L. (1995). Determining objective weights in multiple criteria problems: The CRITIC method. *Computers & Operations Research, 22*(7), 763–770.
- Saaty, T. L. (1980). *The Analytic Hierarchy Process*. McGraw-Hill.

---

## Pengembang

**Alfredo (Ed) Garcia** — [LinkedIn](https://www.linkedin.com/in/alfredo-garcia-elbarta-tarigan/) · ORCID [0009-0001-4549-5129](https://orcid.org/0009-0001-4549-5129)

---
*© 2026 Alfredo Garcia. Dirilis dengan lisensi MIT.*
