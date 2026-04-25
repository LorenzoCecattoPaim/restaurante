// ============================================================
// app.js — Bootstrap, auth guard e navegação
// ============================================================

const App = (() => {
  let _current = 'dashboard';

  // ─── Auth guard ────────────────────────────────────────────
  async function checkAuth() {
    const token = localStorage.getItem('rs_token');
    if (!token) { window.location.href = '/login'; return false; }
    try {
      await API.auth.me();
      return true;
    } catch {
      localStorage.removeItem('rs_token');
      window.location.href = '/login';
      return false;
    }
  }

  // ─── Logout ────────────────────────────────────────────────
  async function logout() {
    try { await API.auth.logout(); } catch {}
    localStorage.removeItem('rs_token');
    localStorage.removeItem('rs_user');
    window.location.href = '/login';
  }

  // ─── Navegação ─────────────────────────────────────────────
  function navigate(section) {
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
    };
    const el = qs('#header-title');
    if (el) el.textContent = titles[section] || section;

    _current = section;

    if (section === 'dashboard') Dashboard.load();
    if (section === 'orders')    Orders.load();
    if (section === 'settings')  Settings.load();
  }

  // ─── Init ──────────────────────────────────────────────────
  async function init() {
    const ok = await checkAuth();
    if (!ok) return;

    // Mostra nome do usuário
    const user = JSON.parse(localStorage.getItem('rs_user') || '{}');
    const nameEl = qs('#user-name');
    const roleEl = qs('#user-role');
    if (nameEl) nameEl.textContent = user.name || 'Admin';
    if (roleEl) roleEl.textContent = user.role === 'admin' ? 'Gerente' : 'Cozinha';
    const avatar = qs('#user-avatar');
    if (avatar) avatar.textContent = (user.name || 'A')[0].toUpperCase();

    // Bind nav
    qsa('.nav-item[data-nav]').forEach(item => {
      item.addEventListener('click', () => navigate(item.dataset.nav));
    });

    // Logout
    qs('#btn-logout')?.addEventListener('click', logout);

    // Inicia módulos
    await Promise.all([
      Dashboard.init(),
      Products.init(),
      Orders.init(),
      Settings.init(),
    ]);

    navigate('dashboard');

    // Atualiza dashboard periodicamente
    setInterval(() => { if (_current === 'dashboard') Dashboard.load(); }, 30000);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { navigate, logout };
})();

window.App = App;
