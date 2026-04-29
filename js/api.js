// ============================================================
// api.js — Cliente HTTP centralizado
// window.API_BASE_URL é definido pelo config.js
// ============================================================

const API_BASE = (window.API_BASE_URL || '').replace(/\/$/, '') + '/api';

function getToken() {
  return localStorage.getItem('rs_token') || '';
}

function goToLogin() {
  const isLocal = location.protocol === 'file:' ||
    location.port === '8080' || location.port === '5500';
  window.location.href = isLocal ? '/login.html' : '/login';
}

async function request(method, path, body = null, retries = 2) {
  const headers = { 'Content-Type': 'application/json' };
  const token   = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res  = await fetch(API_BASE + path, opts);

      if (res.status === 401 && !path.includes('/auth/')) {
        localStorage.removeItem('rs_token');
        localStorage.removeItem('rs_user');
        goToLogin();
        return;
      }

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Muitas requisições. Aguarde um momento.');
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
      return data;

    } catch (err) {
      const isNetwork = err instanceof TypeError;
      if (!isNetwork || attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

const API = {
  auth: {
    login:  (u, p) => request('POST', '/auth/login', { username: u, password: p }),
    logout: ()     => request('POST', '/auth/logout'),
    me:     ()     => request('GET',  '/auth/me'),
  },
  products: {
    list:   ()       => request('GET',    '/products'),
    create: d        => request('POST',   '/products', d),
    update: (id, d)  => request('PUT',    `/products/${id}`, d),
    remove: id       => request('DELETE', `/products/${id}`),
  },
  orders: {
    list:         ()           => request('GET',  '/orders'),
    get:          id           => request('GET',  `/orders/${id}`),
    create:       d            => request('POST', '/orders', d),
    updateStatus: (id, status) => request('PUT',  `/orders/${id}/status`, { status }),
  },
  dashboard: {
    stats: () => request('GET', '/dashboard'),
  },
  categories: {
    list:   ()     => request('GET',    '/categories'),
    create: name   => request('POST',   '/categories', { name }),
    remove: name   => request('DELETE', `/categories/${encodeURIComponent(name)}`),
  },
  settings: {
    get:    ()  => request('GET', '/settings'),
    update: d   => request('PUT', '/settings', d),
  },
};

window.API = API;
