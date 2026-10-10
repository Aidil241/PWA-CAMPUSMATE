const path = require('path');
// SQLite bawaan Node (>= 22.13): tidak perlu install paket native atau build tools.
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.join(__dirname, 'database.sqlite'));

db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS matkul (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kode       TEXT,
    nama       TEXT NOT NULL,
    sks        INTEGER NOT NULL DEFAULT 2,
    dosen      TEXT,
    ruang      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS jadwal (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    matkul_id   INTEGER REFERENCES matkul(id) ON DELETE SET NULL,
    hari        TEXT NOT NULL CHECK (hari IN ('Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu')),
    jam_mulai   TEXT NOT NULL,
    jam_selesai TEXT NOT NULL,
    ruang       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS tugas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    judul      TEXT NOT NULL,
    deskripsi  TEXT,
    matkul_id  INTEGER REFERENCES matkul(id) ON DELETE SET NULL,
    deadline   TEXT,
    status     TEXT NOT NULL DEFAULT 'belum' CHECK (status IN ('belum','proses','selesai')),
    file_path  TEXT,
    file_name  TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS catatan (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    judul      TEXT NOT NULL,
    isi        TEXT,
    matkul_id  INTEGER REFERENCES matkul(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_jadwal_hari ON jadwal(hari);
  CREATE INDEX IF NOT EXISTS idx_tugas_deadline ON tugas(deadline);
  CREATE INDEX IF NOT EXISTS idx_tugas_matkul ON tugas(matkul_id);
`);

module.exports = db;
