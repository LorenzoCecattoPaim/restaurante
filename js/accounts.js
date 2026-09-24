// ============================================================
// accounts.js — Contas das mesas + registro de pagamento
// O consumo vem dos pedidos reais; o servidor valida tudo.
// ============================================================

const Accounts = (() => {
  const REFRESH_MS = 10000;
  const METHODS = [
    ['pix', 'PIX'], ['credito', 'Crédito'], ['debito', 'Débito'], ['dinheiro', 'Dinheiro'], ['outro', 'Outros'],
  ];

  let _list   = [];
  let _detail = null;        // conta aberta no modal
  let _form   = null;        // estado do formulário de pagamento
  let _timer  = null;

  const isAdmin = () => (JSON.parse(localStorage.getItem('rs_user') || '{}').role === 'admin');

  async function init() {
    _timer = setInterval(() => {
      if (qs('#section-accounts')?.classList.contains('active')) load(true);
    }, REFRESH_MS);
  }

  async function load(silent = false) {
    try {
      const res = await API.accounts.list();
      _list = res.data;
      renderList(res.totals);
    } catch (e) {
      if (!silent) Toast.error(e.message || 'Erro ao carregar contas');
    }
  }

  // ─── Lista de mesas ───────────────────────────────────────
  function renderList(totals) {
    const grid = qs('#accounts-grid');
    if (!grid) return;

    const occupied = totals.openAccounts;
    qs('#accounts-summary').innerHTML = `
      <div class="kpi"><div class="kpi-label">Contas abertas</div><div class="kpi-value">${occupied}</div></div>
      <div class="kpi"><div class="kpi-label">Em aberto (a receber)</div><div class="kpi-value">${Format.currency(totals.openAmount)}</div></div>
      <div class="kpi"><div class="kpi-label">Mesas ocupadas</div><div class="kpi-value">${occupied}${totals.tableCount ? ` / ${totals.tableCount}` : ''}</div>
        ${totals.tableCount ? '' : '<div class="kpi-sub">Informe o total de mesas em Configurações</div>'}</div>`;

    if (!_list.length) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;padding:60px">
          <div class="empty-state-icon">🧾</div>
          <div class="empty-state-title">Nenhuma conta aberta</div>
          <div class="empty-state-desc">As contas aparecem assim que uma mesa faz o primeiro pedido.</div>
        </div>`;
      return;
    }

    grid.innerHTML = _list.map(a => {
      const free = a.status === 'free';
      const askedBill = a.activeCalls.some(c => c.type === 'conta');
      const called    = a.activeCalls.some(c => c.type !== 'conta');
      return `
        <button class="table-tile${free ? ' is-free' : ''}" onclick="Accounts.open('${esc(a.tableNumber)}')"
          aria-label="Mesa ${esc(a.tableNumber)}${free ? ', sem consumo' : ', ' + Format.currency(a.subtotal)}">
          <span class="table-tile-name">Mesa ${esc(a.tableNumber)}</span>
          ${free
            ? `<span class="table-tile-meta">Sem consumo</span>`
            : `<span class="table-tile-amount">${Format.currency(a.subtotal)}</span>
               <span class="table-tile-meta">${a.orderCount} pedido(s) · aberta há ${Format.elapsed(a.openedAt)}</span>`}
          <span class="table-tile-flags">
            ${askedBill ? '<span class="pill pill-danger">Pediu a conta</span>' : ''}
            ${called ? '<span class="pill pill-warning">Chamou garçom</span>' : ''}
            ${a.notDeliveredCount ? `<span class="pill pill-info">${a.notDeliveredCount} a entregar</span>` : ''}
          </span>
        </button>`;
    }).join('');
  }

  // ─── Modal de conta ───────────────────────────────────────
  function modal() {
    let el = qs('#account-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'account-modal';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      el.addEventListener('click', e => { if (e.target === el) close(); });
    }
    return el;
  }

  function close() { Modal.close(modal()); _detail = null; }

  async function open(table) {
    try {
      const { data } = await API.accounts.get(table);
      _detail = data;
      _form = { method: null, discount: '', serviceFee: '', feeOn: false, amountReceived: '', note: '', key: uid() };
      renderModal();
      Modal.open(modal());
    } catch (e) {
      Toast.error(e.message || 'Erro ao abrir a conta');
    }
  }

  const cents = v => Math.round((parseFloat(String(v).replace(',', '.')) || 0) * 100);
  function computeTotals() {
    const sub  = Math.round(_detail.subtotal * 100);
    const disc = isAdmin() ? cents(_form.discount) : 0;
    const fee  = _form.feeOn ? cents(_form.serviceFee) : 0;
    return { sub, disc, fee, total: sub - disc + fee };
  }

  function renderModal() {
    const d = _detail;
    const el = modal();

    if (!d.orderIds.length) {
      el.innerHTML = `
        <div class="modal" style="max-width:440px">
          <div class="modal-header"><h3 class="modal-title">Mesa ${esc(d.tableNumber)}</h3>
            <button class="modal-close" onclick="Accounts.close()">✕</button></div>
          <div class="modal-body"><div class="empty-state" style="padding:30px">
            <div class="empty-state-icon">✅</div><div class="empty-state-title">Mesa livre</div>
            <div class="empty-state-desc">Não há consumo em aberto nesta mesa.</div></div></div>
          <div class="modal-footer"><button class="btn btn-ghost" onclick="Accounts.close()">Fechar</button></div>
        </div>`;
      return;
    }

    const t = computeTotals();
    el.innerHTML = `
      <div class="modal" style="max-width:520px">
        <div class="modal-header">
          <h3 class="modal-title">Mesa ${esc(d.tableNumber)}</h3>
          <button class="modal-close" onclick="Accounts.close()" aria-label="Fechar">✕</button>
        </div>
        <div class="modal-body">
          <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:12px">
            ${d.orderCount} pedido(s) · aberta às ${Format.date(d.openedAt)} (${Format.elapsed(d.openedAt)})
          </div>
          ${d.notDeliveredCount ? `<div class="notice notice-warning">⚠ ${d.notDeliveredCount} pedido(s) ainda não entregue(s). Confira com a cozinha antes de fechar.</div>` : ''}

          <div class="bill">
            ${d.items.map(i => `
              <div class="bill-row"><span>${i.quantity}× ${esc(i.productName)}</span><span class="num">${Format.currency(i.total)}</span></div>`).join('')}
          </div>

          <div class="bill">
            <div class="bill-row muted"><span>Subtotal</span><span class="num">${Format.currency(t.sub / 100)}</span></div>
            <div class="bill-row muted"><span>Desconto</span><span class="num" id="acc-disc-view">− ${Format.currency(t.disc / 100)}</span></div>
            <div class="bill-row muted"><span>Taxa de serviço</span><span class="num" id="acc-fee-view">${Format.currency(t.fee / 100)}</span></div>
            <div class="bill-row total"><span>Total</span><span class="num" id="acc-total-view">${Format.currency(t.total / 100)}</span></div>
          </div>

          <div class="form-grid" style="gap:12px">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="acc-fee-on">Taxa de serviço</label>
                <div class="toggle-wrap">
                  <label class="toggle"><input type="checkbox" id="acc-fee-on" ${_form.feeOn ? 'checked' : ''} /><span class="toggle-slider"></span></label>
                  <input id="acc-fee" class="form-control" type="number" min="0" step="0.01" style="max-width:120px"
                    value="${esc(_form.serviceFee)}" ${_form.feeOn ? '' : 'disabled'} aria-label="Valor da taxa de serviço" />
                </div>
              </div>
              ${isAdmin() ? `
              <div class="form-group">
                <label class="form-label" for="acc-disc">Desconto (R$)</label>
                <input id="acc-disc" class="form-control" type="number" min="0" step="0.01" value="${esc(_form.discount)}" placeholder="0,00" />
              </div>` : ''}
            </div>

            <div class="form-group">
              <span class="form-label">Forma de pagamento</span>
              <div class="method-grid" role="radiogroup" aria-label="Forma de pagamento">
                ${METHODS.map(([k, l]) => `
                  <button type="button" role="radio" aria-checked="${_form.method === k}" class="method-btn${_form.method === k ? ' active' : ''}"
                    data-method="${k}">${l}</button>`).join('')}
              </div>
            </div>

            ${_form.method === 'dinheiro' ? `
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="acc-received">Valor recebido (opcional)</label>
                <input id="acc-received" class="form-control" type="number" min="0" step="0.01" value="${esc(_form.amountReceived)}" />
              </div>
              <div class="form-group">
                <span class="form-label">Troco</span>
                <div class="form-control" id="acc-change" style="opacity:.8">—</div>
              </div>
            </div>` : ''}

            <div class="form-group">
              <label class="form-label" for="acc-note">Observação (opcional)</label>
              <input id="acc-note" class="form-control" type="text" maxlength="200" value="${esc(_form.note)}" />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="Accounts.close()">Fechar</button>
          <button class="btn btn-success" id="acc-pay-btn" ${_form.method ? '' : 'disabled'}>
            Pagar conta · <span id="acc-pay-total">${Format.currency(t.total / 100)}</span>
          </button>
        </div>
      </div>`;

    bindModal();
    refreshTotals();
  }

  function bindModal() {
    const el = modal();
    qsa('[data-method]', el).forEach(b => b.addEventListener('click', () => {
      _form.method = b.dataset.method;
      renderModal();
    }));
    const feeOn = qs('#acc-fee-on', el);
    feeOn?.addEventListener('change', () => {
      _form.feeOn = feeOn.checked;
      if (_form.feeOn && !_form.serviceFee) _form.serviceFee = (Math.round(_detail.subtotal * 10) / 100).toFixed(2); // 10% sugerido
      renderModal();
    });
    const bind = (id, key) => qs(id, el)?.addEventListener('input', e => { _form[key] = e.target.value; refreshTotals(); });
    bind('#acc-fee', 'serviceFee');
    bind('#acc-disc', 'discount');
    bind('#acc-received', 'amountReceived');
    bind('#acc-note', 'note');
    qs('#acc-pay-btn', el)?.addEventListener('click', pay);
  }

  function refreshTotals() {
    const t = computeTotals();
    const set = (id, v) => { const x = qs(id); if (x) x.textContent = v; };
    set('#acc-disc-view', `− ${Format.currency(t.disc / 100)}`);
    set('#acc-fee-view', Format.currency(t.fee / 100));
    set('#acc-total-view', Format.currency(t.total / 100));
    set('#acc-pay-total', Format.currency(t.total / 100));
    const ch = qs('#acc-change');
    if (ch) {
      const rec = cents(_form.amountReceived);
      ch.textContent = !_form.amountReceived ? '—' : rec < t.total ? 'Valor insuficiente' : Format.currency((rec - t.total) / 100);
    }
  }

  // ─── Pagamento ────────────────────────────────────────────
  async function pay() {
    const btn = qs('#acc-pay-btn');
    if (!_form.method || !_detail) return;
    const t = computeTotals();
    if (t.total < 0) { Toast.error('Desconto maior que o subtotal'); return; }

    const ok = await confirmDialog(
      `Registrar pagamento da <b>Mesa ${esc(_detail.tableNumber)}</b> em <b>${esc(Format.paymentMethod(_form.method))}</b> no valor de <b>${Format.currency(t.total / 100)}</b>?`);
    if (!ok) return;

    setLoading(btn, true);
    try {
      const res = await API.accounts.pay(_detail.tableNumber, {
        orderIds:         _detail.orderIds,
        expectedSubtotal: _detail.subtotal,
        method:           _form.method,
        discount:         isAdmin() ? (_form.discount || 0) : 0,
        serviceFee:       _form.feeOn ? (_form.serviceFee || 0) : 0,
        amountReceived:   _form.method === 'dinheiro' ? _form.amountReceived : undefined,
        note:             _form.note,
        idempotencyKey:   _form.key,
      });
      showPaid(res.data);
      load(true);
      window.Calls && Calls.load(true);
    } catch (e) {
      if (e.status === 409 && e.data?.current) {
        Toast.warning(e.message);
        _detail = e.data.current;
        _form.key = uid();
        renderModal();
      } else if (e.status === 409) {
        Toast.warning(e.message);
        close();
        load(true);
      } else {
        Toast.error(e.message || 'Erro ao registrar pagamento');
        setLoading(btn, false);
      }
    }
  }

  function showPaid(p) {
    modal().innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header"><h3 class="modal-title">Conta paga</h3>
          <button class="modal-close" onclick="Accounts.close()">✕</button></div>
        <div class="modal-body">
          <div class="notice notice-success">✓ Pagamento registrado e Mesa ${esc(p.tableNumber)} liberada.</div>
          <div class="bill">
            <div class="bill-row"><span>Total</span><span class="num">${Format.currency(p.total)}</span></div>
            <div class="bill-row muted"><span>Forma</span><span>${esc(Format.paymentMethod(p.method))}</span></div>
            ${p.change !== null ? `<div class="bill-row muted"><span>Troco</span><span class="num">${Format.currency(p.change)}</span></div>` : ''}
            <div class="bill-row muted"><span>Registrado por</span><span>${esc(p.paidBy?.name || '—')}</span></div>
            <div class="bill-row muted"><span>Horário</span><span>${Format.fullDate(p.createdAt)}</span></div>
          </div>
        </div>
        <div class="modal-footer"><button class="btn btn-primary" onclick="Accounts.close()">Concluir</button></div>
      </div>`;
    Toast.success(`Mesa ${p.tableNumber} liberada`);
  }

  return { init, load, open, close };
})();

window.Accounts = Accounts;
