// ============================================================
// server.js — HTTP server puro (sem Express)
// ============================================================

const http = require('http');
const url  = require('url');
const path = require('path');
const fs   = require('fs');

const { router }  = require('./routes');
const { initDB }  = require('./db');

const PORT = process.env.PORT || 3000;
const PUB  = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css' : 'text/css',
  '.js'  : 'application/javascript',
  '.json': 'application/json',
  '.png' : 'image/png',
  '.jpg' : 'image/jpeg',
  '.svg' : 'image/svg+xml',
  '.ico' : 'image/x-icon',
  '.mp3' : 'audio/mpeg',
  '.wav' : 'audio/wav',
};

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// Mapeia rotas de página → arquivo HTML
const PAGE_MAP = {
  '/':        'index.html',
  '/admin':   'admin.html',
  '/login':   'login.html',
  '/kitchen': 'kitchen.html',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // API
  if (pathname.startsWith('/api/')) return router(req, res, parsed);

  // Páginas SPA-style
  const page = PAGE_MAP[pathname];
  if (page) return serveStatic(res, path.join(PUB, page));

  // Arquivos estáticos (css, js, assets…)
  serveStatic(res, path.join(PUB, pathname));
});

initDB(() => {
  server.listen(PORT, () => {
    console.log(`\n🍽️  RestaurOS — http://localhost:${PORT}`);
    console.log(`   📊 Admin   → http://localhost:${PORT}/admin`);
    console.log(`   👨‍🍳 Cozinha → http://localhost:${PORT}/kitchen`);
    console.log(`   📱 Cardápio → http://localhost:${PORT}/?mesa=5`);
    console.log(`   🔐 Login   → http://localhost:${PORT}/login\n`);
    console.log('   Credenciais: admin / admin123   |   cozinha / cozinha123\n');
  });
});
