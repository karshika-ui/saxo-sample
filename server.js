'use strict';

const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const dataDirectory = path.join(__dirname, 'data');
fs.mkdirSync(dataDirectory, { recursive: true });
const db = new DatabaseSync(path.join(dataDirectory, 'saxo.sqlite'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'request' CHECK(role IN ('request', 'factory')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS master_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('employee','dealer','direct_customer','unit','location','product')),
    name TEXT NOT NULL COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type, name)
  );
  CREATE TABLE IF NOT EXISTS sample_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_number TEXT UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    cc_email TEXT NOT NULL,
    employee_id INTEGER NOT NULL REFERENCES master_data(id),
    customer_type TEXT NOT NULL CHECK(customer_type IN ('dealer','direct_customer')),
    customer_id INTEGER NOT NULL REFERENCES master_data(id),
    unit_id INTEGER NOT NULL REFERENCES master_data(id),
    location_id INTEGER NOT NULL REFERENCES master_data(id),
    product_id INTEGER NOT NULL REFERENCES master_data(id),
    quantity REAL NOT NULL CHECK(quantity > 0),
    quantity_unit TEXT NOT NULL CHECK(quantity_unit IN ('KG','g','L','ml','pcs')),
    status TEXT NOT NULL DEFAULT 'Pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS sample_requests_user_id ON sample_requests(user_id);
  CREATE INDEX IF NOT EXISTS master_data_type ON master_data(type);
`);

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const MASTER_TYPES = new Set(['employee', 'dealer', 'direct_customer', 'unit', 'location', 'product']);
const QUANTITY_UNITS = new Set(['KG', 'g', 'L', 'ml', 'pcs']);
const validEmail = value => typeof value === 'string' && value.length <= 254 && EMAIL_PATTERN.test(value) && !value.includes('..');
const normalizeEmail = value => value.trim().toLowerCase();
const parseCookies = header => Object.fromEntries((header || '').split(';').filter(Boolean).map(cookie => { const position = cookie.indexOf('='); return [decodeURIComponent(cookie.slice(0, position).trim()), decodeURIComponent(cookie.slice(position + 1))]; }));
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
const hashPassword = (password, salt) => crypto.scryptSync(password, salt, 64).toString('hex');
const secureCompare = (left, right) => { const a = Buffer.from(left, 'hex'), b = Buffer.from(right, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); };

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url'), expires = new Date(Date.now() + 8 * 60 * 60 * 1000);
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash(token), userId, expires.toISOString());
  res.setHeader('Set-Cookie', `saxo_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${8 * 60 * 60}`);
}

function authenticated(req, res, next) {
  const token = parseCookies(req.headers.cookie).saxo_session;
  if (!token) return res.status(401).json({ error: 'Authentication is required.' });
  const user = db.prepare(`SELECT users.id, users.email, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(tokenHash(token), new Date().toISOString());
  if (!user) return res.status(401).json({ error: 'Your session has expired. Please sign in.' });
  req.user = user; req.sessionToken = token; next();
}

app.post('/api/auth/signup', (req, res) => {
  const email = typeof req.body.email === 'string' ? normalizeEmail(req.body.email) : '', password = req.body.password;
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email such as name@company.com.' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Password must contain between 8 and 128 characters.' });
  const salt = crypto.randomBytes(16).toString('hex');
  try { db.prepare('INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)').run(email, hashPassword(password, salt), salt); return res.status(201).json({ message: 'Account created.' }); }
  catch (error) { if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'An account with this email already exists.' }); throw error; }
});

app.post('/api/auth/signin', (req, res) => {
  const email = typeof req.body.email === 'string' ? normalizeEmail(req.body.email) : '', password = req.body.password;
  if (!validEmail(email) || typeof password !== 'string') return res.status(400).json({ error: 'Enter a valid email and password.' });
  const user = db.prepare('SELECT id, email, role, password_hash, password_salt FROM users WHERE email = ?').get(email);
  if (!user || !secureCompare(hashPassword(password, user?.password_salt || crypto.randomBytes(16).toString('hex')), user?.password_hash || '00'.repeat(64))) return res.status(401).json({ error: 'Email or password is incorrect.' });
  createSession(res, user.id); res.json({ user: { id: user.id, email: user.email, role: user.role } });
});

