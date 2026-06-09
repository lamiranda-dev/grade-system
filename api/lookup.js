// api/lookup.js  — student enters number, gets their grade
const { getDB, ok, fail, cors, clientIP } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return fail(res, 'GET only.');

  const num = (req.query.student_number || '').trim();
  if (!num) return fail(res, 'Please enter your student number.');

  const db = getDB();
  const [rows] = await db.query(
    'SELECT student_number, full_name, final_grade, remarks FROM students WHERE student_number = ?',
    [num]
  );
  const student = rows[0];
  if (!student) return fail(res, 'Student not found. Please check your student number.', 404);

  // Log the view
  await db.query(
    'INSERT INTO view_logs (student_number, student_name, ip_address) VALUES (?,?,?)',
    [student.student_number, student.full_name, clientIP(req)]
  );

  return ok(res, student, 'Grade retrieved.');
};
