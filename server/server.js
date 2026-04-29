// ============================================================
// server.js — API-only para Render (sem servir arquivos estáticos)
// Frontend está no Vercel — este servidor só responde /api e /health
// ============================================================

const http = require('http');
const url  = require('url');

const { router }               = require('./routes');
const { initDB, getDB, markDirty } = require('./db');

const PORT           = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// ─── Rate limiting (por IP) ───────────────────────────────────
const rateMap = new Map();
const RL_WINDOW = 60_000;  // 1 minuto
const RL_MAX    = 30;      // 30 req/min por IP (pedidos públicos)

function isRateLimited(ip) {
  const now   = Date.now();
  const entry = rateMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RL_WINDOW) {
    rateMap.set(ip, { count: 1, start: now });
    return false;
  }
  entry.count++;
  rateMap.set(ip, entry);
  return entry.count > RL_MAX;
}

setInterval(() => {
  const cutoff = Date.now() - RL_WINDOW;
  for (const [ip, e] of rateMap) if (e.start < cutoff) rateMap.delete(ip);
}, 5 * 60_000);

// ─── Limpeza de sessões expiradas (a cada 1h) ─────────────────
function cleanSessions() {
  const db     = getDB();
  const cutoff = Date.now() - 8 * 60 * 60_000;
  let   n      = 0;
  for (const [t, s] of Object.entries(db.sessions)) {
    if (s.createdAt < cutoff) { delete db.sessions[t]; n++; }
  }
  if (n > 0) { markDirty(); console.log(`🧹 ${n} sessão(ões) expirada(s)`); }
}

// ─── CORS helper ─────────────────────────────────────────────
function setCors(req, res) {
  const origin = req.headers['origin'] || '';
  if (ALLOWED_ORIGIN === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    // Suporta múltiplas origens separadas por vírgula
    const allowed = ALLOWED_ORIGIN.split(',').map(s => s.trim());
    if (allowed.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else if (!origin) {
      res.setHeader('Access-Control-Allow-Origin', allowed[0]);
    } else {
      res.writeHead(403);
      res.end(JSON.stringify({ error: 'Origin not allowed' }));
      return false;
    }
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return true;
}

// ─── HTTP Server ──────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // CORS preflight
  const corsOk = setCors(req, res);
  if (!corsOk) return;
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // Health check (Render pinga isso para saber se o serviço está vivo)
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      env:    process.env.NODE_ENV || 'development',
    }));
    return;
  }

  // Apenas rotas /api/* são aceitas
  if (!pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. This server only serves /api/*' }));
    return;
  }

  // Rate limit na criação de pedidos (rota pública)
  if (pathname === '/api/orders' && req.method === 'POST') {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.socket.remoteAddress;
    if (isRateLimited(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Muitas requisições. Tente novamente em breve.' }));
      return;
    }
  }

  router(req, res, parsed);
});

// ─── Graceful shutdown ────────────────────────────────────────
let shutting = false;
function shutdown(sig) {
  if (shutting) return;
  shutting = true;
  console.log(`\n📴 ${sig} — encerrando...`);
  server.close(() => { console.log('✅ Servidor encerrado'); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException',   err => console.error('❌ uncaughtException:', err));
process.on('unhandledRejection', err => console.error('❌ unhandledRejection:', err));

// ─── Start ────────────────────────────────────────────────────
initDB(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🍽️  RestaurOS API — http://localhost:${PORT}`);
    console.log(`   💚 Health  → http://localhost:${PORT}/health`);
    console.log(`   🔌 API     → http://localhost:${PORT}/api/`);
    console.log(`   🌐 CORS    → ${ALLOWED_ORIGIN}`);
    console.log(`   🔐 Admin   → admin / ${process.env.ADMIN_PASS || 'Lore4545!'}\n`);
  });
  setInterval(cleanSessions, 60 * 60_000);
});
