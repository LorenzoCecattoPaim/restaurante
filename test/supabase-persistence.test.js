// Testes de integração do modo de persistência "Supabase" (server/db.js).
// Não fala com a internet: sobe um mock local que imita a API REST
// (PostgREST) do Supabase só o suficiente para o db.js conversar com ele —
// GET (carregar) e POST com Prefer:resolution=merge-duplicates (upsert).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer } = require('./helpers');

function startMockSupabase() {
  let stored = null;
  const posts = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'GET' && url.pathname === '/rest/v1/restauros_state') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stored ? [{ data: stored }] : []));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/rest/v1/restauros_state') {
        const parsed = JSON.parse(body);
        stored = parsed.data;
        posts.push(parsed);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end('');
        return;
      }
      res.writeHead(404); res.end('not found');
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        base: `http://127.0.0.1:${port}`,
        posts,
        get stored() { return stored; },
        stop: () => server.close(),
      });
    });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

test('supabase: primeira subida cria a linha (seed) e reporta conectado no /health', async () => {
  const mock = await startMockSupabase();
  const s = await startServer({ DB_MEMORY: '', SUPABASE_URL: mock.base, SUPABASE_SERVICE_KEY: 'test-key' });
  try {
    const health = await fetch(s.base + '/health').then(r => r.json());
    assert.equal(health.persistence, 'supabase');
    assert.equal(health.persistenceConnected, true);
    assert.ok(mock.stored, 'o mock recebeu um POST com o seed na subida');
    assert.ok(mock.stored.users.some(u => u.username === 'admin'));
  } finally {
    s.stop(); mock.stop();
  }
});

test('supabase: dado criado é salvo (debounced) no mock e sobrevive a um restart do processo', async () => {
  const mock = await startMockSupabase();

  const s1 = await startServer({ DB_MEMORY: '', SUPABASE_URL: mock.base, SUPABASE_SERVICE_KEY: 'test-key' });
  const token1 = await s1.login('admin', 'adm');
  const created = await s1.call('POST', '/employees', { name: 'Teste Supabase', username: 'sb_teste', password: '1234', role: 'waiter' }, token1);
  assert.equal(created.status, 201);
  await sleep(500); // debounce de 300ms do persist()
  assert.ok(mock.stored.users.some(u => u.username === 'sb_teste'), 'o POST de persistência chegou no mock antes do restart');
  s1.stop();

  // "restart" — novo processo, mesmo mock (mesmo dado gravado)
  const s2 = await startServer({ DB_MEMORY: '', SUPABASE_URL: mock.base, SUPABASE_SERVICE_KEY: 'test-key' });
  try {
    const token2 = await s2.login('admin', 'adm');
    const list = await s2.call('GET', '/employees', undefined, token2);
    assert.ok(list.data.data.some(u => u.username === 'sb_teste'), 'funcionário criado antes do restart continua lá depois — persistência real');
  } finally {
    s2.stop(); mock.stop();
  }
});

test('supabase: indisponível na subida não derruba o servidor (degrada pra memória, health honesto)', async () => {
  // Aponta pra uma porta sem ninguém escutando
  const s = await startServer({ DB_MEMORY: '', SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_SERVICE_KEY: 'test-key' });
  try {
    const health = await fetch(s.base + '/health').then(r => r.json());
    assert.equal(health.status, 'ok', 'servidor sobe normalmente mesmo sem conseguir falar com o Supabase');
    assert.equal(health.persistence, 'supabase');
    assert.equal(health.persistenceConnected, false, 'health não finge que está conectado');
    // Continua funcional em memória enquanto isso:
    const token = await s.login('admin', 'adm');
    assert.ok(token);
  } finally {
    s.stop();
  }
});
