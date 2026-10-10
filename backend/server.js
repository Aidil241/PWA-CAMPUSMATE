const express = require('express');
const cors = require('cors');
const path = require('path');

require('./db'); // inisialisasi database dan skema tabel

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// File bukti tugas yang diunggah
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API
app.use('/api/matkul', require('./routes/matkul'));
app.use('/api/jadwal', require('./routes/jadwal'));
app.use('/api/tugas', require('./routes/tugas'));
app.use('/api/catatan', require('./routes/catatan'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Sajikan frontend dari server yang sama (praktis untuk dev dan satu-host deploy)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Endpoint API yang tidak ada
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

// Penangan error terakhir
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

app.listen(PORT, () => {
  console.log(`CampusMate berjalan di http://localhost:${PORT}`);
});
