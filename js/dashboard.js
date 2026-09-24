// ============================================================
// dashboard.js — Métricas + gráfico de receita por hora
// ============================================================

const Dashboard = (() => {
  async function init() { await load(); }

  async function load() {
    try {
      const { data } = await API.dashboard.stats();
      render(data);
    } catch {
      Toast.error('Erro ao carregar dashboard');
    }
    if (window.App && App.can('finance')) loadOverview();
  }

  // Visão geral: dinheiro recebido, contas, mesas e chamados (somente gerente)
  async function loadOverview() {
    try {
      const { data: o } = await API.overview.get(Period.query(Period.range('today')));
      const block = qs('#overview-block');
      if (!block) return;
      block.hidden = false;
      const kpi = (label, value, sub = '', alert = false) =>
        `<div class="kpi${alert ? ' is-alert' : ''}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
      qs('#overview-kpis').innerHTML = [
        kpi('Faturamento hoje', Format.currency(o.revenueToday), `${o.paidAccounts} conta(s) paga(s)`),
        kpi('Contas abertas', o.openAccounts, o.openAccounts ? `${Format.currency(o.openAmount)} a receber` : ''),
        kpi('Mesas ocupadas', o.tableCount ? `${o.occupiedTables} / ${o.tableCount}` : o.occupiedTables),
        kpi('Chamados pendentes', o.pendingCalls, o.activeCalls > o.pendingCalls ? `${o.activeCalls - o.pendingCalls} em atendimento` : '', o.pendingCalls > 0),
        kpi('Tempo médio de atendimento', Format.duration(o.avgServiceTotal), o.avgToAccept !== null ? `assumir: ${Format.duration(o.avgToAccept)}` : 'sem chamados concluídos hoje'),
        kpi('Ticket médio', o.avgTicket === null ? '—' : Format.currency(o.avgTicket), 'por conta paga'),
      ].join('');

      renderHBars('overview-methods', o.byMethod.map(m => ({ ...m, value: m.total })), {
        sub: m => `${m.count} transação(ões)`, emptyText: 'Nenhum pagamento hoje',
      });
      const hours = o.callsByHour;
      const series = [];
      if (hours.length) {
        const map = new Map(hours.map(h => [h.hour, h.count]));
        for (let h = hours[0].hour; h <= hours[hours.length - 1].hour; h++)
          series.push({ label: `${String(h).padStart(2, '0')}h`, total: map.get(h) || 0 });
      }
      renderBarChart('overview-calls-hour', series, { format: v => `${v} chamado(s)`, emptyText: 'Nenhum chamado hoje', maxBarWidth: 44 });
    } catch {}
  }

  function render(d) {
    set('#stat-orders',   d.totalOrdersToday);
    set('#stat-revenue',  Format.currency(d.revenueToday));
    set('#stat-pending',  (d.ordersByStatus.recebido || 0) + (d.ordersByStatus.em_preparo || 0));
    set('#stat-avg',      Format.currency(d.avgTicket || 0));

    // Status mini-grid
    set('#status-recebido',   d.ordersByStatus.recebido   || 0);
    set('#status-em_preparo', d.ordersByStatus.em_preparo || 0);
    set('#status-pronto',     d.ordersByStatus.pronto     || 0);
    set('#status-entregue',   d.ordersByStatus.entregue   || 0);

    // Gráfico de barras por hora
    if (d.hourlyRevenue && d.hourlyRevenue.length) {
      renderBarChart('revenue-chart', d.hourlyRevenue);
    }

    // Top itens
    const list = qs('#top-items-list');
    if (!list) return;

    if (!d.topItems || !d.topItems.length) {
      list.innerHTML = '<div class="empty-state" style="padding:24px"><div class="empty-state-desc">Sem vendas hoje ainda</div></div>';
      return;
    }

    const max = d.topItems[0].quantity;
    list.innerHTML = d.topItems.map((item, i) => `
      <div class="top-item">
        <span class="top-item-rank">#${i + 1}</span>
        <div class="top-item-bar-wrap">
          <div class="top-item-name">${item.name}</div>
          <div class="top-item-bar">
            <div class="top-item-bar-fill" style="width:${Math.round(item.quantity/max*100)}%"></div>
          </div>
        </div>
        <div style="text-align:right;min-width:80px">
          <div class="top-item-count">${item.quantity} un.</div>
          <div style="font-size:.68rem;color:var(--text-muted)">${Format.currency(item.revenue)}</div>
        </div>
      </div>`).join('');
  }

  function set(sel, val) {
    const el = qs(sel);
    if (el) el.textContent = val;
  }

  return { init, load };
})();

window.Dashboard = Dashboard;
