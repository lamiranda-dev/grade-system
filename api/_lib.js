// api/_lib.js
const mysql = require('mysql2/promise');
const jwt   = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'gradeview-change-this-secret';

let pool;
function getDB() {
  if (!pool) {
    const isInternal = (process.env.MYSQLHOST || '').includes('.railway.internal');
    pool = mysql.createPool({
      host:     process.env.MYSQLHOST     || process.env.DB_HOST,
      port:     parseInt(process.env.MYSQLPORT || process.env.DB_PORT || '3306'),
      user:     process.env.MYSQLUSER     || process.env.DB_USER,
      password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD,
      database: process.env.MYSQLDATABASE || process.env.DB_NAME,
      ssl:      isInternal ? false : { rejectUnauthorized: false },
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

function verifyToken(req) {
  const auth  = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

function clientIP(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.socket?.remoteAddress || 'unknown';
}

module.exports = { getDB, signToken, verifyToken, clientIP };
