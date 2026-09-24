// Testes unitários dos cálculos (dados sintéticos com horários controlados)
const test = require('node:test');
const assert = require('node:assert/strict');
const { financeSummary, serviceSummary, tablesSummary, callTimes } = require('../server/analytics');

const TZ = 'America/Sao_Paulo'; // UTC-3
const at = (h, m = 0, s = 0, day = 10) => new Date(Date.UTC(2026, 8, day, h + 3, m, s)).toISOString(); // hora local SP

function db() {
  const waiter = { id: 3, name: 'Ana', role: 'waiter' };
  const other  = { id: 4, name: 'Bruno', role: 'waiter' };
  return {
    settings: { tableCount: 10 },
    orders: [
      { id: 1, tableNumber: '1', status: 'entregue', total: 50, createdAt: at(12, 0), paymentId: 1 },
      { id: 2, tableNumber: '2', status: 'entregue', total: 100, createdAt: at(13, 0), paymentId: 2 },
      { id: 3, tableNumber: '2', status: 'cancelado', total: 30, createdAt: at(13, 5) },
      { id: 4, tableNumber: '1', status: 'entregue', total: 30, createdAt: at(20, 0, 0, 11), paymentId: 3 },
    ],
    payments: [
      { id: 1, tableNumber: '1', status: 'paid',   method: 'pix',      total: 50,  discount: 0, serviceFee: 0,  openedAt: at(12, 0), createdAt: at(12, 45) },
      { id: 2, tableNumber: '2', status: 'paid',   method: 'credito',  total: 110, discount: 0, serviceFee: 10, openedAt: at(13, 0), createdAt: at(14, 30) },
      { id: 3, tableNumber: '1', status: 'paid',   method: 'pix',      total: 30,  discount: 0, serviceFee: 0,  openedAt: at(20, 0, 0, 11), createdAt: at(20, 30, 0, 11) },
      { id: 4, tableNumber: '3', status: 'voided', method: 'dinheiro', total: 999, discount: 0, serviceFee: 0,  openedAt: at(12, 0), createdAt: at(12, 10) },
    ],
    waiterCalls: [
      // 12h: assumido em 60s, concluído 120s depois → total 180s
      { id: 1, tableNumber: '1', type: 'garcom', status: 'completed', createdAt: at(12, 0, 0), acceptedAt: at(12, 1, 0), completedAt: at(12, 3, 0), acceptedBy: waiter },
      // 12h: assumido em 30s, concluído 30s depois → total 60s
      { id: 2, tableNumber: '2', type: 'garcom', status: 'completed', createdAt: at(12, 30, 0), acceptedAt: at(12, 30, 30), completedAt: at(12, 31, 0), acceptedBy: other },
      // 20h: pendente
      { id: 3, tableNumber: '2', type: 'conta', status: 'pending', createdAt: at(20, 0, 0), acceptedAt: null, completedAt: null },
      // 20h: cancelado depois de assumido (fora das médias de conclusão)
      { id: 4, tableNumber: '1', type: 'garcom', status: 'cancelled', createdAt: at(20, 10), acceptedAt: at(20, 11), completedAt: null, acceptedBy: waiter },
      // conta concluída pelo pagamento (aceite automático não conta para o funcionário)
      { id: 5, tableNumber: '2', type: 'conta', status: 'completed', createdAt: at(14, 0), acceptedAt: at(14, 30), completedAt: at(14, 30), acceptedBy: waiter, autoAccepted: true, autoCompleted: 'payment' },
    ],
  };
}

const day10 = { from: new Date(at(0, 0)), to: new Date(at(23, 59, 59)), tz: TZ };
const both  = { from: new Date(at(0, 0)), to: new Date(at(23, 59, 59, 11)), tz: TZ };

test('tempos de um chamado', () => {
  const t = callTimes(db().waiterCalls[0]);
  assert.deepEqual(t, { toAccept: 60, service: 120, total: 180 });
});

test('financeiro do dia: faturamento, ticket, método, mesa; estorno fora', () => {
  const f = financeSummary(db(), day10);
  assert.equal(f.revenue, 160);
  assert.equal(f.paidAccounts, 2);
  assert.equal(f.avgTicket, 80);
  assert.equal(f.serviceFees, 10);
  assert.equal(f.voidedCount, 1);
  assert.equal(f.topTable.tableNumber, '2');
  assert.deepEqual(f.byMethod.map(m => [m.method, m.total, m.count]), [['credito', 110, 1], ['pix', 50, 1]]);
});

test('financeiro por período: série diária e forma mais usada', () => {
  const f = financeSummary(db(), both);
  assert.equal(f.revenue, 190);
  assert.equal(f.mostUsedMethod.method, 'pix');
  assert.deepEqual(f.daily.map(d => [d.day, d.total]), [['2026-09-10', 160], ['2026-09-11', 30]]);
});

test('atendimento: contagens, médias e agrupamento por hora local', () => {
  const s = serviceSummary(db(), day10);
  assert.deepEqual(s.counts, { total: 5, completed: 3, pending: 1, accepted: 0, cancelled: 1 });
  // assumir: (60 + 30 + 1800) / 3 = 630 (cancelado não entra)
  assert.equal(s.avgToAccept, 630);
  // total concluídos: (180 + 60 + 1800) / 3 = 680
  assert.equal(s.avgTotal, 680);
  const h12 = s.byHour.find(h => h.hour === 12);
  assert.equal(h12.count, 2);
  assert.equal(h12.avgTotal, 120);
  assert.ok(s.byHour.find(h => h.hour === 20), 'hora local (não UTC)');
  assert.ok(!s.byHour.find(h => h.hour === 15 || h.hour === 23), 'sem deslocamento de fuso');
});

test('atendimento por funcionário: neutro e sem aceite automático', () => {
  const s = serviceSummary(db(), day10);
  const ana = s.byStaff.find(x => x.name === 'Ana');
  assert.equal(ana.accepted, 2);   // chamado 1 + chamado 4 (cancelado); o 5 foi automático
  assert.equal(ana.completed, 1);
  assert.equal(ana.avgService, 120);
  assert.ok(!('rank' in ana) && !('label' in ana));
});

test('mesas: faturamento, contas, pedidos, permanência, chamados', () => {
  const t = tablesSummary(db(), day10);
  const m2 = t.find(x => x.tableNumber === '2');
  assert.equal(m2.revenue, 110);
  assert.equal(m2.accounts, 1);
  assert.equal(m2.orders, 1);           // cancelado não conta
  assert.equal(m2.avgStay, 5400);       // 13:00 → 14:30
  assert.equal(m2.calls, 3);
  assert.ok(!t.find(x => x.tableNumber === '3' && x.revenue > 0), 'estorno não gera faturamento');
});

test('período sem dados: nulos, não zeros inventados', () => {
  const empty = { from: new Date('2020-01-01'), to: new Date('2020-01-02'), tz: TZ };
  const s = serviceSummary(db(), empty);
  assert.equal(s.avgTotal, null);
  assert.deepEqual(s.byHour, []);
  const f = financeSummary(db(), empty);
  assert.equal(f.avgTicket, null);
  assert.ok(f.daily.every(d => d.total === 0));
});
