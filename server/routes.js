// ============================================================
// routes.js — Roteador da API REST
// ============================================================

const { ProductsController, OrdersController, DashboardController } = require('./controllers');
const { AuthController, SettingsController, CategoriesController, requireAuth } = require('./auth');
const { CallsController }                        = require('./calls');
const { AccountsController, PaymentsController } = require('./accounts');
const { AnalyticsController }                    = require('./analytics');
const { EmployeesController }                    = require('./employees');

function json(res, status, data) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Perfis:
//   admin   → acesso total (inclui financeiro e análises)
//   kitchen → mesmas rotas de antes (pedidos/produtos/etc.), sem financeiro/contas/chamados
//   waiter  → pedidos, chamados e contas (sem desconto, sem financeiro)
const WAITER_ALLOWED = new Set(['orders', 'calls', 'accounts']);

function route(req, res, parsed) {
  const method   = req.method;
  const pathname = parsed.pathname;                      // /api/orders/3/status
  const query    = parsed.query || {};
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

  // ── Chamado de garçom (público, a partir da página da mesa) ─
  if (resource === 'calls') {
    if (method === 'POST' && !idRaw)                            return CallsController.create(req, res);
    if (method === 'GET'  && id && sub === 'public')            return CallsController.publicGet(req, res, id, query);
    if (method === 'POST' && id && sub === 'client-cancel')     return CallsController.publicCancel(req, res, id);
  }

  // ── Tudo abaixo exige autenticação ─────────────────────────
  const authed = requireAuth(req, res, null, ['admin', 'kitchen', 'waiter']);
  if (!authed) return;

  // Garçom só acessa as áreas operacionais dele
  if (req.user.role === 'waiter' && !WAITER_ALLOWED.has(resource))
    return json(res, 403, { error: 'Acesso negado para o seu perfil' });

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

  // ── Chamados (equipe) ───────────────────────────────────
  if (resource === 'calls') {
    if (method === 'GET'  && !idRaw)                   return CallsController.list(req, res, query);
    if (method === 'POST' && id && sub === 'accept')   return CallsController.accept(req, res, id);
    if (method === 'POST' && id && sub === 'complete') return CallsController.complete(req, res, id);
    if (method === 'POST' && id && sub === 'cancel')   return CallsController.cancel(req, res, id);
  }

  // ── Contas das mesas ────────────────────────────────────
  if (resource === 'accounts') {
    if (method === 'GET'  && !idRaw)                   return AccountsController.list(req, res);
    if (method === 'GET'  && idRaw && !sub)            return AccountsController.get(req, res, idRaw);
    if (method === 'POST' && idRaw && sub === 'pay')   return AccountsController.pay(req, res, idRaw);
  }

  // ── Pagamentos / auditoria (gerente) ────────────────────
  if (resource === 'payments') {
    if (method === 'GET'  && !idRaw)                   return PaymentsController.list(req, res, query);
    if (method === 'POST' && id && sub === 'void')     return PaymentsController.void(req, res, id);
  }
  if (resource === 'audit' && method === 'GET')        return PaymentsController.auditLog(req, res, query);

  // ── Equipe (garçons e cozinha — gerente) ────────────────
  if (resource === 'employees') {
    if (method === 'GET'  && !idRaw)                        return EmployeesController.list(req, res);
    if (method === 'POST' && !idRaw)                        return EmployeesController.create(req, res);
    if (method === 'GET'  &&  id && !sub)                   return EmployeesController.detail(req, res, id, query);
    if (method === 'PUT'  &&  id && !sub)                   return EmployeesController.update(req, res, id);
    if (method === 'POST' &&  id && sub === 'activate')     return EmployeesController.setActive(req, res, id, true);
    if (method === 'POST' &&  id && sub === 'deactivate')   return EmployeesController.setActive(req, res, id, false);
  }

  // ── Financeiro e análises (gerente) ─────────────────────
  if (resource === 'finance'  && method === 'GET')     return AnalyticsController.finance(req, res, query);
  if (resource === 'overview' && method === 'GET')     return AnalyticsController.overview(req, res, query);
  if (resource === 'analytics' && method === 'GET') {
    if (idRaw === 'service') return AnalyticsController.service(req, res, query);
    if (idRaw === 'tables')  return AnalyticsController.tables(req, res, query);
  }

  json(res, 404, { error: `Rota não encontrada: ${method} ${pathname}` });
}

// Captura erros síncronos E assíncronos (antes, um JSON inválido em rota
// async deixava a requisição sem resposta).
function handleError(res, err) {
  if (err && err.status) return json(res, err.status, { error: err.message, ...(err.extra || {}) });
  if (err && err.message === 'JSON inválido') return json(res, 400, { error: 'JSON inválido' });
  console.error('[router]', err);
  json(res, 500, { error: 'Erro interno do servidor' });
}

function router(req, res, parsed) {
  try {
    const result = route(req, res, parsed);
    if (result && typeof result.catch === 'function') result.catch(err => handleError(res, err));
  } catch (err) {
    handleError(res, err);
  }
}

module.exports = { router };
