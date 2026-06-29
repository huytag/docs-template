async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const hashHex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  const saltHex = [...salt].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const computedHex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  return computedHex === hashHex;
}

async function createJWT(payload, secret) {
  const encoder = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 * 7 }));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`));
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${body}.${sigBase64}`;
}

async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(`${header}.${body}`));
    if (!valid) return null;
    const payload = JSON.parse(atob(body));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

function corsHeaders(origin) {
  const allowed = origin?.startsWith('http://localhost') || origin?.endsWith('.ngothang.tokyo') || origin?.endsWith('.pages.dev') || origin === 'https://docs-template.ngothang.tokyo';
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://docs-template.ngothang.tokyo',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get('Origin'));
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const secret = env.JWT_SECRET;
    const adminKey = env.ADMIN_KEY;

    switch (url.pathname) {
      case '/api/register': {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
        if (request.headers.get('X-Admin-Key') !== adminKey) return json({ error: 'Unauthorized' }, 401, cors);
        const { username, password } = await request.json();
        if (!username || !password || password.length < 6) return json({ error: 'Username required, password min 6 chars' }, 400, cors);
        const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
        if (existing) return json({ error: 'Username already exists' }, 409, cors);
        const hash = await hashPassword(password);
        await env.DB.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').bind(username, hash).run();
        return json({ success: true, message: 'User created' }, 201, cors);
      }
      case '/api/login': {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
        const { username, password } = await request.json();
        if (!username || !password) return json({ error: 'Username and password required' }, 400, cors);
        const user = await env.DB.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').bind(username).first();
        if (!user) return json({ error: 'Invalid credentials' }, 401, cors);
        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) return json({ error: 'Invalid credentials' }, 401, cors);
        const token = await createJWT({ id: user.id, username: user.username }, secret);
        return json({ success: true, token, user: { id: user.id, username: user.username } }, 200, cors);
      }
      case '/api/me': {
        const auth = request.headers.get('Authorization');
        if (!auth?.startsWith('Bearer ')) return json({ error: 'No token' }, 401, cors);
        const payload = await verifyJWT(auth.slice(7), secret);
        if (!payload) return json({ error: 'Invalid or expired token' }, 401, cors);
        return json({ user: { id: payload.id, username: payload.username } }, 200, cors);
      }
      default:
        return json({ error: 'Not found' }, 404, cors);
    }
  },
};
