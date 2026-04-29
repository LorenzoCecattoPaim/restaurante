// ============================================================
// ui.js — Utilitários de interface
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
    const el = document.createElement('div');
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
    error:   m => show(m, 'error', 5000),
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

// ─── Confirm dialog customizado (sem alert nativo) ────────────
function confirmDialog(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px">
        <div class="modal-body" style="padding:28px 24px 8px">
          <p style="font-size:.9rem;line-height:1.6;color:var(--text-secondary)">${message}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cd-cancel">Cancelar</button>
          <button class="btn btn-danger" id="cd-confirm">Confirmar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#cd-confirm').addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });
    overlay.querySelector('#cd-cancel').addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); resolve(false); }
    });
  });
}

// ─── Formatters ───────────────────────────────────────────────
const Format = {
  currency: v =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v),

  date: iso =>
    new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),

  fullDate: iso =>
    new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }),

  timeAgo(iso) {
    const d = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (d < 60)   return `${d}s atrás`;
    if (d < 3600) return `${Math.floor(d / 60)}min atrás`;
    return `${Math.floor(d / 3600)}h atrás`;
  },

  elapsed(iso) {
    const m = Math.floor((Date.now() - new Date(iso)) / 60000);
    if (m < 1)  return '< 1 min';
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  },

  statusLabel(s) {
    return {
      recebido:   'Recebido',
      em_preparo: 'Em preparo',
      pronto:     'Pronto',
      entregue:   'Entregue',
      cancelado:  'Cancelado',
    }[s] || s;
  },
};

// ─── DOM helpers ──────────────────────────────────────────────
function qs(sel, parent = document)  { return parent.querySelector(sel); }
function qsa(sel, parent = document) { return Array.from(parent.querySelectorAll(sel)); }

function setLoading(btn, loading) {
  if (loading) {
    btn._orig = btn.innerHTML;
    btn.innerHTML = '<span style="opacity:.6">Aguarde…</span>';
    btn.disabled  = true;
  } else {
    btn.innerHTML = btn._orig || btn.innerHTML;
    btn.disabled  = false;
  }
}

// ─── Skeleton loader ──────────────────────────────────────────
function skeletonRows(count, cols) {
  return Array.from({ length: count }, () =>
    `<tr>${Array.from({ length: cols }, () =>
      `<td><div class="skeleton" style="height:14px;border-radius:4px"></div></td>`
    ).join('')}</tr>`
  ).join('');
}

// ─── Mini bar chart (SVG puro) ────────────────────────────────
function renderBarChart(containerId, data) {
  const container = qs(`#${containerId}`);
  if (!container || !data.length) return;

  const max  = Math.max(...data.map(d => d.total), 1);
  const W    = container.clientWidth || 420;
  const H    = 90;
  const gap  = 4;
  const barW = Math.floor((W - (data.length - 1) * gap) / data.length);

  const bars = data.map((d, i) => {
    const barH  = Math.max(3, Math.round((d.total / max) * (H - 22)));
    const x     = i * (barW + gap);
    const y     = H - 18 - barH;
    const color = d.total > 0 ? 'var(--accent)' : 'var(--bg-active)';
    return `
      <g>
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}"
          fill="${color}" opacity=".85" rx="3">
          <title>${d.label}: ${Format.currency(d.total)}</title>
        </rect>
        <text x="${x + barW / 2}" y="${H - 2}" text-anchor="middle"
          font-size="9" fill="var(--text-muted)" font-family="DM Mono,monospace">${d.label}</text>
      </g>`;
  }).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
      style="width:100%;height:${H}px;display:block">${bars}</svg>`;
}

// ─── Contador ao vivo (atualiza elementos com data-elapsed) ───
function startElapsedTimers() {
  setInterval(() => {
    qsa('[data-elapsed]').forEach(el => {
      el.textContent = Format.elapsed(el.dataset.elapsed);
    });
  }, 30000);
}

window.Toast         = Toast;
window.Modal         = Modal;
window.Format        = Format;
window.qs            = qs;
window.qsa           = qsa;
window.setLoading    = setLoading;
window.skeletonRows  = skeletonRows;
window.renderBarChart= renderBarChart;
window.confirmDialog = confirmDialog;
window.startElapsedTimers = startElapsedTimers;
