// ============================================================
// products.js — Gestão de produtos (CRUD + categorias)
// ============================================================

const Products = (() => {
  let _all        = [];
  let _categories = [];
  let _editingId  = null;
  let _filterText = '';
  let _filterCat  = 'all';
  let _filterStatus = 'all';

  // ─── Seletores ────────────────────────────────────────────
  const $tbody     = () => qs('#products-tbody');
  const $modal     = () => qs('#product-modal');
  const $form      = () => qs('#product-form');
  const $catFilter = () => qs('#products-cat-filter');

  // ─── Init ─────────────────────────────────────────────────
  async function init() {
    await Promise.all([loadCategories(), load()]);
    bindEvents();
  }

  async function loadCategories() {
    try {
      const { data } = await API.categories.list();
      _categories = data;
      populateCatSelects();
      renderCatManager();
    } catch {}
  }

  async function load() {
    try {
      const { data } = await API.products.list();
      _all = data;
      render();
      updateCatFilter();
    } catch {
      Toast.error('Erro ao carregar produtos');
    }
  }

  // ─── Render tabela ─────────────────────────────────────────
  function render() {
    const filtered = _all.filter(p => {
      const text = !_filterText ||
        p.name.toLowerCase().includes(_filterText) ||
        (p.description || '').toLowerCase().includes(_filterText);
      const cat    = _filterCat === 'all' || p.category === _filterCat;
      const status = _filterStatus === 'all' ||
        (_filterStatus === 'active'   &&  p.active) ||
        (_filterStatus === 'inactive' && !p.active);
      return text && cat && status;
    });

    const tbody = $tbody();
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6">
        <div class="empty-state">
          <div class="empty-state-icon">🍽️</div>
          <div class="empty-state-title">Nenhum produto encontrado</div>
          <div class="empty-state-desc">Ajuste o filtro ou crie um novo produto</div>
        </div></td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(p => `
      <tr data-id="${p.id}">
        <td>
          ${p.image
            ? `<img class="td-img" src="${p.image}" alt="${p.name}"
                onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`
            : ''}
          <div class="td-img-placeholder" ${p.image ? 'style="display:none"' : ''}>🍔</div>
        </td>
        <td>
          <div class="product-name">${p.name}</div>
          <div class="product-desc">${p.description || '—'}</div>
        </td>
        <td><span class="badge">${p.category}</span></td>
        <td><span class="price">${Format.currency(p.price)}</span></td>
        <td>
          <label class="toggle" title="${p.active ? 'Ativo' : 'Inativo'}">
            <input type="checkbox" ${p.active ? 'checked' : ''}
              onchange="Products.toggleActive(${p.id}, this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td class="actions-cell">
          <button class="btn btn-ghost btn-sm" onclick="Products.openEdit(${p.id})">✏️ Editar</button>
          <button class="btn btn-danger btn-sm" onclick="Products.confirmDelete(${p.id})">🗑</button>
        </td>
      </tr>`).join('');
  }

  function updateCatFilter() {
    const sel = $catFilter();
    if (!sel) return;
    const cats = [...new Set(_all.map(p => p.category))].sort();
    sel.innerHTML = '<option value="all">Todas as categorias</option>' +
      cats.map(c => `<option value="${c}">${c}</option>`).join('');
    sel.value = _filterCat;
  }

  // ─── Modal CRUD ────────────────────────────────────────────
  function openCreate() {
    _editingId = null;
    $form().reset();
    qs('#modal-title').textContent = 'Novo produto';
    qs('#field-active').checked = true;
    updateImgPreview('');
    Modal.open($modal());
  }

  function openEdit(id) {
    const p = _all.find(p => p.id === id);
    if (!p) return;
    _editingId = id;
    qs('#modal-title').textContent = 'Editar produto';
    qs('#field-name').value        = p.name;
    qs('#field-description').value = p.description || '';
    qs('#field-price').value       = p.price;
    qs('#field-category').value    = p.category;
    qs('#field-image').value       = p.image || '';
    qs('#field-active').checked    = p.active;
    updateImgPreview(p.image || '');
    Modal.open($modal());
  }

  async function save() {
    const btn = qs('#btn-save-product');
    const payload = {
      name:        qs('#field-name').value.trim(),
      description: qs('#field-description').value.trim(),
      price:       parseFloat(qs('#field-price').value),
      category:    qs('#field-category').value,
      image:       qs('#field-image').value.trim(),
      active:      qs('#field-active').checked,
    };

    if (!payload.name || !payload.price || !payload.category) {
      Toast.error('Preencha nome, preço e categoria');
      return;
    }

    setLoading(btn, true);
    try {
      if (_editingId) {
        const { data } = await API.products.update(_editingId, payload);
        const idx = _all.findIndex(p => p.id === _editingId);
        if (idx !== -1) _all[idx] = data;
        Toast.success('Produto atualizado!');
      } else {
        const { data } = await API.products.create(payload);
        _all.unshift(data);
        Toast.success('Produto criado!');
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
      const { data } = await API.products.update(id, { active });
      const idx = _all.findIndex(p => p.id === id);
      if (idx !== -1) _all[idx] = data;
    } catch {
      Toast.error('Erro ao atualizar');
      load(); // reverte
    }
  }

  function confirmDelete(id) {
    const p = _all.find(p => p.id === id);
    if (!p || !confirmDialog(`Remover "${p.name}"? Esta ação não pode ser desfeita.`)) return;
    deleteProduct(id);
  }

  async function deleteProduct(id) {
    try {
      await API.products.remove(id);
      _all = _all.filter(p => p.id !== id);
      render();
      Toast.success('Produto removido');
    } catch (e) {
      Toast.error(e.message || 'Erro ao remover');
    }
  }

  // ─── Categorias ────────────────────────────────────────────
  function populateCatSelects() {
    qsa('select[data-categories]').forEach(sel => {
      const cur = sel.value;
      sel.innerHTML = '<option value="">Selecione…</option>' +
        _categories.map(c => `<option value="${c}">${c}</option>`).join('');
      if (cur) sel.value = cur;
    });
  }

  function renderCatManager() {
    const wrap = qs('#cat-list');
    if (!wrap) return;
    wrap.innerHTML = _categories.map(c => `
      <div class="cat-chip">
        <span>${c}</span>
        <button onclick="Products.deleteCategory('${c}')" class="cat-chip-del" title="Remover">×</button>
      </div>`).join('') || '<span style="color:var(--text-muted);font-size:.8rem">Nenhuma categoria</span>';
  }

  async function addCategory() {
    const inp  = qs('#new-cat-input');
    const name = inp.value.trim();
    if (!name) return;
    try {
      const { data } = await API.categories.create(name);
      _categories = data;
      inp.value = '';
      populateCatSelects();
      renderCatManager();
      Toast.success(`Categoria "${name}" criada`);
    } catch (e) {
      Toast.error(e.message);
    }
  }

  async function deleteCategory(name) {
    if (!confirmDialog(`Remover categoria "${name}"?`)) return;
    try {
      const { data } = await API.categories.remove(name);
      _categories = data;
      populateCatSelects();
      renderCatManager();
      Toast.success('Categoria removida');
    } catch (e) {
      Toast.error(e.message);
    }
  }

  function updateImgPreview(url) {
    const img = qs('#img-preview');
    if (!img) return;
    img.src           = url;
    img.style.display = url ? 'block' : 'none';
  }

  // ─── Bind events ───────────────────────────────────────────
  function bindEvents() {
    qs('#btn-new-product')?.addEventListener('click', openCreate);
    qs('#btn-save-product')?.addEventListener('click', save);
    qs('#btn-close-modal')?.addEventListener('click', () => Modal.close($modal()));
    qs('#btn-cancel-modal')?.addEventListener('click', () => Modal.close($modal()));
    Modal.bindOutsideClick($modal());

    qs('#products-search')?.addEventListener('input', e => {
      _filterText = e.target.value.toLowerCase().trim();
      render();
    });

    $catFilter()?.addEventListener('change', e => {
      _filterCat = e.target.value;
      render();
    });

    qsa('.status-filter-tab').forEach(t => {
      t.addEventListener('click', () => {
        qsa('.status-filter-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        _filterStatus = t.dataset.status;
        render();
      });
    });

    qs('#field-image')?.addEventListener('input', e => updateImgPreview(e.target.value.trim()));
    qs('#btn-add-cat')?.addEventListener('click', addCategory);
    qs('#new-cat-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') addCategory(); });
  }

  return { init, load, openCreate, openEdit, confirmDelete, toggleActive, addCategory, deleteCategory };
})();

window.Products = Products;
