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
      qs('#set-table-count').value = data.tableCount || '';
      qs('#set-call-alert').value  = data.callAlertSeconds ? +(data.callAlertSeconds / 60).toFixed(1) : 3;
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
        tableCount:       Math.max(0, Math.min(500, parseInt(qs('#set-table-count').value, 10) || 0)),
        callAlertSeconds: Math.max(30, Math.min(3600, Math.round((parseFloat(qs('#set-call-alert').value) || 3) * 60))),
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
