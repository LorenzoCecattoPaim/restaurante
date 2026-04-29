// ============================================================
// controllers.js — Lógica de negócio
// ============================================================

const { getDB, markDirty } = require('./db');

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c.toString(); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

// ─── Products ────────────────────────────────────────────────

const ProductsController = {
  list(req, res) {
    const db = getDB();
    json(res, 200, { data: db.products, total: db.products.length });
  },

  async create(req, res) {
    const db   = getDB();
    const body = await readBody(req);

    if (!body.name || !body.price || !body.category)
      return json(res, 400, { error: 'name, price e category são obrigatórios' });

    const product = {
      id:          db._nextProductId++,
      name:        body.name.trim(),
      description: (body.description || '').trim(),
      price:       parseFloat(body.price),
      category:    body.category,
      image:       body.image || '',
      active:      body.active !== undefined ? Boolean(body.active) : true,
      createdAt:   new Date().toISOString(),
    };

    db.products.push(product);
    markDirty();
    json(res, 201, { data: product });
  },

  async update(req, res, id) {
    const db  = getDB();
    const idx = db.products.findIndex(p => p.id === id);
    if (idx === -1) return json(res, 404, { error: 'Produto não encontrado' });

    const body    = await readBody(req);
    const current = db.products[idx];

    db.products[idx] = {
      ...current,
      name:        body.name        !== undefined ? body.name.trim()        : current.name,
      description: body.description !== undefined ? body.description.trim() : current.description,
      price:       body.price       !== undefined ? parseFloat(body.price)  : current.price,
      category:    body.category    !== undefined ? body.category            : current.category,
      image:       body.image       !== undefined ? body.image               : current.image,
      active:      body.active      !== undefined ? Boolean(body.active)     : current.active,
      updatedAt:   new Date().toISOString(),
    };

    markDirty();
    json(res, 200, { data: db.products[idx] });
  },

  remove(req, res, id) {
    const db  = getDB();
    const idx = db.products.findIndex(p => p.id === id);
    if (idx === -1) return json(res, 404, { error: 'Produto não encontrado' });
    db.products.splice(idx, 1);
    markDirty();
    json(res, 200, { message: 'Produto removido' });
  },
};

// ─── Orders ──────────────────────────────────────────────────

const VALID_STATUSES = ['recebido', 'em_preparo', 'pronto', 'entregue', 'cancelado'];

const OrdersController = {
  list(req, res) {
    const db     = getDB();
    const sorted = [...db.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    json(res, 200, { data: sorted, total: sorted.length });
  },

  async create(req, res) {
    const db   = getDB();
    const body = await readBody(req);

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0)
      return json(res, 400, { error: 'items é obrigatório e não pode ser vazio' });

    let items;
    try {
      items = body.items.map(item => {
        const product = db.products.find(p => p.id === item.productId && p.active);
        if (!product) throw new Error(`Produto ${item.productId} não encontrado ou inativo`);
        return {
          productId:   product.id,
          productName: product.name,
          quantity:    Math.max(1, parseInt(item.quantity) || 1),
          unitPrice:   product.price,
        };
      });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }

    const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    const order = {
      id:           db._nextOrderId++,
      tableNumber:  String(body.tableNumber || '00'),
      customerName: (body.customerName || 'Cliente').trim(),
      items,
      total:        parseFloat(total.toFixed(2)),
      status:       'recebido',
      notes:        (body.notes || '').trim(),
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    };

    db.orders.push(order);
    markDirty();
    json(res, 201, { data: order });
  },

  async updateStatus(req, res, id) {
    const db  = getDB();
    const idx = db.orders.findIndex(o => o.id === id);
    if (idx === -1) return json(res, 404, { error: 'Pedido não encontrado' });

    const body = await readBody(req);
    if (!VALID_STATUSES.includes(body.status))
      return json(res, 400, { error: `Status inválido. Use: ${VALID_STATUSES.join(', ')}` });

    db.orders[idx] = { ...db.orders[idx], status: body.status, updatedAt: new Date().toISOString() };
    markDirty();
    json(res, 200, { data: db.orders[idx] });
  },

  get(req, res, id) {
    const db    = getDB();
    const order = db.orders.find(o => o.id === id);
    if (!order) return json(res, 404, { error: 'Pedido não encontrado' });
    json(res, 200, { data: order });
  },
};

// ─── Dashboard ───────────────────────────────────────────────

const DashboardController = {
  stats(req, res) {
    const db    = getDB();
    const today = new Date().toDateString();

    const todayOrders = db.orders.filter(
      o => new Date(o.createdAt).toDateString() === today && o.status !== 'cancelado'
    );

    const revenue = todayOrders.reduce((s, o) => s + o.total, 0);

    // Itens mais vendidos
    const salesMap = {};
    todayOrders.forEach(o => {
      o.items.forEach(item => {
        if (!salesMap[item.productName])
          salesMap[item.productName] = { name: item.productName, quantity: 0, revenue: 0 };
        salesMap[item.productName].quantity += item.quantity;
        salesMap[item.productName].revenue  += item.unitPrice * item.quantity;
      });
    });

    const topItems = Object.values(salesMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)
      .map(i => ({ ...i, revenue: parseFloat(i.revenue.toFixed(2)) }));

    const byStatus = VALID_STATUSES.reduce((acc, s) => {
      acc[s] = db.orders.filter(o => o.status === s).length;
      return acc;
    }, {});

    // Ticket médio
    const avgTicket = todayOrders.length
      ? parseFloat((revenue / todayOrders.length).toFixed(2))
      : 0;

    json(res, 200, {
      data: {
        totalOrdersToday: todayOrders.length,
        revenueToday:     parseFloat(revenue.toFixed(2)),
        avgTicket,
        topItems,
        ordersByStatus:   byStatus,
        activeProducts:   db.products.filter(p => p.active).length,
        totalProducts:    db.products.length,
        // últimas 7h para gráfico (buckets por hora)
        hourlyRevenue:    buildHourly(db.orders),
      }
    });
  },
};

function buildHourly(orders) {
  const now    = new Date();
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const h     = new Date(now - i * 3600000);
    const label = `${String(h.getHours()).padStart(2,'0')}:00`;
    const total = orders
      .filter(o => {
        const oh = new Date(o.createdAt);
        return oh.getHours() === h.getHours() &&
               oh.toDateString() === h.toDateString() &&
               o.status !== 'cancelado';
      })
      .reduce((s, o) => s + o.total, 0);
    result.push({ label, total: parseFloat(total.toFixed(2)) });
  }
  return result;
}

module.exports = { ProductsController, OrdersController, DashboardController };
