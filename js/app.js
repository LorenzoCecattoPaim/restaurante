// ============================================================
// app.js — Bootstrap, auth guard e navegação
// ============================================================

const App = (() => {
  let _current = 'dashboard';

  // Telas liberadas por perfil (o servidor também valida cada rota)
  const ROLE_SECTIONS = {
    admin:   ['dashboard', 'orders', 'calls', 'accounts', 'finance', 'analytics', 'products', 'settings'],
    kitchen: ['dashboard', 'orders', 'products', 'settings'],
    waiter:  ['calls', 'accounts', 'orders'],
  };
  const ROLE_LABEL = { admin: 'Gerente', kitchen: 'Cozinha', waiter: 'Garçom' };
  const _user = () => JSON.parse(localStorage.getItem('rs_user') || '{}');
  const allowed = () => ROLE_SECTIONS[_user().role] || ROLE_SECTIONS.kitchen;
  const can = section => allowed().includes(section);

  // ─── Auth guard ────────────────────────────────────────────
  async function checkAuth() {
    const token = localStorage.getItem('rs_token');
    if (!token) { redirect('/login'); return false; }
    try {
      await API.auth.me();
      return true;
    } catch {
      localStorage.removeItem('rs_token');
      localStorage.removeItem('rs_user');
      redirect('/login');
      return false;
    }
  }

  // Redireciona corretamente: /login → /login.html em file://,
  // /login em Vercel (vercel.json cuida do roteamento)
  function redirect(path) {
    // Se estiver rodando como arquivo local, usa .html
    if (location.protocol === 'file:' || location.port === '8080' || location.port === '5500') {
      window.location.href = path + '.html';
    } else {
      window.location.href = path;
    }
  }

  // ─── Logout ────────────────────────────────────────────────
  async function logout() {
    try { await API.auth.logout(); } catch {}
    localStorage.removeItem('rs_token');
    localStorage.removeItem('rs_user');
    redirect('/login');
  }

  // ─── Navegação ─────────────────────────────────────────────
  function navigate(section) {
    if (!can(section)) section = allowed()[0];
    qsa('.section').forEach(s => s.classList.remove('active'));
    const target = qs(`#section-${section}`);
    if (target) target.classList.add('active');

    qsa('.nav-item[data-nav]').forEach(i => i.classList.remove('active'));
    qs(`[data-nav="${section}"]`)?.classList.add('active');

    const titles = {
      dashboard: 'Dashboard',
      orders:    'Pedidos',
      products:  'Produtos',
      settings:  'Configurações',
      calls:     'Chamados',
      accounts:  'Contas',
      finance:   'Financeiro',
      analytics: 'Análises',
    };
    const el = qs('#header-title');
    if (el) el.textContent = titles[section] || section;

    _current = section;

    if (section === 'dashboard') Dashboard.load();
    if (section === 'orders')    Orders.load();
    if (section === 'settings')  Settings.load();
    if (section === 'calls')     Calls.load();
    if (section === 'accounts')  Accounts.load();
    if (section === 'finance')   Finance.load();
    if (section === 'analytics') Analytics.load();
  }

  // Esconde itens de menu fora do perfil (e rótulos de grupo que ficarem vazios)
  function applyRoleNav() {
    qsa('.nav-item[data-nav]').forEach(i => { i.hidden = !can(i.dataset.nav); });
    qsa('.nav-label').forEach(label => {
      let el = label.nextElementSibling, any = false;
      while (el && !el.classList.contains('nav-label')) {
        if (el.matches('.nav-item[data-nav]') && !el.hidden) any = true;
        el = el.nextElementSibling;
      }
      label.hidden = !any;
    });
  }

  // ─── Init ──────────────────────────────────────────────────
  async function init() {
    const ok = await checkAuth();
    if (!ok) return;

    const user = _user();
    const nameEl = qs('#user-name');
    const roleEl = qs('#user-role');
    if (nameEl) nameEl.textContent = user.name || 'Admin';
    if (roleEl) roleEl.textContent = ROLE_LABEL[user.role] || 'Cozinha';
    applyRoleNav();
    if (user.role === 'waiter') { const k = qs('#link-kitchen'); if (k) k.hidden = true; }
    const avatar = qs('#user-avatar');
    if (avatar) avatar.textContent = (user.name || 'A')[0].toUpperCase();

    qsa('.nav-item[data-nav]').forEach(item => {
      item.addEventListener('click', () => navigate(item.dataset.nav));
    });

    qs('#btn-logout')?.addEventListener('click', logout);

    // Inicializa apenas os módulos que o perfil pode usar
    const inits = [];
    if (can('dashboard')) inits.push(Dashboard.init());
    if (can('products'))  inits.push(Products.init());
    if (can('orders'))    inits.push(Orders.init());
    if (can('settings'))  inits.push(Settings.init());
    if (can('calls'))     inits.push(Calls.init());
    if (can('accounts'))  inits.push(Accounts.init());
    if (can('finance'))   Finance.init();
    if (can('analytics')) Analytics.init();
    await Promise.all(inits);

    navigate(allowed()[0]);

    setInterval(() => { if (_current === 'dashboard') Dashboard.load(); }, 30000);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { navigate, logout, can, current: () => _current };
})();

window.App = App;
