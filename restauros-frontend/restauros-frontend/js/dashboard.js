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
