import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'crypto';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { toIPv4 } from '../middleware/security.js';

const TOKEN_RE = /^gsk_[A-Za-z0-9_-]{16,220}$/;
const ID_RE = /^[a-f0-9]{32}$/;
const NOTE_MAX = 80;
const CACHE_MS = 20000;
const CACHE_MAX = 256;

const keyCache = { buf: null, stamp: '' };
const tokenCache = new Map();

export const aiGrantsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many requests' }),
});

function grantKey() {
  const secret = process.env.SESSION_SECRET || '';
  if (secret.length < 32) return null;
  if (keyCache.buf && keyCache.stamp === secret) return keyCache.buf;
  const buf = Buffer.from(hkdfSync('sha256', secret, Buffer.from('pz-ai-ip-v1'), Buffer.from('grant'), 32));
  keyCache.buf = buf;
  keyCache.stamp = secret;
  return buf;
}

export function normalizeGrantIp(raw) {
  if (typeof raw !== 'string') return '';
  let ip = raw.trim();
  if (!ip || ip.length > 64) return '';
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return '';
  const parts = ip.split('.').map((n) => Number(n));
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return '';
  const [a, b] = parts;
  if (a === 0 || a === 127 || a >= 224) return '';
  if (a === 169 && b === 254) return '';
  if (a === 100 && b >= 64 && b <= 127) return '';
  return parts.join('.');
}

function cleanToken(raw) {
  if (typeof raw !== 'string') return '';
  const token = raw.trim();
  if (!TOKEN_RE.test(token)) return '';
  return token;
}

function isSiteKey(token) {
  const main = typeof process.env.GROQ_API_KEY === 'string' ? process.env.GROQ_API_KEY.trim() : '';
  if (!main || main.length !== token.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(main));
  } catch {
    return false;
  }
}

function hintOf(token) {
  return token.slice(-4);
}

function seal(ip, token) {
  const key = grantKey();
  if (!key) return null;
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(`v1:${ip}`, 'utf8'));
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return {
    cipher: body.toString('base64'),
    nonce: nonce.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    hint: hintOf(token),
  };
}

function open(ip, row) {
  const key = grantKey();
  if (!key || !row) return '';
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(row.nonce, 'base64'));
    decipher.setAAD(Buffer.from(`v1:${ip}`, 'utf8'));
    decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(row.cipher, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return cleanToken(plain);
  } catch {
    return '';
  }
}

function cleanNote(raw) {
  if (raw == null) return '';
  if (typeof raw !== 'string') return null;
  const note = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NOTE_MAX);
  return note;
}

function dropCache(ip) {
  if (ip) tokenCache.delete(ip);
  else tokenCache.clear();
}

function remember(ip, token) {
  if (tokenCache.size > CACHE_MAX) tokenCache.clear();
  tokenCache.set(ip, { token, at: Date.now() });
}

export function resolveAiKey(ip) {
  const clean = normalizeGrantIp(ip);
  if (!clean) return { mode: 'main' };
  const hit = tokenCache.get(clean);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.token ? { mode: 'custom', token: hit.token } : { mode: 'main' };
  }
  let row;
  try {
    row = db.prepare(
      'SELECT cipher, nonce, tag FROM ai_ip_grants WHERE ip = ? AND active = 1'
    ).get(clean);
  } catch {
    return { mode: 'main' };
  }
  if (!row) {
    remember(clean, '');
    return { mode: 'main' };
  }
  const token = open(clean, row);
  if (!token) return { mode: 'broken' };
  remember(clean, token);
  return { mode: 'custom', token };
}

function sameSiteWrite(req) {
  const origin = req.get('origin');
  const host = req.get('host');
  if (!host) return false;
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  const site = String(req.get('sec-fetch-site') || '');
  if (site && site !== 'same-origin' && site !== 'same-site' && site !== 'none') return false;
  const type = String(req.get('content-type') || '');
  if (!type.toLowerCase().includes('application/json')) return false;
  return true;
}

