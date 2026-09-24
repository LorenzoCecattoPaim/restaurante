// ============================================================
// calls.js — Chamados de garçom (painel da equipe)
// Mesmo mecanismo de tempo real do sistema: polling.
// ============================================================

const Calls = (() => {
  const POLL_MS = (window.CONFIG && CONFIG.CALLS_POLL_INTERVAL) || 5000;

  let _all          = [];
  let _alertSeconds = 180;
  let _clockOffset  = 0;          // diferença relógio servidor − navegador
  let _knownPending = new Set();
  let _firstLoad    = true;
  let _timer        = null;
  let _tick         = null;
  let _busy         = new Set();  // evita duplo clique

  const now = () => Date.now() + _clockOffset;
  const waitingSeconds = c => (now() - new Date(c.createdAt).getTime()) / 1000;
  const isLate = c => c.status === 'pending' && waitingSeconds(c) >= _alertSeconds;

  async function init() {
    await load(true);
    _timer = setInterval(() => load(true), POLL_MS);
    _tick  = setInterval(updateClocks, 1000);
  }

  async function load(silent = false) {
    try {
      const res = await API.calls.list();
      _all          = res.data;
      _alertSeconds = res.alertSeconds || 180;
      _clockOffset  = new Date(res.serverNow).getTime() - Date.now();

      const pending = _all.filter(c => c.status === 'pending');
      const fresh   = pending.filter(c => !_knownPending.has(c.id));
      if (fresh.length && !_firstLoad) {
        softChime();
        Toast.info(`🙋 Mesa ${esc(fresh[0].tableNumber)}: ${esc(fresh[0].typeLabel)}`);
      }
      _knownPending = new Set(pending.map(c => c.id));
      _firstLoad = false;

      updateBadge(pending.length);
      render();
      renderStrip();
    } catch (e) {
      if (!silent) Toast.error(e.message || 'Erro ao carregar chamados');
    }
  }

  // ─── Render ───────────────────────────────────────────────
  function render() {
    const board = qs('#calls-board');
    if (!board) return;

    const active = _all.filter(c => ['pending', 'accepted'].includes(c.status));
    const done   = _all.filter(c => !['pending', 'accepted'].includes(c.status));

    const sub = qs('#calls-subtitle');
    if (sub) sub.textContent = `Destaque após ${Format.duration(_alertSeconds)} de espera · atualiza a cada ${Math.round(POLL_MS / 1000)}s`;

    if (!_all.length) {
      board.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;padding:60px">
          <div class="empty-state-icon">🙋</div>
          <div class="empty-state-title">Nenhum chamado agora</div>
          <div class="empty-state-desc">Quando um cliente tocar em "Chamar garçom" na mesa, o chamado aparece aqui.</div>
        </div>`;
      return;
    }

    board.innerHTML = [...active, ...done].map(card).join('');
  }

  function card(c) {
    const late = isLate(c);
    const cls  = c.status === 'pending' ? 'is-pending' : c.status === 'accepted' ? 'is-accepted' : 'is-done';
    const busy = _busy.has(c.id) ? 'disabled' : '';

    let status = '', actions = '', meta = '';
    if (c.status === 'pending') {
      status  = `<span class="call-wait" data-call-wait="${c.id}">⏱ ${Format.duration(waitingSeconds(c))}</span>`;
      actions = `
        <button class="btn btn-primary btn-sm" ${busy} onclick="Calls.accept(${c.id})">Assumir</button>
        ${c.type === 'conta' && App.can('accounts')
          ? `<button class="btn btn-ghost btn-sm" onclick="Accounts.open('${esc(c.tableNumber)}')">Abrir conta</button>` : ''}
        <button class="btn btn-ghost btn-sm" ${busy} onclick="Calls.cancel(${c.id})" title="Cancelar chamado">Cancelar</button>`;
      meta = `Aberto às ${Format.date(c.createdAt)}`;
    } else if (c.status === 'accepted') {
      status  = `<span class="pill pill-info">Em atendimento</span>`;
      actions = `
        <button class="btn btn-success btn-sm" ${busy} onclick="Calls.complete(${c.id})">Concluir</button>
        ${c.type === 'conta' && App.can('accounts')
          ? `<button class="btn btn-ghost btn-sm" onclick="Accounts.open('${esc(c.tableNumber)}')">Abrir conta</button>` : ''}
        <button class="btn btn-ghost btn-sm" ${busy} onclick="Calls.cancel(${c.id})" title="Cancelar chamado" aria-label="Cancelar chamado">✕</button>`;
      meta = `${esc(c.acceptedBy?.name || '—')} assumiu após ${Format.duration((new Date(c.acceptedAt) - new Date(c.createdAt)) / 1000)}`;
    } else if (c.status === 'completed') {
      status = `<span class="pill pill-success">Concluído</span>`;
      const total = (new Date(c.completedAt) - new Date(c.createdAt)) / 1000;
      meta = c.autoCompleted === 'payment'
        ? `Concluído pelo pagamento da conta · total ${Format.duration(total)}`
        : `${esc(c.completedBy?.name || '—')} · tempo total ${Format.duration(total)}`;
    } else {
      status = `<span class="pill pill-muted">Cancelado</span>`;
      meta = `${esc(c.cancelledBy?.name || '—')}${c.cancelReason ? ' · ' + esc(c.cancelReason) : ''}`;
    }

    return `
      <div class="call-card ${cls}${late ? ' is-late' : ''}" data-call="${c.id}">
        <div class="call-head">
          <div>
            <div class="call-table">Mesa ${esc(c.tableNumber)}</div>
            <div class="call-type">${c.type === 'conta' ? '🧾' : '🙋'} ${esc(c.typeLabel)}</div>
          </div>
          ${status}
        </div>
        <div class="call-meta">${meta}</div>
        ${actions ? `<div class="call-actions">${actions}</div>` : ''}
      </div>`;
  }

  // Atualiza cronômetros sem re-renderizar a lista inteira
  function updateClocks() {
    qsa('[data-call-wait]').forEach(el => {
      const c = _all.find(x => x.id === Number(el.dataset.callWait));
      if (!c) return;
      el.textContent = `⏱ ${Format.duration(waitingSeconds(c))}`;
      el.closest('.call-card')?.classList.toggle('is-late', isLate(c));
    });
    renderStrip();
  }

  // Faixa com chamados que passaram do limite (mostrada nas outras telas)
  function renderStrip() {
    const strip = qs('#calls-strip');
    if (!strip) return;
    const late = _all.filter(isLate).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const onCalls = qs('#section-calls')?.classList.contains('active');
    if (!late.length || onCalls) { strip.classList.remove('show'); return; }
    strip.classList.add('show');
    strip.innerHTML = `
      <span>🔴</span>
      ${late.slice(0, 4).map(c => `<span class="calls-strip-item">Mesa ${esc(c.tableNumber)} esperando há <b>${Format.duration(waitingSeconds(c))}</b></span>`).join('')}
      ${late.length > 4 ? `<span class="calls-strip-item">+${late.length - 4}</span>` : ''}
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="App.navigate('calls')">Ver chamados</button>`;
  }

  function updateBadge(n) {
    const el = qs('#calls-badge');
    if (!el) return;
    el.textContent = n;
    el.style.display = n > 0 ? 'inline-flex' : 'none';
  }

  // Um toque curto e baixo — sem alarme contínuo
  let _ctx = null;
  function softChime() {
    if (localStorage.getItem('rs_sound') === 'false') return;
    try {
      _ctx = _ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = _ctx.createOscillator(), g = _ctx.createGain();
      o.connect(g); g.connect(_ctx.destination);
      o.type = 'sine'; o.frequency.value = 660;
      g.gain.setValueAtTime(0.12, _ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, _ctx.currentTime + 0.35);
      o.start(); o.stop(_ctx.currentTime + 0.4);
    } catch {}
  }

  // ─── Ações ────────────────────────────────────────────────
  async function act(id, fn, okMsg) {
    if (_busy.has(id)) return;
    _busy.add(id);
    render();
    try {
      await fn();
      Toast.success(okMsg);
    } catch (e) {
      Toast.error(e.message || 'Não foi possível atualizar o chamado');
    } finally {
      _busy.delete(id);
      await load(true);
    }
  }

  const accept   = id => act(id, () => API.calls.accept(id),   'Chamado assumido');
  const complete = id => act(id, () => API.calls.complete(id), 'Chamado concluído');
  async function cancel(id) {
    const ok = await confirmDialog('Cancelar este chamado? Ele sai da fila e conta como cancelado nas análises.');
    if (ok) act(id, () => API.calls.cancel(id, ''), 'Chamado cancelado');
  }

  return { init, load, accept, complete, cancel, render };
})();

window.Calls = Calls;
