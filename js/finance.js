// ============================================================
// finance.js — Financeiro (somente gerente)
// Todos os números vêm de /api/finance, calculados sobre os
// pagamentos registrados. Nada é estimado.
// ============================================================

const Finance = (() => {
  let _period = null;
  let _payments = [];

  function init() {
    _period = Period.mount(qs('#finance-period'), () => load());
  }

  async function load() {
    const r = _period.current();
    if (!r) return;
    const today = Period.range('today');
    qs('#finance-range-label').textContent = Period.describe(r);

    try {
      const [period, todayRes, payments] = await Promise.all([
        API.finance.get(Period.query(r)),
        API.finance.get(Period.query(today)),
        API.payments.list(Period.query(r)),
      ]);
      render(period.data, todayRes.data);
      _payments = payments.data;
      renderPayments();
    } catch (e) {
      Toast.error(e.message || 'Erro ao carregar financeiro');
    }
  }

  function render(d, today) {
    const kpi = (label, value, sub = '') =>
      `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;

    qs('#finance-kpis').innerHTML = [
      kpi('Faturamento hoje', Format.currency(today.revenue), `${today.paidAccounts} conta(s) paga(s)`),
      kpi('Faturamento no período', Format.currency(d.revenue)),
      kpi('Contas pagas', d.paidAccounts),
      kpi('Ticket médio', d.avgTicket === null ? '—' : Format.currency(d.avgTicket), 'por conta paga'),
      kpi('Mesa com maior faturamento', d.topTable ? `Mesa ${esc(d.topTable.tableNumber)}` : '—',
          d.topTable ? `${Format.currency(d.topTable.total)} em ${d.topTable.count} conta(s)` : ''),
      kpi('Forma mais utilizada', d.mostUsedMethod ? esc(d.mostUsedMethod.label) : '—',
          d.mostUsedMethod ? `${d.mostUsedMethod.count} transação(ões)` : ''),
    ].join('');

    const extras = [];
    if (d.discounts)   extras.push(`Descontos concedidos: ${Format.currency(d.discounts)}`);
    if (d.serviceFees) extras.push(`Taxas de serviço: ${Format.currency(d.serviceFees)}`);
    if (d.voidedCount) extras.push(`${d.voidedCount} pagamento(s) estornado(s) — fora do faturamento`);
    qs('#finance-extras').textContent = extras.join(' · ');

    // Formas de pagamento: valor + quantidade + participação
    const totalRev = d.revenue || 1;
    renderHBars('finance-methods', d.byMethod.map(m => ({ ...m, value: m.total })), {
      sub: m => `${m.count} transação(ões) · ${Math.round(m.total / totalRev * 100)}%`,
      emptyText: 'Nenhum pagamento registrado no período',
    });

    // Evolução diária
    const chartWrap = qs('#finance-daily');
    if (d.daily.length <= 1) {
      chartWrap.innerHTML = `<div class="empty-state" style="padding:20px"><div class="empty-state-desc">
        ${d.revenue ? 'Selecione um período com mais de um dia para ver a evolução.' : 'Sem movimentação no período.'}</div></div>`;
    } else {
      const data = d.daily.map(x => {
        const [, m, day] = x.day.split('-');
        return { label: `${day}/${m}`, title: `${day}/${m} · ${x.count} conta(s)`, total: x.total };
      });
      renderBarChart('finance-daily', data, { height: 120, labelEvery: Math.ceil(data.length / 12), maxBarWidth: 44 });
    }
  }

  function renderPayments() {
    const tbody = qs('#finance-payments');
    if (!_payments.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:24px"><div class="empty-state-desc">Nenhum pagamento no período</div></div></td></tr>`;
      return;
    }
    tbody.innerHTML = _payments.map(p => `
      <tr class="${p.status === 'voided' ? 'is-voided' : ''}">
        <td>${Format.fullDate(p.createdAt)}</td>
        <td>Mesa ${esc(p.tableNumber)}</td>
        <td>${esc(Format.paymentMethod(p.method))}</td>
        <td class="num">${Format.currency(p.total)}</td>
        <td>${esc(p.paidBy?.name || '—')}</td>
        <td>${p.status === 'voided'
          ? `<span class="pill pill-muted" title="${esc(p.voidReason || '')}">Estornado por ${esc(p.voidedBy?.name || '—')}</span>`
          : '<span class="pill pill-success">Pago</span>'}</td>
        <td>${p.status === 'paid' ? `<button class="btn btn-ghost btn-sm" onclick="Finance.voidPayment(${p.id})">Estornar</button>` : ''}</td>
      </tr>`).join('');
  }

  // Estorno exige motivo e fica registrado (nunca apaga o pagamento)
  function voidPayment(id) {
    const p = _payments.find(x => x.id === id);
    if (!p) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header"><h3 class="modal-title">Estornar pagamento</h3></div>
        <div class="modal-body">
          <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:12px">
            Mesa ${esc(p.tableNumber)} · ${Format.currency(p.total)} em ${esc(Format.paymentMethod(p.method))}.
            O pagamento continua no histórico como estornado e os pedidos voltam para a conta da mesa.
          </p>
          <label class="form-label" for="void-reason">Motivo</label>
          <input id="void-reason" class="form-control" maxlength="300" placeholder="Ex.: forma de pagamento registrada errada" />
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" data-x="cancel">Voltar</button>
          <button class="btn btn-danger" data-x="ok">Estornar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    qs('#void-reason', overlay).focus();
    overlay.addEventListener('click', async e => {
      const x = e.target.dataset?.x;
      if (e.target === overlay || x === 'cancel') { overlay.remove(); return; }
      if (x !== 'ok') return;
      const reason = qs('#void-reason', overlay).value.trim();
      if (reason.length < 3) { Toast.warning('Informe o motivo do estorno'); return; }
      try {
        await API.payments.void(id, reason);
        overlay.remove();
        Toast.success('Pagamento estornado');
        load();
      } catch (err) { Toast.error(err.message || 'Erro ao estornar'); }
    });
  }

  return { init, load, voidPayment };
})();

window.Finance = Finance;
