// ============================================================
// accounts.js — Contas das mesas e pagamentos
//
// Não existe uma segunda lógica de consumo: a conta de uma mesa é
// DERIVADA dos pedidos reais (db.orders) daquela mesa que:
//   • não estão cancelados, e
//   • ainda não foram vinculados a um pagamento (order.paymentId).
//
// Ao pagar, os pedidos recebem paymentId/paidAt → a conta fica vazia
// → a mesa volta a aparecer como livre.
// ============================================================

const { getDB, markDirty } = require('./db');
const {
  json, readBody, HttpError, requireRole, actor, audit,
  normalizeTable, tableSort, toCents, fromCents, parseRange, inRange,
} = require('./util');
const { completeBillCallsForTable } = require('./calls');

const PAYMENT_METHODS = {
  dinheiro: 'Dinheiro',
  pix:      'PIX',
  debito:   'Débito',
  credito:  'Crédito',
  outro:    'Outros',
};

const STAFF_ROLES   = ['admin', 'waiter'];
const MAX_FEE_RATIO = 0.5; // taxa de serviço não pode passar de 50% do subtotal

const isOpenOrder = o => o.status !== 'cancelado' && !o.paymentId;
const NOT_DELIVERED = ['recebido', 'em_preparo', 'pronto'];

function openOrdersByTable(db) {
  const map = new Map();
  for (const o of db.orders) {
    if (!isOpenOrder(o)) continue;
    if (!map.has(o.tableNumber)) map.set(o.tableNumber, []);
    map.get(o.tableNumber).push(o);
  }
  return map;
}

function summarize(tableNumber, orders, db) {
  const subtotalCents = orders.reduce((s, o) => s + toCents(o.total), 0);
  const openedAt = orders.reduce((m, o) => (!m || o.createdAt < m ? o.createdAt : m), null);
  const activeCalls = db.waiterCalls
    .filter(c => c.tableNumber === tableNumber && ['pending', 'accepted'].includes(c.status))
    .map(c => ({ id: c.id, type: c.type, status: c.status, createdAt: c.createdAt }));
  return {
    tableNumber,
    status:           orders.length ? 'open' : 'free',
    orderCount:       orders.length,
    subtotal:         fromCents(subtotalCents),
    openedAt,
    notDeliveredCount: orders.filter(o => NOT_DELIVERED.includes(o.status)).length,
    activeCalls,
  };
}

function accountDetail(tableNumber, db) {
  const orders = db.orders
    .filter(o => o.tableNumber === tableNumber && isOpenOrder(o))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // Agrupa itens iguais (mesmo produto e mesmo preço unitário)
  const grouped = new Map();
  for (const o of orders) {
    for (const i of o.items) {
      const key = `${i.productId}|${i.unitPrice}`;
      const g = grouped.get(key) || { productId: i.productId, productName: i.productName, unitPrice: i.unitPrice, quantity: 0, totalCents: 0 };
      g.quantity   += i.quantity;
      g.totalCents += toCents(i.unitPrice) * i.quantity;
      grouped.set(key, g);
    }
  }
  const items = [...grouped.values()].map(({ totalCents, ...g }) => ({ ...g, total: fromCents(totalCents) }));

  return {
    ...summarize(tableNumber, orders, db),
    items,
    orders: orders.map(o => ({
      id: o.id, status: o.status, total: o.total, createdAt: o.createdAt,
      customerName: o.customerName, notes: o.notes, items: o.items,
    })),
    orderIds: orders.map(o => o.id),
  };
}

