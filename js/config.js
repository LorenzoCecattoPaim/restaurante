// ============================================================
// config.js — Configuração do frontend
// EDITE AQUI a URL do seu backend no Render após o deploy
// ============================================================

const CONFIG = {
  API_URL: 'https://pedemesa.onrender.com',

  // Intervalo de polling para pedidos (ms)
  POLL_INTERVAL: 8000,
};

// Expõe a URL para o api.js via window
window.API_BASE_URL = CONFIG.API_URL;

window.CONFIG = CONFIG;
