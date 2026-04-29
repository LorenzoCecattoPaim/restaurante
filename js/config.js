// ============================================================
// config.js — Configuração do frontend
// EDITE AQUI a URL do seu backend no Render após o deploy
// ============================================================

const CONFIG = {
  // URL do backend no Render.
  // Em desenvolvimento: deixe vazio ou use 'http://localhost:3000'
  // Em produção: cole a URL do Render, ex: 'https://restauros-api.onrender.com'
  API_URL: 'https://restauros-api.onrender.com',

  // Intervalo de polling para pedidos (ms)
  POLL_INTERVAL: 8000,
};

// Expõe a URL para o api.js via window
window.API_BASE_URL = CONFIG.API_URL;

window.CONFIG = CONFIG;