app.get('/api/auth/session', (req, res) => {
  const token = parseCookies(req.headers.cookie).saxo_session; if (!token) return res.json({ user: null });
  const user = db.prepare(`SELECT users.id, users.email, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(tokenHash(token), new Date().toISOString());
  res.json({ user: user || null });
});

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie).saxo_session; if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
  res.setHeader('Set-Cookie', 'saxo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); res.json({ message: 'Signed out.' });
});

app.get('/api/masters', authenticated, (_req, res) => {
  const masters = Object.fromEntries([...MASTER_TYPES].map(type => [type, []]));
  for (const row of db.prepare('SELECT id, type, name FROM master_data ORDER BY name COLLATE NOCASE').all()) masters[row.type].push({ id: row.id, name: row.name });
  res.json({ masters });
});

app.post('/api/masters', authenticated, (req, res) => {
  const type = req.body.type, name = typeof req.body.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
  if (!MASTER_TYPES.has(type)) return res.status(400).json({ error: 'Invalid master-data type.' });
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Name must contain between 2 and 100 characters.' });
  try { const result = db.prepare('INSERT INTO master_data (type, name) VALUES (?, ?)').run(type, name); res.status(201).json({ master: { id: Number(result.lastInsertRowid), type, name } }); }
  catch (error) { if (String(error.message).includes('UNIQUE')) { const existing = db.prepare('SELECT id, type, name FROM master_data WHERE type = ? AND name = ?').get(type, name); return res.status(200).json({ master: existing }); } throw error; }
});

function masterHasType(id, type) { const record = Number.isInteger(id) && db.prepare('SELECT id FROM master_data WHERE id = ? AND type = ?').get(id, type); return Boolean(record); }
app.post('/api/sample-requests', authenticated, (req, res) => {
  const body = req.body, ccEmail = typeof body.ccEmail === 'string' ? normalizeEmail(body.ccEmail) : '';
  if (!validEmail(ccEmail)) return res.status(400).json({ error: `Invalid CC email: ${body.ccEmail || '(empty)'}` });
  if (!['dealer', 'direct_customer'].includes(body.customerType)) return res.status(400).json({ error: 'Select a valid customer type.' });
  const ids = { employeeId: Number(body.employeeId), customerId: Number(body.customerId), unitId: Number(body.unitId), locationId: Number(body.locationId), productId: Number(body.productId) };
  const expected = { employeeId: 'employee', customerId: body.customerType, unitId: 'unit', locationId: 'location', productId: 'product' };
  for (const [field, type] of Object.entries(expected)) if (!masterHasType(ids[field], type)) return res.status(400).json({ error: `Select a valid ${type.replace('_', ' ')}.` });
  const quantity = Number(body.quantity); if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'Sample quantity must be greater than zero.' });
  if (!QUANTITY_UNITS.has(body.quantityUnit)) return res.status(400).json({ error: 'Select a valid quantity unit.' });
  let created;
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare(`INSERT INTO sample_requests (user_id, cc_email, employee_id, customer_type, customer_id, unit_id, location_id, product_id, quantity, quantity_unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(req.user.id, ccEmail, ids.employeeId, body.customerType, ids.customerId, ids.unitId, ids.locationId, ids.productId, quantity, body.quantityUnit);
    const id = Number(result.lastInsertRowid), referenceNumber = `SR-${new Date().getFullYear()}-${String(id).padStart(5, '0')}`;
    db.prepare('UPDATE sample_requests SET reference_number = ? WHERE id = ?').run(referenceNumber, id);
    db.exec('COMMIT'); created = { id, referenceNumber };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  res.status(201).json({ request: created });
});

app.get('/api/sample-requests', authenticated, (req, res) => {
  const requests = db.prepare(`SELECT r.id, r.reference_number AS referenceNumber, r.cc_email AS ccEmail, r.customer_type AS customerType, r.quantity, r.quantity_unit AS quantityUnit, r.status, r.created_at AS createdAt, u.email, employee.name AS employeeName, customer.name AS customerName, unit.name AS unitName, location.name AS locationName, product.name AS productName FROM sample_requests r JOIN users u ON u.id = r.user_id JOIN master_data employee ON employee.id = r.employee_id JOIN master_data customer ON customer.id = r.customer_id JOIN master_data unit ON unit.id = r.unit_id JOIN master_data location ON location.id = r.location_id JOIN master_data product ON product.id = r.product_id WHERE r.user_id = ? ORDER BY r.id DESC`).all(req.user.id);
  res.json({ requests });
});

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/styles.css', (_req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
app.get('/app.js', (_req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'An unexpected server error occurred.' }); });

if (require.main === module) app.listen(PORT, () => console.log(`SAXO Sample Requests is running at http://localhost:${PORT}`));
module.exports = { app, db };
