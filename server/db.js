// ============================================================
// db.js — Banco de dados com dois modos:
//
//  DESENVOLVIMENTO (local):
//    Persiste em data/db.json — dados sobrevivem ao restart
//
//  PRODUÇÃO (Railway, Render, etc.):
//    Filesystem efêmero → dados ficam em memória
//    Para persistência real em produção: usar Railway Volumes
//    ou migrar para PostgreSQL (ver README)
// ============================================================

const fs   = require('fs');
const path = require('path');

const IS_PROD = process.env.NODE_ENV === 'production';
// DATA_DIR (opcional): diretório persistente (ex.: disco do Render/Railway).
// Quando definido, o banco é salvo em arquivo também em produção.
// DB_MEMORY=1 força modo memória (usado pelos testes automatizados).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH  = path.join(DATA_DIR, 'db.json');
const PERSIST  = process.env.DB_MEMORY !== '1' && (!IS_PROD || !!process.env.DATA_DIR);

// ─── Dados iniciais (seed) ────────────────────────────────────
function buildSeed() {
  const now = new Date().toISOString();
  return {
    products: [
      { id:1, name:'X-Burguer Clássico', description:'Pão brioche, blend 180g, queijo cheddar, alface, tomate e molho especial', price:28.90, category:'Lanches', image:'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400', active:true, createdAt:now },
      { id:2, name:'X-Bacon Duplo', description:'Pão brioche, dois blends 150g, bacon crocante, queijo prato, cebola caramelizada', price:38.90, category:'Lanches', image:'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400', active:true, createdAt:now },
      { id:3, name:'Fritas Grandes', description:'Porção generosa de batatas fritas crocantes com sal temperado', price:18.90, category:'Acompanhamentos', image:'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400', active:true, createdAt:now },
      { id:4, name:'Coca-Cola 350ml', description:'Lata gelada', price:7.00, category:'Bebidas', image:'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400', active:true, createdAt:now },
      { id:5, name:'Milk Shake Chocolate', description:'Sorvete premium, leite integral, calda de chocolate belga', price:22.90, category:'Bebidas', image:'https://images.unsplash.com/photo-1572490122747-3a3c35d6b4f0?w=400', active:true, createdAt:now },
      { id:6, name:'Onion Rings', description:'Anéis de cebola empanados, crocantes, com molho ranch', price:16.90, category:'Acompanhamentos', image:'https://images.unsplash.com/photo-1639024471283-03518883512d?w=400', active:false, createdAt:now },
      { id:7, name:'Brownie com Sorvete', description:'Brownie quentinho de chocolate com bola de sorvete de baunilha', price:19.90, category:'Sobremesas', image:'https://images.unsplash.com/photo-1606313564004-4cb8b5f56f8d?w=400', active:true, createdAt:now },
    ],
    orders: [],
    categories: ['Lanches', 'Acompanhamentos', 'Bebidas', 'Sobremesas', 'Combos', 'Entradas'],
    users: [
      { id:1, username: process.env.ADMIN_USER     || 'admin',   password: process.env.ADMIN_PASS     || 'Lore4545!',   role:'admin',   name:'Administrador', active:true, phone:'', createdAt:now },
      { id:2, username: process.env.KITCHEN_USER   || 'cozinha', password: process.env.KITCHEN_PASS   || 'Lore4545!', role:'kitchen', name:'Cozinha', active:true, phone:'', createdAt:now },
    ],
    settings: {
      restaurantName: process.env.RESTAURANT_NAME || 'RestaurOS',
      address:        process.env.RESTAURANT_ADDR || '',
      phone:          process.env.RESTAURANT_PHONE || '',
      openTime:  '11:00',
      closeTime: '23:00',
    },
    sessions: {},
    _nextProductId: 8,
    _nextOrderId:   1,
  };
}