function loadAdmin(req, res) {
  if (!req.session?.user?.id) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const row = db.prepare(
    'SELECT id, email, is_admin, banned, totp_enabled, password_hash FROM users WHERE id = ?'
  ).get(req.session.user.id);
  if (!row || row.banned) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const owner = isOwnerEmail(row.email);
  let level = Number(row.is_admin || 0);
  if (owner && level < 3) {
    db.prepare('UPDATE users SET is_admin = 3 WHERE id = ?').run(row.id);
    level = 3;
  }
  if (level < 1 && !owner) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  if (!row.totp_enabled) {
    res.status(403).json({ error: 'Set up two-factor authentication to continue', code: 'MUST_SETUP_2FA' });
    return null;
  }
  return { id: row.id, password_hash: row.password_hash, level: Math.max(level, owner ? 3 : level) };
}

async function confirmPassword(admin, password, res) {
  const pw = typeof password === 'string' ? password : '';
  if (!pw || pw.length < 8 || pw.length > 256 || !admin.password_hash) {
    await new Promise((r) => setTimeout(r, 140 + Math.floor(Math.random() * 160)));
    res.status(401).json({ error: 'Invalid password' });
    return false;
  }
  const match = await bcrypt.compare(pw, admin.password_hash);
  if (!match) {
    await new Promise((r) => setTimeout(r, 140 + Math.floor(Math.random() * 160)));
    res.status(401).json({ error: 'Invalid password' });
    return false;
  }
  return true;
}

function publicRow(row) {
  return {
    id: row.id,
    ip: row.ip,
    note: row.note,
    hint: row.hint,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at || null,
  };
}

export function listAiGrantsHandler(req, res) {
  const admin = loadAdmin(req, res);
  if (!admin) return;
  const rows = db.prepare(
    `SELECT id, ip, note, hint, active, created_at, updated_at, cancelled_at
     FROM ai_ip_grants
     ORDER BY active DESC, updated_at DESC
     LIMIT 200`
  ).all();
  res.json({ grants: rows.map(publicRow) });
}

export async function createAiGrantHandler(req, res) {
  if (!sameSiteWrite(req)) return res.status(403).json({ error: 'Forbidden' });
  const admin = loadAdmin(req, res);
  if (!admin) return;
  const password = req.body?.password;
  const tokenRaw = req.body?.token;
  const ipRaw = req.body?.ip;
  const noteRaw = req.body?.note;
  if (req.body && typeof req.body === 'object') {
    delete req.body.token;
    delete req.body.password;
  }
  if (!(await confirmPassword(admin, password, res))) return;
  if (!grantKey()) return res.status(503).json({ error: 'AI grants unavailable' });

  const ip = normalizeGrantIp(ipRaw);
  if (!ip) return res.status(400).json({ error: 'Enter a public IPv4 address' });
  const token = cleanToken(tokenRaw);
  if (!token) return res.status(400).json({ error: 'Enter a Groq token' });
  if (isSiteKey(token)) return res.status(400).json({ error: 'Use a different token' });
  const note = cleanNote(noteRaw);
  if (note == null) return res.status(400).json({ error: 'Invalid note' });

  const packed = seal(ip, token);
  if (!packed) return res.status(503).json({ error: 'AI grants unavailable' });
  const now = Date.now();
  const id = randomBytes(16).toString('hex');
  try {
    db.prepare(
      `INSERT INTO ai_ip_grants
        (id, ip, note, cipher, nonce, tag, hint, active, created_by, updated_by, created_at, updated_at, cancelled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, NULL)`
    ).run(id, ip, note, packed.cipher, packed.nonce, packed.tag, packed.hint, admin.id, admin.id, now, now);
  } catch (err) {
    if (String(err?.code || '').includes('CONSTRAINT')) {
      return res.status(409).json({ error: 'That IP already has an active grant' });
    }
    return res.status(500).json({ error: 'Could not save' });
  }
  dropCache(ip);
  const row = db.prepare(
    `SELECT id, ip, note, hint, active, created_at, updated_at, cancelled_at FROM ai_ip_grants WHERE id = ?`
  ).get(id);
  res.json({ grant: publicRow(row) });
}

