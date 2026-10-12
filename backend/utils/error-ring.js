const RING = 24;
const rows = Array.from({ length: RING }, () => ({ t: 0, n: 0, code: 0, path: '', msg: '' }));
let head = 0;
let total = 0;
let hooked = false;

function scrub(raw) {
  const s = String(raw || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 240);
  return s
    .replace(/gsk_[A-Za-z0-9_-]+/g, '[key]')
    .replace(/vtxc_[A-Za-z0-9_-]+/g, '[code]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:code|state|token|access_token|refresh_token|client_secret)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export function noteError(code, path, msg) {
  const m = scrub(msg);
  if (!m) return;
  const p = scrub(path).slice(0, 80);
  const c = Number(code) || 0;
  const look = total < 8 ? total : 8;
  for (let i = 0; i < look; i++) {
    const row = rows[(head - 1 - i + RING) % RING];
    if (row.code === c && row.path === p && row.msg === m) {
      row.n++;
      row.t = Date.now();
      return;
    }
  }
  const row = rows[head];
  row.t = Date.now();
  row.n = 1;
  row.code = c;
  row.path = p;
  row.msg = m;
  head = (head + 1) % RING;
  if (total < 1e7) total++;
}

export function noteHttpStatus(code, method, path) {
  if (code < 500) return;
  noteError(code, `${method || 'GET'} ${path || '/'}`, 'request failed');
}

export function listErrors() {
  const n = total < RING ? total : RING;
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = rows[(head - 1 - i + RING) % RING];
    if (!row.t) continue;
    out.push({ t: row.t, n: row.n, code: row.code, path: row.path, msg: row.msg });
  }
  return { total, rows: out };
}

export function installErrorHooks() {
  if (hooked) return;
  hooked = true;
  const orig = console.error;
  console.error = function (...args) {
    orig.apply(console, args);
    let msg = '';
    const a = args[0];
    if (typeof a === 'string') msg = a;
    else if (a instanceof Error) msg = a.message;
    const b = args[1];
    if (b instanceof Error && b.message && b.message !== msg) msg = msg ? `${msg} ${b.message}` : b.message;
    if (msg) noteError(0, '', msg);
  };
  process.on('uncaughtExceptionMonitor', (err) => {
    noteError(0, '', err instanceof Error ? err.message : 'uncaught');
  });
}
