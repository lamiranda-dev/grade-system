// api/grades.js  — Admin CRUD
const { getDB, verifyToken, ok, fail, cors } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth guard
  const admin = verifyToken(req);
  if (!admin) return fail(res, 'Unauthorized.', 401);

  const db     = getDB();
  const action = req.query.action || '';

  // ── GET ───────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {

    if (action === 'list') {
      const q = `%${(req.query.q || '').trim()}%`;
      const [rows] = await db.query(
        `SELECT id, student_number, full_name, final_grade, remarks, updated_at
         FROM students WHERE student_number LIKE ? OR full_name LIKE ?
         ORDER BY student_number LIMIT 200`,
        [q, q]
      );
      return ok(res, rows);
    }

    if (action === 'logs') {
      const limit  = Math.min(parseInt(req.query.limit  || 50), 200);
      const offset = parseInt(req.query.offset || 0);
      const [logs]  = await db.query(
        'SELECT student_number, student_name, ip_address, viewed_at FROM view_logs ORDER BY viewed_at DESC LIMIT ? OFFSET ?',
        [limit, offset]
      );
      const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM view_logs');
      return ok(res, { logs, total });
    }

    return fail(res, 'Unknown action.');
  }

  // ── POST: add or update ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body  = req.body || {};
    const snum  = (body.student_number || '').trim();
    const name  = (body.full_name || '').trim();
    const grade = body.final_grade !== undefined ? parseFloat(body.final_grade) : null;
    const id    = body.id ? parseInt(body.id) : 0;

    if (!snum || !name || grade === null) return fail(res, 'Student number, name, and final grade are required.');
    if (grade < 1.0 || grade > 5.0) return fail(res, 'Final grade must be between 1.00 and 5.00.');

    const remarks = grade <= 3.00 ? 'Passed' : 'Failed';

    if (id) {
      await db.query(
        'UPDATE students SET student_number=?, full_name=?, final_grade=?, remarks=? WHERE id=?',
        [snum, name, grade, remarks, id]
      );
      return ok(res, null, 'Record updated.');
    } else {
      try {
        const [result] = await db.query(
          'INSERT INTO students (student_number, full_name, final_grade, remarks) VALUES (?,?,?,?)',
          [snum, name, grade, remarks]
        );
        return ok(res, { id: result.insertId }, 'Student record added.');
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return fail(res, 'Student number already exists.');
        throw e;
      }
    }
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const id = parseInt(req.query.id || 0);
    if (!id) return fail(res, 'ID required.');
    await db.query('DELETE FROM students WHERE id=?', [id]);
    return ok(res, null, 'Record deleted.');
  }

  return fail(res, 'Method not allowed.', 405);
};
