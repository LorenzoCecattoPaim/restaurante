// Sobe uma instância isolada da API (banco em memória) para os testes
const { spawn } = require('child_process');
const path = require('path');

let nextPort = 4100 + Math.floor(Math.random() * 500);

async function startServer(env = {}) {
  const port = nextPort++;
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], {
    env: {
      ...process.env, PORT: String(port), DB_MEMORY: '1', NODE_ENV: 'test',
      ADMIN_USER: 'admin', ADMIN_PASS: 'adm', KITCHEN_USER: 'cozinha', KITCHEN_PASS: 'coz',
      WAITERS: 'joao:j1,maria:m1', RATE_LIMIT_MAX: '1000', ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', d => { log += d; });
  proc.stderr.on('data', d => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(base + '/health'); if (r.ok) break; } catch {}
    await new Promise(r => setTimeout(r, 50));
  }

  async function call(method, p, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + '/api' + p, { method, headers, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
    let data = null; try { data = await res.json(); } catch {}
    return { status: res.status, data };
  }
  async function login(u, p) {
    const r = await call('POST', '/auth/login', { username: u, password: p });
    return r.data.data.token;
  }
  return { base, call, login, stop: () => proc.kill(), log: () => log };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
module.exports = { startServer, sleep };
