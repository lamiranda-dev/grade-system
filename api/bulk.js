// api/bulk.js  — CSV / XLS / XLSX bulk import
const XLSX    = require('xlsx');
const { getDB, verifyToken, ok, fail, cors } = require('./_lib');

// Disable Vercel's default body parser so we can read raw buffer
export const config = { api: { bodyParser: false } };

// Read raw body as Buffer
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Parse multipart/form-data manually (single file field "file")
function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from('--' + boundary);
  const parts = [];
  let start = 0;

  while (start < buffer.length) {
    const bStart = buffer.indexOf(boundaryBuf, start);
    if (bStart === -1) break;
    const headerStart = bStart + boundaryBuf.length + 2; // skip \r\n
    const headerEnd   = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    if (headerEnd === -1) break;
    const headers = buffer.slice(headerStart, headerEnd).toString();
    const dataStart = headerEnd + 4;
    const nextBound = buffer.indexOf(boundaryBuf, dataStart);
    const dataEnd   = nextBound === -1 ? buffer.length : nextBound - 2;
    parts.push({ headers, data: buffer.slice(dataStart, dataEnd) });
    start = nextBound === -1 ? buffer.length : nextBound;
  }
  return parts;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return fail(res, 'POST only.');

  const admin = verifyToken(req);
  if (!admin) return fail(res, 'Unauthorized.', 401);

  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.+)/);
  if (!boundaryMatch) return fail(res, 'Expected multipart/form-data.');

  const rawBody  = await readBody(req);
  const parts    = parseMultipart(rawBody, boundaryMatch[1].trim());
  const filePart = parts.find(p => p.headers.includes('filename='));
  if (!filePart) return fail(res, 'No file found in upload.');

  // Get filename
  const fnMatch = filePart.headers.match(/filename="([^"]+)"/);
  const filename = fnMatch ? fnMatch[1].toLowerCase() : '';
  const ext = filename.split('.').pop();
  if (!['csv', 'xls', 'xlsx'].includes(ext)) return fail(res, 'Unsupported file. Use CSV, XLS, or XLSX.');

  // Parse with SheetJS
  let rows;
  try {
    const wb   = XLSX.read(filePart.data, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  } catch (e) {
    return fail(res, 'Could not parse file: ' + e.message);
  }

  if (!rows.length) return fail(res, 'File is empty or has no data rows.');

  // Normalize column names (lowercase + trim)
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
      const [[existing]] = await db.query(
        'SELECT id FROM students WHERE student_number = ?', [snum]
      );
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
  return ok(res, { inserted, updated, errors, total_processed: inserted + updated }, msg);
};
