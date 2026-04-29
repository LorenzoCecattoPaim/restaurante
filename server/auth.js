// ============================================================
// auth.js — Autenticação simples com tokens de sessão
// Sem JWT por ora — token aleatório armazenado no DB
// ============================================================

const crypto = require('crypto');
const { getDB, markDirty } = require('./db');

// ─── Helpers ──────────────────────────────────────────────────
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c.toString(); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('JSON inválido')); }
    });
  });
}

// ─── Extrai token do header ou cookie ─────────────────────────
function extractToken(req) {
  // Authorization: Bearer <token>
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);

  // Cookie: session=<token>
  const cookie = req.headers['cookie'] || '';
  const match  = cookie.match(/session=([a-f0-9]+)/);
  if (match) return match[1];

  return null;
}

// ─── Middleware de autenticação ────────────────────────────────
function requireAuth(req, res, next, allowedRoles = ['admin', 'kitchen']) {
  const token = extractToken(req);
  const db    = getDB();

  if (!token || !db.sessions[token]) {
    json(res, 401, { error: 'Não autorizado — faça login' });
    return false;
  }

  const session = db.sessions[token];

  // Expira após 8h
  if (Date.now() - session.createdAt > 8 * 60 * 60 * 1000) {
    delete db.sessions[token];
    markDirty();
    json(res, 401, { error: 'Sessão expirada — faça login novamente' });
    return false;
  }

  if (!allowedRoles.includes(session.role)) {
    json(res, 403, { error: 'Acesso negado' });
    return false;
  }

  req.user = session;
  return true;
}

// ─── AuthController ───────────────────────────────────────────
const AuthController = {
  async login(req, res) {
    const body = await readBody(req);
    const db   = getDB();

    const user = db.users.find(
      u => u.username === body.username && u.password === body.password
    );

    if (!user) {
      return json(res, 401, { error: 'Usuário ou senha incorretos' });
    }

    const token = generateToken();
    db.sessions[token] = {
      userId:    user.id,
      username:  user.username,
      role:      user.role,
      name:      user.name,
      createdAt: Date.now(),
    };
    markDirty();

    // Seta cookie HttpOnly
    res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; Max-Age=28800; SameSite=Strict`);
    json(res, 200, {
      data: { token, user: { id: user.id, name: user.name, username: user.username, role: user.role } }
    });
  },

  logout(req, res) {
    const token = extractToken(req);
    const db    = getDB();
    if (token && db.sessions[token]) {
      delete db.sessions[token];
      markDirty();
    }
    res.setHeader('Set-Cookie', 'session=; Path=/; Max-Age=0');
    json(res, 200, { message: 'Logout realizado' });
  },

  me(req, res) {
    const token = extractToken(req);
    const db    = getDB();
    const session = token && db.sessions[token];
    if (!session) return json(res, 401, { error: 'Não autenticado' });
    json(res, 200, { data: session });
  },
};

// ─── SettingsController ───────────────────────────────────────
const SettingsController = {
  async get(req, res) {
    const db = getDB();
    json(res, 200, { data: db.settings });
  },

  async update(req, res) {
    const db   = getDB();
    const body = await readBody(req);
    db.settings = { ...db.settings, ...body };
    markDirty();
    json(res, 200, { data: db.settings });
  },
};

// ─── CategoriesController ─────────────────────────────────────
const CategoriesController = {
  list(req, res) {
    json(res, 200, { data: getDB().categories });
  },

  async create(req, res) {
    const db   = getDB();
    const body = await readBody(req);
    const name = (body.name || '').trim();
    if (!name) return json(res, 400, { error: 'Nome obrigatório' });
    if (db.categories.includes(name)) return json(res, 409, { error: 'Categoria já existe' });
    db.categories.push(name);
    markDirty();
    json(res, 201, { data: db.categories });
  },

  async remove(req, res, name) {
    const db  = getDB();
    const dec = decodeURIComponent(name);
    db.categories = db.categories.filter(c => c !== dec);
    markDirty();
    json(res, 200, { data: db.categories });
  },
};

module.exports = { requireAuth, AuthController, SettingsController, CategoriesController };
