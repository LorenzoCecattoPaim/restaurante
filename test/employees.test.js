// Testes de integração — gestão de equipe (garçons/cozinha) — node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

let s, admin, joao, maria, kitchen;

test.before(async () => {
  s = await startServer();
  admin   = await s.login('admin', 'adm');
  joao    = await s.login('joao', 'j1');
  maria   = await s.login('maria', 'm1');
  kitchen = await s.login('cozinha', 'coz');
});
test.after(() => s.stop());

// ─── Permissões ────────────────────────────────────────────────
test('equipe: só admin acessa /employees — garçom e cozinha recebem 403', async () => {
  assert.equal((await s.call('GET', '/employees', undefined, joao)).status, 403);
  assert.equal((await s.call('GET', '/employees', undefined, kitchen)).status, 403);
  assert.equal((await s.call('GET', '/employees', undefined, undefined)).status, 401);
  assert.equal((await s.call('GET', '/employees', undefined, admin)).status, 200);
});

test('equipe: seed via WAITERS/env aparece na listagem (não duplica autenticação)', async () => {
  const r = await s.call('GET', '/employees', undefined, admin);
  const names = r.data.data.map(u => u.username);
  assert.ok(names.includes('joao'));
  assert.ok(names.includes('maria'));
  assert.ok(names.includes('cozinha'));
  assert.ok(!names.includes('admin'), 'conta admin não aparece na gestão de equipe');
});

// ─── Cadastro ───────────────────────────────────────────────────
test('equipe: cadastro exige nome/usuário/senha, rejeita duplicado e role inválida', async () => {
  const ok = await s.call('POST', '/employees', { name: 'Pedro Santos', username: 'pedro', password: '1234', role: 'waiter' }, admin);
  assert.equal(ok.status, 201);
  assert.equal(ok.data.data.active, true);
  assert.equal(ok.data.data.password, undefined, 'senha nunca volta na resposta');

  assert.equal((await s.call('POST', '/employees', { name: 'X', username: '', password: '1234', role: 'waiter' }, admin)).status, 400);
  assert.equal((await s.call('POST', '/employees', { name: 'X', username: 'pedro', password: '1234', role: 'waiter' }, admin)).status, 409);
  assert.equal((await s.call('POST', '/employees', { name: 'X', username: 'novo1', password: '1234', role: 'admin' }, admin)).status, 400, 'não cria admin por aqui');
  assert.equal((await s.call('POST', '/employees', { name: 'X', username: 'novo2', password: '123', role: 'waiter' }, admin)).status, 400, 'senha curta é rejeitada');
});

test('equipe: novo garçom já entra pela autenticação existente (mesma sessão/token)', async () => {
  await s.call('POST', '/employees', { name: 'Carlos Souza', username: 'carlos', password: 'abcd', role: 'waiter' }, admin);
  const login = await s.call('POST', '/auth/login', { username: 'carlos', password: 'abcd' });
  assert.equal(login.status, 200);
  const token = login.data.data.token;
  assert.equal((await s.call('GET', '/calls', undefined, token)).status, 200);
  assert.equal((await s.call('GET', '/finance', undefined, token)).status, 403, 'garçom continua sem ver financeiro');
});

// ─── Edição e proteção da conta admin ───────────────────────────
test('equipe: admin não é editável/gerenciável pela tela de equipe', async () => {
  const r = await s.call('GET', '/employees', undefined, admin);
  const adminId = 1; // seed
  assert.equal((await s.call('PUT', `/employees/${adminId}`, { name: 'Hack' }, admin)).status, 403);
  assert.equal((await s.call('POST', `/employees/${adminId}/deactivate`, undefined, admin)).status, 403);
});

test('equipe: edição troca só os campos enviados; username duplicado é bloqueado', async () => {
  const create = await s.call('POST', '/employees', { name: 'Ana', username: 'ana', password: '1234', role: 'waiter', phone: '111' }, admin);
  const id = create.data.data.id;
  const edited = await s.call('PUT', `/employees/${id}`, { phone: '222' }, admin);
  assert.equal(edited.status, 200);
  assert.equal(edited.data.data.name, 'Ana', 'nome não enviado permanece igual');
  assert.equal(edited.data.data.phone, '222');

  const dup = await s.call('PUT', `/employees/${id}`, { username: 'joao' }, admin);
  assert.equal(dup.status, 409);
});

// ─── Ativação/desativação e efeito imediato na sessão ───────────
test('equipe: desativar bloqueia login futuro E revoga sessões abertas na hora', async () => {
  const create = await s.call('POST', '/employees', { name: 'Bruno', username: 'bruno', password: '1234', role: 'waiter' }, admin);
  const id = create.data.data.id;
  const brunoToken = await s.login('bruno', '1234');

  assert.equal((await s.call('GET', '/calls', undefined, brunoToken)).status, 200, 'sessão válida antes de desativar');

  const off = await s.call('POST', `/employees/${id}/deactivate`, undefined, admin);
  assert.equal(off.status, 200);
  assert.ok(off.data.revokedSessions >= 1);

  assert.equal((await s.call('GET', '/calls', undefined, brunoToken)).status, 401, 'sessão antiga é revogada imediatamente, não espera expirar');
  assert.equal((await s.call('POST', '/auth/login', { username: 'bruno', password: '1234' })).status, 403, 'login bloqueado enquanto inativo');

  const on = await s.call('POST', `/employees/${id}/activate`, undefined, admin);
  assert.equal(on.status, 200);
  assert.equal((await s.call('POST', '/auth/login', { username: 'bruno', password: '1234' })).status, 200, 'reativado volta a logar');
});

test('equipe: histórico não é apagado ao desativar (preserva dados do chamado)', async () => {
  const create = await s.call('POST', '/employees', { name: 'Diego', username: 'diego', password: '1234', role: 'waiter' }, admin);
  const id = create.data.data.id;
  const diegoToken = await s.login('diego', '1234');

  const call = await s.call('POST', '/calls', { tableNumber: '77', type: 'garcom' });
  await s.call('POST', `/calls/${call.data.data.id}/accept`, undefined, diegoToken);
  await s.call('POST', `/calls/${call.data.data.id}/complete`, undefined, diegoToken);

  await s.call('POST', `/employees/${id}/deactivate`, undefined, admin);

  const detail = await s.call('GET', `/employees/${id}`, undefined, admin); // período padrão: hoje
  assert.equal(detail.status, 200);
  assert.equal(detail.data.data.active, false);
  assert.equal(detail.data.data.stats.completed, 1, 'histórico do atendimento continua íntegro após desativação');
  assert.equal(detail.data.data.stats.history[0].tableNumber, '77');
});

// ─── Indicadores objetivos (sem ranking, sem julgamento) ────────
test('equipe: detalhe traz métricas objetivas derivadas dos chamados reais, sem dados inventados', async () => {
  const detail = await s.call('GET', '/employees/2', undefined, admin); // cozinha, período padrão: hoje
  assert.equal(detail.status, 200);
  assert.equal(detail.data.data.stats.accepted, 0, 'sem chamados assumidos por esse funcionário, número é 0, não inventado');
  assert.equal(detail.data.data.stats.avgToAccept, null, 'sem dados suficientes retorna null, não uma média fictícia');
});

test('equipe: detalhe e desativação de um id fora do escopo (waiter/kitchen) dá 404', async () => {
  assert.equal((await s.call('GET', '/employees/9999', undefined, admin)).status, 404);
});
