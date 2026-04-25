// ============================================================
// ui.js — Utilitários: Toast, Modal, Format, DOM helpers
// ============================================================

// ─── Toast ────────────────────────────────────────────────────
const Toast = (() => {
  let container;
  function getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  function show(message, type = 'info', duration = 3500) {
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const el    = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
    getContainer().appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);
  }

  return {
    success: m => show(m, 'success'),
    error:   m => show(m, 'error'),
    info:    m => show(m, 'info'),
    warning: m => show(m, 'warning'),
  };
})();

// ─── Modal ────────────────────────────────────────────────────
const Modal = {
  open(el)  { el.classList.add('open'); document.body.style.overflow = 'hidden'; },
  close(el) { el.classList.remove('open'); document.body.style.overflow = ''; },
  bindOutsideClick(el) {
    el.addEventListener('click', e => { if (e.target === el) Modal.close(el); });
  },
};

// ─── Formatters ───────────────────────────────────────────────
const Format = {
  currency: v =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v),

  date: iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),

  fullDate: iso => new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }),

  timeAgo(iso) {
    const d = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (d < 60)   return `${d}s atrás`;
    if (d < 3600) return `${Math.floor(d / 60)}min atrás`;
    return `${Math.floor(d / 3600)}h atrás`;
  },

  statusLabel(s) {
    return { recebido:'Recebido', em_preparo:'Em preparo', pronto:'Pronto', entregue:'Entregue', cancelado:'Cancelado' }[s] || s;
  },
};

// ─── DOM helpers ──────────────────────────────────────────────
function qs(sel, parent = document)  { return parent.querySelector(sel); }
function qsa(sel, parent = document) { return Array.from(parent.querySelectorAll(sel)); }

function setLoading(btn, loading) {
  if (loading) {
    btn._orig    = btn.innerHTML;
    btn.innerHTML = '<span style="opacity:.6">Aguarde…</span>';
    btn.disabled  = true;
  } else {
    btn.innerHTML = btn._orig || btn.innerHTML;
    btn.disabled  = false;
  }
}

// ─── Mini bar chart (SVG puro) ────────────────────────────────
function renderBarChart(containerId, data, colorVar = '--accent') {
  const container = qs(`#${containerId}`);
  if (!container || !data.length) return;

  const max    = Math.max(...data.map(d => d.total), 1);
  const W      = container.clientWidth || 400;
  const H      = 100;
  const barW   = Math.floor((W - data.length * 4) / data.length);

  const bars = data.map((d, i) => {
    const barH = Math.max(2, Math.round((d.total / max) * (H - 24)));
    const x    = i * (barW + 4);
    const y    = H - 20 - barH;
    return `
      <g>
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}"
          fill="var(${colorVar})" opacity=".8" rx="3"/>
        <text x="${x + barW / 2}" y="${H - 4}" text-anchor="middle"
          font-size="9" fill="var(--text-muted)">${d.label}</text>
      </g>`;
  }).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
      style="width:100%;height:${H}px;overflow:visible">${bars}</svg>`;
}

// ─── Confirm dialog (substitui alert nativo) ──────────────────
function confirmDialog(message) {
  return window.confirm(message);
}

// Expõe globalmente
window.Toast         = Toast;
window.Modal         = Modal;
window.Format        = Format;
window.qs            = qs;
window.qsa           = qsa;
window.setLoading    = setLoading;
window.renderBarChart= renderBarChart;
window.confirmDialog = confirmDialog;
