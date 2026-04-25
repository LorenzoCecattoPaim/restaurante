// ============================================================
// api.js — Cliente HTTP centralizado
// Injeta Authorization header automaticamente
// ============================================================

const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('rs_token') || '';
}

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token   = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(API_BASE + path, opts);

  // Redireciona para login se não autorizado
  if (res.status === 401 && !path.includes('/auth/')) {
    localStorage.removeItem('rs_token');
    localStorage.removeItem('rs_user');
    window.location.href = '/login';
    return;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

const API = {
  // Auth
  auth: {
    login:  (u, p)   => request('POST', '/auth/login', { username: u, password: p }),
    logout: ()        => request('POST', '/auth/logout'),
    me:     ()        => request('GET',  '/auth/me'),
  },

  // Produtos
  products: {
    list:   ()         => request('GET',    '/products'),
    create: (d)        => request('POST',   '/products', d),
    update: (id, d)    => request('PUT',    `/products/${id}`, d),
    remove: (id)       => request('DELETE', `/products/${id}`),
  },

  // Pedidos
  orders: {
    list:         ()           => request('GET',  '/orders'),
    get:          (id)         => request('GET',  `/orders/${id}`),
    create:       (d)          => request('POST', '/orders', d),
    updateStatus: (id, status) => request('PUT',  `/orders/${id}/status`, { status }),
  },

  // Dashboard
  dashboard: {
    stats: () => request('GET', '/dashboard'),
  },

  // Categorias
  categories: {
    list:   ()    => request('GET',    '/categories'),
    create: (name)=> request('POST',   '/categories', { name }),
    remove: (name)=> request('DELETE', `/categories/${encodeURIComponent(name)}`),
  },

  // Configurações
  settings: {
    get:    ()  => request('GET', '/settings'),
    update: (d) => request('PUT', '/settings', d),
  },
};

window.API = API;
