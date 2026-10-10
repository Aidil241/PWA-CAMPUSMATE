const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/matkul
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM matkul ORDER BY nama COLLATE NOCASE').all();
  res.json(rows);
});

// GET /api/matkul/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM matkul WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Mata kuliah tidak ditemukan.' });
  res.json(row);
});

// POST /api/matkul
router.post('/', (req, res) => {
  const { kode, nama, sks, dosen, ruang } = req.body;
  if (!nama || !nama.trim()) {
    return res.status(400).json({ error: 'Nama mata kuliah wajib diisi.' });
  }
  const info = db
    .prepare('INSERT INTO matkul (kode, nama, sks, dosen, ruang) VALUES (?, ?, ?, ?, ?)')
    .run(kode || null, nama.trim(), Number(sks) || 2, dosen || null, ruang || null);
  const row = db.prepare('SELECT * FROM matkul WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

// PUT /api/matkul/:id
router.put('/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM matkul WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Mata kuliah tidak ditemukan.' });

  const nama = (req.body.nama ?? current.nama).toString().trim();
  if (!nama) return res.status(400).json({ error: 'Nama mata kuliah wajib diisi.' });

  db.prepare('UPDATE matkul SET kode = ?, nama = ?, sks = ?, dosen = ?, ruang = ? WHERE id = ?').run(
    req.body.kode ?? current.kode,
    nama,
    Number(req.body.sks) || current.sks,
    req.body.dosen ?? current.dosen,
    req.body.ruang ?? current.ruang,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM matkul WHERE id = ?').get(req.params.id));
});

// DELETE /api/matkul/:id
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM matkul WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Mata kuliah tidak ditemukan.' });
  res.json({ message: 'Mata kuliah dihapus.' });
});

module.exports = router;
