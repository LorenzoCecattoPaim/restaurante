// ============================================================
// settings.js — Configurações do restaurante
// ============================================================

const Settings = (() => {
  async function init() { await load(); bindEvents(); }

  async function load() {
    try {
      const { data } = await API.settings.get();
      qs('#set-name').value    = data.restaurantName || '';
      qs('#set-address').value = data.address || '';
      qs('#set-phone').value   = data.phone || '';
      qs('#set-open').value    = data.openTime || '';
      qs('#set-close').value   = data.closeTime || '';
    } catch {}
  }

  async function save() {
    const btn = qs('#btn-save-settings');
    setLoading(btn, true);
    try {
      await API.settings.update({
        restaurantName: qs('#set-name').value.trim(),
        address:        qs('#set-address').value.trim(),
        phone:          qs('#set-phone').value.trim(),
        openTime:       qs('#set-open').value,
        closeTime:      qs('#set-close').value,
      });
      Toast.success('Configurações salvas!');
    } catch {
      Toast.error('Erro ao salvar configurações');
    } finally {
      setLoading(btn, false);
    }
  }

  function bindEvents() {
    qs('#btn-save-settings')?.addEventListener('click', save);
  }

  return { init, load };
})();

window.Settings = Settings;
