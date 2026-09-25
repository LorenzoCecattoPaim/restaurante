// ============================================================
// employees.js — Equipe (garçons e cozinha): CRUD, ativação,
// histórico e indicadores objetivos por funcionário
// ============================================================

const Employees = (() => {
  let _all         = [];
  let _editingId    = null;
  let _detailId     = null;
  let _detailPeriod = null;
  let _filterText   = '';
  let _filterStatus = 'all';

  const ROLE_LABEL = { waiter: 'Garçom', kitchen: 'Cozinha' };

  const $tbody = () => qs('#employees-tbody');
  const $modal = () => qs('#employee-modal');
  const $detail = () => qs('#employee-detail-modal');

  // ─── Init ─────────────────────────────────────────────────
  async function init() {
    await load();
    bindEvents();
  }

  async function load() {
    try {
      const { data } = await API.employees.list();
      _all = data;
      render();
    } catch (e) {
      Toast.error(e.message || 'Erro ao carregar equipe');
    }
  }

  // ─── Listagem ───────────────────────────────────────────────
  function render() {
    const filtered = _all.filter(u => {
      const text = !_filterText ||
        u.name.toLowerCase().includes(_filterText) ||
        u.username.toLowerCase().includes(_filterText);
      const status = _filterStatus === 'all' ||
        (_filterStatus === 'active'   &&  u.active) ||
        (_filterStatus === 'inactive' && !u.active);
      return text && status;
    });

    const tbody = $tbody();
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6">
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <div class="empty-state-title">Nenhum funcionário encontrado</div>
          <div class="empty-state-desc">Ajuste o filtro ou cadastre um garçom/cozinha</div>
        </div></td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(u => `
      <tr data-id="${u.id}">
        <td>
          <div class="product-name">${esc(u.name)}</div>
          <div class="product-desc">@${esc(u.username)}${u.phone ? ' · ' + esc(u.phone) : ''}</div>
        </td>
        <td><span class="badge">${ROLE_LABEL[u.role] || u.role}</span></td>
        <td class="num">${u.callsHandled}</td>
        <td>${new Date(u.createdAt).toLocaleDateString('pt-BR')}</td>
        <td>
          <label class="toggle" title="${u.active ? 'Ativo' : 'Inativo'}">
            <input type="checkbox" ${u.active ? 'checked' : ''} onchange="Employees.toggleActive(${u.id}, this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td class="actions-cell">
          <button class="btn btn-ghost btn-sm" onclick="Employees.openDetail(${u.id})">📊 Detalhes</button>
          <button class="btn btn-ghost btn-sm" onclick="Employees.openEdit(${u.id})">✏️ Editar</button>
        </td>
      </tr>`).join('');
  }

  // ─── Modal cadastro/edição ──────────────────────────────────
  function openCreate() {
    _editingId = null;
    qs('#emp-form').reset();
    qs('#emp-modal-title').textContent = 'Cadastrar funcionário';
    qs('#emp-field-password').placeholder = 'Senha';
    qs('#emp-field-password').required = true;
    Modal.open($modal());
  }

  function openEdit(id) {
    const u = _all.find(u => u.id === id);
    if (!u) return;
    _editingId = id;
    qs('#emp-modal-title').textContent = 'Editar funcionário';
    qs('#emp-field-name').value     = u.name;
    qs('#emp-field-username').value = u.username;
    qs('#emp-field-role').value     = u.role;
    qs('#emp-field-phone').value    = u.phone || '';
    qs('#emp-field-password').value = '';
    qs('#emp-field-password').placeholder = 'Deixe em branco para manter a senha atual';
    qs('#emp-field-password').required = false;
    Modal.open($modal());
  }

  async function save() {
    const btn = qs('#btn-save-employee');
    const payload = {
      name:     qs('#emp-field-name').value.trim(),
      username: qs('#emp-field-username').value.trim(),
      role:     qs('#emp-field-role').value,
      phone:    qs('#emp-field-phone').value.trim(),
    };
    const password = qs('#emp-field-password').value;
    if (password || !_editingId) payload.password = password;

    if (!payload.name || !payload.username || (!_editingId && !payload.password)) {
      Toast.error('Preencha nome, usuário e senha');
      return;
    }

    setLoading(btn, true);
    try {
      if (_editingId) {
        const { data } = await API.employees.update(_editingId, payload);
        const idx = _all.findIndex(u => u.id === _editingId);
        if (idx !== -1) _all[idx] = { ..._all[idx], ...data };
        Toast.success('Funcionário atualizado!');
      } else {
        const { data } = await API.employees.create(payload);
        _all.unshift({ ...data, roleLabel: ROLE_LABEL[data.role] || data.role, callsHandled: 0 });
        Toast.success('Funcionário cadastrado! Já pode entrar com o login criado.');
      }
      Modal.close($modal());
      render();
    } catch (e) {
      Toast.error(e.message || 'Erro ao salvar');
    } finally {
      setLoading(btn, false);
    }
  }

  async function toggleActive(id, active) {
    try {
      const fn = active ? API.employees.activate : API.employees.deactivate;
      const { data } = await fn(id);
      const idx = _all.findIndex(u => u.id === id);
      if (idx !== -1) _all[idx] = { ..._all[idx], ...data };
      Toast.success(active ? 'Funcionário ativado' : 'Funcionário desativado — acesso encerrado imediatamente');
    } catch (e) {
      Toast.error(e.message || 'Erro ao atualizar');
      load(); // reverte o toggle visual
    }
  }

  // ─── Detalhe / indicadores ──────────────────────────────────
  function openDetail(id) {
    _detailId = id;
    const u = _all.find(u => u.id === id);
    if (!u) return;
    qs('#emp-detail-name').textContent  = u.name;
    qs('#emp-detail-role').textContent  = ROLE_LABEL[u.role] || u.role;
    qs('#emp-detail-status').innerHTML  = u.active
      ? '<span class="badge badge-active">● Ativo</span>' : '<span class="badge badge-inactive">● Inativo</span>';
    Modal.open($detail());
    if (!_detailPeriod) _detailPeriod = Period.mount(qs('#emp-detail-period'), () => loadDetail(), 'today');
    loadDetail();
  }

  async function loadDetail() {
    if (!_detailId || !_detailPeriod) return;
    const r = _detailPeriod.current();
    if (!r) return;
    qs('#emp-detail-range-label').textContent = Period.describe(r);
    try {
      const { data } = await API.employees.detail(_detailId, Period.query(r));
      renderDetail(data);
    } catch (e) {
      Toast.error(e.message || 'Erro ao carregar detalhes');
    }
  }

  const kpi = (label, value, sub = '') =>
    `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;

  function renderDetail(d) {
    const s = d.stats;
    qs('#emp-detail-kpis').innerHTML = [
      kpi('Assumidos', s.accepted, `${s.completed} concluídos`),
      kpi('Cancelados', s.cancelled),
      kpi('Mesas atendidas', s.tablesServed),
      kpi('Tempo médio p/ assumir', Format.duration(s.avgToAccept)),
      kpi('Tempo médio de atendimento', Format.duration(s.avgService)),
      kpi('Tempo total médio', Format.duration(s.avgTotal)),
    ].join('');

    const tbody = qs('#emp-detail-history');
    tbody.innerHTML = s.history.length ? s.history.map(c => `
      <tr>
        <td>Mesa ${esc(c.tableNumber)}</td>
        <td><span class="pill ${c.status === 'completed' ? 'pill-success' : c.status === 'cancelled' ? 'pill-danger' : 'pill-info'}">${statusLabel(c.status)}</span></td>
        <td>${Format.fullDate(c.createdAt)}</td>
        <td>${c.acceptedAt ? Format.date(c.acceptedAt) : '—'}</td>
        <td>${c.completedAt ? Format.date(c.completedAt) : (c.cancelledAt ? '—' : '—')}</td>
      </tr>`).join('')
      : `<tr><td colspan="5"><div class="empty-state" style="padding:20px"><div class="empty-state-desc">Nenhum chamado no período</div></div></td></tr>`;
  }

  function statusLabel(s) {
    return { pending: 'Pendente', accepted: 'Em atendimento', completed: 'Concluído', cancelled: 'Cancelado' }[s] || s;
  }

  // ─── Bind ───────────────────────────────────────────────────
  function bindEvents() {
    qs('#btn-new-employee')?.addEventListener('click', openCreate);
    qs('#btn-save-employee')?.addEventListener('click', save);
    qs('#btn-close-emp-modal')?.addEventListener('click', () => Modal.close($modal()));
    qs('#btn-cancel-emp-modal')?.addEventListener('click', () => Modal.close($modal()));
    Modal.bindOutsideClick($modal());

    qs('#btn-close-emp-detail')?.addEventListener('click', () => Modal.close($detail()));
    Modal.bindOutsideClick($detail());

    qs('#employees-search')?.addEventListener('input', e => {
      _filterText = e.target.value.toLowerCase().trim();
      render();
    });

    qsa('.emp-status-filter-tab').forEach(t => {
      t.addEventListener('click', () => {
        qsa('.emp-status-filter-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        _filterStatus = t.dataset.status;
        render();
      });
    });
  }

  return { init, load, openCreate, openEdit, openDetail, toggleActive };
})();

window.Employees = Employees;
