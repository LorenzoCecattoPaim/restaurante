// ============================================================
// calls.js — Chamados de garçom (cliente → equipe)
//
// Ciclo de vida:  pending → accepted → completed
//                 pending/accepted → cancelled
// Todos os timestamps são gerados no servidor.
// ============================================================

const crypto = require('crypto');
const { getDB, markDirty } = require('./db');
const {
  json, readBody, HttpError, requireRole, actor, normalizeTable,
} = require('./util');

// Tipos de chamado. A estrutura já suporta todos; ENABLED_TYPES controla
// quais o cliente pode abrir hoje. Para habilitar um novo, basta incluí-lo.
const CALL_TYPES = {
  garcom:      'Chamar garçom',
  conta:       'Pedir a conta',
  agua:        'Pedir água',
  atendimento: 'Solicitar atendimento',
  outro:       'Outro',
};
const ENABLED_TYPES = ['garcom', 'conta'];

const ACTIVE = ['pending', 'accepted'];
const MAX_ACTIVE_PER_TABLE = 3;          // anti-spam por mesa
const RECENT_WINDOW_MS     = 60 * 60_000; // concluídos/cancelados exibidos por 1h
const STAFF_ROLES          = ['admin', 'waiter'];

// Visão pública (cliente): nunca expõe dados de funcionários
function publicView(c) {
  return {
    id: c.id, tableNumber: c.tableNumber, type: c.type, typeLabel: CALL_TYPES[c.type],
    status: c.status, createdAt: c.createdAt, acceptedAt: c.acceptedAt || null,
    completedAt: c.completedAt || null,
  };
}

// Visão da equipe (sem o token do cliente)
function staffView(c) {
  const { clientToken, ...rest } = c;
  return { ...rest, typeLabel: CALL_TYPES[c.type] };
}

function findCall(id) {
  const c = getDB().waiterCalls.find(c => c.id === id);
  if (!c) throw new HttpError(404, 'Chamado não encontrado');
  return c;
}

