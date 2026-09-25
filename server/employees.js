// ============================================================
// employees.js — Gestão de equipe (garçons e cozinha)
//
// Não existe uma tabela "employees" separada: funcionário é um
// usuário (db.users) com role 'waiter' ou 'kitchen'. Este módulo
// só adiciona CRUD/ativação sobre a mesma estrutura já usada pelo
// login (server/auth.js) — sem duplicar autenticação.
//
// Indicadores de desempenho são DERIVADOS de db.waiterCalls (quem
// assumiu/concluiu/cancelou cada chamado). Nada é estimado: sem
// dados no período, os números saem 0/null.
// ============================================================

const { getDB, markDirty } = require('./db');
const {
  json, readBody, HttpError, requireRole, audit,
  parseRange, inRange, secondsBetween, avg,
} = require('./util');

// Papéis que esta tela pode gerenciar. Contas admin não são
// tocadas por aqui — evita escalonamento de privilégio e mantém a
// autenticação administrativa fora do escopo desta feature.
const MANAGED_ROLES = ['waiter', 'kitchen'];
const ROLE_LABEL = { waiter: 'Garçom', kitchen: 'Cozinha' };

function publicUser(u) {
  const { password, ...rest } = u;
  return rest;
}

function findManaged(db, id) {
  const u = db.users.find(u => u.id === id);
  if (!u) throw new HttpError(404, 'Funcionário não encontrado');
  if (!MANAGED_ROLES.includes(u.role)) throw new HttpError(403, 'Esta conta não é gerenciada por aqui');
  return u;
}

// Revoga na hora qualquer sessão aberta desse usuário (ex.: ao desativar)
function revokeSessions(db, userId) {
  let n = 0;
  for (const [token, s] of Object.entries(db.sessions)) {
    if (s.userId === userId) { delete db.sessions[token]; n++; }
  }
  return n;
}

function callTimes(c) {
  return {
    toAccept: c.acceptedAt ? secondsBetween(c.createdAt, c.acceptedAt) : null,
    service:  c.completedAt && c.acceptedAt ? secondsBetween(c.acceptedAt, c.completedAt) : null,
    total:    c.completedAt ? secondsBetween(c.createdAt, c.completedAt) : null,
  };
}

// Estatísticas de UM funcionário num período — mesma fonte de dados
// que server/analytics.js usa para o quadro comparativo da equipe.
function employeeStats(db, userId, range) {
  const calls = db.waiterCalls.filter(c => inRange(c.createdAt, range));

  const accepted  = calls.filter(c => c.acceptedBy?.id === userId && !c.autoAccepted);
  const completed = accepted.filter(c => c.status === 'completed');
  const cancelled = calls.filter(c => c.cancelledBy?.id === userId);

  const toAcceptTimes = accepted.map(c => callTimes(c).toAccept).filter(v => v !== null);
  const serviceTimes  = completed.map(c => callTimes(c).service).filter(v => v !== null);
  const totalTimes    = completed.map(c => callTimes(c).total).filter(v => v !== null);

  const tables = new Set(accepted.map(c => c.tableNumber));

  const history = calls
    .filter(c => c.acceptedBy?.id === userId || c.completedBy?.id === userId || c.cancelledBy?.id === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 200)
    .map(c => ({
      id: c.id, tableNumber: c.tableNumber, type: c.type, status: c.status,
      createdAt: c.createdAt, acceptedAt: c.acceptedAt, completedAt: c.completedAt, cancelledAt: c.cancelledAt,
    }));

  return {
    accepted:      accepted.length,
    completed:     completed.length,
    cancelled:     cancelled.length,
    tablesServed:  tables.size,
    avgToAccept:   avg(toAcceptTimes),
    avgService:    avg(serviceTimes),
    avgTotal:      avg(totalTimes),
    history,
  };
}

