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
function renderBarChart(containerId, data, opts = {}) {
  const container = qs(`#${containerId}`);
  if (!container) return;
  if (!data.length) {
    container.innerHTML = `<div class="empty-state" style="padding:20px"><div class="empty-state-desc">${opts.emptyText || 'Sem dados no período'}</div></div>`;
    return;
  }
  const fmtValue = opts.format || Format.currency;

  const max  = Math.max(...data.map(d => d.total), 1);
  const W    = container.clientWidth || 420;
  const H    = opts.height || 90;
  const gap  = 4;
  let   barW = Math.floor((W - (data.length - 1) * gap) / data.length);
  if (opts.maxBarWidth) barW = Math.min(barW, opts.maxBarWidth);
  const offset = opts.maxBarWidth ? Math.max(0, Math.floor((W - (barW * data.length + gap * (data.length - 1))) / 2)) : 0;

  const bars = data.map((d, i) => {
    const barH  = Math.max(3, Math.round((d.total / max) * (H - 22)));
    const x     = offset + i * (barW + gap);
    const y     = H - 18 - barH;
    const color = d.total > 0 ? (d.color || opts.color || 'var(--accent)') : 'var(--bg-active)';
    return `
      <g>
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}"
          fill="${color}" opacity=".85" rx="3">
          <title>${d.title || d.label}: ${fmtValue(d.total)}</title>
        </rect>
        <text x="${x + barW / 2}" y="${H - 2}" text-anchor="middle"
          font-size="9" fill="var(--text-muted)" font-family="DM Mono,monospace">${(opts.labelEvery && i % opts.labelEvery) ? '' : d.label}</text>
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

// ─── Escape de HTML (dados vindos do cliente/usuário) ─────────
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Duração em segundos → "3m 42s" / "1h 05m"
Format.duration = sec => {
  if (sec === null || sec === undefined || isNaN(sec)) return '—';
  sec = Math.max(0, Math.round(sec));
  if (sec < 60)   return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`;
  return `${Math.floor(sec / 3600)}h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}m`;
};

Format.paymentMethod = m => ({
  dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', outro: 'Outros',
}[m] || m);

// ─── Períodos (calculados no fuso do navegador) ───────────────
const Period = (() => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay   = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  const addDays    = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  const PRESETS = {
    today:     { label: 'Hoje' },
    yesterday: { label: 'Ontem' },
    last7:     { label: 'Últimos 7 dias' },
    last30:    { label: 'Últimos 30 dias' },
    month:     { label: 'Este mês' },
    custom:    { label: 'Personalizado' },
  };

  // Retorna {from, to} como Date
  function range(preset, customFrom, customTo) {
    const now = new Date();
    switch (preset) {
      case 'yesterday': { const y = addDays(now, -1); return { from: startOfDay(y), to: endOfDay(y) }; }
      case 'last7':     return { from: startOfDay(addDays(now, -6)),  to: now };
      case 'last30':    return { from: startOfDay(addDays(now, -29)), to: now };
      case 'month':     return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
      case 'custom': {
        if (!customFrom || !customTo) return null;
        const [fy, fm, fd] = customFrom.split('-').map(Number);
        const [ty, tm, td] = customTo.split('-').map(Number);
        const from = new Date(fy, fm - 1, fd);
        const to   = endOfDay(new Date(ty, tm - 1, td));
        return from <= to ? { from, to } : null;
      }
      default:          return { from: startOfDay(now), to: now };
    }
  }

  function query(r) {
    return `from=${encodeURIComponent(r.from.toISOString())}&to=${encodeURIComponent(r.to.toISOString())}&tz=${encodeURIComponent(tz)}`;
  }

  const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Monta o seletor de período (reutilizado em Financeiro e Análises)
  function mount(container, onChange, initial = 'today') {
    const today = isoDate(new Date());
    container.innerHTML = `
      <div class="period-bar">
        <div class="filter-tabs period-tabs">
          ${Object.entries(PRESETS).map(([k, p]) =>
            `<button class="filter-tab${k === initial ? ' active' : ''}" data-preset="${k}">${p.label}</button>`).join('')}
        </div>
        <div class="period-custom" hidden>
          <input type="date" class="form-control period-from" value="${today}" max="${today}" aria-label="Data inicial" />
          <span>até</span>
          <input type="date" class="form-control period-to" value="${today}" max="${today}" aria-label="Data final" />
          <button class="btn btn-primary btn-sm period-apply">Aplicar</button>
        </div>
      </div>`;

    let preset = initial;
    const custom = qs('.period-custom', container);
    const emit = () => {
      const r = range(preset, qs('.period-from', container).value, qs('.period-to', container).value);
      if (!r) { Toast.warning('Período inválido: a data inicial deve ser anterior à final'); return; }
      onChange(r, preset);
    };

    qsa('[data-preset]', container).forEach(btn => btn.addEventListener('click', () => {
      qsa('[data-preset]', container).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      preset = btn.dataset.preset;
      custom.hidden = preset !== 'custom';
      if (preset !== 'custom') emit();
    }));
    qs('.period-apply', container).addEventListener('click', emit);

    return { current: () => range(preset, qs('.period-from', container).value, qs('.period-to', container).value), preset: () => preset };
  }

  function describe(r) {
    const f = r.from.toLocaleDateString('pt-BR');
    const t = r.to.toLocaleDateString('pt-BR');
    return f === t ? f : `${f} até ${t}`;
  }

  return { range, query, mount, describe, tz, PRESETS };
})();

// ─── Barras horizontais (reaproveita o estilo "top-item") ─────
function renderHBars(containerId, rows, { valueFormat = Format.currency, sub, emptyText = 'Sem dados no período' } = {}) {
  const el = qs(`#${containerId}`);
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = `<div class="empty-state" style="padding:20px"><div class="empty-state-desc">${emptyText}</div></div>`;
    return;
  }
  const max = Math.max(...rows.map(r => r.value), 1);
  el.innerHTML = rows.map(r => `
    <div class="top-item">
      <div class="top-item-bar-wrap">
        <div class="top-item-name">${esc(r.label)}</div>
        <div class="top-item-bar"><div class="top-item-bar-fill" style="width:${Math.round(r.value / max * 100)}%"></div></div>
      </div>
      <div style="text-align:right;min-width:96px">
        <div class="top-item-count">${valueFormat(r.value)}</div>
        ${sub ? `<div style="font-size:.68rem;color:var(--text-muted)">${sub(r)}</div>` : ''}
      </div>
    </div>`).join('');
}

// Id único para idempotência de operações sensíveis (pagamento)
function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

window.esc           = esc;
window.Period        = Period;
window.renderHBars   = renderHBars;
window.uid           = uid;
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
