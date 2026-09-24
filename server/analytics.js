// ============================================================
// analytics.js — Financeiro, análise de atendimento e de mesas
//
// Tudo é calculado a partir dos dados reais gravados pela operação:
//   • db.payments     → financeiro (dinheiro efetivamente recebido)
//   • db.waiterCalls  → tempos de atendimento
//   • db.orders       → pedidos por mesa
// Nada é estimado ou inventado: sem dados, o indicador vem null/0.
// ============================================================

const { getDB } = require('./db');
const {
  json, requireRole, parseRange, inRange, localHour, localDay,
  secondsBetween, avg, toCents, fromCents, tableSort,
} = require('./util');
const { PAYMENT_METHODS, openOrdersByTable } = require('./accounts');
const { CALL_TYPES } = require('./calls');

const paidIn = (db, range) => db.payments.filter(p => p.status === 'paid' && inRange(p.createdAt, range));

// ─── Financeiro ───────────────────────────────────────────────
function financeSummary(db, range) {
  const payments = paidIn(db, range);
  const revenueCents = payments.reduce((s, p) => s + toCents(p.total), 0);

  const byMethodMap = new Map();
  const byTableMap  = new Map();
  const byDayMap    = new Map();
  let discountCents = 0, feeCents = 0;

  for (const p of payments) {
    const m = byMethodMap.get(p.method) || { method: p.method, label: PAYMENT_METHODS[p.method] || p.method, cents: 0, count: 0 };
    m.cents += toCents(p.total); m.count++;
    byMethodMap.set(p.method, m);

    const t = byTableMap.get(p.tableNumber) || { tableNumber: p.tableNumber, cents: 0, count: 0 };
    t.cents += toCents(p.total); t.count++;
    byTableMap.set(p.tableNumber, t);

    const day = localDay(p.createdAt, range.tz);
    const d = byDayMap.get(day) || { day, cents: 0, count: 0 };
    d.cents += toCents(p.total); d.count++;
    byDayMap.set(day, d);

    discountCents += toCents(p.discount);
    feeCents      += toCents(p.serviceFee);
  }

  const byMethod = [...byMethodMap.values()]
    .sort((a, b) => b.cents - a.cents)
    .map(({ cents, ...m }) => ({ ...m, total: fromCents(cents) }));

  const topTable = [...byTableMap.values()].sort((a, b) => b.cents - a.cents)[0] || null;
  const mostUsed = [...byMethodMap.values()].sort((a, b) => b.count - a.count || b.cents - a.cents)[0] || null;

  // Série diária contínua (inclui dias sem movimento como zero)
  const daily = [];
  const cursor = new Date(range.from);
  const endDay = localDay(range.to.toISOString(), range.tz);
  for (let guard = 0; guard < 401; guard++) {
    const day = localDay(cursor.toISOString(), range.tz);
    const d = byDayMap.get(day);
    if (!daily.length || daily[daily.length - 1].day !== day)
      daily.push({ day, total: d ? fromCents(d.cents) : 0, count: d ? d.count : 0 });
    if (day === endDay) break;
    cursor.setTime(cursor.getTime() + 24 * 3600 * 1000);
  }

  return {
    revenue:      fromCents(revenueCents),
    paidAccounts: payments.length,
    avgTicket:    payments.length ? fromCents(revenueCents / payments.length) : null,
    discounts:    fromCents(discountCents),
    serviceFees:  fromCents(feeCents),
    voidedCount:  db.payments.filter(p => p.status === 'voided' && inRange(p.createdAt, range)).length,
    topTable:     topTable ? { tableNumber: topTable.tableNumber, total: fromCents(topTable.cents), count: topTable.count } : null,
    mostUsedMethod: mostUsed ? { method: mostUsed.method, label: mostUsed.label, count: mostUsed.count } : null,
    byMethod,
    daily,
  };
}

// ─── Atendimento (chamados) ───────────────────────────────────
function callTimes(c) {
  return {
    toAccept:  c.acceptedAt  ? secondsBetween(c.createdAt,  c.acceptedAt)  : null,
    service:   c.completedAt && c.acceptedAt ? secondsBetween(c.acceptedAt, c.completedAt) : null,
    total:     c.completedAt ? secondsBetween(c.createdAt,  c.completedAt) : null,
  };
}