// ─── Garante a estrutura das entidades novas ──────────────────
// Funciona como uma "migration" idempotente: bancos antigos (db.json)
// recebem as coleções novas sem perder nada do que já existe.
function ensureShape(db) {
  if (!Array.isArray(db.waiterCalls)) db.waiterCalls = [];   // chamados de garçom
  if (!Array.isArray(db.payments))    db.payments    = [];   // pagamentos de contas
  if (!Array.isArray(db.auditLog))    db.auditLog    = [];   // trilha de auditoria (append-only)
  if (!db._nextCallId)    db._nextCallId    = db.waiterCalls.reduce((m, c) => Math.max(m, c.id), 0) + 1;
  if (!db._nextPaymentId) db._nextPaymentId = db.payments.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  if (!db._nextAuditId)   db._nextAuditId   = db.auditLog.reduce((m, a) => Math.max(m, a.id), 0) + 1;

  db.settings = db.settings || {};
  // Segundos até um chamado pendente ser destacado no painel
  if (db.settings.callAlertSeconds === undefined) db.settings.callAlertSeconds = 180;
  // Total de mesas do salão (0 = não informado → "mesas ocupadas" sem denominador)
  if (db.settings.tableCount === undefined) db.settings.tableCount = 0;

  // "Migration" idempotente: usuários de bancos antigos (db.json) não tinham
  // active/phone/createdAt — passam a existir com um valor padrão seguro.
  const seedNow = new Date().toISOString();
  for (const u of db.users) {
    if (u.active === undefined)   u.active    = true;
    if (u.phone === undefined)    u.phone     = '';
    if (!u.createdAt)             u.createdAt = seedNow;
  }
  if (!db._nextUserId) db._nextUserId = db.users.reduce((m, u) => Math.max(m, u.id), 0) + 1;

  // Garçons: WAITERS="joao:senha1,maria:senha2" (opcional — bootstrap por env var;
  // o cadastro normal agora também pode ser feito pela tela Equipe do admin)
  const waiters = (process.env.WAITERS || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const entry of waiters) {
    const sep = entry.indexOf(':');
    if (sep <= 0) continue;
    const username = entry.slice(0, sep).trim();
    const password = entry.slice(sep + 1);
    const existing = db.users.find(u => u.username === username);
    if (existing) {
      if (existing.role === 'waiter') existing.password = password;
      continue;
    }
    const name = username.charAt(0).toUpperCase() + username.slice(1);
    db.users.push({ id: db._nextUserId++, username, password, role: 'waiter', name, active: true, phone: '', createdAt: seedNow });
  }
  return db;
}

let _db           = null;
let _persistTimer = null;

// ─── Init ─────────────────────────────────────────────────────
function initDB(callback) {
  if (!PERSIST) {
    // Produção sem DATA_DIR: começa sempre do seed (filesystem efêmero)
    _db = ensureShape(buildSeed());
    console.log('⚡ Banco em memória — dados são perdidos ao reiniciar!');
    console.log('   → Para persistência: defina DATA_DIR apontando para um disco persistente');
    callback();
    return;
  }

  // Desenvolvimento: persiste em arquivo
  const dataDir = DATA_DIR;
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    try {
      _db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      // Garante estrutura mínima para versões antigas do arquivo
      if (!_db.settings)  _db.settings  = buildSeed().settings;
      if (!_db.users)     _db.users      = buildSeed().users;
      if (!_db.sessions)  _db.sessions   = {};
      console.log('✅ Banco carregado:', DB_PATH);
    } catch {
      _db = buildSeed();
      console.warn('⚠️  DB corrompido — recriado do zero');
    }
  } else {
    _db = buildSeed();
    console.log('✅ Banco criado:', DB_PATH);
  }

  ensureShape(_db);
  persist();
  callback();
}

// ─── Persistência (só em dev) ─────────────────────────────────
function persist() {
  if (!PERSIST) return; // modo memória não persiste em arquivo
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    try {
      // Escrita atômica: grava em arquivo temporário e renomeia
      const tmp = DB_PATH + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(_db, null, 2), 'utf8');
      fs.renameSync(tmp, DB_PATH);
    } catch (e) {
      console.error('Erro ao salvar DB:', e.message);
    }
  }, 300);
}

// Grava imediatamente (usado no desligamento para não perder o último debounce)
function flush() {
  if (!PERSIST || !_db) return;
  clearTimeout(_persistTimer);
  try {
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(_db, null, 2), 'utf8');
    fs.renameSync(tmp, DB_PATH);
  } catch (e) {
    console.error('Erro ao salvar DB:', e.message);
  }
}

function getDB()     { return _db; }
function markDirty() { persist(); }

module.exports = { initDB, getDB, markDirty, flush, ensureShape, IS_PERSISTENT: PERSIST };
