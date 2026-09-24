// Testes de integração (API real, banco em memória) — node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, sleep } = require('./helpers');

let s, admin, joao, maria, kitchen;

test.before(async () => {
  s = await startServer();
  admin   = await s.login('admin', 'adm');
  joao    = await s.login('joao', 'j1');
  maria   = await s.login('maria', 'm1');
  kitchen = await s.login('cozinha', 'coz');
});
test.after(() => s.stop());

const order = (table, items) => s.call('POST', '/orders', { tableNumber: table, items });

// ─── Funcionalidades antigas continuam funcionando ───────────
test('regressão: cardápio público, pedido, status e dashboard', async () => {
  assert.equal((await s.call('GET', '/products')).status, 200);
  const o = await order('1', [{ productId: 1, quantity: 1 }]);
  assert.equal(o.status, 201);
  assert.equal((await s.call('PUT', `/orders/${o.data.data.id}/status`, { status: 'em_preparo' }, kitchen)).status, 200);
  assert.equal((await s.call('GET', '/dashboard', undefined, admin)).status, 200);
  assert.equal((await s.call('GET', '/dashboard', undefined, kitchen)).status, 200);
  assert.equal((await s.call('GET', '/orders')).status, 401);
});

test('JSON inválido responde 400 (antes deixava a requisição pendurada)', async () => {
  const r = await s.call('PUT', '/orders/1/status', '{quebrado', admin);
  assert.equal(r.status, 400);
});

// ─── Chamados ────────────────────────────────────────────────
test('chamado: cliente cria sem login, mesa correta, timestamps e ciclo completo', async () => {
  const c = await s.call('POST', '/calls', { tableNumber: '12', type: 'garcom' });
  assert.equal(c.status, 201);
  const call = c.data.data;
  assert.equal(call.tableNumber, '12');
  assert.equal(call.status, 'pending');
  assert.ok(call.token, 'cliente recebe token do chamado');
  assert.equal(call.acceptedBy, undefined, 'visão pública não expõe funcionário');

  // aparece para a equipe (polling)
  const list = await s.call('GET', '/calls', undefined, joao);
  const seen = list.data.data.find(x => x.id === call.id);
  assert.ok(seen);
  assert.equal(seen.clientToken, undefined, 'token do cliente não vaza para a equipe');

  // concluir antes de assumir não é permitido
  assert.equal((await s.call('POST', `/calls/${call.id}/complete`, undefined, joao)).status, 409);

  await sleep(30);
  const acc = await s.call('POST', `/calls/${call.id}/accept`, undefined, joao);
  assert.equal(acc.status, 200);
  assert.equal(acc.data.data.acceptedBy.name, 'Joao');

  // outro funcionário não consegue assumir o mesmo chamado
  const again = await s.call('POST', `/calls/${call.id}/accept`, undefined, maria);
  assert.equal(again.status, 409);
  assert.match(again.data.error, /Joao/);

  await sleep(30);
  const done = await s.call('POST', `/calls/${call.id}/complete`, undefined, joao);
  assert.equal(done.status, 200);
  const d = done.data.data;
  const created = new Date(d.createdAt), accepted = new Date(d.acceptedAt), completed = new Date(d.completedAt);
  assert.ok(created < accepted && accepted < completed, 'timestamps em ordem');

  // cliente acompanha pelo token
  const pub = await s.call('GET', `/calls/${call.id}/public?token=${call.token}`);
  assert.equal(pub.data.data.status, 'completed');
  assert.equal((await s.call('GET', `/calls/${call.id}/public?token=errado`)).status, 404);
});

