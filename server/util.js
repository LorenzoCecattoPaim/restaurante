// ============================================================
// util.js — Helpers compartilhados pelos módulos novos
// (chamados, contas, pagamentos, financeiro, análises)
// ============================================================

const { getDB, markDirty } = require('./db');

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra  = extra;
  }
}

// Lê o corpo JSON com limite de tamanho (evita payloads abusivos)
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Requisição muito grande')); req.destroy(); return; }
      body += c.toString();
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new HttpError(400, 'JSON inválido')); }
    });
    req.on('error', reject);
  });
}

// ─── Autorização por papel ────────────────────────────────────
function requireRole(req, roles) {
  if (!req.user || !roles.includes(req.user.role))
    throw new HttpError(403, 'Acesso negado para o seu perfil');
}

function actor(req) {
  return req.user
    ? { id: req.user.userId, name: req.user.name, role: req.user.role }
    : null;
}

// ─── Auditoria (append-only; não existe rota de exclusão) ─────
function audit(req, action, entity, entityId, details = {}) {
  const db = getDB();
  const entry = {
    id:       db._nextAuditId++,
    at:       new Date().toISOString(),
    action,
    entity,
    entityId,
    user:     actor(req),
    details,
  };
  db.auditLog.push(entry);
  markDirty();
  return entry;
}

// ─── Mesas ────────────────────────────────────────────────────
// A identificação da mesa já existente é o número vindo do QR (?mesa=N).
function normalizeTable(raw) {
  const t = String(raw ?? '').trim();
  if (!t || t.length > 10 || !/^[A-Za-z0-9-]+$/.test(t)) return null;
  return t;
}

function tableSort(a, b) {
  const na = Number(a), nb = Number(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
}

// ─── Dinheiro em centavos (evita erro de ponto flutuante) ─────
const toCents   = v => Math.round(Number(v || 0) * 100);
const fromCents = c => Math.round(c) / 100;

// ─── Período e fuso horário ───────────────────────────────────
// O frontend envia from/to (ISO) calculados no fuso do navegador
// e tz (IANA) para agrupar por hora/dia no horário local.
const MAX_RANGE_MS = 400 * 24 * 3600 * 1000;

function parseRange(query) {
  const now = new Date();
  let from = query.from ? new Date(query.from) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let to   = query.to   ? new Date(query.to)   : now;
  if (isNaN(from) || isNaN(to)) throw new HttpError(400, 'Datas inválidas (use ISO 8601)');
  if (from > to) throw new HttpError(400, 'Data inicial maior que a final');
  if (to - from > MAX_RANGE_MS) throw new HttpError(400, 'Período máximo: 400 dias');
  return { from, to, tz: parseTz(query.tz) };
}

function parseTz(tz) {
  if (!tz) return 'America/Sao_Paulo';
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; }
  catch { return 'America/Sao_Paulo'; }
}

function inRange(iso, range) {
  const t = new Date(iso).getTime();
  return t >= range.from.getTime() && t <= range.to.getTime();
}

const _fmtCache = new Map();
function fmt(tz, kind) {
  const key = tz + '|' + kind;
  if (!_fmtCache.has(key)) {
    _fmtCache.set(key, kind === 'hour'
      ? new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' })
      : new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }));
  }
  return _fmtCache.get(key);
}
const localHour = (iso, tz) => parseInt(fmt(tz, 'hour').format(new Date(iso)), 10) % 24;
const localDay  = (iso, tz) => fmt(tz, 'day').format(new Date(iso)); // YYYY-MM-DD

const secondsBetween = (a, b) => (new Date(b) - new Date(a)) / 1000;

function avg(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

module.exports = {
  json, readBody, HttpError, requireRole, actor, audit,
  normalizeTable, tableSort, toCents, fromCents,
  parseRange, parseTz, inRange, localHour, localDay, secondsBetween, avg,
};
