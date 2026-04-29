// ============================================================
// routes.js — Roteador da API REST
// ============================================================

const { ProductsController, OrdersController, DashboardController } = require('./controllers');
const { AuthController, SettingsController, CategoriesController, requireAuth } = require('./auth');

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function router(req, res, parsed) {
  const method   = req.method;
  const pathname = parsed.pathname;                      // /api/orders/3/status
  const segments = pathname.replace(/^\/api\//, '').split('/');
  const resource = segments[0];
  const idRaw    = segments[1];
  const sub      = segments[2];
  const id       = idRaw && !isNaN(idRaw) ? parseInt(idRaw, 10) : null;

  // ── Auth (pública) ─────────────────────────────────────────
  if (resource === 'auth') {
    if (method === 'POST' && idRaw === 'login')  return AuthController.login(req, res);
    if (method === 'POST' && idRaw === 'logout') return AuthController.logout(req, res);
    if (method === 'GET'  && idRaw === 'me')     return AuthController.me(req, res);
  }

  // ── Cardápio público (somente leitura, sem auth) ──────────
  if (resource === 'products' && method === 'GET' && !id)
    return ProductsController.list(req, res);

  if (resource === 'categories' && method === 'GET')
    return CategoriesController.list(req, res);

  if (resource === 'orders' && method === 'POST' && !id)
    return OrdersController.create(req, res);

  // ── Tudo abaixo exige autenticação ─────────────────────────
  const authed = requireAuth(req, res);
  if (!authed) return;

  try {
    // ── Dashboard ───────────────────────────────────────────
    if (resource === 'dashboard' && method === 'GET')
      return DashboardController.stats(req, res);

    // ── Settings ────────────────────────────────────────────
    if (resource === 'settings') {
      if (method === 'GET')  return SettingsController.get(req, res);
      if (method === 'PUT')  return SettingsController.update(req, res);
    }

    // ── Products ────────────────────────────────────────────
    if (resource === 'products') {
      if (method === 'POST'   && !id)  return ProductsController.create(req, res);
      if (method === 'PUT'    &&  id)  return ProductsController.update(req, res, id);
      if (method === 'DELETE' &&  id)  return ProductsController.remove(req, res, id);
    }

    // ── Categories ──────────────────────────────────────────
    if (resource === 'categories') {
      if (method === 'POST')   return CategoriesController.create(req, res);
      if (method === 'DELETE') return CategoriesController.remove(req, res, idRaw);
    }

    // ── Orders ──────────────────────────────────────────────
    if (resource === 'orders') {
      if (method === 'GET'  && !id)                      return OrdersController.list(req, res);
      if (method === 'GET'  &&  id)                      return OrdersController.get(req, res, id);
      if (method === 'PUT'  &&  id && sub === 'status')  return OrdersController.updateStatus(req, res, id);
    }

    json(res, 404, { error: `Rota não encontrada: ${method} ${pathname}` });

  } catch (err) {
    console.error('[router]', err);
    json(res, 500, { error: 'Erro interno do servidor' });
  }
}

module.exports = { router };
