// ============================================================
// orders.js — Gestão de pedidos com polling, som e impressão
// ============================================================

const Orders = (() => {
  let _all          = [];
  let _filterStatus = 'all';
  let _pollingTimer = null;
  let _knownIds     = new Set();
  let _audioCtx     = null;

  const POLL_MS = 8000;

  const STATUS_FLOW = {
    recebido:   { next: 'em_preparo', label: '▶ Iniciar preparo',    cls: 'btn-primary' },
    em_preparo: { next: 'pronto',     label: '✓ Marcar pronto',       cls: 'btn-success' },
    pronto:     { next: 'entregue',   label: '🛵 Confirmar entrega',  cls: 'btn-ghost'   },
    entregue:   { next: null,         label: '✓ Entregue',            cls: 'btn-ghost'   },
    cancelado:  { next: null,         label: '✕ Cancelado',           cls: 'btn-danger'  },
  };

  // ─── Init ─────────────────────────────────────────────────
  async function init() {
    await load();
    bindEvents();
    startPolling();
  }

  // ─── Carregar ─────────────────────────────────────────────
  async function load(silent = false) {
    try {
      const { data } = await API.orders.list();

      // Detecta pedidos novos para notificar
      const newIds = data
        .filter(o => o.status === 'recebido' && !_knownIds.has(o.id))
        .map(o => o.id);

      if (newIds.length && _knownIds.size > 0) {
        playAlert();
        Toast.info(`🔔 ${newIds.length} novo(s) pedido(s) recebido(s)!`);
      }

      data.forEach(o => _knownIds.add(o.id));

      // Badge no sidebar
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

  function stopPolling() {
    clearInterval(_pollingTimer);
    _pollingTimer = null;
  }

  // ─── Render board ─────────────────────────────────────────
  function render() {
    const board = qs('#orders-board');
    if (!board) return;

    const visible = _filterStatus === 'all'
      ? _all
      : _all.filter(o => o.status === _filterStatus);

    if (!visible.length) {
      board.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;padding:60px">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-title">Nenhum pedido</div>
          <div class="empty-state-desc">
            ${_filterStatus === 'all' ? 'Os pedidos aparecem aqui automaticamente' : 'Sem pedidos com esse status'}
          </div>
        </div>`;
      return;
    }

    board.innerHTML = visible.map(renderCard).join('');
  }

  function renderCard(o) {
    const flow       = STATUS_FLOW[o.status] || {};
    const canAdvance = !!flow.next;
    const items      = o.items.map(i => `
      <div class="order-item">
        <span><span class="order-item-qty">×${i.quantity}</span>${i.productName}</span>
        <span>${Format.currency(i.unitPrice * i.quantity)}</span>
      </div>`).join('');

    const noteHtml = o.notes
      ? `<div class="order-note">📝 ${o.notes}</div>`
      : '';

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
          <div style="display:flex;gap:6px;align-items:center">
            <div class="order-time">🕐 ${Format.timeAgo(o.createdAt)}</div>
            <button class="btn btn-ghost btn-sm" onclick="Orders.printOrder(${o.id})" title="Imprimir comanda">🖨️</button>
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

    // Otimismo: atualiza UI imediatamente
    const idx = _all.findIndex(o => o.id === id);
    const prev = { ..._all[idx] };
    _all[idx]  = { ..._all[idx], status: nextStatus };
    render();
    updateBadge(_all.filter(o => ['recebido', 'em_preparo'].includes(o.status)).length);

    try {
      await API.orders.updateStatus(id, nextStatus);
      Toast.success(`#${String(id).padStart(4,'0')} → ${Format.statusLabel(nextStatus)}`);
    } catch (e) {
      _all[idx] = prev; // reverte
      render();
      Toast.error('Erro ao atualizar status');
    }
  }

  async function cancel(id) {
    if (!confirmDialog('Cancelar este pedido?')) return;
    try {
      await API.orders.updateStatus(id, 'cancelado');
      const idx = _all.findIndex(o => o.id === id);
      if (idx !== -1) _all[idx].status = 'cancelado';
      render();
      Toast.warning('Pedido cancelado');
    } catch {
      Toast.error('Erro ao cancelar');
    }
  }

  // ─── Impressão de comanda ──────────────────────────────────
  function printOrder(id) {
    const o = _all.find(o => o.id === id);
    if (!o) return;

    const fmt = Format.currency;
    const win = window.open('', '_blank', 'width=340,height=500');
    win.document.write(`
      <!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <title>Comanda #${String(o.id).padStart(4,'0')}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Courier New', monospace; font-size: 13px; padding: 16px; width: 300px; }
        h1 { font-size: 16px; text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
        .info { margin-bottom: 8px; }
        .items { border-bottom: 1px dashed #000; margin-bottom: 8px; padding-bottom: 8px; }
        .item { display: flex; justify-content: space-between; margin-bottom: 3px; }
        .total { display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; }
        .footer { text-align: center; margin-top: 12px; font-size: 11px; color: #555; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>🍽️ RestaurOS</h1>
      <div class="info">
        <div>Pedido: <b>#${String(o.id).padStart(4,'0')}</b></div>
        <div>Mesa: <b>${o.tableNumber}</b></div>
        <div>Cliente: ${o.customerName}</div>
        <div>Hora: ${Format.fullDate(o.createdAt)}</div>
        ${o.notes ? `<div>Obs: ${o.notes}</div>` : ''}
      </div>
      <div class="items">
        ${o.items.map(i => `
          <div class="item">
            <span>${i.quantity}× ${i.productName}</span>
            <span>${fmt(i.unitPrice * i.quantity)}</span>
          </div>`).join('')}
      </div>
      <div class="total"><span>TOTAL</span><span>${fmt(o.total)}</span></div>
      <div class="footer">Obrigado pela preferência!</div>
      <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body></html>`);
    win.document.close();
  }

  // ─── Som de alerta (Web Audio API) ────────────────────────
  function playAlert() {
    try {
      if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.15, 0.3].forEach(delay => {
        const osc  = _audioCtx.createOscillator();
        const gain = _audioCtx.createGain();
        osc.connect(gain);
        gain.connect(_audioCtx.destination);
        osc.frequency.value = 880;
        osc.type            = 'sine';
        gain.gain.setValueAtTime(0.3, _audioCtx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + delay + 0.2);
        osc.start(_audioCtx.currentTime + delay);
        osc.stop(_audioCtx.currentTime + delay + 0.2);
      });
    } catch {}
  }

  function updateBadge(count) {
    const el = qs('#orders-badge');
    if (!el) return;
    el.textContent    = count;
    el.style.display  = count > 0 ? 'inline-flex' : 'none';
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

    qs('#btn-refresh-orders')?.addEventListener('click', () => load());
  }

  return { init, load, advance, cancel, printOrder, startPolling, stopPolling };
})();

window.Orders = Orders;
