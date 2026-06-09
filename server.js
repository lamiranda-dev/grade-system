// server.js — Railway entry point
// Serves static files + all API routes in one Express app

const express = require('express');
const path    = require('path');
const multer  = require('multer');
const XLSX    = require('xlsx');

const { getDB, signToken, verifyToken, clientIP } = require('./api/_lib');
const bcrypt = require('bcryptjs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (index.html, admin/, etc.)
app.use(express.static(path.join(__dirname)));

// ── Auth helpers ──────────────────────────────────────────────────────────────
function authGuard(req, res, next) {
  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ success: false, message: 'Unauthorized.' });
  req.admin = payload;
  next();
}

function json(res, ok, data = null, msg = '') {
  return res.json({ success: ok, data, message: msg });
}

// ── POST /api/auth?action=login ───────────────────────────────────────────────
app.post('/api/auth', async (req, res) => {
  const action = req.query.action;

  if (action === 'login') {
    const { username, password } = req.body;
    if (!username || !password)
      return json(res, false, null, 'Username and password required.');

    const db = getDB();
    const [rows] = await db.query(
      'SELECT * FROM admin_users WHERE username = ? AND is_active = 1', [username]
    );
    const admin = rows[0];
    if (!admin || !bcrypt.compareSync(password, admin.password))
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });

    await db.query('UPDATE admin_users SET last_login = NOW() WHERE id = ?', [admin.id]);
    const token = signToken({ id: admin.id, username: admin.username, full_name: admin.full_name });
    return json(res, true, { token, full_name: admin.full_name }, 'Login successful.');
  }

  return res.status(404).json({ success: false, message: 'Not found.' });
});

// ── GET /api/auth?action=check ────────────────────────────────────────────────
app.get('/api/auth', (req, res) => {
  const action = req.query.action;
  if (action === 'check') {
    const payload = verifyToken(req);
    if (!payload) return res.status(401).json({ success: false, message: 'Not authenticated.' });
    return json(res, true, { full_name: payload.full_name });
  }
  return res.status(404).json({ success: false, message: 'Not found.' });
});

// ── GET /api/lookup — student grade lookup ────────────────────────────────────
app.get('/api/lookup', async (req, res) => {
  const num = (req.query.student_number || '').trim();
  if (!num) return json(res, false, null, 'Please enter your student number.');

  const db = getDB();
  const [rows] = await db.query(
    'SELECT student_number, full_name, final_grade, remarks FROM students WHERE student_number = ?',
    [num]
  );
  const student = rows[0];
  if (!student) return res.status(404).json({ success: false, message: 'Student not found. Please check your student number.' });

  await db.query(
    'INSERT INTO view_logs (student_number, student_name, ip_address) VALUES (?,?,?)',
    [student.student_number, student.full_name, clientIP(req)]
  );
  return json(res, true, student, 'Grade retrieved.');
});

// ── GET /api/grades — list / logs ─────────────────────────────────────────────
app.get('/api/grades', authGuard, async (req, res) => {
  const db     = getDB();
  const action = req.query.action;

  if (action === 'list') {
    const q = `%${(req.query.q || '').trim()}%`;
    const [rows] = await db.query(
      `SELECT id, student_number, full_name, final_grade, remarks, updated_at
       FROM students WHERE student_number LIKE ? OR full_name LIKE ?
       ORDER BY student_number LIMIT 200`, [q, q]
    );
    return json(res, true, rows);
  }

  if (action === 'logs') {
    const limit  = Math.min(parseInt(req.query.limit  || 50), 200);
    const offset = parseInt(req.query.offset || 0);
    const [logs] = await db.query(
      'SELECT student_number, student_name, ip_address, viewed_at FROM view_logs ORDER BY viewed_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM view_logs');
    return json(res, true, { logs, total });
  }

  return json(res, false, null, 'Unknown action.');
});

