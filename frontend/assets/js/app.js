/* CampusMate - aplikasi frontend (Vanilla JS)
 *
 * Alur data:
 *  - Data terakhir disimpan di localStorage, jadi app langsung tampil walau offline.
 *  - Saat online, data diambil dari API lalu disimpan lagi ke localStorage.
 *  - Saat offline (atau server tidak terjangkau), tambah/ubah/hapus tetap jalan: perubahan langsung terlihat
 *    di layar dan dimasukkan ke antrean IndexedDB (termasuk file foto). Antrean dikirim otomatis saat online kembali.
 */
(() => {
  'use strict';

  /* ================= Konfigurasi ================= */
  // Kosongkan jika frontend disajikan oleh backend yang sama (default).
  // Jika frontend dibuka dari host lain, isi alamat backend, mis. 'http://192.168.1.10:3000'.
  const BASE = '';
  const API = `${BASE}/api`;
  const MAX_UPLOAD = 10 * 1024 * 1024; // harus sama dengan batas di backend
  const UPLOAD_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip';

  const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  const HARI_PENDEK = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  const HARI_IDX = Object.fromEntries(HARI.map((h, i) => [h, i]));
  const JS_DAY = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const STATUS = { belum: 'Belum', proses: 'Dikerjakan', selesai: 'Selesai' };
  const RESOURCES = ['matkul', 'jadwal', 'tugas', 'catatan'];
  const TABS = [
    { id: 'tugas', label: 'Tugas', add: 'Tambah tugas' },
    { id: 'jadwal', label: 'Jadwal', add: 'Tambah jadwal' },
    { id: 'matkul', label: 'Mata kuliah', add: 'Tambah mata kuliah' },
    { id: 'catatan', label: 'Catatan', add: 'Tambah catatan' },
  ];
  const LS_DATA = 'campusmate:data:v1';

  /* ================= Helper umum ================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safe = async (fn, fallback) => {
    try { return await fn(); } catch { return fallback; }
  };
  let tmpCounter = 0;
  const tempId = () => -(Date.now() * 10 + (tmpCounter++ % 10)); // id sementara (negatif) untuk data yang dibuat offline

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYMD = (s) => {
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const daysUntil = (s) => Math.round((parseYMD(s) - parseYMD(ymd(new Date()))) / 864e5);
  const nowStr = () => {
    const d = new Date();
    return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const toMin = (t) => {
    const [h, m] = String(t).split(':').map(Number);
    return h * 60 + m;
  };
  const todayName = () => JS_DAY[new Date().getDay()];
  const dateFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtDate = (s) => dateFmt.format(parseYMD(s));
  const fmtUpdated = (s) => {
    const diff = daysUntil(s);
    if (diff === 0) return `Hari ini, ${String(s).slice(11, 16)}`;
    if (diff === -1) return 'Kemarin';
    return fmtDate(s);
  };
  const fmtSize = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
  const isImage = (name) => /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name || '');

  const ICONS = {
    tugas: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>',
    jadwal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    matkul: '<path d="M5 4.5h11.5a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h11.5"/>',
    catatan: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
    book: '<path d="M5 4.5h11.5a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h11.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1.3-2h6l1.3 2h1.2A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/>',
    clip: '<path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7"/>',
    pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
    cloudoff: '<path d="M3 3l18 18"/><path d="M8 18h9a4 4 0 0 0 1.4-7.7"/><path d="M6.3 10A5 5 0 0 0 8 18"/><path d="M9.5 6.2A6 6 0 0 1 17 9.5"/>',
  };
  const icon = (name, size = 20, sw = 1.8) =>
    `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  const chip = (text, cls = '', iconName = '') =>
    `<span class="chip ${cls}">${iconName ? icon(iconName, 14) : ''}<span>${esc(text)}</span></span>`;
  const empty = (title, text) => `<div class="empty"><strong>${esc(title)}</strong>${esc(text)}</div>`;

  function tabFromHash() {
    const h = location.hash.slice(1);
    return TABS.some((t) => t.id === h) ? h : 'tugas';
  }

  /* ================= State & penyimpanan lokal ================= */
  const state = {
    tab: tabFromHash(),
    data: { matkul: [], jadwal: [], tugas: [], catatan: [] },
    filter: 'belum',
    day: todayName(),
    q: '',
    online: navigator.onLine,
    pending: 0,
    syncing: false,
    installEvent: null,
    rev: 0, // naik setiap ada perubahan data, untuk membuang hasil refresh yang sudah basi
  };

  function persist() {
    try { localStorage.setItem(LS_DATA, JSON.stringify(state.data)); } catch { /* penyimpanan penuh/diblokir */ }
  }
  function loadLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_DATA));
      if (saved) for (const r of RESOURCES) if (Array.isArray(saved[r])) state.data[r] = saved[r];
    } catch { /* abaikan data rusak */ }
  }

  function sortAll() {
    const d = state.data;
    d.matkul.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
    d.jadwal.sort((a, b) => HARI_IDX[a.hari] - HARI_IDX[b.hari] || a.jam_mulai.localeCompare(b.jam_mulai));
    d.tugas.sort(
      (a, b) =>
        (a.status === 'selesai') - (b.status === 'selesai') ||
        !a.deadline - !b.deadline ||
        (a.deadline || '').localeCompare(b.deadline || '') ||
        String(b.created_at).localeCompare(String(a.created_at))
    );
    d.catatan.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }

  /* ================= Antrean offline (IndexedDB) ================= */
  let dbPromise;
  const openDB = () =>
    (dbPromise ||= new Promise((resolve, reject) => {
      const req = indexedDB.open('campusmate', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  async function tx(mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction('outbox', mode);
      const out = fn(t.objectStore('outbox'));
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
      t.onerror = t.onabort = () => reject(t.error);
    });
  }
  const outbox = {
    all: () => tx('readonly', (s) => s.getAll()),
    add: (e) => tx('readwrite', (s) => s.add(e)),
    put: (e) => tx('readwrite', (s) => s.put(e)),
    del: (seq) => tx('readwrite', (s) => s.delete(seq)),
  };
  const countPending = async () => (await safe(() => outbox.all(), [])).length;

  /* ================= Jaringan ================= */
  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }
  // Error jaringan / server tidak terjangkau → masuk antrean. Error validasi dari server (4xx) → tampilkan ke pengguna.
  const isNetworkError = (e) => !(e instanceof ApiError) || [502, 503, 504].includes(e.status);

  function setOnline(value) {
    if (state.online !== value) {
      state.online = value;
      renderStatus();
    }
  }

  async function request(method, path, { json, form, timeout = 15000 } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), form ? Math.max(timeout, 60000) : timeout);
    const opts = { method, headers: {}, signal: ctrl.signal };
    if (json !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(json);
    }
    if (form) opts.body = form;

    let res;
    try {
      res = await fetch(API + path, opts);
    } catch (err) {
      setOnline(false);
      throw err;
    } finally {
      clearTimeout(timer);
    }
    setOnline(true);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || `Permintaan gagal (${res.status}).`, res.status);
    return data;
  }

  // Kirim satu operasi ke server. entry: { op, resource, id, fields, file, fileName }
  function send({ op, resource, id, fields, file, fileName }) {
    const base = `/${resource}`;
    if (op === 'delete') return request('DELETE', `${base}/${id}`);
    if (op === 'status') return request('PATCH', `${base}/${id}/status`, { json: { status: fields.status } });

    const method = op === 'create' ? 'POST' : 'PUT';
    const path = op === 'create' ? base : `${base}/${id}`;
    if (resource === 'tugas') {
      const fd = new FormData(); // tugas memakai multipart karena bisa membawa file
      for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) fd.append(k, v);
      if (file) fd.append('file', file, fileName || 'lampiran');
      return request(method, path, { form: fd });
    }
    return request(method, path, { json: fields });
  }

  /* ================= Perubahan data: online langsung, offline lewat antrean ================= */
  function withJoins(resource, row) {
    const m = state.data.matkul.find((x) => x.id === row.matkul_id);
    if (resource === 'tugas' || resource === 'catatan') row.matkul_nama = m ? m.nama : null;
    if (resource === 'jadwal') {
      row.matkul_nama = m ? m.nama : null;
      row.matkul_kode = m ? m.kode : null;
      row.matkul_dosen = m ? m.dosen : null;
    }
    return row;
  }
  function rejoinAll() {
    for (const r of ['jadwal', 'tugas', 'catatan']) state.data[r].forEach((row) => withJoins(r, row));
  }
  function detachMatkul(id) {
    for (const r of ['jadwal', 'tugas', 'catatan']) {
      state.data[r].forEach((row) => {
        if (row.matkul_id === id) row.matkul_id = null;
      });
    }
    rejoinAll();
  }

  function typeFields(f) {
    const out = {};
    for (const [k, v] of Object.entries(f)) {
      if (k === 'hapus_file') continue;
      if (k === 'matkul_id') out[k] = v === '' || v == null ? null : Number(v);
      else if (k === 'deadline') out[k] = v || null;
      else if (k === 'sks') out[k] = Number(v) || 2;
      else out[k] = v;
    }
    return out;
  }
  const DEFAULTS = {
    tugas: { judul: '', deskripsi: '', matkul_id: null, deadline: null, status: 'belum', file_path: null, file_name: null },
    jadwal: { matkul_id: null, ruang: '' },
    matkul: { kode: '', dosen: '', ruang: '', sks: 2 },
    catatan: { isi: '', matkul_id: null },
  };

  // Terapkan perubahan ke data lokal (tampilan langsung berubah, sebelum server menjawab).
  function applyLocal({ op, resource, id, fields, file }) {
    const list = state.data[resource];
    const typed = typeFields(fields);
    if (op === 'create') {
      const now = nowStr();
      const row = { id, ...DEFAULTS[resource], ...typed, created_at: now, updated_at: now, _pending: true };
      if (resource === 'tugas') row.file_name = file ? file.name : null;
      list.push(withJoins(resource, row));
    } else if (op === 'delete') {
      state.data[resource] = list.filter((x) => x.id !== id);
      if (resource === 'matkul') detachMatkul(id);
    } else {
      const row = list.find((x) => x.id === id);
      if (!row) return;
      Object.assign(row, typed, { updated_at: nowStr(), _pending: true });
      if (resource === 'tugas') {
        if (fields.hapus_file === '1') Object.assign(row, { file_path: null, file_name: null });
        if (file) Object.assign(row, { file_path: null, file_name: file.name });
      }
      withJoins(resource, row);
      if (resource === 'matkul') rejoinAll();
    }
    sortAll();
  }

  // Terapkan jawaban server ke data lokal.
  function applyServer({ op, resource, id }, row) {
    const list = state.data[resource];
    if (op === 'create') list.push(row);
    else if (op === 'delete') {
      state.data[resource] = list.filter((x) => x.id !== id);
      if (resource === 'matkul') detachMatkul(id);
    } else {
      const i = list.findIndex((x) => x.id === id);
      if (i >= 0) list[i] = row;
      else list.push(row);
    }
    sortAll();
    persist();
    render();
    if (resource === 'matkul' && op !== 'create') refreshAll(); // nama mata kuliah tampil di data lain
  }

  async function mutate(op, resource, id, fields = {}, file = null) {
    state.rev++;
    const entry = { op, resource, id, fields, file, fileName: file ? file.name : null };
    const queue = await safe(() => outbox.all(), []);

    if (navigator.onLine && queue.length === 0) {
      try {
        applyServer(entry, await send(entry));
        return { queued: false };
      } catch (err) {
        if (!isNetworkError(err)) throw err;
      }
    }
    await enqueue(queue, entry);
    return { queued: true };
  }

  async function enqueue(queue, entry) {
    const { op, resource, id } = entry;
    // Data yang dibuat offline dan belum terkirim: gabungkan perubahan ke entri "create"-nya.
    const pendingCreate = id < 0 ? queue.find((e) => e.op === 'create' && e.resource === resource && e.id === id) : null;

    if (pendingCreate && op === 'delete') {
      for (const e of queue) if (e.resource === resource && e.id === id) await outbox.del(e.seq);
      if (resource === 'matkul') {
        // entri lain yang merujuk mata kuliah sementara ini kehilangan rujukannya
        for (const e of queue) {
          if (e.fields && e.fields.matkul_id != null && Number(e.fields.matkul_id) === id) {
            e.fields.matkul_id = typeof e.fields.matkul_id === 'string' ? '' : null; // tugas memakai string, lainnya angka
            await outbox.put(e);
          }
        }
      }
    } else if (pendingCreate) {
      Object.assign(pendingCreate.fields, entry.fields);
      if (entry.fields.hapus_file === '1') {
        pendingCreate.file = null;
        pendingCreate.fileName = null;
      }
      delete pendingCreate.fields.hapus_file;
      if (entry.file) {
        pendingCreate.file = entry.file;
        pendingCreate.fileName = entry.fileName;
      }
      await outbox.put(pendingCreate);
    } else {
      await outbox.add({ ...entry, ts: Date.now() });
    }

    applyLocal(entry);
    state.pending = await countPending();
    persist();
    render();
    if (navigator.onLine) setTimeout(sync, 400);
  }

  // Setelah "create" berhasil, ganti id sementara dengan id asli di antrean dan data lokal.
  async function remapId(resource, tempId, realId) {
    for (const e of await outbox.all()) {
      let changed = false;
      if (e.resource === resource && e.id === tempId) {
        e.id = realId;
        changed = true;
      }
      if (resource === 'matkul' && e.fields && e.fields.matkul_id != null && Number(e.fields.matkul_id) === tempId) {
        e.fields.matkul_id = typeof e.fields.matkul_id === 'string' ? String(realId) : realId;
        changed = true;
      }
      if (changed) await outbox.put(e);
    }
    const row = state.data[resource].find((x) => x.id === tempId);
    if (row) row.id = realId;
    if (resource === 'matkul') {
      for (const r of ['jadwal', 'tugas', 'catatan']) {
        state.data[r].forEach((x) => {
          if (x.matkul_id === tempId) x.matkul_id = realId;
        });
      }
    }
  }

  async function flush() {
    if (state.syncing || !navigator.onLine) return;
    const queue = await safe(() => outbox.all(), []);
    if (!queue.length) return;

    state.syncing = true;
    renderStatus();
    try {
      for (const queued of queue) {
        const entry = (await outbox.all()).find((e) => e.seq === queued.seq); // bisa sudah berubah oleh remapId
        if (!entry) continue;
        try {
          const row = await send(entry);
          await outbox.del(entry.seq);
          if (entry.op === 'create') await remapId(entry.resource, entry.id, row.id);
        } catch (err) {
          if (isNetworkError(err)) break; // coba lagi nanti, urutan tetap terjaga
          await outbox.del(entry.seq); // ditolak server: buang agar antrean tidak macet
          toast(`Satu perubahan ditolak server: ${err.message}`, 'error');
        }
      }
    } finally {
      state.syncing = false;
      state.pending = await countPending();
      persist();
      renderStatus();
    }
  }

  async function refreshAll() {
    if (!navigator.onLine || state.pending > 0) return;
    const rev = state.rev;
    try {
      const [matkul, jadwal, tugas, catatan] = await Promise.all(RESOURCES.map((r) => request('GET', `/${r}`)));
      if (rev !== state.rev) return; // ada perubahan saat mengambil data, hasilnya sudah basi
      Object.assign(state.data, { matkul, jadwal, tugas, catatan });
      persist();
      render();
    } catch {
      /* offline: tetap pakai data lokal */
    }
  }

  let syncing = null;
  function sync() {
    syncing ||= (async () => {
      try {
        await flush();
        await refreshAll();
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  }

  /* ================= Tampilan ================= */
  function deadlineInfo(t) {
    if (!t.deadline) return null;
    const d = daysUntil(t.deadline);
    const date = fmtDate(t.deadline);
    if (t.status === 'selesai') return { text: date, cls: '' };
    if (d < 0) return { text: `Terlambat ${-d} hari`, cls: 'chip-coral', title: date };
    if (d === 0) return { text: 'Hari ini', cls: 'chip-mark', title: date };
    if (d === 1) return { text: 'Besok', cls: 'chip-mark', title: date };
    if (d <= 7) return { text: `${d} hari lagi`, cls: '', title: date };
    return { text: date, cls: '' };
  }

  function attachThumb(t) {
    if (t.file_path) {
      const url = `${BASE}/uploads/${encodeURIComponent(t.file_path)}`;
      return `<a class="thumb" href="${url}" target="_blank" rel="noopener" aria-label="Buka lampiran ${esc(t.file_name)}">${icon('clip', 22)}${
        isImage(t.file_path) ? `<img src="${url}" alt="" loading="lazy">` : ''
      }</a>`;
    }
    if (t.file_name) return `<span class="thumb" title="Menunggu diunggah">${icon('clip', 22)}</span>`;
    return '';
  }

  function tugasItem(t) {
    const done = t.status === 'selesai';
    const dl = deadlineInfo(t);
    const chips = [
      t.matkul_nama ? chip(t.matkul_nama, '', 'book') : '',
      dl ? `<span class="chip ${dl.cls}"${dl.title ? ` title="${esc(dl.title)}"` : ''}><span>${esc(dl.text)}</span></span>` : '',
      t.status === 'proses' ? chip('Dikerjakan', 'chip-ink') : '',
      t.file_name && !isImage(t.file_name) ? chip(t.file_name, '', 'clip') : '',
      t._pending ? chip('Menunggu sinkron', 'chip-mark') : '',
    ].join('');
    return `<li class="item"${done ? ' data-done' : ''}${t._pending ? ' data-pending' : ''}>
      <button type="button" class="check" role="checkbox" aria-checked="${done}" aria-label="${esc(t.judul)}" data-action="toggle" data-id="${t.id}"><span>${done ? icon('check', 16, 3) : ''}</span></button>
      <button type="button" class="item-main" data-action="edit" data-res="tugas" data-id="${t.id}">
        <span class="item-title">${esc(t.judul)}</span>
        ${t.deskripsi ? `<span class="item-text">${esc(t.deskripsi)}</span>` : ''}
        ${chips ? `<span class="mt-2.5 flex flex-wrap gap-1.5">${chips}</span>` : ''}
      </button>
      ${attachThumb(t)}
    </li>`;
  }

  function viewTugas() {
    const all = state.data.tugas;
    const aktif = all.filter((t) => t.status !== 'selesai');
    const telat = aktif.filter((t) => t.deadline && daysUntil(t.deadline) < 0).length;
    const sub = !all.length
      ? 'Belum ada tugas yang dicatat.'
      : aktif.length
        ? `${aktif.length} belum selesai${telat ? `, ${telat} terlambat` : ''}.`
        : 'Semua tugas sudah selesai.';
    const filters = [
      ['belum', 'Belum selesai', aktif.length],
      ['selesai', 'Selesai', all.length - aktif.length],
      ['semua', 'Semua', all.length],
    ];
    const shown = all.filter((t) => state.filter === 'semua' || (state.filter === 'selesai') === (t.status === 'selesai'));
    const emptyMsg = {
      belum: ['Tidak ada tugas yang menunggu', 'Ketuk Tambah tugas untuk mencatat tugas baru.'],
      selesai: ['Belum ada tugas yang selesai', 'Centang tugas di daftar untuk memindahkannya ke sini.'],
      semua: ['Belum ada tugas', 'Ketuk Tambah tugas untuk mulai mencatat.'],
    }[state.filter];
    return `<h1 class="mt-3 text-[2.5rem] font-extrabold leading-none tracking-[-0.035em]">Tugas</h1>
      <p class="mb-[1.1rem] mt-2 text-mute">${sub}</p>
      <div class="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Saring tugas">
        ${filters
          .map(([v, l, n]) => `<button type="button" class="segbtn" data-action="filter" data-value="${v}" aria-pressed="${state.filter === v}">${l}<span class="n">${n}</span></button>`)
          .join('')}
      </div>
      ${shown.length ? `<ul class="grid gap-3">${shown.map(tugasItem).join('')}</ul>` : empty(...emptyMsg)}`;
  }

  function jadwalItem(j, mode) {
    // 'after' = kelas berikutnya saat kelas lain sedang berlangsung: berlabel, tapi stabilo hanya untuk satu kelas.
    const label = mode === 'now' ? chip('Sedang berlangsung', 'chip-ink') : mode === 'next' || mode === 'after' ? chip('Berikutnya') : '';
    const chips = [
      label,
      j.ruang ? chip(j.ruang, '', 'pin') : '',
      j.matkul_dosen ? chip(j.matkul_dosen, '', 'person') : '',
      j._pending ? chip('Menunggu sinkron', 'chip-mark') : '',
    ].join('');
    return `<li class="item"${mode === 'past' ? ' data-past' : ''}${j._pending ? ' data-pending' : ''}>
      <button type="button" class="item-main row" data-action="edit" data-res="jadwal" data-id="${j.id}">
        <span class="w-[4.25rem] shrink-0"><b class="inline-block text-lg font-extrabold leading-snug${mode === 'now' || mode === 'next' ? ' hl' : ''}">${esc(j.jam_mulai)}</b><span class="block text-sm text-mute">${esc(j.jam_selesai)}</span></span>
        <span class="min-w-0 flex-1">
          <span class="item-title">${esc(j.matkul_nama || 'Tanpa mata kuliah')}</span>
          ${chips ? `<span class="mt-2.5 flex flex-wrap gap-1.5">${chips}</span>` : ''}
        </span>
      </button>
    </li>`;
  }

  function viewJadwal() {
    const today = todayName();
    const isToday = state.day === today;
    const items = state.data.jadwal.filter((j) => j.hari === state.day);
    const d = new Date();
    const now = d.getHours() * 60 + d.getMinutes();
    const ongoing = isToday ? items.find((j) => toMin(j.jam_mulai) <= now && now < toMin(j.jam_selesai)) : null;
    const next = isToday ? items.find((j) => toMin(j.jam_mulai) > now) : null;
    const when = isToday ? 'hari ini' : `pada hari ${state.day}`;
    const sub = items.length ? `${items.length} kelas ${when}.` : `Tidak ada kelas ${when}.`;
    const modeOf = (j) =>
      j === ongoing ? 'now' : j === next ? (ongoing ? 'after' : 'next') : isToday && toMin(j.jam_selesai) <= now ? 'past' : '';

    return `<h1 class="mt-3 text-[2.5rem] font-extrabold leading-none tracking-[-0.035em]">Jadwal</h1>
      <p class="mb-[1.1rem] mt-2 text-mute">${sub}</p>
      <div class="mb-4 grid grid-cols-7 gap-1" role="group" aria-label="Pilih hari">
        ${HARI.map(
          (h, i) =>
            `<button type="button" class="daytab" data-action="day" data-value="${h}" aria-pressed="${state.day === h}" aria-label="${h}${h === today ? ' (hari ini)' : ''}">${HARI_PENDEK[i]}${h === today ? '<i></i>' : ''}</button>`
        ).join('')}
      </div>
      ${
        items.length
          ? `<ul class="grid gap-3">${items.map((j) => jadwalItem(j, modeOf(j))).join('')}</ul>`
          : empty(`Tidak ada kelas hari ${state.day}`, 'Ketuk Tambah jadwal untuk menambahkan kelas.')
      }`;
  }

  function matkulItem(m) {
    const aktif = state.data.tugas.filter((t) => t.matkul_id === m.id && t.status !== 'selesai').length;
    const chips = [
      m.kode ? chip(m.kode) : '',
      m.ruang ? chip(m.ruang, '', 'pin') : '',
      aktif ? chip(`${aktif} tugas belum selesai`, 'chip-mark') : '',
      m._pending ? chip('Menunggu sinkron', 'chip-mark') : '',
    ].join('');
    return `<li class="item"${m._pending ? ' data-pending' : ''}>
      <button type="button" class="item-main" data-action="edit" data-res="matkul" data-id="${m.id}">
        <span class="item-title">${esc(m.nama)}</span>
        ${m.dosen ? `<span class="item-text">${esc(m.dosen)}</span>` : ''}
        ${chips ? `<span class="mt-2.5 flex flex-wrap gap-1.5">${chips}</span>` : ''}
      </button>
      <span class="sks"><b>${esc(m.sks)}</b><small>SKS</small></span>
    </li>`;
  }

  function viewMatkul() {
    const list = state.data.matkul;
    const sks = list.reduce((s, m) => s + (Number(m.sks) || 0), 0);
    return `<h1 class="mt-3 text-[2.5rem] font-extrabold leading-none tracking-[-0.035em]">Mata kuliah</h1>
      <p class="mb-[1.1rem] mt-2 text-mute">${list.length ? `${list.length} mata kuliah, ${sks} SKS.` : 'Belum ada mata kuliah.'}</p>
      ${
        list.length
          ? `<ul class="grid gap-3">${list.map(matkulItem).join('')}</ul>`
          : empty('Belum ada mata kuliah', 'Ketuk Tambah mata kuliah. Setelah itu tugas, jadwal, dan catatan bisa dikaitkan ke sana.')
      }`;
  }

  function catatanFiltered() {
    const q = state.q.trim().toLowerCase();
    return state.data.catatan.filter((c) => !q || `${c.judul} ${c.isi} ${c.matkul_nama || ''}`.toLowerCase().includes(q));
  }
  function catatanSub() {
    const total = state.data.catatan.length;
    if (!total) return 'Belum ada catatan.';
    return state.q.trim() ? `${catatanFiltered().length} dari ${total} catatan cocok.` : `${total} catatan.`;
  }
  function catatanItems() {
    const list = catatanFiltered();
    if (!list.length) {
      return state.data.catatan.length
        ? empty('Tidak ada yang cocok', 'Coba kata kunci lain.')
        : empty('Belum ada catatan', 'Ketuk Tambah catatan untuk menulis yang pertama.');
    }
    return `<ul class="grid gap-3">${list
      .map(
        (c) => `<li class="item"${c._pending ? ' data-pending' : ''}>
          <button type="button" class="item-main" data-action="edit" data-res="catatan" data-id="${c.id}">
            <span class="item-title">${esc(c.judul)}</span>
            ${c.isi ? `<span class="item-text">${esc(c.isi)}</span>` : ''}
            <span class="mt-2.5 flex flex-wrap gap-1.5">${c.matkul_nama ? chip(c.matkul_nama, '', 'book') : ''}${chip(fmtUpdated(c.updated_at))}${c._pending ? chip('Menunggu sinkron', 'chip-mark') : ''}</span>
          </button>
        </li>`
      )
      .join('')}</ul>`;
  }
  function viewCatatan() {
    return `<h1 class="mt-3 text-[2.5rem] font-extrabold leading-none tracking-[-0.035em]">Catatan</h1>
      <p class="mb-[1.1rem] mt-2 text-mute" id="cat-sub">${catatanSub()}</p>
      <input id="cat-q" type="search" class="field mb-4" placeholder="Cari judul atau isi catatan" aria-label="Cari catatan" value="${esc(state.q)}">
      <div id="cat-list">${catatanItems()}</div>`;
  }

  const VIEWS = { tugas: viewTugas, jadwal: viewJadwal, matkul: viewMatkul, catatan: viewCatatan };

  function renderNav() {
    $('#nav').innerHTML = TABS.map((t) => {
      const active = t.id === state.tab;
      return `<button type="button" class="navbtn" data-action="tab" data-tab="${t.id}"${active ? ' aria-current="page"' : ''}>${icon(t.id, 22)}<span${active ? ' class="hl"' : ''}>${t.label}</span></button>`;
    }).join('');
  }

  function renderStatus() {
    const parts = [];
    if (!state.online) parts.push(`<span class="chip chip-coral">${icon('cloudoff', 14)}<span>Offline</span></span>`);
    if (state.pending) {
      parts.push(
        `<button type="button" class="chip chip-mark" data-action="sync"${state.syncing ? ' disabled' : ''}><span>${state.syncing ? 'Menyinkronkan…' : `${state.pending} menunggu sinkron`}</span></button>`
      );
    }
    if (state.installEvent) parts.push('<button type="button" class="chip" data-action="install"><span>Pasang aplikasi</span></button>');
    $('#status').innerHTML = parts.join('');
  }

  function render() {
    const tab = TABS.find((t) => t.id === state.tab);
    document.title = `${tab.label} - CampusMate`;
    renderNav();
    renderStatus();
    $('#fab').innerHTML = `${icon('plus', 20, 2.4)}${esc(tab.add)}`;

    // Di tab Catatan, perbarui hanya daftar agar kolom pencarian tidak kehilangan fokus saat mengetik.
    if (state.tab === 'catatan' && $('#cat-list')) {
      $('#cat-list').innerHTML = catatanItems();
      $('#cat-sub').textContent = catatanSub();
      return;
    }
    $('#view').innerHTML = VIEWS[state.tab]();
  }

  /* ================= Toast ================= */
  let toastTimer;
  function toast(message, kind = 'ok') {
    const el = $('#toast');
    el.textContent = message;
    el.dataset.kind = kind;
    el.classList.add('show');
    try {
      if (el.showPopover && !el.matches(':popover-open')) el.showPopover(); // popover tampil di atas dialog
    } catch { /* browser lama: tampil sebagai elemen biasa */ }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      try {
        if (el.hidePopover && el.matches(':popover-open')) el.hidePopover();
      } catch { /* abaikan */ }
    }, kind === 'error' ? 5000 : 3000);
  }
  const QUEUED_MSG = 'Tersimpan di perangkat. Akan dikirim saat online.';

  /* ================= Sheet form ================= */
  const sheet = $('#sheet');
  let sheetCleanup = null;
  let downTarget = null;

  sheet.addEventListener('pointerdown', (e) => { downTarget = e.target; });
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet && downTarget === sheet) closeSheet(); // klik di area gelap menutup sheet
  });
  sheet.addEventListener('close', () => {
    sheet.innerHTML = '';
    if (sheetCleanup) sheetCleanup();
    sheetCleanup = null;
  });
  const closeSheet = () => { if (sheet.open) sheet.close(); };

  function openSheet({ title, body, submitLabel = 'Simpan', onSubmit, onDelete, setup, focusFirst = false }) {
    sheet.innerHTML = `<form id="sheet-form">
      <div class="sheet-head">
        <h2 id="sheet-title">${esc(title)}</h2>
        <button type="button" class="icon-btn" data-action="close" aria-label="Tutup">${icon('close', 20)}</button>
      </div>
      <div class="sheet-body">${body}</div>
      <div class="sheet-foot">
        ${onDelete ? '<button type="button" class="btn btn-danger" id="sheet-del">Hapus</button>' : ''}
        <button type="submit" class="btn flex-1" id="sheet-save">${esc(submitLabel)}</button>
      </div>
    </form>`;
    const form = $('#sheet-form', sheet);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#sheet-save', sheet);
      btn.disabled = true;
      btn.textContent = 'Menyimpan…';
      try {
        const res = await onSubmit(new FormData(form));
        closeSheet();
        toast(res && res.queued ? QUEUED_MSG : 'Tersimpan');
      } catch (err) {
        toast(err.message || 'Gagal menyimpan.', 'error');
        btn.disabled = false;
        btn.textContent = submitLabel;
      }
    });

    const del = $('#sheet-del', sheet);
    if (del) {
      let timer;
      del.addEventListener('click', async () => {
        if (!del.dataset.armed) { // klik pertama meminta konfirmasi
          del.dataset.armed = '1';
          del.textContent = 'Yakin hapus?';
          timer = setTimeout(() => {
            if (del.isConnected) {
              delete del.dataset.armed;
              del.textContent = 'Hapus';
            }
          }, 3500);
          return;
        }
        clearTimeout(timer);
        del.disabled = true;
        try {
          const res = await onDelete();
          closeSheet();
          toast(res && res.queued ? QUEUED_MSG : 'Dihapus');
        } catch (err) {
          toast(err.message || 'Gagal menghapus.', 'error');
          del.disabled = false;
        }
      });
    }

    sheet.showModal();
    if (setup) setup(form);
    if (focusFirst) form.querySelector('.field')?.focus();
  }

  const matkulOptions = (selected, noneLabel = 'Tanpa mata kuliah') =>
    `<option value="">${noneLabel}</option>` +
    state.data.matkul.map((m) => `<option value="${m.id}"${Number(selected) === m.id ? ' selected' : ''}>${esc(m.nama)}</option>`).join('');
  const noMatkulHint = () =>
    state.data.matkul.length ? '' : '<p class="mt-1.5 text-sm text-mute">Belum ada mata kuliah. Tambahkan dulu di menu Mata kuliah.</p>';

  // Perkecil foto dari kamera agar upload cepat dan hemat kuota (maks. 1600 px, JPEG).
  async function prepareFile(file) {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 1.5 * 1048576) {
        bmp.close?.();
        return file;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close?.();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
    } catch {
      return file;
    }
  }

  function formTugas(t) {
    const edit = Boolean(t);
    const v = t || { judul: '', deskripsi: '', matkul_id: '', deadline: '', status: 'belum' };
    const att = { file: null, remove: false };
    const urls = [];

    openSheet({
      title: edit ? 'Ubah tugas' : 'Tambah tugas',
      focusFirst: !edit,
      body: `
        <label><span class="lbl">Judul tugas</span><input class="field" name="judul" required maxlength="120" value="${esc(v.judul)}" placeholder="Contoh: Laporan praktikum 3"></label>
        <label><span class="lbl">Mata kuliah</span><select class="field" name="matkul_id">${matkulOptions(v.matkul_id)}</select></label>
        <div class="grid grid-cols-2 gap-3">
          <label><span class="lbl">Tenggat</span><input class="field" type="date" name="deadline" value="${esc(v.deadline)}"></label>
          <label><span class="lbl">Status</span><select class="field" name="status">${Object.entries(STATUS)
            .map(([k, l]) => `<option value="${k}"${v.status === k ? ' selected' : ''}>${l}</option>`)
            .join('')}</select></label>
        </div>
        <label><span class="lbl">Keterangan</span><textarea class="field" name="deskripsi" rows="3" placeholder="Ketentuan, halaman, atau hal yang perlu diingat">${esc(v.deskripsi)}</textarea></label>
        <div>
          <span class="lbl">Bukti tugas</span>
          <div class="grid grid-cols-2 gap-3">
            <label class="btn btn-ghost">${icon('camera', 20)}Ambil foto<input class="sr-only" type="file" name="foto" accept="image/*" capture="environment"></label>
            <label class="btn btn-ghost">${icon('clip', 20)}Pilih file<input class="sr-only" type="file" name="berkas" accept="${UPLOAD_ACCEPT}"></label>
          </div>
          <div id="attach" class="mt-3"></div>
        </div>`,
      setup(form) {
        sheetCleanup = () => urls.forEach((u) => URL.revokeObjectURL(u));
        const box = $('#attach', form);
        const { foto, berkas } = form.elements;

        const show = () => {
          let html = '';
          if (att.file) {
            const isImg = att.file.type.startsWith('image/');
            let img = '';
            if (isImg) {
              const url = URL.createObjectURL(att.file);
              urls.push(url);
              img = `<img src="${url}" alt="Pratinjau foto">`;
            }
            html = `<div class="preview">${img}<div class="name">${esc(att.file.name)}<small>${fmtSize(att.file.size)}</small></div><button type="button" class="chip" data-attach="clear">Hapus</button></div>`;
          } else if (att.remove) {
            html = '<div class="preview"><div class="name">Lampiran akan dihapus saat disimpan.</div><button type="button" class="chip" data-attach="undo">Batal</button></div>';
          } else if (edit && v.file_name) {
            const img = v.file_path && isImage(v.file_path) ? `<img src="${BASE}/uploads/${encodeURIComponent(v.file_path)}" alt="">` : '';
            html = `<div class="preview">${img}<div class="name">${esc(v.file_name)}<small>${v.file_path ? 'Lampiran saat ini' : 'Menunggu diunggah'}</small></div><button type="button" class="chip" data-attach="remove">Hapus lampiran</button></div>`;
          }
          box.innerHTML = html;
        };

        const pick = async (input, other) => {
          const f = input.files[0];
          other.value = '';
          if (!f) return;
          const prepared = await prepareFile(f);
          if (prepared.size > MAX_UPLOAD) {
            input.value = '';
            toast('Ukuran file maksimal 10 MB.', 'error');
            return;
          }
          att.file = prepared;
          att.remove = false;
          show();
        };
        foto.addEventListener('change', () => pick(foto, berkas));
        berkas.addEventListener('change', () => pick(berkas, foto));

        box.addEventListener('click', (e) => {
          const act = e.target.closest('[data-attach]')?.dataset.attach;
          if (!act) return;
          if (act === 'clear') { att.file = null; foto.value = ''; berkas.value = ''; }
          if (act === 'remove') att.remove = true;
          if (act === 'undo') att.remove = false;
          show();
        });
        show();
      },
      onSubmit(fd) {
        const fields = {
          judul: String(fd.get('judul')).trim(),
          deskripsi: String(fd.get('deskripsi')).trim(),
          matkul_id: String(fd.get('matkul_id') || ''),
          deadline: String(fd.get('deadline') || ''),
          status: String(fd.get('status')),
        };
        if (!fields.judul) throw new Error('Judul tugas wajib diisi.');
        if (att.remove && !att.file) fields.hapus_file = '1';
        return edit ? mutate('update', 'tugas', t.id, fields, att.file) : mutate('create', 'tugas', tempId(), fields, att.file);
      },
      onDelete: edit ? () => mutate('delete', 'tugas', t.id) : null,
    });
  }

  function formJadwal(j) {
    const edit = Boolean(j);
    const v = j || { matkul_id: '', hari: state.day, jam_mulai: '', jam_selesai: '', ruang: '' };
    const hasMatkul = state.data.matkul.length > 0;
    openSheet({
      title: edit ? 'Ubah jadwal' : 'Tambah jadwal',
      body: `
        <div>
          <label><span class="lbl">Mata kuliah</span><select class="field" name="matkul_id"${hasMatkul ? ' required' : ''}>${matkulOptions(v.matkul_id, hasMatkul ? 'Pilih mata kuliah' : 'Tanpa mata kuliah')}</select></label>
          ${noMatkulHint()}
        </div>
        <label><span class="lbl">Hari</span><select class="field" name="hari">${HARI.map((h) => `<option${v.hari === h ? ' selected' : ''}>${h}</option>`).join('')}</select></label>
        <div class="grid grid-cols-2 gap-3">
          <label><span class="lbl">Jam mulai</span><input class="field" type="time" name="jam_mulai" required value="${esc(v.jam_mulai)}"></label>
          <label><span class="lbl">Jam selesai</span><input class="field" type="time" name="jam_selesai" required value="${esc(v.jam_selesai)}"></label>
        </div>
        <label><span class="lbl">Ruang</span><input class="field" name="ruang" maxlength="60" value="${esc(v.ruang)}" placeholder="Contoh: Lab Komputer 2"></label>`,
      setup(form) {
        form.elements.matkul_id.addEventListener('change', () => {
          const m = state.data.matkul.find((x) => x.id === Number(form.elements.matkul_id.value));
          if (m && m.ruang && !form.elements.ruang.value) form.elements.ruang.value = m.ruang; // isi ruang otomatis
        });
      },
      async onSubmit(fd) {
        const fields = {
          matkul_id: fd.get('matkul_id') ? Number(fd.get('matkul_id')) : null,
          hari: String(fd.get('hari')),
          jam_mulai: String(fd.get('jam_mulai')),
          jam_selesai: String(fd.get('jam_selesai')),
          ruang: String(fd.get('ruang')).trim(),
        };
        if (fields.jam_selesai <= fields.jam_mulai) throw new Error('Jam selesai harus setelah jam mulai.');
        const res = await (edit ? mutate('update', 'jadwal', j.id, fields) : mutate('create', 'jadwal', tempId(), fields));
        state.day = fields.hari; // tampilkan hari yang baru disimpan
        render();
        return res;
      },
      onDelete: edit ? () => mutate('delete', 'jadwal', j.id) : null,
    });
  }

  function formMatkul(m) {
    const edit = Boolean(m);
    const v = m || { kode: '', nama: '', sks: 3, dosen: '', ruang: '' };
    openSheet({
      title: edit ? 'Ubah mata kuliah' : 'Tambah mata kuliah',
      focusFirst: !edit,
      body: `
        <label><span class="lbl">Nama mata kuliah</span><input class="field" name="nama" required maxlength="120" value="${esc(v.nama)}" placeholder="Contoh: Struktur Data"></label>
        <div class="grid grid-cols-2 gap-3">
          <label><span class="lbl">Kode</span><input class="field" name="kode" maxlength="20" value="${esc(v.kode)}" placeholder="IF2101"></label>
          <label><span class="lbl">SKS</span><select class="field" name="sks">${[1, 2, 3, 4, 5, 6].map((n) => `<option${Number(v.sks) === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>
        <label><span class="lbl">Dosen</span><input class="field" name="dosen" maxlength="80" value="${esc(v.dosen)}" placeholder="Nama dosen pengampu"></label>
        <label><span class="lbl">Ruang biasa</span><input class="field" name="ruang" maxlength="60" value="${esc(v.ruang)}" placeholder="Contoh: Gedung B 204"></label>`,
      onSubmit(fd) {
        const fields = {
          kode: String(fd.get('kode')).trim(),
          nama: String(fd.get('nama')).trim(),
          sks: Number(fd.get('sks')),
          dosen: String(fd.get('dosen')).trim(),
          ruang: String(fd.get('ruang')).trim(),
        };
        if (!fields.nama) throw new Error('Nama mata kuliah wajib diisi.');
        return edit ? mutate('update', 'matkul', m.id, fields) : mutate('create', 'matkul', tempId(), fields);
      },
      onDelete: edit ? () => mutate('delete', 'matkul', m.id) : null,
    });
  }

  function formCatatan(c) {
    const edit = Boolean(c);
    const v = c || { judul: '', isi: '', matkul_id: '' };
    openSheet({
      title: edit ? 'Ubah catatan' : 'Tambah catatan',
      focusFirst: !edit,
      body: `
        <label><span class="lbl">Judul</span><input class="field" name="judul" required maxlength="120" value="${esc(v.judul)}" placeholder="Contoh: Ringkasan bab 3"></label>
        <label><span class="lbl">Mata kuliah</span><select class="field" name="matkul_id">${matkulOptions(v.matkul_id)}</select></label>
        <label><span class="lbl">Isi catatan</span><textarea class="field" name="isi" rows="10" style="min-height:35vh" placeholder="Tulis di sini">${esc(v.isi)}</textarea></label>`,
      onSubmit(fd) {
        const fields = {
          judul: String(fd.get('judul')).trim(),
          isi: String(fd.get('isi')),
          matkul_id: fd.get('matkul_id') ? Number(fd.get('matkul_id')) : null,
        };
        if (!fields.judul) throw new Error('Judul catatan wajib diisi.');
        return edit ? mutate('update', 'catatan', c.id, fields) : mutate('create', 'catatan', tempId(), fields);
      },
      onDelete: edit ? () => mutate('delete', 'catatan', c.id) : null,
    });
  }

  const FORMS = { tugas: formTugas, jadwal: formJadwal, matkul: formMatkul, catatan: formCatatan };

  /* ================= Aksi ================= */
  function setTab(tab) {
    state.tab = tab;
    history.replaceState(null, '', `#${tab}`);
    render();
    window.scrollTo(0, 0);
  }

  async function toggleTugas(id) {
    const t = state.data.tugas.find((x) => x.id === id);
    if (!t) return;
    const prev = t.status;
    t.status = prev === 'selesai' ? 'belum' : 'selesai'; // langsung terlihat, tanpa menunggu server
    sortAll();
    render();
    try {
      const res = await mutate('status', 'tugas', id, { status: t.status });
      if (res.queued) toast(QUEUED_MSG);
    } catch (err) {
      t.status = prev;
      sortAll();
      render();
      toast(err.message, 'error');
    }
  }

  async function install() {
    const ev = state.installEvent;
    if (!ev) return;
    ev.prompt();
    await ev.userChoice.catch(() => {});
    state.installEvent = null;
    renderStatus();
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, id, res, tab, value } = el.dataset;
    switch (action) {
      case 'tab': setTab(tab); break;
      case 'add': FORMS[state.tab](null); break;
      case 'edit': {
        const row = state.data[res].find((x) => x.id === Number(id));
        if (row) FORMS[res](row);
        break;
      }
      case 'toggle': toggleTugas(Number(id)); break;
      case 'filter': state.filter = value; render(); break;
      case 'day': state.day = value; render(); break;
      case 'close': closeSheet(); break;
      case 'sync': sync(); break;
      case 'install': install(); break;
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'cat-q') {
      state.q = e.target.value;
      render();
    }
  });

  // Gambar lampiran yang tidak bisa dimuat (offline/format tidak didukung): tampilkan ikon klip saja.
  document.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG') e.target.closest('.thumb')?.classList.add('thumb-off');
  }, true);

  window.addEventListener('online', () => { state.online = true; renderStatus(); sync(); });
  window.addEventListener('offline', () => { state.online = false; renderStatus(); });
  window.addEventListener('hashchange', () => {
    const tab = tabFromHash();
    if (tab !== state.tab) { state.tab = tab; render(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installEvent = e; renderStatus(); });
  window.addEventListener('appinstalled', () => { state.installEvent = null; renderStatus(); });

  // Coba kirim ulang antrean secara berkala selama masih ada yang tertunda atau server belum terjangkau.
  setInterval(() => {
    if (navigator.onLine && (!state.online || state.pending)) sync();
  }, 15000);
  // Perbarui penanda "sedang berlangsung" di jadwal tiap menit.
  setInterval(() => {
    if (state.tab === 'jadwal' && !sheet.open) render();
  }, 60000);

  /* ================= Mulai ================= */
  async function init() {
    loadLocal();
    sortAll();
    render();
    state.pending = await countPending();
    renderStatus();
    sync();
  }
  init();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker gagal didaftarkan:', err));
    });
  }
})();
