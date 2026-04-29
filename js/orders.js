// ============================================================
// orders.js — Gestão de pedidos
// Polling + busca + modal de detalhes + impressão
// ============================================================

const Orders = (() => {
  let _all          = [];
  let _filterStatus = 'all';
  let _searchText   = '';
  let _pollingTimer = null;
  let _knownIds     = new Set();
  let _audioCtx     = null;
  let _soundEnabled = localStorage.getItem('rs_sound') !== 'false';

  const POLL_MS = 8000;

  const STATUS_FLOW = {
    recebido:   { next: 'em_preparo', label: '▶ Iniciar preparo',   cls: 'btn-primary' },
    em_preparo: { next: 'pronto',     label: '✓ Marcar pronto',      cls: 'btn-success' },
    pronto:     { next: 'entregue',   label: '🛵 Confirmar entrega', cls: 'btn-ghost'   },
    entregue:   { next: null,         label: '✓ Entregue',           cls: 'btn-ghost'   },
    cancelado:  { next: null,         label: '✕ Cancelado',          cls: 'btn-danger'  },
  };

  // ─── Init ──────────────────────────────────────────────────
  async function init() {
    await load();
    bindEvents();
    startPolling();
    updateSoundBtn();
  }

  // ─── Carregar ─────────────────────────────────────────────
  async function load(silent = false) {
    try {
      const { data } = await API.orders.list();

      const newOnes = data.filter(o => o.status === 'recebido' && !_knownIds.has(o.id));
      if (newOnes.length && _knownIds.size > 0) {
        playAlert();
        Toast.info(`🔔 ${newOnes.length} novo(s) pedido(s)!`);
      }
      data.forEach(o => _knownIds.add(o.id));

      const pending = data.filter(o => ['recebido', 'em_preparo'].includes(o.status)).length;
      updateBadge(pending);

      _all = data;
      render();
    } catch (e) {
      if (!silent) Toast.error('Erro ao carregar pedidos');
    }
  }

  // ─── Polling ──────────────────────────────────────────────
  function startPolling() {
    if (_pollingTimer) return;
    _pollingTimer = setInterval(() => load(true), POLL_MS);
    const el = qs('#polling-indicator');
    if (el) { el.textContent = '● Ao vivo'; el.style.opacity = '1'; }
  }

  // ─── Render ───────────────────────────────────────────────
  function render() {
    const board = qs('#orders-board');
    if (!board) return;

    const search = _searchText.toLowerCase();
    const visible = _all.filter(o => {
      const matchStatus = _filterStatus === 'all' || o.status === _filterStatus;
      const matchSearch = !search ||
        o.tableNumber.includes(search) ||
        o.customerName.toLowerCase().includes(search) ||
        String(o.id).includes(search);
      return matchStatus && matchSearch;
    });

    if (!visible.length) {
      board.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;padding:60px">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-title">${_searchText ? 'Nenhum resultado' : 'Nenhum pedido'}</div>
          <div class="empty-state-desc">${_searchText ? 'Tente outra busca' : 'Os pedidos aparecerão aqui automaticamente'}</div>
        </div>`;
      return;
    }

    board.innerHTML = visible.map(renderCard).join('');
  }

  function renderCard(o) {
    const flow       = STATUS_FLOW[o.status] || {};
    const canAdvance = !!flow.next;
    const urgent     = ['recebido','em_preparo'].includes(o.status);

    const items = o.items.map(i => `
      <div class="order-item">
        <span><span class="order-item-qty">×${i.quantity}</span>${i.productName}</span>
        <span>${Format.currency(i.unitPrice * i.quantity)}</span>
      </div>`).join('');

    const noteHtml = o.notes
      ? `<div class="order-note">📝 ${o.notes}</div>` : '';

    return `
      <div class="order-card" data-id="${o.id}">
        <div class="order-card-header">
          <div>
            <div class="order-number">#${String(o.id).padStart(4,'0')}</div>
            <div class="order-table">Mesa ${o.tableNumber}</div>
          </div>
          <span class="status-badge status-${o.status}">${Format.statusLabel(o.status)}</span>
        </div>
        <div class="order-card-body">
          <div class="order-customer">👤 ${o.customerName}</div>
          ${noteHtml}
          <div class="order-items">${items}</div>
          <div class="order-total">
            <span>Total</span>
            <span class="order-total-value">${Format.currency(o.total)}</span>
          </div>
        </div>
        <div class="order-card-footer">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <div class="order-time" ${urgent ? `data-elapsed="${o.createdAt}"` : ''}>
              🕐 ${urgent ? Format.elapsed(o.createdAt) : Format.timeAgo(o.createdAt)}
            </div>
            <button class="btn btn-ghost btn-sm" onclick="Orders.showDetail(${o.id})" title="Detalhes">🔍</button>
            <button class="btn btn-ghost btn-sm" onclick="Orders.printOrder(${o.id})" title="Imprimir">🖨️</button>
          </div>
          <div style="display:flex;gap:6px">
            ${o.status !== 'entregue' && o.status !== 'cancelado'
              ? `<button class="btn btn-danger btn-sm" onclick="Orders.cancel(${o.id})">✕</button>`
              : ''}
            ${canAdvance
              ? `<button class="btn btn-sm ${flow.cls}" onclick="Orders.advance(${o.id})">${flow.label}</button>`
              : `<span class="btn btn-sm btn-ghost" style="opacity:.4;cursor:default">${flow.label}</span>`}
          </div>
        </div>
      </div>`;
  }

  // ─── Ações ────────────────────────────────────────────────
  async function advance(id) {
    const order = _all.find(o => o.id === id);
    if (!order || !STATUS_FLOW[order.status]?.next) return;

    const nextStatus = STATUS_FLOW[order.status].next;
    const idx = _all.findIndex(o => o.id === id);
    const prev = { ..._all[idx] };
    _all[idx] = { ..._all[idx], status: nextStatus, updatedAt: new Date().toISOString() };
    render();
    updateBadge(_all.filter(o => ['recebido','em_preparo'].includes(o.status)).length);

    try {
      await API.orders.updateStatus(id, nextStatus);
      Toast.success(`#${String(id).padStart(4,'0')} → ${Format.statusLabel(nextStatus)}`);
    } catch (e) {
      _all[idx] = prev;
      render();
      Toast.error('Erro ao atualizar status');
    }
  }

  async function cancel(id) {
    const confirmed = await confirmDialog('Cancelar este pedido? Esta ação não pode ser desfeita.');
    if (!confirmed) return;
    try {
      await API.orders.updateStatus(id, 'cancelado');
      const idx = _all.findIndex(o => o.id === id);
      if (idx !== -1) _all[idx] = { ..._all[idx], status: 'cancelado' };
      render();
      updateBadge(_all.filter(o => ['recebido','em_preparo'].includes(o.status)).length);
      Toast.warning('Pedido cancelado');
    } catch {
      Toast.error('Erro ao cancelar');
    }
  }

  // ─── Modal de detalhes ─────────────────────────────────────
  function showDetail(id) {
    const o = _all.find(o => o.id === id);
    if (!o) return;

    let overlay = qs('#order-detail-modal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'order-detail-modal';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
    }

    const flow = STATUS_FLOW[o.status] || {};

    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <h3 class="modal-title">Pedido #${String(o.id).padStart(4,'0')} — Mesa ${o.tableNumber}</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').classList.remove('open')">✕</button>
        </div>
        <div class="modal-body">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <span class="status-badge status-${o.status}">${Format.statusLabel(o.status)}</span>
            <span style="font-size:.75rem;color:var(--text-muted)">${Format.fullDate(o.createdAt)}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
            <div style="background:var(--bg-raised);padding:10px 12px;border-radius:6px">
              <div style="font-size:.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Cliente</div>
              <div style="font-size:.875rem;font-weight:600;margin-top:2px">${o.customerName}</div>
            </div>
            <div style="background:var(--bg-raised);padding:10px 12px;border-radius:6px">
              <div style="font-size:.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Tempo</div>
              <div style="font-size:.875rem;font-weight:600;margin-top:2px">${Format.elapsed(o.createdAt)}</div>
            </div>
          </div>
          ${o.notes ? `<div class="order-note" style="margin-bottom:14px">📝 ${o.notes}</div>` : ''}
          <div style="background:var(--bg-raised);border-radius:8px;overflow:hidden;margin-bottom:14px">
            ${o.items.map(i => `
              <div style="display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border)">
                <span style="font-size:.85rem"><strong>${i.quantity}×</strong> ${i.productName}</span>
                <span style="font-size:.85rem;font-family:var(--font-mono)">${Format.currency(i.unitPrice * i.quantity)}</span>
              </div>`).join('')}
            <div style="display:flex;justify-content:space-between;padding:12px 14px;font-weight:700">
              <span>Total</span>
              <span style="font-family:var(--font-mono);font-size:1rem">${Format.currency(o.total)}</span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost btn-sm" onclick="Orders.printOrder(${o.id})">🖨️ Imprimir</button>
          <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').classList.remove('open')">Fechar</button>
          ${flow.next ? `<button class="btn btn-sm ${flow.cls}" onclick="Orders.advance(${o.id});this.closest('.modal-overlay').classList.remove('open')">${flow.label}</button>` : ''}
        </div>
      </div>`;

    Modal.open(overlay);
    Modal.bindOutsideClick(overlay);
  }

  // ─── Impressão ────────────────────────────────────────────
  function printOrder(id) {
    const o = _all.find(o => o.id === id);
    if (!o) return;

    const win = window.open('', '_blank', 'width=340,height=520');
    win.document.write(`<!DOCTYPE html><html><head>
<meta charset="UTF-8"><title>Comanda #${String(o.id).padStart(4,'0')}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',monospace;font-size:13px;padding:16px;width:300px}
  h1{font-size:15px;text-align:center;border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:10px}
  .row{display:flex;justify-content:space-between;margin-bottom:3px}
  .info{margin-bottom:10px;border-bottom:1px dashed #ccc;padding-bottom:8px}
  .items{border-bottom:1px dashed #000;margin-bottom:10px;padding-bottom:8px}
  .total{display:flex;justify-content:space-between;font-weight:bold;font-size:15px}
  .note{background:#fff3cd;border:1px solid #ffc107;padding:4px 8px;margin:8px 0;font-size:12px}
  @media print{body{padding:0}}
</style></head><body>
<h1>🍽️ RestaurOS</h1>
<div class="info">
  <div class="row"><span>Pedido:</span><b>#${String(o.id).padStart(4,'0')}</b></div>
  <div class="row"><span>Mesa:</span><b>${o.tableNumber}</b></div>
  <div class="row"><span>Cliente:</span><span>${o.customerName}</span></div>
  <div class="row"><span>Hora:</span><span>${Format.fullDate(o.createdAt)}</span></div>
</div>
${o.notes ? `<div class="note">⚠ ${o.notes}</div>` : ''}
<div class="items">
${o.items.map(i => `<div class="row"><span>${i.quantity}× ${i.productName}</span><span>R$${(i.unitPrice*i.quantity).toFixed(2).replace('.',',')}</span></div>`).join('')}
</div>
<div class="total"><span>TOTAL</span><span>R$${o.total.toFixed(2).replace('.',',')}</span></div>
<p style="text-align:center;margin-top:14px;font-size:11px;color:#666">Obrigado pela preferência!</p>
<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}<\/script>
</body></html>`);
    win.document.close();
  }

  // ─── Som ──────────────────────────────────────────────────
  function playAlert() {
    if (!_soundEnabled) return;
    try {
      if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      [[880,0],[880,0.15],[1100,0.3]].forEach(([freq, delay]) => {
        const osc = _audioCtx.createOscillator();
        const g   = _audioCtx.createGain();
        osc.connect(g); g.connect(_audioCtx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        g.gain.setValueAtTime(0.25, _audioCtx.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + delay + 0.25);
        osc.start(_audioCtx.currentTime + delay);
        osc.stop(_audioCtx.currentTime + delay + 0.3);
      });
    } catch {}
  }

  function toggleSound() {
    _soundEnabled = !_soundEnabled;
    localStorage.setItem('rs_sound', _soundEnabled);
    updateSoundBtn();
    Toast.info(_soundEnabled ? '🔔 Som ativado' : '🔕 Som desativado');
  }

  function updateSoundBtn() {
    const btn = qs('#btn-toggle-sound');
    if (btn) btn.textContent = _soundEnabled ? '🔔' : '🔕';
  }

  function updateBadge(count) {
    const el = qs('#orders-badge');
    if (!el) return;
    el.textContent   = count;
    el.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  // ─── Bind events ───────────────────────────────────────────
  function bindEvents() {
    qsa('.orders-filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        qsa('.orders-filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        _filterStatus = tab.dataset.status;
        render();
      });
    });

    qs('#orders-search')?.addEventListener('input', e => {
      _searchText = e.target.value.trim();
      render();
    });

    qs('#btn-refresh-orders')?.addEventListener('click', () => load());
    qs('#btn-toggle-sound')?.addEventListener('click', toggleSound);

    // Ativa AudioContext no primeiro clique
    document.addEventListener('click', () => {
      try { if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch {}
    }, { once: true });
  }

  return { init, load, advance, cancel, showDetail, printOrder, startPolling };
})();

window.Orders = Orders;
