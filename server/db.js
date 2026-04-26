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
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

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
      { id:1, username: process.env.ADMIN_USER     || 'admin',   password: process.env.ADMIN_PASS     || 'admin123',   role:'admin',   name:'Administrador' },
      { id:2, username: process.env.KITCHEN_USER   || 'cozinha', password: process.env.KITCHEN_PASS   || 'cozinha123', role:'kitchen', name:'Cozinha' },
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

let _db           = null;
let _persistTimer = null;

// ─── Init ─────────────────────────────────────────────────────
function initDB(callback) {
  if (IS_PROD) {
    // Produção: começa sempre do seed (filesystem efêmero)
    _db = buildSeed();
    console.log('⚡ Banco em memória (modo produção)');
    console.log('   → Para persistência: configure Railway Volumes apontando para /app/data');
    callback();
    return;
  }

  // Desenvolvimento: persiste em arquivo
  const dataDir = path.dirname(DB_PATH);
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

  persist();
  callback();
}

// ─── Persistência (só em dev) ─────────────────────────────────
function persist() {
  if (IS_PROD) return; // produção não persiste em arquivo
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(_db, null, 2), 'utf8');
    } catch (e) {
      console.error('Erro ao salvar DB:', e.message);
    }
  }, 300);
}

function getDB()     { return _db; }
function markDirty() { persist(); }

module.exports = { initDB, getDB, markDirty };