function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const CallsController = {
  // ── Público: cliente abre um chamado a partir da página da mesa ──
  async create(req, res) {
    const db   = getDB();
    const body = await readBody(req, 4 * 1024);

    const tableNumber = normalizeTable(body.tableNumber);
    if (!tableNumber) throw new HttpError(400, 'Mesa não identificada. Escaneie o QR Code da mesa.');

    const tableCount = Number(db.settings.tableCount) || 0;
    if (tableCount > 0 && /^\d+$/.test(tableNumber) && Number(tableNumber) > tableCount)
      throw new HttpError(400, 'Mesa inválida');

    const type = String(body.type || 'garcom');
    if (!ENABLED_TYPES.includes(type)) throw new HttpError(400, 'Tipo de chamado inválido');

    const activeForTable = db.waiterCalls.filter(c => c.tableNumber === tableNumber && ACTIVE.includes(c.status));

    // Mesmo tipo já em aberto → devolve o existente em vez de duplicar
    const dup = activeForTable.find(c => c.type === type);
    if (dup) return json(res, 200, { data: { ...publicView(dup), token: dup.clientToken }, deduplicated: true });

    if (activeForTable.length >= MAX_ACTIVE_PER_TABLE)
      throw new HttpError(429, 'Já existem chamados em aberto para esta mesa. Aguarde o atendimento.');

    const call = {
      id:          db._nextCallId++,
      tableNumber,
      type,
      status:      'pending',
      createdAt:   new Date().toISOString(),
      acceptedAt:  null,
      completedAt: null,
      cancelledAt: null,
      acceptedBy:  null,
      completedBy: null,
      cancelledBy: null,
      cancelReason: null,
      clientToken: crypto.randomBytes(16).toString('hex'),
    };
    db.waiterCalls.push(call);
    markDirty();
    json(res, 201, { data: { ...publicView(call), token: call.clientToken } });
  },

  // ── Público: cliente consulta o próprio chamado (exige token) ──
  publicGet(req, res, id, query) {
    const c = findCall(id);
    if (!sameToken(String(query.token || ''), c.clientToken)) throw new HttpError(404, 'Chamado não encontrado');
    json(res, 200, { data: publicView(c) });
  },

  // ── Público: cliente desiste de um chamado ainda pendente ──
  async publicCancel(req, res, id) {
    const body = await readBody(req, 2 * 1024);
    const c = findCall(id);
    if (!sameToken(String(body.token || ''), c.clientToken)) throw new HttpError(404, 'Chamado não encontrado');
    if (c.status !== 'pending') throw new HttpError(409, 'O chamado já está sendo atendido');
    c.status       = 'cancelled';
    c.cancelledAt  = new Date().toISOString();
    c.cancelledBy  = { id: null, name: 'Cliente', role: 'customer' };
    c.cancelReason = 'Cancelado pelo cliente';
    markDirty();
    json(res, 200, { data: publicView(c) });
  },

  // ── Equipe: lista chamados ativos + recentes ──
  list(req, res, query) {
    requireRole(req, STAFF_ROLES);
    const db   = getDB();
    const now  = Date.now();
    const list = db.waiterCalls.filter(c =>
      ACTIVE.includes(c.status) ||
      (query.scope !== 'active' && now - new Date(c.completedAt || c.cancelledAt || c.createdAt) < RECENT_WINDOW_MS)
    ).sort((a, b) => {
      const rank = { pending: 0, accepted: 1, completed: 2, cancelled: 3 };
      return rank[a.status] - rank[b.status] || new Date(a.createdAt) - new Date(b.createdAt);
    });
    json(res, 200, {
      data: list.map(staffView),
      serverNow: new Date().toISOString(),
      alertSeconds: Number(db.settings.callAlertSeconds) || 180,
    });
  },

  accept(req, res, id) {
    requireRole(req, STAFF_ROLES);
    const c = findCall(id);
    if (c.status !== 'pending') {
      const who = c.acceptedBy ? ` por ${c.acceptedBy.name}` : '';
      throw new HttpError(409, c.status === 'accepted' ? `Chamado já assumido${who}` : 'Chamado não está mais pendente');
    }
    c.status     = 'accepted';
    c.acceptedAt = new Date().toISOString();
    c.acceptedBy = actor(req);
    markDirty();
    json(res, 200, { data: staffView(c) });
  },

  complete(req, res, id) {
    requireRole(req, STAFF_ROLES);
    const c = findCall(id);
    if (c.status === 'pending') throw new HttpError(409, 'Assuma o chamado antes de concluir');
    if (c.status !== 'accepted') throw new HttpError(409, 'Chamado já finalizado');
    c.status      = 'completed';
    c.completedAt = new Date().toISOString();
    c.completedBy = actor(req);
    markDirty();
    json(res, 200, { data: staffView(c) });
  },

  async cancel(req, res, id) {
    requireRole(req, STAFF_ROLES);
    const body = await readBody(req, 2 * 1024);
    const c = findCall(id);
    if (!ACTIVE.includes(c.status)) throw new HttpError(409, 'Chamado já finalizado');
    c.status       = 'cancelled';
    c.cancelledAt  = new Date().toISOString();
    c.cancelledBy  = actor(req);
    c.cancelReason = String(body.reason || '').trim().slice(0, 200) || null;
    markDirty();
    json(res, 200, { data: staffView(c) });
  },
};

// Chamado "pedir a conta" é concluído automaticamente quando a conta é paga.
// Mantém os tempos reais: se ninguém assumiu, accepted = momento do pagamento.
function completeBillCallsForTable(tableNumber, by, atIso) {
  const db = getDB();
  let n = 0;
  for (const c of db.waiterCalls) {
    if (c.tableNumber !== tableNumber || c.type !== 'conta' || !ACTIVE.includes(c.status)) continue;
    if (!c.acceptedAt) { c.acceptedAt = atIso; c.acceptedBy = by; c.autoAccepted = true; }
    c.status        = 'completed';
    c.completedAt   = atIso;
    c.completedBy   = by;
    c.autoCompleted = 'payment';
    n++;
  }
  if (n) markDirty();
  return n;
}

module.exports = { CallsController, CALL_TYPES, ENABLED_TYPES, completeBillCallsForTable };
