const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.zip'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return cb(new Error('Tipe file tidak didukung. Gunakan foto, PDF, dokumen Office, TXT, atau ZIP.'));
    }
    cb(null, true);
  },
});

const STATUS = ['belum', 'proses', 'selesai'];

const SELECT_JOIN = `
  SELECT t.*, m.nama AS matkul_nama
  FROM tugas t
  LEFT JOIN matkul m ON m.id = t.matkul_id
`;

const getById = (id) => db.prepare(`${SELECT_JOIN} WHERE t.id = ?`).get(id);

// Multer membaca nama asli sebagai latin1; ubah ke UTF-8 agar nama file berbahasa Indonesia tidak rusak.
const decodeName = (name) => Buffer.from(name, 'latin1').toString('utf8');

const removeFile = (filename) => {
  if (!filename) return;
  fs.unlink(path.join(UPLOAD_DIR, filename), () => {});
};

// Bungkus multer agar error upload dikembalikan sebagai JSON 400.
const handleUpload = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran file maksimal 10 MB.' : err.message;
    res.status(400).json({ error: message });
  });
};

// GET /api/tugas?status=belum&matkul_id=1
router.get('/', (req, res) => {
  const { status, matkul_id } = req.query;
  const where = [];
  const params = [];

  if (status) {
    where.push('t.status = ?');
    params.push(status);
  }
  if (matkul_id) {
    where.push('t.matkul_id = ?');
    params.push(matkul_id);
  }

  // Tugas belum selesai di atas, urut deadline terdekat; deadline kosong paling bawah.
  const sql = `${SELECT_JOIN}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY (t.status = 'selesai'), (t.deadline IS NULL), t.deadline, t.id DESC`;
  res.json(db.prepare(sql).all(...params));
});

// GET /api/tugas/:id
router.get('/:id', (req, res) => {
  const row = getById(req.params.id);
  if (!row) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });
  res.json(row);
});

// POST /api/tugas  (multipart/form-data, field file opsional)
router.post('/', handleUpload, (req, res) => {
  const { judul, deskripsi, matkul_id, deadline, status } = req.body;

  if (!judul || !judul.trim()) {
    if (req.file) removeFile(req.file.filename);
    return res.status(400).json({ error: 'Judul tugas wajib diisi.' });
  }
  if (status && !STATUS.includes(status)) {
    if (req.file) removeFile(req.file.filename);
    return res.status(400).json({ error: 'Status tidak valid.' });
  }

  const info = db
    .prepare(
      `INSERT INTO tugas (judul, deskripsi, matkul_id, deadline, status, file_path, file_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      judul.trim(),
      deskripsi || null,
      matkul_id || null,
      deadline || null,
      status || 'belum',
      req.file ? req.file.filename : null,
      req.file ? decodeName(req.file.originalname) : null
    );
  res.status(201).json(getById(info.lastInsertRowid));
});

// PUT /api/tugas/:id  (multipart/form-data; kirim hapus_file=1 untuk menghapus lampiran lama)
router.put('/:id', handleUpload, (req, res) => {
  const current = db.prepare('SELECT * FROM tugas WHERE id = ?').get(req.params.id);
  if (!current) {
    if (req.file) removeFile(req.file.filename);
    return res.status(404).json({ error: 'Tugas tidak ditemukan.' });
  }

  const judul = (req.body.judul ?? current.judul).toString().trim();
  const status = req.body.status ?? current.status;

  if (!judul || !STATUS.includes(status)) {
    if (req.file) removeFile(req.file.filename);
    return res.status(400).json({ error: !judul ? 'Judul tugas wajib diisi.' : 'Status tidak valid.' });
  }

  let file_path = current.file_path;
  let file_name = current.file_name;

  if (req.file) {
    removeFile(current.file_path);
    file_path = req.file.filename;
    file_name = decodeName(req.file.originalname);
  } else if (req.body.hapus_file === '1') {
    removeFile(current.file_path);
    file_path = null;
    file_name = null;
  }

  db.prepare(
    `UPDATE tugas
     SET judul = ?, deskripsi = ?, matkul_id = ?, deadline = ?, status = ?,
         file_path = ?, file_name = ?, updated_at = datetime('now','localtime')
     WHERE id = ?`
  ).run(
    judul,
    req.body.deskripsi ?? current.deskripsi,
    req.body.matkul_id === undefined ? current.matkul_id : req.body.matkul_id || null,
    req.body.deadline === undefined ? current.deadline : req.body.deadline || null,
    status,
    file_path,
    file_name,
    req.params.id
  );
  res.json(getById(req.params.id));
});

// PATCH /api/tugas/:id/status  (ubah status cepat, mis. centang selesai)
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  if (!STATUS.includes(status)) return res.status(400).json({ error: 'Status tidak valid.' });

  const info = db
    .prepare("UPDATE tugas SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(status, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });
  res.json(getById(req.params.id));
});

// DELETE /api/tugas/:id
router.delete('/:id', (req, res) => {
  const current = db.prepare('SELECT file_path FROM tugas WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });

  db.prepare('DELETE FROM tugas WHERE id = ?').run(req.params.id);
  removeFile(current.file_path);
  res.json({ message: 'Tugas dihapus.' });
});

module.exports = router;
