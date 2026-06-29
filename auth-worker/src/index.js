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
  const allowed = !origin || origin?.startsWith('http://localhost') || origin?.includes('.ngothang.tokyo') || origin?.includes('.huytagicloud.workers.dev') || origin?.endsWith('.pages.dev');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://docs-template.ngothang.tokyo',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

async function getUserFromToken(auth, secret, db) {
  if (!auth?.startsWith('Bearer ')) return null;
  const payload = await verifyJWT(auth.slice(7), secret);
  if (!payload) return null;
  const user = await db.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(payload.id).first();
  return user;
}

function requireAdmin(user) {
  return user && user.role === 'admin';
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get('Origin'));
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const secret = env.JWT_SECRET;
    const adminKey = env.ADMIN_KEY;
    const DB = env.DB;

    const path = url.pathname;
    const method = request.method;

    if (path === '/api/register') {
      if (method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
      if (request.headers.get('X-Admin-Key') !== adminKey) return json({ error: 'Unauthorized' }, 401, cors);
      const { username, password, role } = await request.json();
      if (!username || !password || password.length < 6) return json({ error: 'Username required, password min 6 chars' }, 400, cors);
      const existing = await DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
      if (existing) return json({ error: 'Username already exists' }, 409, cors);
      const hash = await hashPassword(password);
      const userRole = role === 'admin' ? 'admin' : 'customer';
      await DB.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').bind(username, hash, userRole).run();
      return json({ success: true, message: 'User created', role: userRole }, 201, cors);
    }

    if (path === '/api/login') {
      if (method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
      const { username, password } = await request.json();
      if (!username || !password) return json({ error: 'Username and password required' }, 400, cors);
      const user = await DB.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?').bind(username).first();
      if (!user) return json({ error: 'Invalid credentials' }, 401, cors);
      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) return json({ error: 'Invalid credentials' }, 401, cors);
      const token = await createJWT({ id: user.id, username: user.username, role: user.role }, secret);
      return json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } }, 200, cors);
    }

    if (path === '/api/me') {
      const user = await getUserFromToken(request.headers.get('Authorization'), secret, DB);
      if (!user) return json({ error: 'Unauthorized' }, 401, cors);
      return json({ user }, 200, cors);
    }

    if (path === '/api/projects') {
      const user = await getUserFromToken(request.headers.get('Authorization'), secret, DB);
      if (!user) return json({ error: 'Unauthorized' }, 401, cors);
      let projects;
      if (user.role === 'admin') {
        projects = await DB.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
      } else {
        projects = await DB.prepare(`
          SELECT p.* FROM projects p
          INNER JOIN user_projects up ON up.project_id = p.id
          WHERE up.user_id = ?
          ORDER BY p.created_at DESC
        `).bind(user.id).all();
      }
      const parsed = (projects.results || []).map(p => ({ ...p, tags: JSON.parse(p.tags || '[]') }));
      return json({ projects: parsed }, 200, cors);
    }

    if (path === '/api/admin/projects') {
      const user = await getUserFromToken(request.headers.get('Authorization'), secret, DB);
      if (!requireAdmin(user)) return json({ error: 'Forbidden' }, 403, cors);

      if (method === 'GET') {
        const projects = await DB.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
        const parsed = (projects.results || []).map(p => ({ ...p, tags: JSON.parse(p.tags || '[]') }));
        return json({ projects: parsed }, 200, cors);
      }

      if (method === 'POST') {
        const { name, description, repo, icon, version, download_url, tags } = await request.json();
        if (!name) return json({ error: 'Name is required' }, 400, cors);
        const id = slugify(name);
        const existing = await DB.prepare('SELECT id FROM projects WHERE id = ?').bind(id).first();
        if (existing) return json({ error: 'Project ID already exists' }, 409, cors);
        await DB.prepare(
          'INSERT INTO projects (id, name, description, repo, icon, version, download_url, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(id, name, description || '', repo || '', icon || '📦', version || '', download_url || '', JSON.stringify(tags || [])).run();
        const project = await DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
        return json({ success: true, project: { ...project, tags: JSON.parse(project.tags || '[]') } }, 201, cors);
      }

      return json({ error: 'Method not allowed' }, 405, cors);
    }

    const adminProjectMatch = path.match(/^\/api\/admin\/projects\/(.+)$/);
    if (adminProjectMatch) {
      const user = await getUserFromToken(request.headers.get('Authorization'), secret, DB);
      if (!requireAdmin(user)) return json({ error: 'Forbidden' }, 403, cors);
      const projectId = adminProjectMatch[1];

      if (method === 'PUT') {
        const { name, description, repo, icon, version, download_url, tags } = await request.json();
        const existing = await DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();
        if (!existing) return json({ error: 'Project not found' }, 404, cors);
        const newId = name ? slugify(name) : projectId;
        await DB.prepare(
          'UPDATE projects SET id=?, name=?, description=?, repo=?, icon=?, version=?, download_url=?, tags=?, updated_at=datetime(\'now\') WHERE id=?'
        ).bind(newId, name || '', description || '', repo || '', icon || '📦', version || '', download_url || '', JSON.stringify(tags || []), projectId).run();
        const project = await DB.prepare('SELECT * FROM projects WHERE id = ?').bind(newId).first();
        return json({ success: true, project: { ...project, tags: JSON.parse(project.tags || '[]') } }, 200, cors);
      }

      if (method === 'DELETE') {
        await DB.prepare('DELETE FROM user_projects WHERE project_id = ?').bind(projectId).run();
        await DB.prepare('DELETE FROM projects WHERE id = ?').bind(projectId).run();
        return json({ success: true, message: 'Project deleted' }, 200, cors);
      }

      return json({ error: 'Method not allowed' }, 405, cors);
    }

    if (path === '/api/admin/users') {
      const user = await getUserFromToken(request.headers.get('Authorization'), secret, DB);
      if (!requireAdmin(user)) return json({ error: 'Forbidden' }, 403, cors);
      if (method !== 'GET') return json({ error: 'Method not allowed' }, 405, cors);
      const users = await DB.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC').all();
      return json({ users: users.results }, 200, cors);
    }

    const userPermMatch = path.match(/^\/api\/admin\/users\/(\d+)\/projects$/);
    if (userPermMatch) {
      const user = await getUserFromToken(request.headers.get('Authorization'), secret, DB);
      if (!requireAdmin(user)) return json({ error: 'Forbidden' }, 403, cors);
      const userId = parseInt(userPermMatch[1]);

      if (method === 'GET') {
        const projectIds = await DB.prepare('SELECT project_id FROM user_projects WHERE user_id = ?').bind(userId).all();
        return json({ project_ids: (projectIds.results || []).map(r => r.project_id) }, 200, cors);
      }

      if (method === 'PUT') {
        const { project_ids } = await request.json();
        if (!Array.isArray(project_ids)) return json({ error: 'project_ids must be an array' }, 400, cors);
        await DB.prepare('DELETE FROM user_projects WHERE user_id = ?').bind(userId).run();
        for (const pid of project_ids) {
          await DB.prepare('INSERT OR IGNORE INTO user_projects (user_id, project_id) VALUES (?, ?)').bind(userId, pid).run();
        }
        return json({ success: true, message: 'Permissions updated' }, 200, cors);
      }

      return json({ error: 'Method not allowed' }, 405, cors);
    }

    return json({ error: 'Not found' }, 404, cors);
  },
};
