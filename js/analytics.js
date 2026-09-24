// ============================================================
// analytics.js — Análise de atendimento e de mesas (gerente)
// ============================================================

const Analytics = (() => {
  let _period = null;
  let _tab = 'service';

  function init() {
    _period = Period.mount(qs('#analytics-period'), () => load());
    qsa('[data-analytics-tab]').forEach(b => b.addEventListener('click', () => {
      qsa('[data-analytics-tab]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      _tab = b.dataset.analyticsTab;
      qs('#analytics-service').hidden = _tab !== 'service';
      qs('#analytics-tables').hidden  = _tab !== 'tables';
      load();
    }));
  }

  async function load() {
    const r = _period.current();
    if (!r) return;
    qs('#analytics-range-label').textContent = Period.describe(r);
    try {
      if (_tab === 'service') renderService((await API.analytics.service(Period.query(r))).data);
      else                    renderTables((await API.analytics.tables(Period.query(r))).data);
    } catch (e) {
      Toast.error(e.message || 'Erro ao carregar análises');
    }
  }

  const kpi = (label, value, sub = '') =>
    `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;

  // Preenche as horas entre a primeira e a última com zero (eixo contínuo)
  function hourSeries(byHour, key) {
    if (!byHour.length) return [];
    const map = new Map(byHour.map(h => [h.hour, h]));
    const out = [];
    for (let h = byHour[0].hour; h <= byHour[byHour.length - 1].hour; h++) {
      const e = map.get(h);
      out.push({ label: `${String(h).padStart(2, '0')}h`, total: e ? (e[key] || 0) : 0 });
    }
    return out;
  }

  function renderService(d) {
    const c = d.counts;
    qs('#service-kpis').innerHTML = [
      kpi('Tempo médio total', Format.duration(d.avgTotal), 'da abertura à conclusão'),
      kpi('Tempo médio para assumir', Format.duration(d.avgToAccept), 'da abertura até alguém assumir'),
      kpi('Tempo médio de atendimento', Format.duration(d.avgService), 'de assumido a concluído'),
      kpi('Chamados', c.total, `${c.completed} concluídos · ${c.pending + c.accepted} em aberto · ${c.cancelled} cancelados`),
    ].join('');

    renderBarChart('service-count-hour', hourSeries(d.byHour, 'count'),
      { height: 110, format: v => `${v} chamado(s)`, emptyText: 'Sem chamados no período', maxBarWidth: 44 });
    renderBarChart('service-time-hour', hourSeries(d.byHour, 'avgTotal'),
      { height: 110, format: Format.duration, color: 'var(--warning)', emptyText: 'Sem chamados concluídos no período', maxBarWidth: 44 });

    const staff = qs('#service-staff');
    staff.innerHTML = d.byStaff.length ? d.byStaff.map(s => `
      <tr>
        <td>${esc(s.name)}</td>
        <td class="num">${s.accepted}</td>
        <td class="num">${s.completed}</td>
        <td class="num">${Format.duration(s.avgToAccept)}</td>
        <td class="num">${Format.duration(s.avgService)}</td>
      </tr>`).join('')
      : `<tr><td colspan="5"><div class="empty-state" style="padding:20px"><div class="empty-state-desc">Nenhum chamado assumido no período</div></div></td></tr>`;

    qs('#service-types').textContent = d.byType.length
      ? d.byType.map(t => `${t.label}: ${t.count}`).join(' · ') : '';
  }

  function renderTables(rows) {
    const tbody = qs('#tables-body');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding:24px"><div class="empty-state-desc">Sem movimentação de mesas no período</div></div></td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(t => `
      <tr>
        <td>Mesa ${esc(t.tableNumber)}</td>
        <td class="num">${Format.currency(t.revenue)}</td>
        <td class="num">${t.accounts}</td>
        <td class="num">${t.orders}</td>
        <td class="num">${t.avgTicket === null ? '—' : Format.currency(t.avgTicket)}</td>
        <td class="num">${Format.duration(t.avgStay)}</td>
        <td class="num">${t.calls}</td>
        <td class="num">${t.callsPerDay.toLocaleString('pt-BR')}</td>
      </tr>`).join('');
  }

  return { init, load };
})();

window.Analytics = Analytics;
