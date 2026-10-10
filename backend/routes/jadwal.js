const express = require('express');
const db = require('../db');

const router = express.Router();

const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const HARI_ORDER = `CASE j.hari
  WHEN 'Senin' THEN 1 WHEN 'Selasa' THEN 2 WHEN 'Rabu' THEN 3 WHEN 'Kamis' THEN 4
  WHEN 'Jumat' THEN 5 WHEN 'Sabtu' THEN 6 ELSE 7 END`;

const SELECT_JOIN = `
  SELECT j.*, m.nama AS matkul_nama, m.kode AS matkul_kode, m.dosen AS matkul_dosen
  FROM jadwal j
  LEFT JOIN matkul m ON m.id = j.matkul_id
`;

const getById = (id) => db.prepare(`${SELECT_JOIN} WHERE j.id = ?`).get(id);

function validate({ hari, jam_mulai, jam_selesai }) {
  if (!HARI.includes(hari)) return 'Hari tidak valid.';
  if (!jam_mulai || !jam_selesai) return 'Jam mulai dan jam selesai wajib diisi.';
  if (jam_selesai <= jam_mulai) return 'Jam selesai harus setelah jam mulai.';
  return null;
}

// GET /api/jadwal?hari=Senin
router.get('/', (req, res) => {
  const { hari } = req.query;
  const rows = hari
    ? db.prepare(`${SELECT_JOIN} WHERE j.hari = ? ORDER BY j.jam_mulai`).all(hari)
    : db.prepare(`${SELECT_JOIN} ORDER BY ${HARI_ORDER}, j.jam_mulai`).all();
  res.json(rows);
});

// GET /api/jadwal/:id
router.get('/:id', (req, res) => {
  const row = getById(req.params.id);
  if (!row) return res.status(404).json({ error: 'Jadwal tidak ditemukan.' });
  res.json(row);
});

// POST /api/jadwal
router.post('/', (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });

  const { matkul_id, hari, jam_mulai, jam_selesai, ruang } = req.body;
  const info = db
    .prepare('INSERT INTO jadwal (matkul_id, hari, jam_mulai, jam_selesai, ruang) VALUES (?, ?, ?, ?, ?)')
    .run(matkul_id || null, hari, jam_mulai, jam_selesai, ruang || null);
  res.status(201).json(getById(info.lastInsertRowid));
});

// PUT /api/jadwal/:id
router.put('/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM jadwal WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Jadwal tidak ditemukan.' });

  const next = {
    matkul_id: req.body.matkul_id === undefined ? current.matkul_id : req.body.matkul_id || null,
    hari: req.body.hari ?? current.hari,
    jam_mulai: req.body.jam_mulai ?? current.jam_mulai,
    jam_selesai: req.body.jam_selesai ?? current.jam_selesai,
    ruang: req.body.ruang ?? current.ruang,
  };
  const err = validate(next);
  if (err) return res.status(400).json({ error: err });

  db.prepare(
    'UPDATE jadwal SET matkul_id = ?, hari = ?, jam_mulai = ?, jam_selesai = ?, ruang = ? WHERE id = ?'
  ).run(next.matkul_id, next.hari, next.jam_mulai, next.jam_selesai, next.ruang, req.params.id);
  res.json(getById(req.params.id));
});

// DELETE /api/jadwal/:id
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM jadwal WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Jadwal tidak ditemukan.' });
  res.json({ message: 'Jadwal dihapus.' });
});

module.exports = router;