test('chamado: proteção contra spam (dedupe e limite por mesa)', async () => {
  const a = await s.call('POST', '/calls', { tableNumber: '30', type: 'garcom' });
  const b = await s.call('POST', '/calls', { tableNumber: '30', type: 'garcom' });
  assert.equal(b.status, 200);
  assert.equal(b.data.deduplicated, true);
  assert.equal(b.data.data.id, a.data.data.id);
  assert.equal((await s.call('POST', '/calls', { tableNumber: '30', type: 'conta' })).status, 201);
  assert.equal((await s.call('POST', '/calls', { tableNumber: '', type: 'garcom' })).status, 400);
  assert.equal((await s.call('POST', '/calls', { tableNumber: '<x>', type: 'garcom' })).status, 400);
  assert.equal((await s.call('POST', '/calls', { tableNumber: '31', type: 'hackear' })).status, 400);
});

test('chamado: cliente só cancela o próprio chamado pendente', async () => {
  const c = (await s.call('POST', '/calls', { tableNumber: '40', type: 'garcom' })).data.data;
  assert.equal((await s.call('POST', `/calls/${c.id}/client-cancel`, { token: 'x'.repeat(32) })).status, 404);
  assert.equal((await s.call('POST', `/calls/${c.id}/client-cancel`, { token: c.token })).status, 200);
});

test('segurança: cliente e cozinha não concluem chamados nem veem financeiro', async () => {
  const c = (await s.call('POST', '/calls', { tableNumber: '41', type: 'garcom' })).data.data;
  assert.equal((await s.call('POST', `/calls/${c.id}/accept`)).status, 401);
  assert.equal((await s.call('POST', `/calls/${c.id}/accept`, undefined, kitchen)).status, 403);
  for (const p of ['/finance', '/overview', '/payments', '/analytics/service', '/analytics/tables', '/accounts', '/audit']) {
    assert.equal((await s.call('GET', p)).status, 401, p);
    assert.equal((await s.call('GET', p, undefined, kitchen)).status, 403, p);
  }
  // garçom: operação sim, financeiro/produtos/config não
  for (const p of ['/finance', '/overview', '/payments', '/analytics/service', '/settings', '/dashboard']) {
    assert.equal((await s.call('GET', p, undefined, joao)).status, 403, p);
  }
  assert.equal((await s.call('POST', '/products', { name: 'x', price: 1, category: 'Lanches' }, joao)).status, 403);
  assert.equal((await s.call('GET', '/accounts', undefined, joao)).status, 200);
});

// ─── Contas e pagamento ──────────────────────────────────────
test('conta: consumo vem dos pedidos reais, cálculo correto e pedidos cancelados fora', async () => {
  await order('7', [{ productId: 1, quantity: 2 }, { productId: 3, quantity: 1 }]); // 57,80 + 18,90
  await order('7', [{ productId: 4, quantity: 2 }]);                                // 14,00
  const canc = await order('7', [{ productId: 7, quantity: 1 }]);
  await s.call('PUT', `/orders/${canc.data.data.id}/status`, { status: 'cancelado' }, admin);

  const acc = (await s.call('GET', '/accounts/7', undefined, joao)).data.data;
  assert.equal(acc.subtotal, 90.7);
  assert.equal(acc.orderCount, 2);
  const burger = acc.items.find(i => i.productId === 1);
  assert.equal(burger.quantity, 2);
  assert.equal(burger.total, 57.8);
});

