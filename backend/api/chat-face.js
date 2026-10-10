import db from '../db.js';

const ID = /^[a-f0-9]{24}$/;
const USER = /^[A-Za-z0-9_-]{8,80}$/;
const FACE_TTL = 20000;
const faceCache = new Map();
const writes = new Map();

const lookupStmt = db.prepare(
  `SELECT f.vortex_id, u.username, u.display_name, u.bio, u.avatar_url, u.profile_color, u.banned
   FROM chat_faces f JOIN users u ON u.id = f.user_id
   WHERE f.vortex_id = ?`
);

function cleanText(raw, max) {
  return String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function safeAvatar(raw) {
  const v = String(raw || '').trim();
  if (!v || v.length > 240) return '';
  if (/^\/uploads\/avatars\/[A-Za-z0-9._-]+$/.test(v)) return v;
  if (/^\/storage\/[A-Za-z0-9._/-]+$/.test(v)) return v;
  return '';
}

function shapeFace(row) {
  if (!row || row.banned) return null;
  const name = cleanText(row.display_name || row.username, 32);
  const username = cleanText(row.username, 32);
  const bio = cleanText(row.bio, 160);
  const avatar = safeAvatar(row.avatar_url);
  const color = /^#[0-9a-fA-F]{6}$/.test(String(row.profile_color || '')) ? String(row.profile_color) : '';
  if (!name && !username && !bio && !avatar) return null;
  return { name: name || username, username, avatar, bio, color };
}

function remember(id, face) {
  if (faceCache.size > 400) faceCache.clear();
  faceCache.set(id, { at: Date.now(), face });
}

export function faceFor(id) {
  if (!ID.test(String(id || ''))) return null;
  const hit = faceCache.get(id);
  if (hit && Date.now() - hit.at < FACE_TTL) return hit.face;
  let face = null;
  try {
    const row = lookupStmt.get(id);
    face = shapeFace(row);
    if (row?.banned) {
      db.prepare('DELETE FROM chat_faces WHERE vortex_id = ?').run(id);
    }
  } catch {
    face = null;
  }
  remember(id, face);
  return face;
}

export function facesFor(ids) {
  const out = new Map();
  for (const id of [...new Set(ids)].slice(0, 80)) {
    if (!ID.test(id)) continue;
    out.set(id, faceFor(id));
  }
  return out;
}

function withSite(person) {
  if (!person?.id) return person;
  const site = faceFor(person.id);
  if (!site) return person;
  return {
    ...person,
    avatar: site.avatar || person.avatar,
    site,
  };
}

export function attachMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) return messages || [];
  try {
    return messages.map((msg) => {
      if (!msg?.author) return msg;
      const author = withSite(msg.author);
      return author === msg.author ? msg : { ...msg, author };
    });
  } catch {
    return messages;
  }
}

export function attachViewer(viewer) {
  try {
    return withSite(viewer);
  } catch {
    return viewer;
  }
}

export function attachGroups(groups) {
  if (!Array.isArray(groups)) return groups || [];
  try {
    return groups.map((group) => ({
      ...group,
      members: (group.members || []).map((member) => withSite(member)),
    }));
  } catch {
    return groups;
  }
}

export function attachCard(card) {
  if (!card?.id) return card;
  try {
    const site = faceFor(card.id);
    return site ? { ...card, avatar: site.avatar || card.avatar, site } : card;
  } catch {
    return card;
  }
}

function allowWrite(key) {
  const now = Date.now();
  const row = writes.get(key) || [];
  const next = row.filter((at) => now - at < 60000);
  if (next.length >= 8) {
    writes.set(key, next);
    return false;
  }
  next.push(now);
  writes.set(key, next);
  if (writes.size > 500) writes.clear();
  return true;
}

export function sameFaceOrigin(req) {
  const host = req.get('host');
  if (!host) return false;
  const origin = req.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  const site = String(req.get('sec-fetch-site') || '');
  if (site && site !== 'same-origin' && site !== 'same-site' && site !== 'none') return false;
  return true;
}

export function readSiteUser(req) {
  const id = String(req.session?.user?.id || '');
  if (!USER.test(id)) return null;
  const row = db.prepare(
    'SELECT id, username, display_name, bio, avatar_url, profile_color, banned FROM users WHERE id = ?'
  ).get(id);
  if (!row || row.banned) return null;
  return row;
}

export function faceState(vortexId, siteRow) {
  const linked = ID.test(String(vortexId || '')) ? faceFor(vortexId) : null;
  const mine = siteRow ? shapeFace(siteRow) : null;
  return {
    signedIn: !!siteRow,
    linked: !!linked,
    face: linked,
    mine,
  };
}

export function setFace(vortexId, userId, on) {
  if (!ID.test(vortexId) || !USER.test(userId)) return { ok: false, status: 400 };
  if (!allowWrite(userId)) return { ok: false, status: 429 };
  if (!on) {
    db.prepare('DELETE FROM chat_faces WHERE vortex_id = ? AND user_id = ?').run(vortexId, userId);
    faceCache.delete(vortexId);
    return { ok: true };
  }
  const row = db.prepare(
    'SELECT id, username, display_name, bio, avatar_url, profile_color, banned FROM users WHERE id = ?'
  ).get(userId);
  if (!row || row.banned) return { ok: false, status: 401 };
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM chat_faces WHERE user_id = ? AND vortex_id != ?').run(userId, vortexId);
    db.prepare(
      `INSERT INTO chat_faces (vortex_id, user_id, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(vortex_id) DO UPDATE SET user_id = excluded.user_id, updated_at = excluded.updated_at`
    ).run(vortexId, userId, now);
  });
  tx();
  faceCache.delete(vortexId);
  return { ok: true, face: shapeFace(row) };
}
