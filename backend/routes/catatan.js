const express = require('express');
const db = require('../db');

const router = express.Router();

const SELECT_JOIN = `
  SELECT c.*, m.nama AS matkul_nama
  FROM catatan c
  LEFT JOIN matkul m ON m.id = c.matkul_id
`;

const getById = (id) => db.prepare(`${SELECT_JOIN} WHERE c.id = ?`).get(id);

// GET /api/catatan?q=kata&matkul_id=1
router.get('/', (req, res) => {
  const { q, matkul_id } = req.query;
  const where = [];
  const params = [];

  if (q) {
    where.push('(c.judul LIKE ? OR c.isi LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (matkul_id) {
    where.push('c.matkul_id = ?');
    params.push(matkul_id);
  }

  const sql = `${SELECT_JOIN} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.updated_at DESC`;
  res.json(db.prepare(sql).all(...params));
});

// GET /api/catatan/:id
router.get('/:id', (req, res) => {
  const row = getById(req.params.id);
  if (!row) return res.status(404).json({ error: 'Catatan tidak ditemukan.' });
  res.json(row);
});

// POST /api/catatan
router.post('/', (req, res) => {
  const { judul, isi, matkul_id } = req.body;
  if (!judul || !judul.trim()) return res.status(400).json({ error: 'Judul catatan wajib diisi.' });

  const info = db
    .prepare('INSERT INTO catatan (judul, isi, matkul_id) VALUES (?, ?, ?)')
    .run(judul.trim(), isi || '', matkul_id || null);
  res.status(201).json(getById(info.lastInsertRowid));
});

// PUT /api/catatan/:id
router.put('/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM catatan WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Catatan tidak ditemukan.' });

  const judul = (req.body.judul ?? current.judul).toString().trim();
  if (!judul) return res.status(400).json({ error: 'Judul catatan wajib diisi.' });

  db.prepare(
    "UPDATE catatan SET judul = ?, isi = ?, matkul_id = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  ).run(
    judul,
    req.body.isi ?? current.isi,
    req.body.matkul_id === undefined ? current.matkul_id : req.body.matkul_id || null,
    req.params.id
  );
  res.json(getById(req.params.id));
});

// DELETE /api/catatan/:id
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM catatan WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Catatan tidak ditemukan.' });
  res.json({ message: 'Catatan dihapus.' });
});

module.exports = router;