test('pagamento: registra, libera mesa, bloqueia duplicado e conta já paga', async () => {
  await order('8', [{ productId: 2, quantity: 1 }, { productId: 4, quantity: 1 }]); // 45,90
  const acc = (await s.call('GET', '/accounts/8', undefined, joao)).data.data;
  const body = { orderIds: acc.orderIds, expectedSubtotal: acc.subtotal, method: 'dinheiro', amountReceived: 50, idempotencyKey: 'pay-8' };

  const p = await s.call('POST', '/accounts/8/pay', body, joao);
  assert.equal(p.status, 201);
  const pay = p.data.data;
  assert.equal(pay.total, 45.9);
  assert.equal(pay.change, 4.1);
  assert.equal(pay.method, 'dinheiro');
  assert.equal(pay.paidBy.name, 'Joao');
  assert.equal(pay.tableNumber, '8');
  assert.deepEqual(pay.orderIds, acc.orderIds);

  // mesmo clique reenviado → devolve o mesmo pagamento
  const dup = await s.call('POST', '/accounts/8/pay', body, joao);
  assert.equal(dup.status, 200);
  assert.equal(dup.data.duplicate, true);
  assert.equal(dup.data.data.id, pay.id);

  // outra tentativa (nova chave) → conta já paga
  const again = await s.call('POST', '/accounts/8/pay', { ...body, idempotencyKey: 'outra' }, maria);
  assert.equal(again.status, 409);

  // mesa liberada
  const list = (await s.call('GET', '/accounts', undefined, admin)).data.data;
  assert.equal(list.find(a => a.tableNumber === '8'), undefined);

  // pedido pago não pode ser cancelado
  assert.equal((await s.call('PUT', `/orders/${acc.orderIds[0]}/status`, { status: 'cancelado' }, admin)).status, 409);

  // auditoria registrou
  const log = (await s.call('GET', '/audit', undefined, admin)).data.data;
  assert.ok(log.some(e => e.action === 'payment.create' && e.entityId === pay.id && e.user.name === 'Joao'));
});

test('pagamento: conta que mudou (novo pedido) é recusada', async () => {
  await order('9', [{ productId: 1, quantity: 1 }]);
  const acc = (await s.call('GET', '/accounts/9', undefined, joao)).data.data;
  await order('9', [{ productId: 4, quantity: 1 }]); // chega pedido novo
  const r = await s.call('POST', '/accounts/9/pay', { orderIds: acc.orderIds, expectedSubtotal: acc.subtotal, method: 'pix' }, joao);
  assert.equal(r.status, 409);
  assert.equal(r.data.current.orderCount, 2);
});

test('pagamento: validações de método, desconto e perfil', async () => {
  await order('10', [{ productId: 1, quantity: 1 }]); // 28,90
  const acc = (await s.call('GET', '/accounts/10', undefined, admin)).data.data;
  const base = { orderIds: acc.orderIds, expectedSubtotal: acc.subtotal };
  assert.equal((await s.call('POST', '/accounts/10/pay', { ...base, method: 'cheque' }, admin)).status, 400);
  assert.equal((await s.call('POST', '/accounts/10/pay', { ...base, method: 'pix', discount: 5 }, joao)).status, 403);
  assert.equal((await s.call('POST', '/accounts/10/pay', { ...base, method: 'pix', discount: 99 }, admin)).status, 400);
  assert.equal((await s.call('POST', '/accounts/10/pay', { ...base, method: 'pix' }, kitchen)).status, 403);
  assert.equal((await s.call('POST', '/accounts/10/pay', { ...base, method: 'pix' })).status, 401);
  const ok = await s.call('POST', '/accounts/10/pay', { ...base, method: 'credito', discount: 3.9, serviceFee: 2.89 }, admin);
  assert.equal(ok.status, 201);
  assert.equal(ok.data.data.total, 27.89);
});

test('pagamento: "pedir a conta" é concluído automaticamente ao pagar', async () => {
  await order('11', [{ productId: 1, quantity: 1 }]);
  const c = (await s.call('POST', '/calls', { tableNumber: '11', type: 'conta' })).data.data;
  const acc = (await s.call('GET', '/accounts/11', undefined, joao)).data.data;
  const r = await s.call('POST', '/accounts/11/pay', { orderIds: acc.orderIds, expectedSubtotal: acc.subtotal, method: 'pix' }, joao);
  assert.equal(r.data.autoCompletedCalls, 1);
  const pub = (await s.call('GET', `/calls/${c.id}/public?token=${c.token}`)).data.data;
  assert.equal(pub.status, 'completed');
});

