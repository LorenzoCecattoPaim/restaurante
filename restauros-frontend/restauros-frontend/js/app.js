// ============================================================
// app.js — Bootstrap, auth guard e navegação
// ============================================================

const App = (() => {
  let _current = 'dashboard';

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

    const user = JSON.parse(localStorage.getItem('rs_user') || '{}');
    const nameEl = qs('#user-name');
    const roleEl = qs('#user-role');
    if (nameEl) nameEl.textContent = user.name || 'Admin';
    if (roleEl) roleEl.textContent = user.role === 'admin' ? 'Gerente' : 'Cozinha';
    const avatar = qs('#user-avatar');
    if (avatar) avatar.textContent = (user.name || 'A')[0].toUpperCase();

    qsa('.nav-item[data-nav]').forEach(item => {
      item.addEventListener('click', () => navigate(item.dataset.nav));
    });

    qs('#btn-logout')?.addEventListener('click', logout);

    await Promise.all([
      Dashboard.init(),
      Products.init(),
      Orders.init(),
      Settings.init(),
    ]);

    navigate('dashboard');

    setInterval(() => { if (_current === 'dashboard') Dashboard.load(); }, 30000);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { navigate, logout };
})();

window.App = App;