const EmployeesController = {
  // GET /api/employees — lista garçons e cozinha (contagem geral, sem período)
  list(req, res) {
    requireRole(req, ['admin']);
    const db = getDB();
    const data = db.users
      .filter(u => MANAGED_ROLES.includes(u.role))
      .map(u => {
        const callsHandled = db.waiterCalls.filter(c => c.acceptedBy?.id === u.id && !c.autoAccepted).length;
        return { ...publicUser(u), roleLabel: ROLE_LABEL[u.role] || u.role, callsHandled };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    json(res, 200, { data });
  },

  // POST /api/employees — cadastra garçom ou cozinha
  async create(req, res) {
    requireRole(req, ['admin']);
    const db   = getDB();
    const body = await readBody(req, 4 * 1024);

    const name     = String(body.name || '').trim();
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const role     = String(body.role || '');
    const phone    = String(body.phone || '').trim().slice(0, 30);

    if (!name || !username || !password) throw new HttpError(400, 'Nome, usuário e senha são obrigatórios');
    if (password.length < 4) throw new HttpError(400, 'A senha deve ter pelo menos 4 caracteres');
    if (!MANAGED_ROLES.includes(role)) throw new HttpError(400, `Função inválida. Use: ${MANAGED_ROLES.join(' ou ')}`);
    if (db.users.some(u => u.username === username)) throw new HttpError(409, 'Já existe um usuário com esse login');

    const user = {
      id: db._nextUserId++, username, password, role, name, phone,
      active: true, createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    audit(req, 'employee.create', 'user', user.id, { username, role, name });
    markDirty();
    json(res, 201, { data: publicUser(user) });
  },

  // PUT /api/employees/:id — edita cadastro (senha é opcional: só troca se enviada)
  async update(req, res, id) {
    requireRole(req, ['admin']);
    const db   = getDB();
    const user = findManaged(db, id);
    const body = await readBody(req, 4 * 1024);

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new HttpError(400, 'Nome não pode ficar em branco');
      user.name = name;
    }
    if (body.username !== undefined) {
      const username = String(body.username).trim().toLowerCase();
      if (!username) throw new HttpError(400, 'Usuário não pode ficar em branco');
      if (db.users.some(u => u.username === username && u.id !== id)) throw new HttpError(409, 'Já existe um usuário com esse login');
      user.username = username;
    }
    if (body.role !== undefined) {
      if (!MANAGED_ROLES.includes(body.role)) throw new HttpError(400, `Função inválida. Use: ${MANAGED_ROLES.join(' ou ')}`);
      user.role = body.role;
    }
    if (body.phone !== undefined) user.phone = String(body.phone).trim().slice(0, 30);
    if (body.password) {
      if (String(body.password).length < 4) throw new HttpError(400, 'A senha deve ter pelo menos 4 caracteres');
      user.password = String(body.password);
    }

    audit(req, 'employee.update', 'user', user.id, { fields: Object.keys(body) });
    markDirty();
    json(res, 200, { data: publicUser(user) });
  },

  // POST /api/employees/:id/activate | /deactivate
  async setActive(req, res, id, active) {
    requireRole(req, ['admin']);
    const db   = getDB();
    const user = findManaged(db, id);
    user.active = active;

    let revoked = 0;
    if (!active) revoked = revokeSessions(db, id); // efeito imediato, não espera a sessão expirar

    audit(req, active ? 'employee.activate' : 'employee.deactivate', 'user', user.id, { revokedSessions: revoked });
    markDirty();
    json(res, 200, { data: publicUser(user), revokedSessions: revoked });
  },

  // GET /api/employees/:id?from&to&tz — detalhe + indicadores + histórico do período
  detail(req, res, id, query) {
    requireRole(req, ['admin']);
    const db     = getDB();
    const user   = findManaged(db, id);
    const range  = parseRange(query);
    const stats  = employeeStats(db, id, range);
    json(res, 200, {
      data: { ...publicUser(user), roleLabel: ROLE_LABEL[user.role] || user.role, stats },
      range: { from: range.from, to: range.to, tz: range.tz },
    });
  },
};

module.exports = { EmployeesController, MANAGED_ROLES };