// ── POST /api/grades — add or update ─────────────────────────────────────────
app.post('/api/grades', authGuard, async (req, res) => {
  const db    = getDB();
  const body  = req.body;
  const snum  = (body.student_number || '').trim();
  const name  = (body.full_name || '').trim();
  const grade = body.final_grade !== undefined ? parseFloat(body.final_grade) : null;
  const id    = body.id ? parseInt(body.id) : 0;

  if (!snum || !name || grade === null)
    return json(res, false, null, 'Student number, name, and final grade are required.');
  if (grade < 1.0 || grade > 5.0)
    return json(res, false, null, 'Final grade must be between 1.00 and 5.00.');

  const remarks = grade <= 3.00 ? 'Passed' : 'Failed';

  if (id) {
    await db.query(
      'UPDATE students SET student_number=?, full_name=?, final_grade=?, remarks=? WHERE id=?',
      [snum, name, grade, remarks, id]
    );
    return json(res, true, null, 'Record updated.');
  } else {
    try {
      const [result] = await db.query(
        'INSERT INTO students (student_number, full_name, final_grade, remarks) VALUES (?,?,?,?)',
        [snum, name, grade, remarks]
      );
      return json(res, true, { id: result.insertId }, 'Student record added.');
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return json(res, false, null, 'Student number already exists.');
      throw e;
    }
  }
});

// ── DELETE /api/grades?id=X ───────────────────────────────────────────────────
app.delete('/api/grades', authGuard, async (req, res) => {
  const id = parseInt(req.query.id || 0);
  if (!id) return json(res, false, null, 'ID required.');
  await getDB().query('DELETE FROM students WHERE id=?', [id]);
  return json(res, true, null, 'Record deleted.');
});

// ── POST /api/bulk — file upload ──────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/bulk', authGuard, upload.single('file'), async (req, res) => {
  if (!req.file) return json(res, false, null, 'No file uploaded.');

  const ext = req.file.originalname.split('.').pop().toLowerCase();
  if (!['csv', 'xls', 'xlsx'].includes(ext))
    return json(res, false, null, 'Unsupported file. Use CSV, XLS, or XLSX.');

  let rows;
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  } catch (e) {
    return json(res, false, null, 'Could not parse file: ' + e.message);
  }

  if (!rows.length) return json(res, false, null, 'File is empty or has no data rows.');

  // Normalize column names
  rows = rows.map(r => {
    const out = {};
    for (const [k, v] of Object.entries(r)) out[k.toLowerCase().trim()] = String(v).trim();
    return out;
  });

  const db = getDB();
  let inserted = 0, updated = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i];
    const rowNum = i + 2;
    const snum   = row['student_number'] || row['student_no'] || '';
    const name   = row['full_name'] || row['name'] || '';
    const raw    = row['final_grade'] || row['grade'] || '';

    if (!snum || !name || raw === '') {
      errors.push(`Row ${rowNum}: Missing student_number, full_name, or final_grade.`);
      continue;
    }
    const grade = parseFloat(raw);
    if (isNaN(grade) || grade < 1 || grade > 5) {
      errors.push(`Row ${rowNum}: Grade "${raw}" is invalid (must be 1.00–5.00).`);
      continue;
    }
    const remarks = grade <= 3.00 ? 'Passed' : 'Failed';

    try {
      const [[existing]] = await db.query('SELECT id FROM students WHERE student_number = ?', [snum]);
      if (existing) {
        await db.query(
          'UPDATE students SET full_name=?, final_grade=?, remarks=?, updated_at=NOW() WHERE student_number=?',
          [name, grade, remarks, snum]
        );
        updated++;
      } else {
        await db.query(
          'INSERT INTO students (student_number, full_name, final_grade, remarks) VALUES (?,?,?,?)',
          [snum, name, grade, remarks]
        );
        inserted++;
      }
    } catch (e) {
      errors.push(`Row ${rowNum}: DB error — ${e.message}`);
    }
  }

  const msg = `${inserted} added, ${updated} updated.` + (errors.length ? ` ${errors.length} row(s) had errors.` : '');
  return json(res, true, { inserted, updated, errors, total_processed: inserted + updated }, msg);
});

// ── Catch-all: serve index.html for any unmatched route ───────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`GradeView running on port ${PORT}`);
});