export async function updateAiGrantHandler(req, res) {
  if (!sameSiteWrite(req)) return res.status(403).json({ error: 'Forbidden' });
  const admin = loadAdmin(req, res);
  if (!admin) return;
  const id = String(req.params?.id || '');
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Invalid request' });
  const password = req.body?.password;
  const tokenRaw = req.body?.token;
  const ipRaw = req.body?.ip;
  const noteRaw = req.body?.note;
  const activeRaw = req.body?.active;
  if (req.body && typeof req.body === 'object') {
    delete req.body.token;
    delete req.body.password;
  }
  if (!(await confirmPassword(admin, password, res))) return;

  const current = db.prepare('SELECT * FROM ai_ip_grants WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ error: 'Not found' });

  let ip = current.ip;
  if (ipRaw != null) {
    ip = normalizeGrantIp(ipRaw);
    if (!ip) return res.status(400).json({ error: 'Enter a public IPv4 address' });
  }
  const note = noteRaw == null ? current.note : cleanNote(noteRaw);
  if (note == null) return res.status(400).json({ error: 'Invalid note' });

  let active = current.active === 1;
  if (typeof activeRaw === 'boolean') active = activeRaw;

  let cipher = current.cipher;
  let nonce = current.nonce;
  let tag = current.tag;
  let hint = current.hint;
  const incoming = typeof tokenRaw === 'string' ? tokenRaw.trim() : '';
  const ipChanged = ip !== current.ip;
  if (incoming || ipChanged) {
    if (!grantKey()) return res.status(503).json({ error: 'AI grants unavailable' });
    let token = incoming ? cleanToken(incoming) : open(current.ip, current);
    if (!token) return res.status(400).json({ error: incoming ? 'Enter a Groq token' : 'Stored token could not be read' });
    if (isSiteKey(token)) return res.status(400).json({ error: 'Use a different token' });
    const packed = seal(ip, token);
    if (!packed) return res.status(503).json({ error: 'AI grants unavailable' });
    cipher = packed.cipher;
    nonce = packed.nonce;
    tag = packed.tag;
    hint = packed.hint;
  }

  const now = Date.now();
  const cancelledAt = active ? null : (current.cancelled_at || now);
  try {
    db.prepare(
      `UPDATE ai_ip_grants
       SET ip = ?, note = ?, cipher = ?, nonce = ?, tag = ?, hint = ?, active = ?, updated_by = ?, updated_at = ?, cancelled_at = ?
       WHERE id = ?`
    ).run(ip, note, cipher, nonce, tag, hint, active ? 1 : 0, admin.id, now, cancelledAt, id);
  } catch (err) {
    if (String(err?.code || '').includes('CONSTRAINT')) {
      return res.status(409).json({ error: 'That IP already has an active grant' });
    }
    return res.status(500).json({ error: 'Could not save' });
  }
  dropCache(current.ip);
  dropCache(ip);
  const row = db.prepare(
    `SELECT id, ip, note, hint, active, created_at, updated_at, cancelled_at FROM ai_ip_grants WHERE id = ?`
  ).get(id);
  res.json({ grant: publicRow(row) });
}

export async function cancelAiGrantHandler(req, res) {
  if (!sameSiteWrite(req)) return res.status(403).json({ error: 'Forbidden' });
  const admin = loadAdmin(req, res);
  if (!admin) return;
  const id = String(req.params?.id || '');
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Invalid request' });
  const password = req.body?.password;
  if (req.body && typeof req.body === 'object') delete req.body.password;
  if (!(await confirmPassword(admin, password, res))) return;
  const current = db.prepare('SELECT id, ip, active FROM ai_ip_grants WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ error: 'Not found' });
  const now = Date.now();
  db.prepare(
    `UPDATE ai_ip_grants SET active = 0, cancelled_at = COALESCE(cancelled_at, ?), updated_by = ?, updated_at = ? WHERE id = ?`
  ).run(now, admin.id, now, id);
  dropCache(current.ip);
  const row = db.prepare(
    `SELECT id, ip, note, hint, active, created_at, updated_at, cancelled_at FROM ai_ip_grants WHERE id = ?`
  ).get(id);
  res.json({ grant: publicRow(row) });
}