const AccountsController = {
  // GET /api/accounts — todas as mesas com conta aberta (+ mesas livres se tableCount definido)
  list(req, res) {
    requireRole(req, STAFF_ROLES);
    const db  = getDB();
    const map = openOrdersByTable(db);

    const tableCount = Number(db.settings.tableCount) || 0;
    for (let n = 1; n <= tableCount; n++) if (!map.has(String(n))) map.set(String(n), []);

    const data = [...map.entries()]
      .map(([t, orders]) => summarize(t, orders, db))
      .sort((a, b) => tableSort(a.tableNumber, b.tableNumber));

    const open = data.filter(a => a.status === 'open');
    json(res, 200, {
      data,
      totals: {
        openAccounts: open.length,
        openAmount:   fromCents(open.reduce((s, a) => s + toCents(a.subtotal), 0)),
        tableCount,
      },
    });
  },

  // GET /api/accounts/:mesa — consumo detalhado
  get(req, res, rawTable) {
    requireRole(req, STAFF_ROLES);
    const tableNumber = normalizeTable(decodeURIComponent(rawTable || ''));
    if (!tableNumber) throw new HttpError(400, 'Mesa inválida');
    json(res, 200, { data: accountDetail(tableNumber, getDB()) });
  },

  // POST /api/accounts/:mesa/pay — registra o pagamento (validação 100% no servidor)
  async pay(req, res, rawTable) {
    requireRole(req, STAFF_ROLES);
    const db   = getDB();
    const body = await readBody(req, 8 * 1024);
    const tableNumber = normalizeTable(decodeURIComponent(rawTable || ''));
    if (!tableNumber) throw new HttpError(400, 'Mesa inválida');

    // 1) Idempotência: o mesmo clique enviado duas vezes não gera 2 pagamentos
    const idemKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.slice(0, 64) : null;
    if (idemKey) {
      const prev = db.payments.find(p => p.idempotencyKey === idemKey);
      if (prev) return json(res, 200, { data: prev, duplicate: true });
    }

    // 2) Método de pagamento
    const method = String(body.method || '');
    if (!PAYMENT_METHODS[method]) throw new HttpError(400, 'Forma de pagamento inválida');

    // 3) A conta ainda está aberta? (verificado aqui, não no frontend)
    const detail = accountDetail(tableNumber, db);
    if (!detail.orderIds.length)
      throw new HttpError(409, 'Esta conta não está aberta (já foi paga ou não tem consumo)');

    // 4) O que o funcionário viu na tela é exatamente o que está aberto agora?
    const sent = Array.isArray(body.orderIds) ? body.orderIds.map(Number).sort((a, b) => a - b) : [];
    const current = [...detail.orderIds].sort((a, b) => a - b);
    const sameOrders = sent.length === current.length && sent.every((id, i) => id === current[i]);
    const subtotalCents = toCents(detail.subtotal);
    if (!sameOrders || toCents(body.expectedSubtotal) !== subtotalCents) {
      throw new HttpError(409, 'A conta mudou desde que foi aberta (novo pedido ou pagamento). Confira e tente de novo.',
        { current: detail });
    }

    // 5) Desconto e taxa
    const discountCents = toCents(body.discount);
    const feeCents      = toCents(body.serviceFee);
    if (discountCents < 0 || feeCents < 0) throw new HttpError(400, 'Valores negativos não são permitidos');
    if (discountCents > subtotalCents) throw new HttpError(400, 'Desconto maior que o subtotal');
    if (discountCents > 0 && req.user.role !== 'admin') throw new HttpError(403, 'Apenas o gerente pode conceder desconto');
    if (feeCents > subtotalCents * MAX_FEE_RATIO) throw new HttpError(400, 'Taxa de serviço acima do permitido');

    const totalCents = subtotalCents - discountCents + feeCents;

    // 6) Troco (somente dinheiro, opcional)
    let amountReceived = null, change = null;
    if (method === 'dinheiro' && body.amountReceived !== undefined && body.amountReceived !== null && body.amountReceived !== '') {
      const recCents = toCents(body.amountReceived);
      if (recCents < totalCents) throw new HttpError(400, 'Valor recebido menor que o total');
      amountReceived = fromCents(recCents);
      change = fromCents(recCents - totalCents);
    }

    // 7) Registra — tudo síncrono a partir daqui (sem await), logo não há
    //    como outra requisição pagar a mesma conta no meio do caminho.
    const now = new Date().toISOString();
    const payment = {
      id:             db._nextPaymentId++,
      tableNumber,
      orderIds:       current,
      items:          detail.items,
      subtotal:       fromCents(subtotalCents),
      discount:       fromCents(discountCents),
      serviceFee:     fromCents(feeCents),
      total:          fromCents(totalCents),
      method,
      amountReceived,
      change,
      note:           String(body.note || '').trim().slice(0, 200) || null,
      status:         'paid',
      openedAt:       detail.openedAt,
      createdAt:      now,
      paidBy:         actor(req),
      idempotencyKey: idemKey,
      voidedAt:       null,
      voidedBy:       null,
      voidReason:     null,
    };
    db.payments.push(payment);

    for (const o of db.orders) {
      if (current.includes(o.id)) { o.paymentId = payment.id; o.paidAt = now; }
    }

    const autoCompletedCalls = completeBillCallsForTable(tableNumber, actor(req), now);

    audit(req, 'payment.create', 'payment', payment.id, {
      tableNumber, total: payment.total, method, orderIds: current,
      discount: payment.discount, serviceFee: payment.serviceFee,
    });
    markDirty();

    json(res, 201, { data: payment, tableReleased: true, autoCompletedCalls });
  },
};

const PaymentsController = {
  // GET /api/payments?from&to — histórico (inclui estornados)
  list(req, res, query) {
    requireRole(req, ['admin']);
    const range = parseRange(query);
    const data = getDB().payments
      .filter(p => inRange(p.createdAt, range))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    json(res, 200, { data, total: data.length });
  },

  // POST /api/payments/:id/void — estorno. Nunca apaga: marca como estornado,
  // guarda quem/quando/por quê e reabre os pedidos na conta da mesa.
  async void(req, res, id) {
    requireRole(req, ['admin']);
    const db   = getDB();
    const body = await readBody(req, 2 * 1024);
    const reason = String(body.reason || '').trim();
    if (reason.length < 3) throw new HttpError(400, 'Informe o motivo do estorno');

    const p = db.payments.find(p => p.id === id);
    if (!p) throw new HttpError(404, 'Pagamento não encontrado');
    if (p.status !== 'paid') throw new HttpError(409, 'Pagamento já estornado');

    p.status     = 'voided';
    p.voidedAt   = new Date().toISOString();
    p.voidedBy   = actor(req);
    p.voidReason = reason.slice(0, 300);

    let reopened = 0;
    for (const o of db.orders) {
      if (o.paymentId === p.id) { delete o.paymentId; delete o.paidAt; reopened++; }
    }

    audit(req, 'payment.void', 'payment', p.id, { reason: p.voidReason, total: p.total, reopenedOrders: reopened });
    markDirty();
    json(res, 200, { data: p, reopenedOrders: reopened });
  },

  // GET /api/audit — trilha de auditoria (somente leitura)
  auditLog(req, res, query) {
    requireRole(req, ['admin']);
    const range = parseRange(query);
    const data = getDB().auditLog.filter(a => inRange(a.at, range)).sort((a, b) => b.id - a.id);
    json(res, 200, { data });
  },
};

module.exports = { AccountsController, PaymentsController, PAYMENT_METHODS, isOpenOrder, openOrdersByTable };