test('estorno: exige motivo, preserva histórico e reabre a conta', async () => {
  await order('13', [{ productId: 5, quantity: 1 }]);
  const acc = (await s.call('GET', '/accounts/13', undefined, admin)).data.data;
  const pay = (await s.call('POST', '/accounts/13/pay', { orderIds: acc.orderIds, expectedSubtotal: acc.subtotal, method: 'pix' }, admin)).data.data;
  assert.equal((await s.call('POST', `/payments/${pay.id}/void`, { reason: '' }, admin)).status, 400);
  assert.equal((await s.call('POST', `/payments/${pay.id}/void`, { reason: 'erro de método' }, joao)).status, 403);
  const v = await s.call('POST', `/payments/${pay.id}/void`, { reason: 'erro de método' }, admin);
  assert.equal(v.status, 200);
  assert.equal(v.data.data.status, 'voided');
  assert.equal((await s.call('POST', `/payments/${pay.id}/void`, { reason: 'de novo' }, admin)).status, 409);
  const reopened = (await s.call('GET', '/accounts/13', undefined, admin)).data.data;
  assert.equal(reopened.subtotal, 22.9);
  const hist = (await s.call('GET', '/payments', undefined, admin)).data.data;
  assert.ok(hist.find(p => p.id === pay.id && p.status === 'voided'), 'pagamento não some do histórico');
  assert.equal((await s.call('DELETE', `/payments/${pay.id}`, undefined, admin)).status, 404, 'não existe rota de exclusão');
});

// ─── Financeiro e análises (endpoints) ───────────────────────
test('financeiro: período sem movimentação retorna zeros, não dados inventados', async () => {
  const from = new Date('2020-01-01T00:00:00Z').toISOString();
  const to   = new Date('2020-01-02T00:00:00Z').toISOString();
  const r = (await s.call('GET', `/finance?from=${from}&to=${to}&tz=America/Sao_Paulo`, undefined, admin)).data.data;
  assert.equal(r.revenue, 0);
  assert.equal(r.paidAccounts, 0);
  assert.equal(r.avgTicket, null);
  assert.equal(r.topTable, null);
  assert.equal(r.mostUsedMethod, null);
  assert.deepEqual(r.byMethod, []);
  const svc = (await s.call('GET', `/analytics/service?from=${from}&to=${to}`, undefined, admin)).data.data;
  assert.equal(svc.counts.total, 0);
  assert.equal(svc.avgTotal, null);
});

test('financeiro: filtros de data inválidos são recusados', async () => {
  assert.equal((await s.call('GET', '/finance?from=abc', undefined, admin)).status, 400);
  assert.equal((await s.call('GET', '/finance?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z', undefined, admin)).status, 400);
});

test('overview: indicadores do dia para o dashboard', async () => {
  const r = await s.call('GET', '/overview', undefined, admin);
  assert.equal(r.status, 200);
  for (const k of ['revenueToday', 'openAccounts', 'occupiedTables', 'pendingCalls', 'avgServiceTotal', 'avgTicket'])
    assert.ok(k in r.data.data, k);
});

test('configurações: total de mesas e limite de alerta são saneados', async () => {
  await s.call('PUT', '/settings', { tableCount: '20', callAlertSeconds: 5 }, admin);
  const st = (await s.call('GET', '/settings', undefined, admin)).data.data;
  assert.equal(st.tableCount, 20);
  assert.equal(st.callAlertSeconds, 30);
  const list = (await s.call('GET', '/accounts', undefined, admin)).data;
  assert.equal(list.totals.tableCount, 20);
  assert.ok(list.data.some(a => a.tableNumber === '3' && a.status === 'free'), 'mesas sem consumo aparecem');
  assert.equal((await s.call('POST', '/calls', { tableNumber: '99', type: 'garcom' })).status, 400, 'mesa fora do salão');
});

test('rate limit nas rotas públicas de chamado', async () => {
  const s2 = await (require('./helpers').startServer({ RATE_LIMIT_MAX: '3' }));
  try {
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await s2.call('POST', '/calls', { tableNumber: String(100 + i), type: 'garcom' })).status);
    assert.ok(codes.includes(429));
  } finally { s2.stop(); }
});
