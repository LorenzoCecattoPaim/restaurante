// ============================================================
// db.js — Persistência em arquivo JSON
// Em produção: trocar por better-sqlite3 ou PostgreSQL
// ============================================================

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const SEED = {
  products: [
    { id:1, name:'X-Burguer Clássico', description:'Pão brioche, blend 180g, queijo cheddar, alface, tomate e molho especial', price:28.90, category:'Lanches', image:'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400', active:true, createdAt: new Date().toISOString() },
    { id:2, name:'X-Bacon Duplo', description:'Pão brioche, dois blends 150g, bacon crocante, queijo prato, cebola caramelizada', price:38.90, category:'Lanches', image:'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400', active:true, createdAt: new Date().toISOString() },
    { id:3, name:'Fritas Grandes', description:'Porção generosa de batatas fritas crocantes com sal temperado', price:18.90, category:'Acompanhamentos', image:'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400', active:true, createdAt: new Date().toISOString() },
    { id:4, name:'Coca-Cola 350ml', description:'Lata gelada', price:7.00, category:'Bebidas', image:'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400', active:true, createdAt: new Date().toISOString() },
    { id:5, name:'Milk Shake Chocolate', description:'Sorvete premium, leite integral, calda de chocolate belga', price:22.90, category:'Bebidas', image:'https://images.unsplash.com/photo-1572490122747-3a3c35d6b4f0?w=400', active:true, createdAt: new Date().toISOString() },
    { id:6, name:'Onion Rings', description:'Anéis de cebola empanados, crocantes, com molho ranch', price:16.90, category:'Acompanhamentos', image:'https://images.unsplash.com/photo-1639024471283-03518883512d?w=400', active:false, createdAt: new Date().toISOString() },
    { id:7, name:'Brownie com Sorvete', description:'Brownie quentinho de chocolate com uma bola de sorvete de baunilha', price:19.90, category:'Sobremesas', image:'https://images.unsplash.com/photo-1606313564004-4cb8b5f56f8d?w=400', active:true, createdAt: new Date().toISOString() },
  ],
  orders: [
    { id:1, tableNumber:'05', customerName:'João Silva', items:[{productId:1,productName:'X-Burguer Clássico',quantity:2,unitPrice:28.90},{productId:3,productName:'Fritas Grandes',quantity:1,unitPrice:18.90},{productId:4,productName:'Coca-Cola 350ml',quantity:2,unitPrice:7.00}], total:90.70, status:'em_preparo', notes:'', createdAt: new Date(Date.now()-8*60000).toISOString(), updatedAt: new Date(Date.now()-5*60000).toISOString() },
    { id:2, tableNumber:'12', customerName:'Maria Oliveira', items:[{productId:2,productName:'X-Bacon Duplo',quantity:1,unitPrice:38.90},{productId:5,productName:'Milk Shake Chocolate',quantity:1,unitPrice:22.90}], total:61.80, status:'pronto', notes:'Sem cebola no burguer', createdAt: new Date(Date.now()-20*60000).toISOString(), updatedAt: new Date(Date.now()-2*60000).toISOString() },
    { id:3, tableNumber:'03', customerName:'Carlos Mendes', items:[{productId:1,productName:'X-Burguer Clássico',quantity:3,unitPrice:28.90},{productId:3,productName:'Fritas Grandes',quantity:2,unitPrice:18.90},{productId:4,productName:'Coca-Cola 350ml',quantity:3,unitPrice:7.00}], total:145.50, status:'entregue', notes:'', createdAt: new Date(Date.now()-60*60000).toISOString(), updatedAt: new Date(Date.now()-40*60000).toISOString() },
    { id:4, tableNumber:'07', customerName:'Ana Costa', items:[{productId:2,productName:'X-Bacon Duplo',quantity:2,unitPrice:38.90},{productId:5,productName:'Milk Shake Chocolate',quantity:2,unitPrice:22.90},{productId:3,productName:'Fritas Grandes',quantity:1,unitPrice:18.90}], total:141.60, status:'recebido', notes:'Urgente!', createdAt: new Date(Date.now()-2*60000).toISOString(), updatedAt: new Date(Date.now()-1*60000).toISOString() },
  ],
  categories: ['Lanches', 'Acompanhamentos', 'Bebidas', 'Sobremesas', 'Combos', 'Entradas'],
  users: [
    { id:1, username:'admin', password:'admin123', role:'admin', name:'Administrador' },
    { id:2, username:'cozinha', password:'cozinha123', role:'kitchen', name:'Cozinha' },
  ],
  settings: {
    restaurantName: 'RestaurOS',
    address: 'Rua das Flores, 123',
    phone: '(54) 99999-9999',
    openTime: '11:00',
    closeTime: '23:00',
  },
  sessions: {},
  _nextProductId: 8,
  _nextOrderId: 5,
};

let _db = null;
let _persistTimer = null;

function initDB(callback) {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    try {
      _db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      if (!_db.settings)   _db.settings  = SEED.settings;
      if (!_db.users)      _db.users      = SEED.users;
      if (!_db.sessions)   _db.sessions   = {};
      console.log('✅ Banco carregado:', DB_PATH);
    } catch {
      _db = JSON.parse(JSON.stringify(SEED));
      console.warn('⚠️  DB corrompido — recriado do zero');
    }
  } else {
    _db = JSON.parse(JSON.stringify(SEED));
    console.log('✅ Banco criado:', DB_PATH);
  }

  persist();
  callback();
}

function persist() {
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(_db, null, 2), 'utf8');
    } catch (e) {
      console.error('Erro ao persistir:', e.message);
    }
  }, 300);
}

function getDB()     { return _db; }
function markDirty() { persist(); }

module.exports = { initDB, getDB, markDirty };
