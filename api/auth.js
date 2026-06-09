// api/auth.js
const bcrypt = require('bcryptjs');
const { getDB, signToken, verifyToken, ok, fail, cors } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;

  // ── POST /api/auth?action=login ───────────────────────────────────────────
  if (req.method === 'POST' && action === 'login') {
    const { username, password } = req.body || {};
    if (!username || !password) return fail(res, 'Username and password required.');

    const db = getDB();
    const [rows] = await db.query(
      'SELECT * FROM admin_users WHERE username = ? AND is_active = 1', [username]
    );
    const admin = rows[0];
    if (!admin || !bcrypt.compareSync(password, admin.password))
      return fail(res, 'Invalid username or password.', 401);

    await db.query('UPDATE admin_users SET last_login = NOW() WHERE id = ?', [admin.id]);

    const token = signToken({ id: admin.id, username: admin.username, full_name: admin.full_name });
    return ok(res, { token, full_name: admin.full_name }, 'Login successful.');
  }

  // ── GET /api/auth?action=check ────────────────────────────────────────────
  if (req.method === 'GET' && action === 'check') {
    const payload = verifyToken(req);
    if (!payload) return fail(res, 'Not authenticated.', 401);
    return ok(res, { full_name: payload.full_name });
  }

  return fail(res, 'Not found.', 404);
};