function serviceSummary(db, range) {
  const calls = db.waiterCalls.filter(c => inRange(c.createdAt, range));
  const times = calls.map(c => ({ c, t: callTimes(c) }));

  const completed = times.filter(x => x.c.status === 'completed');
  const accepted  = times.filter(x => x.t.toAccept !== null && x.c.status !== 'cancelled');

  // Por horário (hora local do chamado)
  const hours = new Map();
  for (const { c, t } of times) {
    const h = localHour(c.createdAt, range.tz);
    const e = hours.get(h) || { hour: h, count: 0, totals: [], accepts: [] };
    e.count++;
    if (c.status === 'completed') e.totals.push(t.total);
    if (t.toAccept !== null && c.status !== 'cancelled') e.accepts.push(t.toAccept);
    hours.set(h, e);
  }
  const byHour = [...hours.values()].sort((a, b) => a.hour - b.hour)
    .map(e => ({ hour: e.hour, count: e.count, avgTotal: avg(e.totals), avgToAccept: avg(e.accepts) }));

  // Por funcionário (quem assumiu). Métricas neutras, sem ranking/rótulos.
  const staff = new Map();
  for (const { c, t } of times) {
    if (!c.acceptedBy || c.autoAccepted) continue; // aceito automaticamente pelo pagamento não conta como ação do funcionário
    const key = c.acceptedBy.id ?? c.acceptedBy.name;
    const e = staff.get(key) || { name: c.acceptedBy.name, role: c.acceptedBy.role, accepted: 0, completed: 0, accepts: [], services: [] };
    e.accepted++;
    if (t.toAccept !== null) e.accepts.push(t.toAccept);
    if (c.status === 'completed') { e.completed++; if (t.service !== null) e.services.push(t.service); }
    staff.set(key, e);
  }
  const byStaff = [...staff.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map(e => ({ name: e.name, role: e.role, accepted: e.accepted, completed: e.completed, avgToAccept: avg(e.accepts), avgService: avg(e.services) }));

  const byType = Object.keys(CALL_TYPES)
    .map(type => ({ type, label: CALL_TYPES[type], count: calls.filter(c => c.type === type).length }))
    .filter(t => t.count > 0);

  return {
    counts: {
      total:     calls.length,
      completed: calls.filter(c => c.status === 'completed').length,
      pending:   calls.filter(c => c.status === 'pending').length,
      accepted:  calls.filter(c => c.status === 'accepted').length,
      cancelled: calls.filter(c => c.status === 'cancelled').length,
    },
    avgToAccept: avg(accepted.map(x => x.t.toAccept)),
    avgService:  avg(completed.map(x => x.t.service).filter(v => v !== null)),
    avgTotal:    avg(completed.map(x => x.t.total)),
    byHour,
    byStaff,
    byType,
  };
}

// ─── Mesas ────────────────────────────────────────────────────
function tablesSummary(db, range) {
  const map = new Map();
  const get = t => {
    if (!map.has(t)) map.set(t, { tableNumber: t, revenueCents: 0, accounts: 0, orders: 0, stays: [], calls: 0 });
    return map.get(t);
  };

  for (const p of paidIn(db, range)) {
    const e = get(p.tableNumber);
    e.revenueCents += toCents(p.total);
    e.accounts++;
    if (p.openedAt) e.stays.push(secondsBetween(p.openedAt, p.createdAt));
  }
  for (const o of db.orders) {
    if (o.status !== 'cancelado' && inRange(o.createdAt, range)) get(o.tableNumber).orders++;
  }
  for (const c of db.waiterCalls) {
    if (inRange(c.createdAt, range)) get(c.tableNumber).calls++;
  }

  const days = Math.max(1, (range.to - range.from) / (24 * 3600 * 1000));
  return [...map.values()]
    .sort((a, b) => tableSort(a.tableNumber, b.tableNumber))
    .map(e => ({
      tableNumber: e.tableNumber,
      revenue:     fromCents(e.revenueCents),
      accounts:    e.accounts,
      orders:      e.orders,
      avgTicket:   e.accounts ? fromCents(e.revenueCents / e.accounts) : null,
      avgStay:     avg(e.stays),                      // segundos (1º pedido → pagamento)
      calls:       e.calls,
      callsPerDay: Math.round((e.calls / days) * 10) / 10,
    }));
}

// ─── Visão geral (dashboard) ──────────────────────────────────
function overview(db, range) {
  const fin  = financeSummary(db, range);
  const svc  = serviceSummary(db, range);
  const open = openOrdersByTable(db);
  const openAmountCents = [...open.values()].flat().reduce((s, o) => s + toCents(o.total), 0);
  return {
    revenueToday:   fin.revenue,
    paidAccounts:   fin.paidAccounts,
    avgTicket:      fin.avgTicket,
    openAccounts:   open.size,
    openAmount:     fromCents(openAmountCents),
    occupiedTables: open.size,
    tableCount:     Number(db.settings.tableCount) || 0,
    pendingCalls:   db.waiterCalls.filter(c => c.status === 'pending').length,
    activeCalls:    db.waiterCalls.filter(c => ['pending', 'accepted'].includes(c.status)).length,
    avgServiceTotal: svc.avgTotal,
    avgToAccept:    svc.avgToAccept,
    byMethod:       fin.byMethod,
    callsByHour:    svc.byHour,
  };
}

const AnalyticsController = {
  finance(req, res, query) {
    requireRole(req, ['admin']);
    const range = parseRange(query);
    json(res, 200, { data: financeSummary(getDB(), range), range: { from: range.from, to: range.to, tz: range.tz } });
  },
  service(req, res, query) {
    requireRole(req, ['admin']);
    const range = parseRange(query);
    json(res, 200, { data: serviceSummary(getDB(), range), range: { from: range.from, to: range.to, tz: range.tz } });
  },
  tables(req, res, query) {
    requireRole(req, ['admin']);
    const range = parseRange(query);
    json(res, 200, { data: tablesSummary(getDB(), range), range: { from: range.from, to: range.to, tz: range.tz } });
  },
  overview(req, res, query) {
    requireRole(req, ['admin']);
    const range = parseRange(query);
    json(res, 200, { data: overview(getDB(), range) });
  },
};

module.exports = { AnalyticsController, financeSummary, serviceSummary, tablesSummary, overview, callTimes };
