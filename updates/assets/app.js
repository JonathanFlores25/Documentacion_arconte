// ════════════════════════════════════════════════════════════════════
//  CV Celestial — lógica compartida (multipágina). Generado por build_pages.py
// ════════════════════════════════════════════════════════════════════

// Fecha de HOY en zona horaria LOCAL (YYYY-MM-DD). Reemplaza al patrón
// new Date().toISOString().slice(0,10), que devuelve la fecha en UTC y por la
// noche (México = UTC-6) marcaba el día siguiente.
function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Separa un responsable combinado ("Juan / Jonathan", "Abelardo/Jonathan",
// "Ana y Luis") en personas individuales, para que una tarea compartida
// aparezca en CADA persona (no en un grupo "Juan/Jonathan"). Vacío -> "Equipo".
function splitPeople(str) {
  const s = (str || '').trim();
  if (!s) return ['Equipo'];
  const parts = s.split(/\s*[\/,;&]\s*|\s+(?:y|e)\s+/i).map(p => p.trim()).filter(Boolean);
  return parts.length ? parts : ['Equipo'];
}

    const now = new Date();
    const fmt = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' });
    var _fdEl = document.getElementById('footer-date'); if (_fdEl) _fdEl.textContent = fmt.format(now);
  

  // ── Roadmap UI ─────────────────────────────────────────────────────────────

  // Store global
  const _rm = {
    byDate: {}, phases: [], estado: {},
    rawData: null,   // datos crudos del xlsx (sin edits aplicados)
    edits: null,     // roadmap_edits.json
    editMode: false,        // modo edición roadmap
    acuerdoEditMode: false, // modo edición acuerdos
    calYear: null, calMonth: null,  // mes roadmap
    acuerdoYear: null, acuerdoMonth: null  // mes acuerdos
  };

  const AREA_CLASS = {
    'PM':'PM','Infra':'Infra','AI Eng':'AIEng',
    'Datos':'Datos','Frontend':'Frontend','Ciclo':'Ciclo','QA':'QA'
  };
  const PHASE_LABEL = {
    done:'Completada', paused:'En pausa', continuous:'Continuo', active:'En curso'
  };
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  // Paleta de colores por índice de fase (cada fase tiene su propio color)
  const PHASE_PALETTE = [
    'rgba(34,211,238,0.28)',   // azul
    'rgba(163,230,53,0.28)',  // violeta
    'rgba(251,191,36,0.28)',   // ámbar
    'rgba(236,72,153,0.28)',   // rosa
    'rgba(20,184,166,0.28)',   // teal
    'rgba(249,115,22,0.28)',   // naranja
    'rgba(99,102,241,0.28)',   // índigo
    'rgba(244,63,94,0.28)',    // rojo rosado
  ];
  const PHASE_COLOR_DONE   = 'rgba(52,211,153,0.30)'; // verde — todas las tareas completadas
  const PHASE_COLOR_PAUSED = 'rgba(251,191,36,0.22)'; // ámbar — en pausa
  // (Alias legacy para código que aún lo use)
  const PHASE_COLOR = { done: PHASE_COLOR_DONE, active: PHASE_PALETTE[0], paused: PHASE_COLOR_PAUSED, continuous: PHASE_PALETTE[0] };

  /** Estado efectivo de una fase basado en si todas sus tareas activas están hechas */
  function phaseEffectiveStatus(phase, estado, isRetail) {
    if (phase.status === 'paused') return 'paused';
    const tasks = (phase.tasks || []).filter(t => !t.deleted);
    if (!tasks.length) return phase.status;
    const allDone = tasks.every(t => {
      if (isRetail) {
        const key = 'retail_' + t.id;
        return key in (estado || {}) ? estado[key] : t.done_xlsx;
      }
      return !!t.done;
    });
    return allDone ? 'done' : phase.status;
  }

  /** Color de celda de calendario para una fase (índice pi, opcional estado) */
  function phaseCalColor(phase, pi, estado, isRetail) {
    const eff = phaseEffectiveStatus(phase, estado, isRetail);
    if (eff === 'done')   return PHASE_COLOR_DONE;
    if (eff === 'paused') return PHASE_COLOR_PAUSED;
    return PHASE_PALETTE[pi % PHASE_PALETTE.length];
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function isoFromParts(y, m1, d) {
    return `${y}-${String(m1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  function daysInMonth(y, m0) { return new Date(y, m0 + 1, 0).getDate(); }
  function startDow(y, m0) {              // Lunes=0 … Dom=6
    const d = new Date(y, m0, 1).getDay();
    return d === 0 ? 6 : d - 1;
  }
  function todayISO() { return todayLocalISO(); }

  // Genera el HTML del wrapper del calendario (sin IDs — usa clases)
  function calWrapHTML(legendHTML) {
    return `<div class="rm-cal-wrap">
      <div class="rm-cal-nav">
        <button class="rm-cal-arrow rm-cal-prev">‹</button>
        <span class="rm-cal-month-label"></span>
        <button class="rm-cal-arrow rm-cal-next">›</button>
      </div>
      <div class="rm-cal-dow">
        <span>Lun</span><span>Mar</span><span>Mié</span>
        <span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span>
      </div>
      <div class="rm-cal-grid"></div>
      <div class="rm-cal-detail" style="display:none;"></div>
      ${legendHTML || ''}
    </div>`;
  }

  // Renderiza el grid de días en el calendario
  function renderGrid(wrap, year, month0, buildCell) {
    const grid  = wrap.querySelector('.rm-cal-grid');
    const label = wrap.querySelector('.rm-cal-month-label');
    label.textContent = `${MESES[month0]} ${year}`;
    const total = daysInMonth(year, month0);
    const offset = startDow(year, month0);
    const today  = todayISO();
    let html = '';
    for (let i = 0; i < offset; i++) html += '<div class="rm-cal-day empty"></div>';
    for (let d = 1; d <= total; d++) {
      const iso = isoFromParts(year, month0 + 1, d);
      html += buildCell(d, iso, iso === today);
    }
    grid.innerHTML = html;
    wrap.querySelector('.rm-cal-detail').style.display = 'none';
  }

  // ── Votación — eliminar roadmap ───────────────────────────────────────────

  async function loadVotes() {
    try {
      const r = await fetch('/api/votes');
      if (!r.ok) return;
      const data = await r.json();
      _pendingVotes = (data.proposals || []).filter(p => p.status === 'pending');
      renderVoteBanner();
    } catch(e) {}
  }

  function renderVoteBanner() {
    const banner = document.getElementById('vote-banner');
    if (!banner) return;
    if (!_pendingVotes.length) { banner.style.display = 'none'; banner.innerHTML = ''; return; }
    banner.style.display = 'flex';
    banner.innerHTML = _pendingVotes.map(v => {
      const voters     = v.votes.map(vt => vt.user).join(', ');
      const myVote     = v.votes.some(vt => vt.user === _currentUser);
      const isProposer = v.proposed_by === _currentUser;
      const safeReason = v.reason.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const voteBtn    = myVote
        ? `<span style="font-size:11px;color:var(--green);white-space:nowrap;">✓ Votaste</span>`
        : `<button class="vote-action-btn" onclick="openVoteCastModal('${v.id}','${v.project}','${safeReason}')">Votar a favor</button>`;
      const cancelBtn  = isProposer
        ? `<button class="vote-action-btn cancel" onclick="cancelVoteProposal('${v.id}')">Cancelar</button>`
        : '';
      return `<div class="vote-banner-item">
        <span class="vote-badge-pill">Voto pendiente</span>
        <span class="vote-banner-reason"><strong>${v.proposed_by}</strong> propone eliminar roadmap <strong>${v.project}</strong>: "${v.reason}"</span>
        <span class="vote-banner-progress">${v.votes.length}/${v.needed} votos (${voters})</span>
        ${voteBtn}${cancelBtn}
      </div>`;
    }).join('');
  }

  function proposeRoadmapDelete(project, title) {
    requireAdmin(() => {
      _voteProposalCtx = { project, title };
      const needed = Math.floor(4 / 2) + 1; // se calcula en backend; aquí es orientativo
      document.getElementById('vote-propose-info').textContent =
        `Proyecto: "${title}". Se necesitan ${needed} votos del equipo para aprobar. ` +
        `Esta acción eliminará todas las fases, tareas y estado del roadmap de forma permanente.`;
      document.getElementById('vote-reason-input').value = '';
      document.getElementById('vote-propose-err').textContent = '';
      document.getElementById('vote-propose-overlay').classList.add('open');
    });
  }

  function closeVoteModal() {
    document.getElementById('vote-propose-overlay').classList.remove('open');
    _voteProposalCtx = null;
  }

  async function submitVoteProposal() {
    if (!_voteProposalCtx) return;
    const reason = document.getElementById('vote-reason-input').value.trim();
    const errEl  = document.getElementById('vote-propose-err');
    if (!reason) { errEl.textContent = 'Escribe la razón para eliminar.'; return; }
    errEl.textContent = '';
    try {
      const r = await fetch('/api/votes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: _adminToken, project: _voteProposalCtx.project, reason })
      });
      const data = await r.json();
      if (!r.ok) { errEl.textContent = data.detail || 'Error al proponer.'; return; }
      const project = _voteProposalCtx.project;
      closeVoteModal();
      await loadVotes();
      if (data.approved) {
        _applyLocalRoadmapDeletion(project);
        alert('Consenso alcanzado. Roadmap eliminado.');
        location.reload();
      }
    } catch(e) { errEl.textContent = 'Error de conexión.'; }
  }

  function openVoteCastModal(voteId, project, reason) {
    _voteCastId = voteId;
    document.getElementById('vote-cast-info').innerHTML =
      `<strong>Proyecto:</strong> ${project}<br><strong>Razón:</strong> "${reason}"`;
    document.getElementById('vote-cast-token').value = '';
    document.getElementById('vote-cast-err').textContent = '';
    document.getElementById('vote-cast-overlay').classList.add('open');
  }

  function closeVoteCastModal() {
    document.getElementById('vote-cast-overlay').classList.remove('open');
    _voteCastId = null;
  }

  async function submitCastVote() {
    if (!_voteCastId) return;
    const token = document.getElementById('vote-cast-token').value.trim();
    const errEl = document.getElementById('vote-cast-err');
    if (!token) { errEl.textContent = 'Ingresa tu token.'; return; }
    errEl.textContent = '';
    try {
      const r = await fetch(`/api/votes/${_voteCastId}/cast`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await r.json();
      if (!r.ok) { errEl.textContent = data.detail || 'Error al votar.'; return; }
      const project = data.proposal?.project;
      closeVoteCastModal();
      await loadVotes();
      if (data.approved) {
        if (project) _applyLocalRoadmapDeletion(project);
        alert('Consenso alcanzado. Roadmap eliminado.');
        location.reload();
      }
    } catch(e) { errEl.textContent = 'Error de conexión.'; }
  }

  /** Limpia la memoria del roadmap inmediatamente sin esperar al reload */
  function _applyLocalRoadmapDeletion(project) {
    // Limpia platform project en memoria y re-renderiza
    if (_projects[project]) {
      _projects[project].phases       = [];
      _projects[project].sprint_tasks = {};
      _projects[project].acuerdos     = [];
      try { renderPlatformRoadmap(project); } catch(e) {}
    }
    // Limpia roadmap xlsx en memoria si aplica
    if (project === 'arconte_retail' && _rm) {
      _rm.rawData = { phases: [], acuerdos: [] };
      _rm.edits   = {};
      try { rerender(); } catch(e) {}
      try { renderAcuerdosCalendar([]); } catch(e) {}
    }
    refreshWeekView();
  }

  async function cancelVoteProposal(voteId) {
    if (!confirm('¿Cancelar la propuesta de eliminación?')) return;
    try {
      const r = await fetch(`/api/votes/${voteId}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: _adminToken })
      });
      if (r.ok) await loadVotes();
    } catch(e) {}
  }

  // ── Toggle / tabs ─────────────────────────────────────────────────────────

  function toggleRm(btn, contentId) {
    btn.classList.toggle('open');
    const el = document.getElementById(contentId);
    if (el.style.display === 'none') {
      el.style.display = 'block';
      if (!el.dataset.loaded) {
        el.dataset.loaded = '1';
        // Platform roadmaps se cargan una vez globalmente en DOMContentLoaded
      }
    } else {
      el.style.display = 'none';
    }
  }

  // ── Admin / Auth ──────────────────────────────────────────────────────────

  let _adminToken  = localStorage.getItem('cv_admin_token') || '';
  let _currentUser = localStorage.getItem('cv_admin_user')  || '';

  // ── Estado de votaciones ──────────────────────────────────────────────────
  let _pendingVotes       = [];   // propuestas pending del servidor
  let _voteProposalCtx    = null; // { project, title } al abrir modal propuesta
  let _voteCastId         = null; // id de propuesta al abrir modal voto

  function isAdmin() { return !!_adminToken; }

  function updateAdminUI() {
    const btn    = document.getElementById('admin-lock-btn');
    const label  = document.getElementById('admin-lock-label');
    const logout = document.getElementById('admin-logout-btn');
    if (isAdmin()) {
      btn.classList.add('unlocked');
      label.textContent = _currentUser ? `${_currentUser} ✓` : 'Admin ✓';
      if (logout) logout.style.display = '';
    } else {
      btn.classList.remove('unlocked');
      label.textContent = 'Admin';
      if (logout) logout.style.display = 'none';
    }
    document.body.classList.toggle('admin-active', isAdmin());

    // Bitácora: visible solo para admin
    const admin     = isAdmin();
    const navBita   = document.getElementById('nav-bitacora');
    const secBita   = document.getElementById('sec-bitacora');
    const bitaBody  = document.getElementById('bitacora-body');
    const bitaLock  = document.getElementById('bitacora-locked');
    if (navBita)  navBita.style.display = admin ? '' : 'none';
    if (secBita)  secBita.style.display = admin ? '' : 'none';
    if (bitaBody) bitaBody.style.display = admin ? '' : 'none';
    if (bitaLock) bitaLock.style.display = admin ? 'none' : '';
    if (admin) loadAudit();
  }

  function openAdminModal() {
    const input  = document.getElementById('admin-token-input');
    const err    = document.getElementById('admin-modal-err');
    const title  = document.getElementById('admin-modal-title');
    const logout = document.getElementById('admin-logout-btn');
    err.textContent = '';
    if (isAdmin()) {
      title.textContent = `🔓 Sesión activa: ${_currentUser || 'Admin'}`;
      input.style.display = 'none';
      if (logout) logout.style.display = '';
    } else {
      title.textContent = '🔒 Identificarse';
      input.style.display = '';
      input.value = '';
      if (logout) logout.style.display = 'none';
      setTimeout(() => input.focus(), 60);
    }
    document.getElementById('admin-overlay').classList.add('open');
  }

  function closeAdminModal() {
    document.getElementById('admin-overlay').classList.remove('open');
  }

  async function submitAdminToken() {
    const input = document.getElementById('admin-token-input');
    const err   = document.getElementById('admin-modal-err');
    const token = input.value.trim();
    if (!token) { err.textContent = 'Ingresa tu token'; return; }
    try {
      const res  = await fetch('/api/verify-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      if (data.ok) {
        _adminToken  = token;
        _currentUser = data.name || 'Admin';
        localStorage.setItem('cv_admin_token', token);
        localStorage.setItem('cv_admin_user',  _currentUser);
        updateAdminUI();
        closeAdminModal();
        _rerenderAllToolbars();
        if (_pendingAdminCb) { const cb = _pendingAdminCb; _pendingAdminCb = null; cb(); }
      } else {
        err.textContent = 'Token incorrecto';
        input.select();
      }
    } catch(e) {
      err.textContent = 'Error de conexión';
    }
  }

  function logoutAdmin() {
    _adminToken  = '';
    _currentUser = '';
    localStorage.removeItem('cv_admin_token');
    localStorage.removeItem('cv_admin_user');
    updateAdminUI();
    closeAdminModal();
    _rerenderAllToolbars();
  }

  function _rerenderAllToolbars() {
    // Re-renderiza roadmap y proyectos para mostrar/ocultar botones según isAdmin()
    if (_rm && _rm.rawData) rerender();
    if (typeof _projects !== 'undefined') {
      Object.keys(_projects).forEach(pid => {
        try { renderPlatformRoadmap(pid); } catch(e) {}
      });
    }
    try { renderNewProjBtn(); } catch(e) {}
    try { renderDynamicProjects(); } catch(e) {}
    // Cancelar cualquier edición de métricas activa si el admin cierra sesión
    Object.keys(_smEditMode).forEach(pid => {
      if (_smEditMode[pid]) cancelStaticMetricsEdit(pid);
    });
  }

  let _pendingAdminCb     = null;
  let _softDeleteCallback = null;

  function requireAdmin(cb) {
    if (isAdmin()) { cb(); return; }
    _pendingAdminCb = cb;
    openAdminModal();
  }

  // Siempre pide razón al eliminar
  // ── Modal de acción genérico (visto bueno / razón) ───────────────────────
  function openActionModal({ title, info, label, placeholder, btnLabel, required = false }, cb) {
    _actionModalRequired = required;
    _actionModalCb = cb;
    document.getElementById('action-modal-title').textContent    = title   || 'Confirmar';
    document.getElementById('action-modal-info').textContent     = info    || '';
    document.getElementById('action-modal-label').textContent    = label   || '';
    document.getElementById('action-modal-input').placeholder    = placeholder || 'Describe el motivo…';
    document.getElementById('action-modal-input').value          = '';
    document.getElementById('action-modal-confirm-btn').textContent = btnLabel || 'Confirmar';
    document.getElementById('action-overlay').classList.add('open');
    setTimeout(() => document.getElementById('action-modal-input').focus(), 60);
  }
  function closeActionModal() {
    document.getElementById('action-overlay').classList.remove('open');
    _actionModalCb = null;
  }
  function confirmActionModal() {
    const note = document.getElementById('action-modal-input').value.trim();
    if (_actionModalRequired && !note) {
      document.getElementById('action-modal-input').style.border = '1px solid var(--red)';
      document.getElementById('action-modal-input').focus();
      return;
    }
    document.getElementById('action-modal-input').style.border = '';
    const cb = _actionModalCb;
    closeActionModal();
    if (cb) cb(note);
  }

  // ── Navegación de sprints en la vista semanal ─────────────────────────────
  function getWeekSprints() {
    const today = todayLocalISO();
    let curIdx = SPRINTS.findIndex(s => today >= s.start && today <= s.end);
    if (curIdx < 0) curIdx = SPRINTS.findIndex(s => today < s.start);
    if (curIdx < 0) curIdx = SPRINTS.length - 1;
    const startIdx = Math.max(0, Math.min(SPRINTS.length - 1, curIdx + _weekSprintOffset));
    return SPRINTS.slice(startIdx, Math.min(SPRINTS.length, startIdx + 4));
  }
  function navWeekView(delta) { _weekSprintOffset += delta; refreshWeekView(); }
  function navWeekViewHome()  { _weekSprintOffset  = 0;     refreshWeekView(); }

  function requireAdminDelete(itemDesc, cb) {
    const doDelete = () => openSoftDeleteModal(itemDesc, cb);
    if (isAdmin()) { doDelete(); return; }
    _pendingAdminCb = doDelete;
    openAdminModal();
  }

  function openSoftDeleteModal(info, cb) {
    _softDeleteCallback = cb;
    document.getElementById('delete-modal-info').textContent = `Eliminando: ${info}`;
    document.getElementById('delete-reason-input').value = '';
    document.getElementById('delete-overlay').classList.add('open');
    setTimeout(() => document.getElementById('delete-reason-input').focus(), 60);
  }

  function closeSoftDeleteModal() {
    document.getElementById('delete-overlay').classList.remove('open');
    _softDeleteCallback = null;
  }

  function confirmSoftDelete() {
    const reason = document.getElementById('delete-reason-input').value.trim();
    const cb = _softDeleteCallback;
    closeSoftDeleteModal();
    if (cb) cb(reason);
  }

  // ── Notificaciones ────────────────────────────────────────────────────────

  async function notifyChange(action, type, project, detail) {
    try {
      await fetch('/api/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: _adminToken, action, type, project, detail })
      });
    } catch(e) {} // silencioso si no hay email configurado
    // Si la bitácora está visible (admin), refréscala para reflejar el evento.
    if (isAdmin() && document.getElementById('bitacora-body')?.style.display !== 'none') {
      loadAudit();
    }
  }

  // ── Bitácora / Historial ────────────────────────────────────────────────────
  let _auditEvents = [];

  async function loadAudit() {
    if (!isAdmin()) return;
    try {
      const r = await fetch('/api/audit?token=' + encodeURIComponent(_adminToken));
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      _auditEvents = data.events || [];
      renderAudit();
    } catch (e) {
      const list = document.getElementById('bitacora-list');
      if (list) list.innerHTML = `<div style="font-size:12px;color:var(--red);padding:10px;">No se pudo cargar la bitácora (${e.message || e}).</div>`;
    }
  }

  function renderAudit() {
    const list = document.getElementById('bitacora-list');
    if (!list) return;
    const q       = (document.getElementById('bitacora-search')?.value || '').toLowerCase().trim();
    const actFilt = document.getElementById('bitacora-action')?.value || '';
    const ACT_LABEL = { delete:'Eliminó', add:'Agregó', move:'Movió', edit:'Editó', evidence:'Evidencia' };
    const ESC = s => String(s == null ? '' : s).replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const filtered = _auditEvents.filter(ev => {
      if (actFilt && (ev.action || '') !== actFilt) return false;
      if (q) {
        const hay = `${ev.user||''} ${ev.action||''} ${ev.type||''} ${ev.project||''} ${ev.detail||''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    document.getElementById('bitacora-count').textContent = `${filtered.length} evento${filtered.length !== 1 ? 's' : ''}`;
    if (!filtered.length) {
      list.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:10px;">Sin eventos para este filtro.</div>`;
      return;
    }
    list.innerHTML = filtered.map(ev => {
      const act = ev.action || 'edit';
      const cls = ['delete','add','move','edit','evidence'].includes(act) ? act : 'edit';
      return `<div class="bita-row ${cls}">
        <span class="bita-ts">${ESC(ev.ts) || '—'}</span>
        <span class="bita-act ${cls}">${ACT_LABEL[act] || ESC(act)}</span>
        <div class="bita-main">
          <div class="bita-detail"><strong>${ESC(ev.type)}</strong>${ev.project ? ' · ' + ESC(ev.project) : ''} — ${ESC(ev.detail)}</div>
          <div class="bita-meta">👤 ${ESC(ev.user) || '?'}${ev.source === 'backfill' ? '<span class="bita-backfill">(histórico reconstruido)</span>' : ''}</div>
        </div>
      </div>`;
    }).join('');
  }

  // Carga inicial
  async function injectChrome() {
    const top = document.getElementById('app-top');
    if (top) {
      try {
        const html  = await fetch('/assets/chrome.html').then(r => r.text());
        const parts = html.split('<!-- @FOOT -->');
        top.innerHTML = parts[0];
        const foot = document.getElementById('app-foot');
        if (foot && parts[1]) foot.innerHTML = parts[1];
      } catch (e) { /* sin chrome: la pagina sigue funcionando */ }
    }
    const fd = document.getElementById('footer-date');
    if (fd) { try { fd.textContent = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(new Date()); } catch (e) {} }
    // resaltar el enlace de la pagina actual
    const path = (location.pathname || '').replace(/\/+$/, '');
    document.querySelectorAll('.page-nav a').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (href === path || ((path === '' || path === '/index.html') && href === '/inicio.html')) {
        a.classList.add('nav-active');
      }
    });
  }

  // Abre (y hace scroll a) el roadmap de un proyecto en la página Proyectos.
  // Si el proyecto no tiene bloque de roadmap, no hace nada.
  function openProjectRoadmapById(pid) {
    const sectionMap = { arconte:'rm-arconte', publicvector:'rm-pv', stack_modelos:'rm-stack', arconte_retail:'rm-arconte-retail' };
    const contentId = sectionMap[pid] || (pid ? `dyn-rm-${pid}` : null);
    if (!contentId) return;
    const el = document.getElementById(contentId);
    if (!el) return;                       // sin roadmap para este proyecto -> no hace nada
    const btn = el.previousElementSibling;
    if (el.style.display === 'none') {
      el.style.display = 'block';
      el.dataset.loaded = '1';
      if (btn) btn.classList.add('open');
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Warning: tareas de semanas ya cerradas que no se completaron ──────────
  // Semana cerrada = pasó el VIERNES (fin de sprint) a las 20:00 hora local.
  function sprintDeadlinePassed(sprintName) {
    const s = SPRINTS.find(x => x.name === sprintName);
    if (!s) return false;
    return new Date() > new Date(s.end + 'T20:00:00');   // local, no UTC
  }
  function taskHasEvidence(key) {
    const e = _solutionsMeta[key];
    return Array.isArray(e) ? e.length > 0 : !!e;
  }
  // El sprint que ACABA de terminar: el más reciente cuyo viernes 8pm ya pasó.
  // (SPRINTS está en orden cronológico, así que es el último que cumple.)
  function lastClosedSprint() {
    let last = null;
    for (const s of SPRINTS) if (sprintDeadlinePassed(s.name)) last = s.name;
    return last;
  }
  // Primera semana cuyo viernes 8pm AÚN no pasa = la semana actual/abierta.
  // Mover una atrasada aquí garantiza que deje de estar atrasada.
  function firstOpenSprint() {
    for (const s of SPRINTS) if (!sprintDeadlinePassed(s.name)) return s.name;
    return SPRINTS[SPRINTS.length - 1].name;
  }
  // Días que hay que recorrer una tarea para que su inicio caiga en la semana abierta.
  function daysToOpenSprint(pid, taskId) {
    const target = firstOpenSprint();
    const targetStart = (SPRINTS.find(s => s.name === target) || {}).start;
    if (!targetStart) return 0;
    const all = (_projects[pid]?.phases || []).flatMap(ph => (ph.tasks || []).map(t => ({ t, ph })));
    const anchor = all.find(x => x.t.id === taskId);
    if (!anchor) return 0;
    const base = anchor.t.start_iso || anchor.ph.start_iso;
    if (!base) return 0;
    return Math.round((new Date(targetStart + 'T12:00:00') - new Date(base + 'T12:00:00')) / 86400000);
  }
  // Tareas SOLO de la semana que acaba de terminar, que NO están resueltas.
  // Resuelta = hecha CON evidencia. Recorrer con motivo mueve la tarea a otra
  // semana, así que sale sola del warning.
  function computeOverdue() {
    const target = lastClosedSprint();
    if (!target) return [];
    const out = [];
    Object.entries(_projects || {}).forEach(([pid, project]) => {
      if (!project) return;
      const pname = project.title || pid;
      // Tareas de fase (roadmap). start_iso ya refleja los desplazamientos.
      (project.phases || []).forEach(phase => {
        if (phase.deleted) return;
        if (getPfPhaseBlockedBy(pid, phase.id).length) return;   // fase bloqueada: el view la oculta
        (phase.tasks || []).forEach(task => {
          if (task.deleted) return;
          const planned = task.start_iso || phase.start_iso;
          if (!planned) return;
          const sp = getSprintForDate(planned);
          if (!sprintDeadlinePassed(sp)) return;   // su semana aún no vence
          const key = `${pid}_${task.id}`;
          if (!task.done) {   // solo las NO hechas (no se exige evidencia para no bloquear)
            out.push({ key, label: task.title || task.description || '(sin título)', resp: (task.responsible || task.resp || '').trim(), project: pname, sprintName: sp, done: !!task.done,
                       type: 'platform', pid, phaseId: phase.id, taskId: task.id, fromIso: planned });
          }
        });
      });
      // Tareas del planificador semanal: el sprint ES el bucket. Cualquier bucket ya vencido.
      Object.entries(project.sprint_tasks || {}).forEach(([sprintName, tasks]) => {
        if (!sprintDeadlinePassed(sprintName)) return;
        (tasks || []).forEach((task, idx) => {
          if (task.deleted) return;
          const key = `plan_${pid}_${sprintName}_${idx}`;
          if (!task.done) {   // solo las NO hechas (no se exige evidencia para no bloquear)
            out.push({ key, label: task.title || task.description || '(sin título)', resp: (task.resp || task.responsible || '').trim(), project: pname, sprintName, done: !!task.done,
                       type: 'plan', pid, planIdx: idx });
          }
        });
      });
    });
    return out;
  }
  function openOverdueModal()  { const o = document.getElementById('overdue-overlay'); if (o) o.classList.add('open'); }
  function closeOverdueModal() { const o = document.getElementById('overdue-overlay'); if (o) o.classList.remove('open'); }

  // Mover TODAS las atrasadas a la primera semana abierta (la actual), de un solo
  // paso. Cada tarea se reprograma a su semana abierta, sin importar qué tan vieja sea.
  function moveAllOverdue() {
    if (!isAdmin()) return;
    const items = computeOverdue();
    if (!items.length) return;
    const target = firstOpenSprint();
    openActionModal({
      title:       `Mover todas las atrasadas a ${target}`,
      info:        `Se mueven las ${items.length} atrasada(s) a ${target} (la semana actual).`,
      label:       '¿Por qué no se completaron? (requerido)',
      placeholder: 'Ej: bloqueadas por dependencia, faltó tiempo…',
      btnLabel:    `Mover a ${target}`,
      required:    true,
    }, async (reason) => {
      let moved = 0;
      // Tareas de fase: cada una a la semana abierta (delta propio).
      const platPids = new Set();
      for (const it of items.filter(x => x.type === 'platform')) {
        const days = daysToOpenSprint(it.pid, it.taskId);
        if (days > 0) { moved += shiftTaskIdSet(it.pid, new Set([it.taskId]), days, reason); platPids.add(it.pid); }
      }
      for (const pid of platPids) await savePlatformProject(pid);
      // Planificador semanal: mover cada tarea a la semana abierta.
      const planByPid = {};
      items.filter(it => it.type === 'plan').forEach(it => (planByPid[it.pid] = planByPid[it.pid] || []).push(it));
      const ti = SPRINTS.findIndex(s => s.name === target);
      for (const [pid, its] of Object.entries(planByPid)) {
        // agrupar por sprint origen para empalmar índices al hacer splice
        const bySprint = {};
        its.forEach(it => (bySprint[it.sprintName] = bySprint[it.sprintName] || []).push(it.planIdx));
        for (const [w, idxs] of Object.entries(bySprint)) {
          const ci = SPRINTS.findIndex(s => s.name === w);
          if (ci < 0 || ci >= ti) continue;
          const arr = _projects[pid]?.sprint_tasks?.[w];
          if (!arr) continue;
          if (!_projects[pid].sprint_tasks[target]) _projects[pid].sprint_tasks[target] = [];
          idxs.sort((a, b) => b - a).forEach(idx => {
            const [m] = arr.splice(idx, 1); if (!m) return;
            m.shift_reason = reason; m.shifted_by = _currentUser || 'Admin'; m.shifted_at = todayLocalISO();
            _projects[pid].sprint_tasks[target].push(m); moved++;
          });
        }
        await savePlatformProject(pid);
      }
      notifyChange('move', 'tarea', '', `Movió ${moved} tarea(s) atrasada(s) a ${target} — ${reason}`);
      renderPlanner();
      refreshWeekView();
      renderOverdueBanner();
    });
  }

  // ── Recorrido POR DEPENDENCIAS ────────────────────────────────────────────
  // Dependientes transitivos de una tarea (quién depende de ella, directa o
  // indirectamente). Usa el campo task.deps (IDs internos) cargado desde la lista.
  function getTaskDependents(pid, taskId) {
    const all = (_projects[pid]?.phases || []).flatMap(ph => (ph.tasks || []));
    const out = new Set();
    const stack = [taskId];
    while (stack.length) {
      const cur = stack.pop();
      all.forEach(t => {
        if ((t.deps || []).includes(cur) && t.id !== taskId && !out.has(t.id)) {
          out.add(t.id); stack.push(t.id);
        }
      });
    }
    return out;
  }
  // Recorre un conjunto de tareas +days (cada una una vez). Saca fecha efectiva
  // (propia o de su fase) y la fija desplazada. No mueve las ya hechas.
  function shiftTaskIdSet(pid, idSet, days, reason) {
    const pairs = (_projects[pid]?.phases || []).flatMap(ph => (ph.tasks || []).map(t => ({ t, ph })));
    const by = _currentUser || 'Admin', stamp = todayLocalISO();
    const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    let n = 0;
    idSet.forEach(id => {
      const e = pairs.find(x => x.t.id === id); if (!e || e.t.done) return;
      const base = e.t.start_iso || e.ph.start_iso;
      if (base) e.t.start_iso = addDays(base, days);
      e.t.shift_days = (e.t.shift_days || 0) + days;
      e.t.shift_reason = reason; e.t.shifted_by = by; e.t.shifted_at = stamp;
      n++;
    });
    return n;
  }
  // Mover una tarea + su cadena de dependientes (ripple), pidiendo motivo.
  function rippleMoveTask(pid, taskId, label, days) {
    if (!isAdmin()) return;
    const set = new Set([taskId, ...getTaskDependents(pid, taskId)]);
    const depCount = set.size - 1;
    openActionModal({
      title:       'Recorrer tarea y sus dependientes',
      info:        `"${label}"${depCount ? ` + ${depCount} tarea(s) que dependen de ella` : ' (no tiene dependientes)'} se recorren +${days / 7} semana(s).`,
      label:       '¿Por qué no se completó? (requerido)',
      placeholder: 'Ej: bloqueada por dependencia, faltó tiempo…',
      btnLabel:    `Recorrer +${days / 7} semana(s)`,
      required:    true,
    }, async (reason) => {
      const n = shiftTaskIdSet(pid, set, days, reason);
      await savePlatformProject(pid);
      notifyChange('move', 'tarea', '', `Recorrió "${label}" y su cadena (${n} tarea[s]) +${days / 7} sem — ${reason}`);
      renderPlanner(); refreshWeekView(); renderOverdueBanner();
    });
  }

  // Mover una tarea atrasada a la semana abierta actual, de un solo clic. Garantiza
  // que deje de estar atrasada por más vieja que sea (no depende de "+1 semana").
  function moveTaskToCurrentSprint(pid, taskId, label) {
    if (!isAdmin()) return;
    const target = firstOpenSprint();
    const days   = daysToOpenSprint(pid, taskId);
    if (days <= 0) return;   // ya está en una semana abierta
    openActionModal({
      title:       `Mover a ${target}`,
      info:        `"${label}" se reprograma a ${target} (la semana actual).`,
      label:       '¿Por qué no se completó? (requerido)',
      placeholder: 'Ej: faltó tiempo, bloqueada por dependencia…',
      btnLabel:    `Mover a ${target}`,
      required:    true,
    }, async (reason) => {
      shiftTaskIdSet(pid, new Set([taskId]), days, reason);
      await savePlatformProject(pid);
      notifyChange('move', 'tarea', '', `Movió "${label}" a ${target} — ${reason}`);
      renderPlanner(); refreshWeekView(); renderOverdueBanner();
    });
  }

  // Acciones por tarea (usan el índice en _overdueItems para no romper con comillas).
  let _overdueItems = [];
  function overdueComplete(i) {
    const it = _overdueItems[i]; if (!it) return;
    // Abre el modal de cierre (visto bueno + evidencia). Al confirmar marca
    // hecha y guarda -> el warning recalcula y la quita si quedó con evidencia.
    openWkCloseModal(it.label, it.key, it.type, it.pid, it.phaseId || '', it.taskId || '', it.planIdx || 0, it.sprintName || '');
  }
  function overdueMove(i) {
    const it = _overdueItems[i]; if (!it) return;
    if (it.type === 'plan') {
      const target = firstOpenSprint();
      const curIdx = SPRINTS.findIndex(s => s.name === it.sprintName);
      const tgtIdx = SPRINTS.findIndex(s => s.name === target);
      if (curIdx >= 0 && tgtIdx > curIdx) movePlanTaskSprint(it.pid, it.sprintName, it.planIdx, tgtIdx - curIdx);
    } else {
      moveTaskToCurrentSprint(it.pid, it.taskId, it.label);
    }
  }

  // Recalcula tareas atrasadas: pastilla del menú + cuerpo de la VENTANA.
  // La ventana queda ABIERTA mientras haya atrasadas (hasta resolverlas).
  function renderOverdueBanner() {
    const pill = document.getElementById('overdue-pill');
    const body = document.getElementById('overdue-modal-body');
    if (!pill && !body) return;
    const escH = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const items = computeOverdue();
    _overdueItems = items;

    if (pill) {
      const cnt = document.getElementById('overdue-count');
      if (cnt) cnt.textContent = items.length;
      pill.style.display = items.length ? '' : 'none';
    }
    if (!items.length) { closeOverdueModal(); if (body) body.innerHTML = ''; return; }

    const admin  = isAdmin();
    const target = firstOpenSprint();
    const lis = items.map((it, i) => {
      const who = `<span class="ovd-who">${escH(it.resp || 'Equipo')}</span>`;
      const tag = it.done ? `<span class="ovd-tag ovd-noev">falta evidencia</span>`
                          : `<span class="ovd-tag ovd-pend">sin hacer</span>`;
      const wk  = `<span class="ovd-proj">${escH(it.sprintName)}</span>`;   // semana de origen
      // Por cada tarea: decidir TERMINAR (con evidencia) o MOVER. Solo admin.
      const actions = admin
        ? `<div class="ovd-actions">
             <button class="ovd-done" onclick="overdueComplete(${i})" title="Marcar hecha y subir evidencia">✓ Terminar</button>
             <button class="ovd-move" onclick="overdueMove(${i})" title="Reprogramar esta tarea a la semana actual (pide motivo)">Mover a ${target} ▶</button>
           </div>`
        : '';
      return `<li><div class="ovd-li-main">${wk} · ${who} · ${escH(it.label)} <span class="ovd-proj">(${escH(it.project)})</span> ${tag}</div>${actions}</li>`;
    }).join('');
    const moveAllBtn = admin
      ? `<button class="ovd-move-all" onclick="moveAllOverdue()" title="Reprograma todas las atrasadas a la semana actual">↻ Mover todas a ${target} (semana actual)</button>`
      : '';

    if (body) {
      // Solo los no-admin pueden cerrar (no pueden resolver). Para admin la
      // ventana es bloqueante: se va sola cuando ya no quedan atrasadas.
      const closeBtn = admin ? '' :
        `<div class="admin-modal-row" style="margin-top:14px;justify-content:flex-end;"><button class="admin-modal-btn" onclick="closeOverdueModal()">Cerrar</button></div>`;
      body.innerHTML =
        `<div class="ovd-week"><div class="ovd-week-h">${items.length} tarea(s) sin completar de semanas ya vencidas</div><ul class="ovd-list">${lis}</ul></div>` +
        (moveAllBtn ? `<div style="margin-top:12px;">${moveAllBtn}</div>` : '') +
        `<div class="ovd-foot">Por cada tarea: <b>✓ Terminar</b> (con evidencia) o <b>Mover a ${target}</b> con motivo. ${admin ? 'O muévelas todas a la semana actual de una vez. La ventana no se cierra hasta resolverlas todas.' : 'Solo un admin puede resolverlas.'}</div>` +
        closeBtn;
    }
    // La ventana se mantiene abierta mientras haya atrasadas.
    openOverdueModal();
  }

  window.addEventListener('DOMContentLoaded', async () => {
    await injectChrome();
    updateAdminUI();
    loadVotes();
    const page = (document.body.dataset.page) || '';
    // Carga datos para el warning de atrasadas en TODAS las páginas.
    // loadProjects ya ejecuta solo el render de la sección presente.
    await loadProjects();
    renderOverdueBanner();
    if (page === 'proyectos') {
      const pid = new URLSearchParams(location.search).get('proj');
      if (pid) openProjectRoadmapById(pid);
    }
    // Deep-link desde "Tareas por semana" (inicio): abre directo el form de agregar
    // tarea del sprint actual en el proyecto activo del planificador.
    if (page === 'planificador' && new URLSearchParams(location.search).get('add') === '1') {
      const sp = (getCurrentAndNextSprints(4)[0] || {}).name;
      if (sp) setTimeout(() => {
        showPlanForm(_planPid, sp);
        document.getElementById(`plan-form-${_planPid}-${sp}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
    }
    // Deep-link desde "Tareas por semana" (inicio): enfoca una tarea concreta en la
    // página de Tareas — abre su grupo, hace scroll y la resalta para subir evidencia/editar.
    const focusKey = new URLSearchParams(location.search).get('focus');
    if (page === 'tareas' && focusKey) {
      setTimeout(() => {
        const el = document.getElementById('wk-' + focusKey);
        if (!el) return;
        const group = el.closest('.wk-group');
        if (group) {
          const content = group.querySelector('div[id^="wk-grp"]');
          if (content) content.style.display = 'block';
          const chev = group.querySelector('.wk-chevron');
          if (chev) chev.style.transform = 'rotate(90deg)';
        }
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const orig = el.style.background;
        el.style.transition = 'background .35s';
        el.style.background = 'rgba(34,211,238,0.28)';
        setTimeout(() => { el.style.background = orig; }, 1800);
      }, 150);
    }
  });

  function initNavSpy() {
    const SEC_IDS = ['sec-dashboard','sec-organigrama','sec-vision','sec-proyectos','sec-tareas','sec-planificador'];
    function updateActive() {
      const offset = 70;
      let active = SEC_IDS[0];
      for (const id of SEC_IDS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= offset) active = id;
      }
      document.querySelectorAll('.page-nav a').forEach(a => {
        a.classList.toggle('nav-active', a.getAttribute('href') === '#' + active);
      });
    }
    window.addEventListener('scroll', updateActive, { passive: true });
    updateActive();
  }

  function switchRmTab(btn, panelId, sectionId) {
    const section = document.getElementById(sectionId);
    section.querySelectorAll('.rm-tab').forEach(t => t.classList.remove('active'));
    section.querySelectorAll('.rm-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(panelId).classList.add('active');
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadRoadmap() {
    let roadmap, estado, edits;
    try {
      const [rr, er, edr] = await Promise.all([
        fetch('/api/roadmap'), fetch('/api/estado'), fetch('/api/edits')
      ]);
      if (!rr.ok) throw new Error(rr.status);
      roadmap = await rr.json();
      estado  = await er.json();
      edits   = await edr.json();
    } catch (e) {
      const msg = `<div class="rm-offline-notice">⚠ Abre la documentación desde el servidor
        (<code>python main.py</code>) para ver el roadmap interactivo.</div>`;
      document.getElementById('rm-retail-roadmap').innerHTML  = msg;
      document.getElementById('rm-retail-acuerdos').innerHTML = msg;
      return;
    }
    _rm.rawData = roadmap.arconte_retail;
    _rm.edits   = edits;
    renderRoadmap(roadmap.arconte_retail, estado.tasks || {});
    refreshWeekView();
  }

  // ── Edit helpers ──────────────────────────────────────────────────────────

  function defaultEdits() {
    return {
      added_tasks: [], deleted_ids: [], phase_shifts: {}, task_shifts: {}, phase_deps: {}, task_text_overrides: {},
      acuerdos_edits: { status_overrides: {}, deleted_items: [], added_items: [], added_sessions: [] }
    };
  }
  function getEdits() {
    if (!_rm.edits) _rm.edits = {};
    if (!_rm.edits.arconte_retail) _rm.edits.arconte_retail = defaultEdits();
    const e = _rm.edits.arconte_retail;
    if (!e.acuerdos_edits) e.acuerdos_edits = { status_overrides: {}, deleted_items: [], added_items: [], added_sessions: [] };
    return e;
  }
  function getAcuerdoEdits() {
    return getEdits().acuerdos_edits;
  }
  function applyAcuerdoEdits(acuerdos) {
    const ae = getAcuerdoEdits();
    const overrides = ae.status_overrides || {};
    const deletedSet = new Set(ae.deleted_items || []);
    const addedItems = ae.added_items || [];
    const addedSessions = ae.added_sessions || [];
    const result = acuerdos.map(session => {
      const items = session.items
        .map((item, ii) => {
          const key = `${session.iso_date}|${ii}`;
          return deletedSet.has(key) ? null : (overrides[key] ? { ...item, status: overrides[key] } : item);
        })
        .filter(Boolean);
      const extras = addedItems.filter(i => i.session_iso === session.iso_date);
      return { ...session, items: [...items, ...extras] };
    });
    // Aplica también added_items a las sesiones custom
    const appliedAddedSessions = addedSessions.map(session => {
      const extras = addedItems.filter(i => i.session_iso === session.iso_date);
      return { ...session, items: [...(session.items || []), ...extras] };
    });
    return [...result, ...appliedAddedSessions];
  }
  function rerenderAcuerdos() {
    if (!_rm.rawData) return;
    renderAcuerdosCalendar(_rm.rawData.acuerdos);
  }
  function shiftDate(iso, days) {
    if (!iso || !days) return iso;
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function applyEdits(data) {
    const e = (_rm.edits && _rm.edits.arconte_retail) || defaultEdits();
    const deletedSet  = new Set(e.deleted_ids || []);
    const shifts      = e.phase_shifts || {};
    const taskShifts    = e.task_shifts       || {};
    const phaseDeps     = e.phase_deps        || {};
    const textOverrides = e.task_text_overrides || {};
    const phases = data.phases.map((p, pi) => {
      const raw   = shifts[pi];
      const shift = typeof raw === 'object' ? (raw.shift || 0) : (raw || 0);
      // depends_on del CSV: fase numbers 1-indexed → convertir a índice 0
      const csvDeps = (p.depends_on || []).map(n => n - 1);
      // UI overrides adicionales (0-indexed)
      const uiDeps  = phaseDeps[pi] || [];
      const deps    = [...new Set([...csvDeps, ...uiDeps])];
      return {
        ...p,
        start_iso: p.start_iso ? shiftDate(p.start_iso, shift) : null,
        end_iso:   p.end_iso   ? shiftDate(p.end_iso,   shift) : null,
        _phase_deps: deps,
        _phase_shift: shift,
        tasks: [
          ...p.tasks.filter(t => !deletedSet.has(t.id)).map(t => {
            const tRaw    = taskShifts[t.id];
            const tShift  = typeof tRaw === 'object' && tRaw ? (tRaw.shift || 0) : (tRaw || 0);
            const tReason = typeof tRaw === 'object' && tRaw ? (tRaw.reason || '') : '';
            return {
              ...t,
              description: textOverrides[t.id] || t.description,
              _shift_days: tShift,
              _shift_reason: tReason
            };
          }),
          ...(e.added_tasks || []).filter(t => t.phase_idx === pi).map(t => ({ ...t, _shift_days: 0, _shift_reason: '' }))
        ]
      };
    });
    return { ...data, phases };
  }
  async function persistEdits() {
    try {
      await fetch('/api/edits', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: _rm.edits })
      });
    } catch(e) {}
  }
  function rerender() {
    if (!_rm.rawData) return;
    const applied = applyEdits(_rm.rawData);
    renderRoadmapCalendar(applied.phases, _rm.estado);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function renderRoadmap(data, estado) {
    _rm.estado = estado;
    const applied = applyEdits(data);
    renderRoadmapCalendar(applied.phases, estado);
    renderAcuerdosCalendar(data.acuerdos);
  }

  // ── Toolbar actions ───────────────────────────────────────────────────────

  function toggleEditMode() {
    _rm.editMode = !_rm.editMode;
    rerender();
    // Refrescar el panel si estaba abierto
    rmRoadmapDayClick(null, null, true);
  }

  async function reloadXlsx() {
    requireAdmin(async () => {
      if (!confirm('¿Recargar el roadmap desde el archivo guardado?\nEsto reemplazará las fases actuales de Arconte Retail.')) return;
      const btn = document.getElementById('rm-reload-btn');
      if (btn) { btn.disabled = true; btn.textContent = '⟳ Recargando...'; }
      try {
        await fetch('/api/reload', { method: 'POST' });
        const rr = await fetch('/api/roadmap');
        _rm.rawData = (await rr.json()).arconte_retail;
        rerender();
        if (btn) { btn.textContent = '✓ Recargado'; setTimeout(() => { btn.textContent = '🔄 Recargar'; btn.disabled = false; }, 2000); }
      } catch(e) { if (btn) { btn.textContent = '✗ Error'; btn.disabled = false; } }
    });
  }

  function uploadCsvXlsx() {
    requireAdmin(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,.xlsx';
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        const btn = document.getElementById('rm-upload-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⟳ Subiendo...'; }
        try {
          const fd = new FormData();
          fd.append('file', file);
          const r = await fetch('/api/upload-roadmap', { method: 'POST', body: fd });
          if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            alert('Error al subir: ' + (err.detail || r.status));
            if (btn) { btn.textContent = '✗ Error'; btn.disabled = false; }
            return;
          }
          const rr = await fetch('/api/roadmap');
          _rm.rawData = (await rr.json()).arconte_retail;
          rerender();
          if (btn) { btn.textContent = '✓ Subido'; setTimeout(() => { btn.textContent = '📤 Subir CSV/xlsx'; btn.disabled = false; }, 2000); }
        } catch(e) {
          alert('Error: ' + e);
          if (btn) { btn.textContent = '✗ Error'; btn.disabled = false; }
        }
      };
      input.click();
    });
  }

  async function resetEdits() {
    if (!confirm('¿Limpiar todos los cambios estructurales? (tareas agregadas, eliminadas y fases desplazadas). Los checkboxes NO se borran.')) return;
    _rm.edits = { arconte_retail: defaultEdits() };
    await persistEdits();
    rerender();
  }

  // ── Shift phase ───────────────────────────────────────────────────────────

  async function shiftPhase(phaseIdx, days) {
    const cascade = document.getElementById('rm-cascade-cb') && document.getElementById('rm-cascade-cb').checked;
    const total   = _rm.rawData.phases.length;
    const from    = phaseIdx;
    const to      = cascade ? total - 1 : phaseIdx;

    // Reunir las fases que realmente se van a recorrer (las que tienen fecha)
    // y contar cuántas tareas pendientes se aplazan, para mostrarlo en el modal.
    const applied  = applyEdits(_rm.rawData);
    const affected = [];
    let pendCount  = 0;
    for (let i = from; i <= to; i++) {
      if (!_rm.rawData.phases[i].start_iso) continue;
      affected.push(i);
      const ph = applied.phases[i];
      pendCount += (ph.tasks || []).filter(t => {
        const key = 'retail_' + t.id;
        return !(_rm.estado && key in _rm.estado ? _rm.estado[key] : t.done_xlsx);
      }).length;
    }
    if (!affected.length) return;

    const dir        = days > 0 ? `+${days}` : `${days}`;
    const phaseNames = affected.map(i => `Fase ${i + 1}`).join(', ');
    const info = cascade && affected.length > 1
      ? `Se recorrerán ${dir} día(s) EN CASCADA: ${phaseNames}. ${pendCount} tarea(s) pendiente(s) se aplazarán.`
      : `Se recorrerá ${dir} día(s) la ${phaseNames}. ${pendCount} tarea(s) pendiente(s) se aplazarán.`;

    // Motivo obligatorio: modal que dice QUÉ se mueve y pide el PORQUÉ.
    openActionModal({
      title:       `Desplazar ${dir} día(s)`,
      info,
      label:       '¿Por qué se recorre? (requerido)',
      placeholder: 'Ej: cliente pidió más tiempo, bloqueado por dependencia…',
      btnLabel:    `Desplazar ${dir}d`,
      required:    true,
    }, async (reason) => {
      const e = getEdits();
      for (const i of affected) {
        const cur      = e.phase_shifts[i];
        const curShift = typeof cur === 'object' ? (cur.shift || 0) : (cur || 0);
        const newShift = curShift + days;
        if (newShift === 0) {
          delete e.phase_shifts[i];
        } else {
          e.phase_shifts[i] = { shift: newShift, reason };
        }
      }
      await persistEdits();
      notifyChange('move', 'fase', 'Arconte Retail', `${phaseNames}: ${dir}d — ${reason}`);
      rerender();
      refreshWeekView();
      const wrap   = document.querySelector('#rm-retail-roadmap .rm-cal-wrap');
      const detail = wrap && wrap.querySelector('.rm-cal-detail');
      if (detail) rmRoadmapDayClick(null, phaseIdx, true);
    });
  }

  // ── Shift individual task ────────────────────────────────────────────────────

  async function shiftTask(taskId, phaseIdx, days, reason) {
    const e = getEdits();
    if (!e.task_shifts) e.task_shifts = {};
    const curRaw   = e.task_shifts[taskId];
    const cur      = typeof curRaw === 'object' && curRaw ? (curRaw.shift || 0) : (curRaw || 0);
    const newShift = cur + days;
    const apply    = async (rsn) => {
      if (newShift === 0) {
        delete e.task_shifts[taskId];
      } else {
        e.task_shifts[taskId] = { shift: newShift, reason: rsn || '' };
      }
      await persistEdits();
      if (newShift !== 0) notifyChange('move', 'tarea', 'Arconte Retail', `${taskId}: ${days > 0 ? '+' + days : days}d — ${rsn || ''}`);
      rerender();
      refreshWeekView();
      if (phaseIdx != null) rmRoadmapDayClick(null, phaseIdx, true);
    };
    // Anular el desplazamiento (vuelve a 0) no requiere motivo.
    if (newShift === 0) { await apply(''); return; }
    // Si ya viene un motivo (p. ej. desde la vista semanal), úsalo directo.
    if (typeof reason === 'string' && reason.trim()) { await apply(reason.trim()); return; }
    // Motivo obligatorio al mover una tarea desde el detalle del roadmap.
    openActionModal({
      title:       'Mover tarea',
      info:        `Desplazar la tarea ${newShift > 0 ? '+' + newShift : newShift} día(s).`,
      label:       'Motivo del movimiento',
      placeholder: 'Explica por qué se mueve esta tarea…',
      btnLabel:    'Mover',
      required:    true,
    }, (rsn) => apply(rsn));
  }

  // ── Edit task text ────────────────────────────────────────────────────────

  async function editTaskText(taskId, newText) {
    const e = getEdits();
    if (!e.task_text_overrides) e.task_text_overrides = {};
    const trimmed = newText.trim();
    if (trimmed) {
      e.task_text_overrides[taskId] = trimmed;
    } else {
      delete e.task_text_overrides[taskId];
    }
    await persistEdits();
    notifyChange('edit', 'tarea', 'Arconte Retail', `Texto de ${taskId}: "${trimmed}"`);
    rerender();
    refreshWeekView();
    rmRoadmapDayClick(null, null, true);
  }

  // ── Phase dependencies ────────────────────────────────────────────────────

  async function togglePhaseDep(phaseIdx, depIdx, checked) {
    const e = getEdits();
    if (!e.phase_deps) e.phase_deps = {};
    if (!e.phase_deps[phaseIdx]) e.phase_deps[phaseIdx] = [];
    if (checked) {
      if (!e.phase_deps[phaseIdx].includes(depIdx)) e.phase_deps[phaseIdx].push(depIdx);
    } else {
      e.phase_deps[phaseIdx] = e.phase_deps[phaseIdx].filter(d => d !== depIdx);
      if (!e.phase_deps[phaseIdx].length) delete e.phase_deps[phaseIdx];
    }
    await persistEdits();
    refreshWeekView();
    rmRoadmapDayClick(null, phaseIdx, true);
  }

  function isPhaseComplete(phaseIdx) {
    const phases = _rm.phases;
    const phase  = phases && phases[phaseIdx];
    if (!phase) return true;
    if (phase.status === 'done') return true;
    if (!_rm.estado) return false;
    return phase.tasks.every(task => {
      const key = 'retail_' + task.id;
      return key in _rm.estado ? _rm.estado[key] : task.done_xlsx;
    });
  }

  function updateCascadeWrap(cascadeCount) {
    const cb   = document.getElementById('rm-cascade-cb');
    const wrap = document.getElementById('rm-cascade-wrap');
    const txt  = document.getElementById('rm-cascade-text');
    if (!cb || !wrap) return;
    if (cb.checked) {
      wrap.className = 'rm-cascade-toggle on';
      if (txt) txt.textContent = `Cascada · ${cascadeCount} fase${cascadeCount !== 1 ? 's' : ''} siguientes`;
    } else {
      wrap.className = 'rm-cascade-toggle off';
      if (txt) txt.textContent = `Cascada OFF`;
    }
  }

  // ── Delete / Add task ─────────────────────────────────────────────────────

  async function deleteTask(taskId, phaseIdx) {
    requireAdmin(async () => {
      const e = getEdits();
      if (taskId.startsWith('custom_')) {
        e.added_tasks = e.added_tasks.filter(t => t.id !== taskId);
      } else {
        if (!e.deleted_ids.includes(taskId)) e.deleted_ids.push(taskId);
      }
      await persistEdits();
      rerender();
      rmRoadmapDayClick(null, phaseIdx, true);
      notifyChange('delete', 'tarea', 'Arconte Retail', `ID: ${taskId}`);
    });
  }

  function showAddTaskForm(phaseIdx) {
    const wrap   = document.querySelector('#rm-retail-roadmap .rm-cal-wrap');
    const detail = wrap && wrap.querySelector('.rm-cal-detail');
    if (!detail) return;
    const formId = 'rm-new-task-form';
    if (document.getElementById(formId)) return; // ya abierto
    const form = document.createElement('div');
    form.id = formId;
    form.className = 'rm-edit-form';
    form.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:2px;">+ Nueva tarea</div>
      <textarea class="rm-edit-input" rows="2" placeholder="Descripción de la tarea…" id="rm-nt-desc"></textarea>
      <div class="rm-edit-row">
        <select class="rm-edit-select" id="rm-nt-area">
          <option>AI Eng</option><option>Infra</option><option>PM</option>
          <option>Frontend</option><option>Datos</option><option>QA</option><option>Ciclo</option>
        </select>
        <input type="text" class="rm-edit-input-sm" id="rm-nt-resp" placeholder="Responsable">
      </div>
      <div class="rm-edit-row">
        <button class="rm-btn-save" onclick="commitAddTask(${phaseIdx})">+ Agregar</button>
        <button class="rm-btn-cancel" onclick="document.getElementById('${formId}').remove()">Cancelar</button>
      </div>`;
    detail.appendChild(form);
  }

  async function commitAddTask(phaseIdx) {
    const desc = document.getElementById('rm-nt-desc').value.trim();
    const area = document.getElementById('rm-nt-area').value;
    const resp = document.getElementById('rm-nt-resp').value.trim();
    if (!desc) { document.getElementById('rm-nt-desc').focus(); return; }
    const e = getEdits();
    e.added_tasks.push({
      id: 'custom_' + Date.now(),
      phase_idx: phaseIdx,
      area, description: desc,
      responsible: resp || '—',
      done_xlsx: false
    });
    await persistEdits();
    rerender();
    rmRoadmapDayClick(null, phaseIdx, true);
  }

  // ── TAB 1: Roadmap calendar ───────────────────────────────────────────────

  function renderRoadmapCalendar(phases, estado) {
    const panel = document.getElementById('rm-retail-roadmap');

    // Barra de progreso
    const allTasks = phases.flatMap(p => p.tasks);
    const doneCount = allTasks.filter(t => {
      const k = 'retail_' + t.id;
      return k in estado ? estado[k] : t.done_xlsx;
    }).length;
    const pct = allTasks.length ? Math.round(doneCount / allTasks.length * 100) : 0;

    // Construye mapa iso → lista de fases activas ese día (sin fines de semana)
    const dayPhases = {};
    phases.forEach((phase, pi) => {
      if (!phase.start_iso || !phase.end_iso) return;
      let cur = new Date(phase.start_iso + 'T12:00:00');
      const end = new Date(phase.end_iso + 'T12:00:00');
      while (cur <= end) {
        const dow = cur.getDay(); // 0=Dom, 6=Sáb
        if (dow !== 0 && dow !== 6) {
          const iso = cur.toISOString().slice(0,10);
          if (!dayPhases[iso]) dayPhases[iso] = [];
          dayPhases[iso].push(pi);
        }
        cur.setDate(cur.getDate() + 1);
      }
    });

    // Mes inicial: usa estado guardado o primer mes con fase
    const allIsoDates = Object.keys(dayPhases).sort();
    const firstISO = allIsoDates[0] || '2026-04-01';
    const [fy, fm] = firstISO.split('-').map(Number);
    let cy  = _rm.calYear  ?? fy;
    let cm0 = _rm.calMonth ?? (fm - 1);

    const editActive = _rm.editMode;
    panel.innerHTML = `
      <div class="rm-tool-row">
        <button class="rm-tool-btn${editActive ? ' active' : ''}" onclick="toggleEditMode()">✏ Editar</button>
        ${isAdmin() ? `<button class="rm-tool-btn" id="rm-upload-btn" onclick="uploadCsvXlsx()">📤 Subir CSV/xlsx</button>` : ''}
        <button class="rm-tool-btn" id="rm-reload-btn" onclick="reloadXlsx()">🔄 Recargar</button>
        <button class="rm-tool-btn danger" onclick="resetEdits()">🗑 Limpiar edits</button>
        ${isAdmin() ? `<button class="rm-tool-btn danger" onclick="proposeRoadmapDelete('arconte_retail','Arconte Retail')" title="Requiere votación 50%+1 del equipo">⚠ Eliminar Roadmap</button>` : ''}
        ${editActive ? '<span style="font-size:11px;color:var(--accent);margin-left:4px;">— Modo edición activo</span>' : ''}
      </div>
      <div class="rm-progress-bar"><div class="rm-progress-fill" style="width:${pct}%"></div></div>
      <div class="rm-summary">${doneCount} de ${allTasks.length} tareas completadas (${pct}%)</div>
      ${calWrapHTML(`<div class="rm-cal-legend" style="flex-wrap:wrap;gap:8px;">
        ${phases.map((p, pi) => p.start_iso ? `
          <span style="display:inline-flex;align-items:center;gap:4px;">
            <span style="width:10px;height:10px;border-radius:2px;background:${phaseCalColor(p, pi, estado, true)};display:inline-block;border:1px solid rgba(255,255,255,0.1);"></span>
            <span style="font-size:10px;color:var(--text-muted);">${p.title}</span>
          </span>` : '').join('')}
      </div>`)}
      <div class="rm-phase-list" style="margin-top:18px;"></div>`;

    const wrap = panel.querySelector('.rm-cal-wrap');

    function buildCell(d, iso, isToday) {
      const phaseIdxs = dayPhases[iso] || [];
      if (!phaseIdxs.length) {
        return `<div class="rm-cal-day${isToday ? ' today' : ''}" data-iso="${iso}"><span>${d}</span></div>`;
      }
      const pi0 = phaseIdxs[0];  // primera fase (índice menor) como color principal
      const phase0 = phases[pi0];
      const bg = `background:${phaseCalColor(phase0, pi0, estado, true)};`;
      // Dots para fases adicionales superpuestas (máx 4)
      const extraDots = phaseIdxs.slice(1, 5).map(ei =>
        `<span style="width:5px;height:5px;border-radius:50%;background:${phaseCalColor(phases[ei],ei,estado,true)};display:inline-block;flex-shrink:0;"></span>`
      ).join('');
      const dotsHTML = extraDots ? `<div style="display:flex;gap:2px;justify-content:center;margin-top:1px;">${extraDots}</div>` : '';
      return `<div class="rm-cal-day${isToday ? ' today' : ''} has-session" style="${bg}"
          data-phases="${phaseIdxs.join(',')}" data-iso="${iso}"
          onclick="rmRoadmapDayClick(this)">
        <span>${d}</span>${dotsHTML}</div>`;
    }

    renderGrid(wrap, cy, cm0, buildCell);
    wrap.querySelector('.rm-cal-prev').onclick = () => {
      cm0--; if (cm0 < 0) { cm0=11; cy--; }
      _rm.calYear = cy; _rm.calMonth = cm0;
      renderGrid(wrap, cy, cm0, buildCell);
    };
    wrap.querySelector('.rm-cal-next').onclick = () => {
      cm0++; if (cm0 > 11) { cm0=0; cy++; }
      _rm.calYear = cy; _rm.calMonth = cm0;
      renderGrid(wrap, cy, cm0, buildCell);
    };

    // Guarda en store global para el click handler
    _rm.phases = phases;
    _rm.estado = estado;
  }

  function rmRoadmapDayClick(dayEl, _legacy, keepOpen) {
    const wrap   = dayEl ? dayEl.closest('.rm-cal-wrap') : document.querySelector('#rm-retail-roadmap .rm-cal-wrap');
    const detail = wrap.querySelector('.rm-cal-detail');
    const phases = _rm.phases;
    const estado = _rm.estado;
    const edit   = _rm.editMode;

    // Obtiene índices de fases: desde el elemento día, o desde el panel guardado (si se llama tras un shift)
    let phaseIdxs;
    if (dayEl) {
      const rawPhases = dayEl.dataset.phases || dayEl.dataset.phase || '';
      phaseIdxs = rawPhases.split(',').map(Number).filter(n => !isNaN(n) && phases[n]);
    } else if (detail && detail.dataset.pi) {
      // Llamada programática tras un shift: re-usar fases que ya se mostraban
      phaseIdxs = detail.dataset.pi.split(',').map(Number).filter(n => !isNaN(n) && phases && phases[n]);
    } else {
      phaseIdxs = [];
    }
    if (!phaseIdxs.length) return;

    const keyStr = phaseIdxs.join(',');

    // Toggle: cierra si ya está abierto el mismo día
    if (!keepOpen && detail.style.display !== 'none' && detail.dataset.pi === keyStr) {
      detail.style.display = 'none';
      wrap.querySelectorAll('.rm-cal-day').forEach(d => d.classList.remove('selected'));
      return;
    }
    wrap.querySelectorAll('.rm-cal-day').forEach(d => d.classList.remove('selected'));
    if (dayEl) dayEl.classList.add('selected');

    // Construye bloque por fase; solo incluye fases con tareas pendientes
    const phaseBlocks = [];

    phaseIdxs.forEach((phaseIdx) => {
      const phase = phases[phaseIdx];
      const shiftRaw    = ((_rm.edits?.arconte_retail?.phase_shifts) || {})[phaseIdx];
      const shiftAmt    = typeof shiftRaw === 'object' ? (shiftRaw.shift || 0) : (shiftRaw || 0);
      const shiftReason = typeof shiftRaw === 'object' ? (shiftRaw.reason || '') : '';
      const isShifted   = shiftAmt !== 0;
      const color       = phaseCalColor(phase, phaseIdx, estado, true);

      // Filtrar solo tareas PENDIENTES (las completas ya aparecen tachadas en la lista de abajo)
      const pending = phase.tasks.filter(task => {
        const key = 'retail_' + task.id;
        return !(key in estado ? estado[key] : task.done_xlsx);
      });
      if (!pending.length) return; // fase sin pendientes → omitir del panel

      let block = `<div class="rm-cal-detail-header">
        <div>
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:5px;flex-shrink:0;vertical-align:middle;"></span>
          <span class="rm-cal-detail-title">${phase.title}</span>
          <div class="rm-cal-detail-sub" style="padding-left:13px;">${pending.length} pendiente${pending.length > 1 ? 's' : ''} · ${phase.start_iso||'?'} → ${phase.end_iso||'?'}</div>
        </div>
      </div>`;

      if (isShifted) {
        block += `<div class="rm-shift-notice">⚠ Desplazada ${shiftAmt > 0 ? '+' + shiftAmt : shiftAmt} días${shiftReason ? ' — ' + shiftReason : ''}</div>`;
      }
      if (edit) {
        const cascadeCount = _rm.rawData.phases.length - phaseIdx - 1;
        block += `<div class="rm-shift-bar">
          <label class="rm-cascade-toggle on" id="rm-cascade-wrap">
            <input type="checkbox" id="rm-cascade-cb" checked style="display:none" onchange="updateCascadeWrap(${cascadeCount})">
            ⛓ <span id="rm-cascade-text">Cascada · ${cascadeCount} fase${cascadeCount !== 1 ? 's' : ''} siguientes</span>
          </label>
          <span style="font-size:11px;color:var(--text-muted);">Desplazar:</span>
          <button class="rm-shift-btn" onclick="shiftPhase(${phaseIdx},-7)">−7d</button>
          <button class="rm-shift-btn" onclick="shiftPhase(${phaseIdx},-1)">−1d</button>
          <button class="rm-shift-btn" onclick="shiftPhase(${phaseIdx},1)">+1d</button>
          <button class="rm-shift-btn" onclick="shiftPhase(${phaseIdx},7)">+7d</button>
        </div>`;
      }

      // Dependencias de la fase (sección edición)
      if (edit) {
        const curDeps  = (getEdits().phase_deps || {})[phaseIdx] || [];
        const depOpts  = phases.map((p2, i2) => {
          if (i2 === phaseIdx || !p2.start_iso) return '';
          const chk = curDeps.includes(i2) ? 'checked' : '';
          return `<label style="display:inline-flex;align-items:center;gap:3px;cursor:pointer;">
            <input type="checkbox" ${chk} onchange="togglePhaseDep(${phaseIdx},${i2},this.checked)">
            <span>F${i2+1}</span>
          </label>`;
        }).join('');
        block += `<div class="rm-deps-section">
          <span>Depende de:</span>${depOpts || '<span style="font-style:italic;">ninguna</span>'}
        </div>`;
      }

      pending.forEach(task => {
        const ac           = AREA_CLASS[task.area] || 'active';
        const taskShiftAmt = task._shift_days || 0;
        const delBtn       = edit
          ? `<button class="rm-delete-btn" onclick="deleteTask('${task.id}',${phaseIdx})">✕</button>` : '';
        const shiftBadge = taskShiftAmt
          ? `<span class="rm-task-shift-badge" title="${(task._shift_reason || '').replace(/"/g,'&quot;')}">${taskShiftAmt > 0 ? '+' : ''}${taskShiftAmt}d</span>` : '';
        const resetBtn = taskShiftAmt
          ? `<button class="rm-task-shift-btn" onclick="shiftTask('${task.id}',${phaseIdx},${-taskShiftAmt})" title="Quitar desplazamiento">↺</button>` : '';
        // Hint de sprint destino cuando la tarea tiene shift
        let sprintHint = '';
        if (taskShiftAmt) {
          const phaseShift   = phase._phase_shift || 0;
          const todayStr     = todayLocalISO();
          const naturalStart = shiftDate(phase.start_iso, -phaseShift);
          const anchor       = naturalStart < todayStr ? todayStr : naturalStart;
          const bucketDate   = shiftDate(anchor, phaseShift + taskShiftAmt);
          const sn  = getSprintForDate(bucketDate);
          sprintHint = `<span class="rm-task-sprint-hint">→ ${sn}</span>`;
        }
        // Botones shift por tarea: siempre visibles
        const taskShiftBar = `<div class="rm-task-shift-bar">
          <button class="rm-task-shift-btn" onclick="shiftTask('${task.id}',${phaseIdx},-7)">−7d</button>
          <button class="rm-task-shift-btn" onclick="shiftTask('${task.id}',${phaseIdx},-1)">−1d</button>
          <button class="rm-task-shift-btn" onclick="shiftTask('${task.id}',${phaseIdx},1)">+1d</button>
          <button class="rm-task-shift-btn" onclick="shiftTask('${task.id}',${phaseIdx},7)">+7d</button>
          ${resetBtn}${sprintHint}
        </div>`;
        // Descripción: editable en modo edición, solo lectura si no
        const descHTML = edit
          ? `<textarea class="rm-task-edit-input" rows="2" onblur="editTaskText('${task.id}',this.value)">${task.description.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>`
          : `<div class="rm-task-desc${isShifted ? ' task-proposed-text' : ''}">${task.description}</div>`;
        block += `<div class="rm-task">
          <input type="checkbox" onchange="toggleTask(this,'${task.id}')">
          <div class="rm-task-body">
            ${descHTML}
            <div class="rm-task-meta">
              <span class="rm-area-badge ${ac}">${task.area}</span>
              <span class="rm-resp">${task.responsible}</span>
              ${isShifted ? '<span class="task-proposed-badge">Propuesto</span>' : ''}
              ${shiftBadge}
            </div>
            ${taskShiftBar}
          </div>${delBtn}
        </div>`;
      });
      if (edit) block += `<button class="rm-add-task-btn" onclick="showAddTaskForm(${phaseIdx})">＋ Agregar tarea</button>`;

      phaseBlocks.push(block);
    });

    if (!phaseBlocks.length) {
      detail.style.display = 'none';
      return;
    }
    detail.innerHTML = phaseBlocks.join('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:8px 0;">');
    detail.dataset.pi = keyStr;
    detail.style.display = 'block';
  }

  async function toggleTask(cb, taskId) {
    if (!isAdmin()) { cb.checked = !cb.checked; return; }
    const done = cb.checked;
    cb.closest('.rm-task').querySelector('.rm-task-desc').classList.toggle('done-task', done);
    // Actualiza barra de progreso en el panel de roadmap
    const panel = document.getElementById('rm-retail-roadmap');
    const boxes = panel.querySelectorAll('input[type=checkbox]');
    const doneN = [...boxes].filter(b => b.checked).length;
    const pct   = boxes.length ? Math.round(doneN / boxes.length * 100) : 0;
    const fill  = panel.querySelector('.rm-progress-fill');
    const summ  = panel.querySelector('.rm-summary');
    if (fill) fill.style.width = pct + '%';
    if (summ) summ.textContent = `${doneN} de ${boxes.length} tareas completadas (${pct}%)`;
    try {
      await fetch('/api/estado/' + encodeURIComponent('retail_' + taskId), {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ done })
      });
    } catch(e) {}
  }

  // ── Acuerdo edit actions ──────────────────────────────────────────────────

  function toggleAcuerdoEditMode() {
    _rm.acuerdoEditMode = !_rm.acuerdoEditMode;
    rerenderAcuerdos();
  }

  // Actualiza el estado de un acuerdo en lugar (sin reconstruir el calendario completo)
  async function applyAcuerdoStatusChange(selectEl, sessionIso, origIdx, customKey) {
    const newStatus = selectEl.value;
    const ae = getAcuerdoEdits();
    if (customKey) {
      // Item agregado manualmente
      const item = ae.added_items.find(i => i._key === customKey);
      if (item) item.status = newStatus;
    } else {
      // Item del xlsx
      ae.status_overrides[`${sessionIso}|${origIdx}`] = newStatus;
    }
    await persistEdits();
    // Actualiza contadores en el header del detalle sin reconstruir el calendario
    const wrap = document.querySelector('#rm-retail-acuerdos .rm-cal-wrap');
    const detail = wrap && wrap.querySelector('.rm-cal-detail');
    if (detail && detail.dataset.iso === sessionIso) {
      const selects = detail.querySelectorAll('select.rm-edit-select');
      let comp = 0, proc = 0, total = selects.length;
      selects.forEach(s => {
        if (s.value === 'COMPLETADO') comp++;
        if (s.value === 'EN PROCESO') proc++;
      });
      const subEl = detail.querySelector('.rm-cal-detail-sub');
      if (subEl) {
        const hora = _rm.byDate[sessionIso] && _rm.byDate[sessionIso].hora;
        subEl.textContent = `${hora ? hora + ' h · ' : ''}${total} acuerdos`;
      }
      // Actualiza badges de resumen
      const badges = detail.querySelectorAll('.rm-acuerdo-status');
      const compBadge = [...badges].find(b => b.classList.contains('COMPLETADO'));
      const procBadge = [...badges].find(b => b.classList.contains('EN-PROCESO'));
      if (compBadge) compBadge.textContent = comp + ' completados';
      if (procBadge) procBadge.textContent = proc + ' en proceso';
    }
  }

  async function deleteAcuerdoItem(sessionIso, itemIdx) {
    requireAdmin(async () => {
      const ae = getAcuerdoEdits();
      const key = `${sessionIso}|${itemIdx}`;
      if (!ae.deleted_items.includes(key)) ae.deleted_items.push(key);
      await persistEdits();
      rerenderAcuerdos();
      rmAcuerdoOpenByIso(sessionIso);
      notifyChange('delete', 'acuerdo', 'Arconte Retail', `Sesión ${sessionIso}`);
    });
  }

  async function deleteAddedItem(sessionIso, customKey) {
    requireAdmin(async () => {
      const ae = getAcuerdoEdits();
      ae.added_items = ae.added_items.filter(i => i._key !== customKey);
      await persistEdits();
      rerenderAcuerdos();
      rmAcuerdoOpenByIso(sessionIso);
      notifyChange('delete', 'acuerdo', 'Arconte Retail', `Sesión ${sessionIso}`);
    });
  }

  function showAddAcuerdoForm(sessionIso) {
    const wrap   = document.querySelector('#rm-retail-acuerdos .rm-cal-wrap');
    const detail = wrap && wrap.querySelector('.rm-cal-detail');
    if (!detail || document.getElementById('rm-new-acuerdo-form')) return;
    const form = document.createElement('div');
    form.id = 'rm-new-acuerdo-form';
    form.className = 'rm-edit-form';
    form.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:2px;">+ Nuevo acuerdo</div>
      <input type="text" class="rm-edit-input" id="rm-na-title" placeholder="Título (breve)">
      <textarea class="rm-edit-input" rows="2" placeholder="Descripción / detalle (opcional)" id="rm-na-text" style="margin-top:4px;"></textarea>
      <div class="rm-edit-row">
        <input type="text" class="rm-edit-input-sm" id="rm-na-resp" placeholder="Responsable">
        <select class="rm-edit-select" id="rm-na-status">
          <option value="PENDIENTE">PENDIENTE</option>
          <option value="EN PROCESO">EN PROCESO</option>
          <option value="COMPLETADO">COMPLETADO</option>
          <option value="CANCELADO">CANCELADO</option>
        </select>
      </div>
      <div class="rm-edit-row">
        <button class="rm-btn-save" onclick="commitAddAcuerdo('${sessionIso}')">+ Agregar</button>
        <button class="rm-btn-cancel" onclick="document.getElementById('rm-new-acuerdo-form').remove()">Cancelar</button>
      </div>`;
    detail.appendChild(form);
    document.getElementById('rm-na-title').focus();
  }

  async function commitAddAcuerdo(sessionIso) {
    const title = document.getElementById('rm-na-title').value.trim();
    const desc  = document.getElementById('rm-na-text').value.trim();
    const resp  = document.getElementById('rm-na-resp').value.trim();
    const status = document.getElementById('rm-na-status').value;
    if (!title) { document.getElementById('rm-na-title').focus(); return; }
    const ae = getAcuerdoEdits();
    ae.added_items.push({
      _key: `${sessionIso}|custom${Date.now()}`,
      session_iso: sessionIso,
      title, description: desc, responsible: resp || '—', status, date: null
    });
    await persistEdits();
    rerenderAcuerdos();
    rmAcuerdoOpenByIso(sessionIso);
  }

  function showAddSessionForm() {
    const panel = document.getElementById('rm-retail-acuerdos');
    if (document.getElementById('rm-new-session-form')) return;
    const form = document.createElement('div');
    form.id = 'rm-new-session-form';
    form.className = 'rm-edit-form';
    form.style.cssText = 'margin:12px 0;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid var(--border);';
    form.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:6px;">+ Nueva sesión</div>
      <div class="rm-edit-row">
        <input type="text" class="rm-edit-input-sm" id="rm-ns-title" placeholder="Título (ej: Viernes 15 de mayo, 13 H)" style="flex:1;">
        <input type="date" class="rm-edit-input-sm" id="rm-ns-date">
      </div>
      <div class="rm-edit-row">
        <button class="rm-btn-save" onclick="commitAddSession()">+ Crear sesión</button>
        <button class="rm-btn-cancel" onclick="document.getElementById('rm-new-session-form').remove()">Cancelar</button>
      </div>`;
    panel.appendChild(form);
    document.getElementById('rm-ns-title').focus();
  }

  async function commitAddSession() {
    const title = document.getElementById('rm-ns-title').value.trim();
    const iso   = document.getElementById('rm-ns-date').value;
    if (!title || !iso) { alert('Título y fecha son requeridos.'); return; }
    const ae = getAcuerdoEdits();
    ae.added_sessions.push({
      session: title, iso_date: iso, display: title, hora: null, items: []
    });
    await persistEdits();
    document.getElementById('rm-new-session-form').remove();
    rerenderAcuerdos();
  }

  function rmAcuerdoOpenByIso(iso) {
    const wrap = document.querySelector('#rm-retail-acuerdos .rm-cal-wrap');
    if (!wrap) return;
    const dayEl = wrap.querySelector(`.rm-cal-day[data-iso="${iso}"]`);
    if (dayEl) rmAcuerdoClick(dayEl, true);
    else {
      // El día puede estar en otro mes; solo actualiza el detail si ya estaba abierto
      const detail = wrap.querySelector('.rm-cal-detail');
      if (detail && detail.dataset.iso === iso && detail.style.display !== 'none') {
        rmAcuerdoClick(null, true, iso);
      }
    }
  }

  // ── TAB 2: Acuerdos calendar ──────────────────────────────────────────────

  function renderAcuerdosCalendar(acuerdos) {
    const panel = document.getElementById('rm-retail-acuerdos');
    const applied = applyAcuerdoEdits(acuerdos);
    const byDate = {};
    applied.forEach(s => { if (s.iso_date) byDate[s.iso_date] = s; });

    const dates = Object.keys(byDate).sort();
    if (!dates.length) {
      panel.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:10px;">Sin sesiones con fecha.</div>';
      return;
    }
    const [fy, fm] = dates[0].split('-').map(Number);
    let cy  = _rm.acuerdoYear  ?? fy;
    let cm0 = _rm.acuerdoMonth ?? (fm - 1);

    const editActive = _rm.acuerdoEditMode;
    panel.innerHTML = `
      <div class="rm-tool-row">
        <button class="rm-tool-btn${editActive ? ' active' : ''}" onclick="toggleAcuerdoEditMode()">✏ Editar</button>
        <a class="rm-tool-btn" style="text-decoration:none;" href="/RoadMaps/Arconte_Retail_Roadmap_v6.xlsx" download>⬇ Descargar xlsx</a>
        ${editActive ? `<button class="rm-tool-btn" onclick="showAddSessionForm()">＋ Nueva sesión</button>` : ''}
        ${editActive ? '<span style="font-size:11px;color:var(--accent);margin-left:4px;">— Modo edición activo</span>' : ''}
      </div>
      ${calWrapHTML(`<div class="rm-cal-legend">
        <span class="rm-cal-dot-sample"></span> Reunión de equipo
      </div>`)}`;

    const wrap = panel.querySelector('.rm-cal-wrap');
    _rm.byDate = byDate;

    function buildCell(d, iso, isToday) {
      const has = iso in byDate;
      return `<div class="rm-cal-day${has ? ' has-session' : ''}${isToday ? ' today' : ''}"
        data-iso="${iso}" ${has ? 'onclick="rmAcuerdoClick(this)"' : ''}>
        <span>${d}</span>${has ? '<div class="rm-cal-dot"></div>' : ''}
      </div>`;
    }

    renderGrid(wrap, cy, cm0, buildCell);
    wrap.querySelector('.rm-cal-prev').onclick = () => {
      cm0--; if (cm0 < 0) { cm0=11; cy--; }
      _rm.acuerdoYear = cy; _rm.acuerdoMonth = cm0;
      renderGrid(wrap, cy, cm0, buildCell);
    };
    wrap.querySelector('.rm-cal-next').onclick = () => {
      cm0++; if (cm0 > 11) { cm0=0; cy++; }
      _rm.acuerdoYear = cy; _rm.acuerdoMonth = cm0;
      renderGrid(wrap, cy, cm0, buildCell);
    };
  }

  function rmAcuerdoClick(dayEl, keepOpen, isoOverride) {
    const iso    = isoOverride || (dayEl && dayEl.dataset.iso);
    const wrap   = (dayEl && dayEl.closest('.rm-cal-wrap')) || document.querySelector('#rm-retail-acuerdos .rm-cal-wrap');
    if (!wrap) return;
    const detail = wrap.querySelector('.rm-cal-detail');
    const s      = _rm.byDate[iso];
    if (!s) return;

    if (!keepOpen && detail.style.display !== 'none' && detail.dataset.iso === iso) {
      detail.style.display = 'none';
      wrap.querySelectorAll('.rm-cal-day').forEach(d => d.classList.remove('selected'));
      return;
    }
    wrap.querySelectorAll('.rm-cal-day').forEach(d => d.classList.remove('selected'));
    if (dayEl) dayEl.classList.add('selected');
    else wrap.querySelectorAll(`.rm-cal-day[data-iso="${iso}"]`).forEach(d => d.classList.add('selected'));

    const edit = _rm.acuerdoEditMode;
    const comp = s.items.filter(i => i.status === 'COMPLETADO').length;
    const proc = s.items.filter(i => i.status === 'EN PROCESO').length;

    // Calcula índices originales (del xlsx) para los items — los agregados tienen _key
    const origAccuerdos = _rm.rawData ? _rm.rawData.acuerdos : [];
    const origSession = origAccuerdos.find(sx => sx.iso_date === iso);
    const origCount = origSession ? origSession.items.length : 0;

    let html = `<div class="rm-cal-detail-header">
      <div>
        <div class="rm-cal-detail-title">${s.display}</div>
        <div class="rm-cal-detail-sub">${s.hora ? s.hora + ' h' : ''} · ${s.items.length} acuerdos</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <span class="rm-acuerdo-status COMPLETADO">${comp} completados</span>
        <span class="rm-acuerdo-status EN-PROCESO">${proc} en proceso</span>
      </div>
    </div>`;

    // Reconstruye la lista combinada con índices correctos para edición
    // Los items del xlsx tienen idx >= 0; los items agregados tienen _key
    const ae = getAcuerdoEdits();
    const overrides = ae.status_overrides || {};
    // items del xlsx (aplicando overrides actuales)
    const xlsxItems = origSession
      ? origSession.items.map((item, ii) => {
          const key = `${iso}|${ii}`;
          const deleted = (ae.deleted_items || []).includes(key);
          return deleted ? null : { ...item, status: overrides[key] || item.status, _origIdx: ii };
        }).filter(Boolean)
      : [];
    // items agregados
    const customItems = (ae.added_items || [])
      .filter(i => i.session_iso === iso)
      .map(i => ({ ...i, _isCustom: true }));
    const allItems = [...xlsxItems, ...customItems];

    allItems.forEach((item, listIdx) => {
      const isCustom = item._isCustom;
      const origIdx  = item._origIdx;
      // Acción de cambio de estado: funciona en ambos modos (edit y normal)
      const statusAction = isCustom
        ? `applyAcuerdoStatusChange(this,'${iso}',null,'${item._key}')`
        : `applyAcuerdoStatusChange(this,'${iso}',${origIdx},null)`;
      const statusOpts = ['PENDIENTE','EN PROCESO','COMPLETADO','CANCELADO'].map(st =>
        `<option value="${st}"${item.status === st ? ' selected' : ''}>${st}</option>`
      ).join('');
      const deleteBtn = edit
        ? `<button class="rm-delete-btn" title="Eliminar" onclick="${isCustom ? `deleteAddedItem('${iso}','${item._key}')` : `deleteAcuerdoItem('${iso}',${origIdx})`}">✕</button>`
        : '';
      html += `<div class="rm-acuerdo" style="margin-bottom:6px;align-items:flex-start;">
        <select class="rm-edit-select" style="min-width:110px;" onchange="${statusAction}">
          ${statusOpts}
        </select>
        <div class="rm-acuerdo-body">
          <div class="rm-acuerdo-text">${item.title || item.text || '(sin título)'}</div>
          ${(item.title && item.description) ? `<div class="rm-acuerdo-meta">${item.description}</div>` : ''}
          <div class="rm-acuerdo-meta">
            ${item.responsible ? '👤 ' + item.responsible : ''}
            ${item.date ? ' · 📅 ' + item.date : ''}
            ${isCustom ? '<span style="color:var(--accent);font-size:10px;"> · nuevo</span>' : ''}
          </div>
        </div>
        ${deleteBtn}
      </div>`;
    });

    if (edit) {
      html += `<button class="rm-add-task-btn" onclick="showAddAcuerdoForm('${iso}')">＋ Agregar acuerdo</button>`;
    }

    detail.innerHTML = html;
    detail.dataset.iso = iso;
    detail.style.display = 'block';
  }

  // ══════════════════════════════════════════════════════════════════
  // PLANIFICADOR SEMANAL SIMPLE (sección 05)
  // ══════════════════════════════════════════════════════════════════

  let _planPid    = 'arconte'; // proyecto activo en el planificador
  let _modelEditId        = null;  // { pid, modelId } — modelo en edición
  let _modelFormOpen      = {};    // pid → bool (formulario add abierto)
  let _modelEditMode      = {};    // pid → bool (modo edición independiente de modelos)
  let _planEditKey        = null;  // { pid, sprint, idx } — tarea en edición
  let _wkEditKey          = null;  // key de tarea en edición en la vista semanal
  let _solutionsMeta      = {};    // task_key → [{ url, filename, uploaded_by, uploaded_at }]
  let _actionModalCb      = null;  // callback del modal de acción genérico
  let _actionModalRequired = false;
  let _weekSprintOffset   = 0;     // desplazamiento de navegación de sprints (−4, 0, +4, …)

  function selectPlanProject(pid, btn) {
    _planPid = pid;
    document.querySelectorAll('.plan-proj-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderPlanner();
  }

  function renderPlanner() {
    const root = document.getElementById('plan-sprints');
    if (!root) return;
    const today = todayLocalISO();
    const sprints = getCurrentAndNextSprints(4);
    const pid = _planPid;

    // Fuente de tareas según proyecto
    const isRetail = pid === 'arconte_retail';
    let html = '';

    sprints.forEach(sprint => {
      const isCur = today >= sprint.start && today <= sprint.end;
      const tasks = getPlanTasks(pid, sprint.name);

      html += `<div class="plan-sprint-card${isCur ? ' cur' : ''}">
        <div class="plan-sprint-range${isCur ? ' cur' : ''}" style="margin-bottom:1px;">${isCur ? '● ' : ''}${fmtDateRange(sprint.start, sprint.end)}</div>
        <div class="plan-sprint-name" style="margin-bottom:10px;">${sprint.name}</div>`;

      tasks.forEach((task, ti) => {
        const label = task.title || task.text || '(sin título)';
        const detail = task.description || '';
        if (task.deleted) {
          html += `<div class="plan-task-item task-deleted">
            <div style="flex:1;">
              <div class="plan-task-text task-deleted-text">${label}</div>
              ${detail ? `<div class="plan-task-meta task-deleted-text">${detail}</div>` : ''}
              <div class="task-deleted-badge">Eliminado por ${task.deleted_by}${task.deleted_at ? ' · ' + task.deleted_at : ''}${task.deleted_reason ? ' — ' + task.deleted_reason : ''}</div>
            </div>
          </div>`;
          return;
        }
        const doneCls   = task.done ? ' done' : '';
        const isEditing = _planEditKey?.pid === pid && _planEditKey?.sprint === sprint.name && _planEditKey?.idx === ti;
        if (isEditing) {
          const areaOpts = ['AI Eng','Infra','PM','Frontend','Datos','QA','Ciclo']
            .map(a => `<option${a === task.area ? ' selected' : ''}>${a}</option>`).join('');
          html += `<div class="plan-task-item" style="flex-direction:column;gap:4px;padding:8px;">
            <input class="plan-input" id="plan-edit-title-${ti}" value="${(task.title||'').replace(/"/g,'&quot;')}" placeholder="Título">
            <input class="plan-input" id="plan-edit-desc-${ti}" value="${(task.description||'').replace(/"/g,'&quot;')}" placeholder="Descripción">
            <div class="plan-row">
              <select class="plan-select" id="plan-edit-area-${ti}">${areaOpts}</select>
              <input class="plan-input" style="flex:1;" id="plan-edit-resp-${ti}" value="${(task.resp||'').replace(/"/g,'&quot;')}" placeholder="Responsable">
            </div>
            <div class="plan-row">
              <button class="plan-save-btn" onclick="savePlanTaskEdit('${pid}','${sprint.name}',${ti})">Guardar</button>
              <button class="plan-cancel-btn" onclick="cancelPlanTaskEdit()">Cancelar</button>
            </div>
          </div>`;
        } else {
          html += `<div class="plan-task-item">
            <input type="checkbox" ${task.done ? 'checked' : ''} onchange="togglePlanTask('${pid}','${sprint.name}',${ti},this.checked)">
            <div style="flex:1;">
              <div class="plan-task-text${doneCls}">${label}</div>
              ${detail ? `<div class="plan-task-meta">${detail}</div>` : ''}
              <div class="plan-task-meta">${task.area || ''}${task.resp ? ' · ' + task.resp : ''}</div>
            </div>
            ${isAdmin() ? `
            <button style="flex-shrink:0;width:18px;height:18px;border-radius:4px;border:none;background:rgba(34,211,238,0.1);color:var(--accent);cursor:pointer;font-size:11px;" onclick="startPlanTaskEdit('${pid}','${sprint.name}',${ti})" title="Editar">✏</button>
            <button style="flex-shrink:0;width:18px;height:18px;border-radius:4px;border:none;background:rgba(248,113,113,0.1);color:var(--red);cursor:pointer;font-size:11px;" onclick="deletePlanTask('${pid}','${sprint.name}',${ti})">✕</button>
            ` : ''}
          </div>`;
        }
      });

      const _pfPhases = (_projects[pid]?.phases || []).filter(p => !p.deleted);
      // Fase "en turno": la que contiene HOY; si varias se traslapan, la de inicio más reciente.
      // Se preselecciona para no tener que buscarla y evitar caer en semanas ya cerradas.
      let _curPhase = null;
      _pfPhases.forEach(p => {
        if (p.start_iso && p.end_iso && p.start_iso <= today && today <= p.end_iso) {
          if (!_curPhase || p.start_iso > _curPhase.start_iso) _curPhase = p;
        }
      });
      const _pfPhaseOpts = _pfPhases.map(p =>
        `<option value="${p.id}"${_curPhase && p.id === _curPhase.id ? ' selected' : ''}>${p.title}</option>`
      ).join('');

      html += `<button class="plan-add-btn" onclick="showPlanForm('${pid}','${sprint.name}')">＋ Agregar tarea</button>
        <div id="plan-form-${pid}-${sprint.name}" style="display:none;" class="plan-inline-form">
          <div class="plan-row" style="gap:6px;">
            <select class="plan-select" id="plan-type-${pid}-${sprint.name}" style="flex:1;" onchange="(function(sel){var wrap=document.getElementById('plan-fase-wrap-${pid}-${sprint.name}');var areaWrap=document.getElementById('plan-area-wrap-${pid}-${sprint.name}');if(wrap)wrap.style.display=sel.value==='acuerdo'?'none':'flex';if(areaWrap)areaWrap.style.display=sel.value==='acuerdo'?'none':'flex';})(this)">
              <option value="task">Tarea</option>
              <option value="acuerdo">Acuerdo</option>
            </select>
          </div>
          <input class="plan-input" id="plan-title-${pid}-${sprint.name}" placeholder="Título (breve)" onkeydown="if(event.key==='Enter')document.getElementById('plan-txt-${pid}-${sprint.name}').focus()">
          <input class="plan-input" id="plan-txt-${pid}-${sprint.name}" placeholder="Descripción / detalle (opcional)" onkeydown="if(event.key==='Enter')commitPlanTask('${pid}','${sprint.name}')">
          <div class="plan-row" id="plan-fase-wrap-${pid}-${sprint.name}" style="gap:6px;">
            <select class="plan-select" id="plan-fase-${pid}-${sprint.name}" style="flex:1;">
              <option value="">— Sin fase (solo planificador) —</option>
              ${_pfPhaseOpts}
            </select>
          </div>
          <div class="plan-row" id="plan-area-wrap-${pid}-${sprint.name}">
            <select class="plan-select" id="plan-area-${pid}-${sprint.name}">
              <option>AI Eng</option><option>Infra</option><option>PM</option>
              <option>Frontend</option><option>Datos</option><option>QA</option><option>Ciclo</option>
            </select>
          </div>
          <input class="plan-input" id="plan-resp-${pid}-${sprint.name}" placeholder="Responsable">
          <div class="plan-row">
            <button class="plan-save-btn" onclick="commitPlanTask('${pid}','${sprint.name}')">Guardar</button>
            <button class="plan-cancel-btn" onclick="hidePlanForm('${pid}','${sprint.name}')">Cancelar</button>
          </div>
        </div>
      </div>`;
    });
    root.innerHTML = html;
  }

  function getPlanTasks(pid, sprintName) {
    if (pid === 'arconte_retail') {
      // Lee del sprint_tasks de arconte_retail en projects.json si existe
      return (_projects['arconte_retail']?.sprint_tasks?.[sprintName]) || [];
    }
    return (_projects[pid]?.sprint_tasks?.[sprintName]) || [];
  }

  function showPlanForm(pid, sprint) {
    // Oculta cualquier otro formulario abierto
    document.querySelectorAll('[id^="plan-form-"]').forEach(f => { f.style.display = 'none'; });
    const f = document.getElementById(`plan-form-${pid}-${sprint}`);
    if (f) { f.style.display = 'flex'; document.getElementById(`plan-title-${pid}-${sprint}`).focus(); }
  }

  function hidePlanForm(pid, sprint) {
    const f = document.getElementById(`plan-form-${pid}-${sprint}`);
    if (f) f.style.display = 'none';
  }

  async function commitPlanTask(pid, sprint) {
    const title  = document.getElementById(`plan-title-${pid}-${sprint}`)?.value.trim();
    const desc   = document.getElementById(`plan-txt-${pid}-${sprint}`)?.value.trim();
    if (!title) { document.getElementById(`plan-title-${pid}-${sprint}`)?.focus(); return; }
    const area   = document.getElementById(`plan-area-${pid}-${sprint}`)?.value || '';
    const resp   = document.getElementById(`plan-resp-${pid}-${sprint}`)?.value.trim() || '';
    const type   = document.getElementById(`plan-type-${pid}-${sprint}`)?.value || 'task';
    const faseId = document.getElementById(`plan-fase-${pid}-${sprint}`)?.value || '';

    const PLAN_FRIENDLY = { arconte: 'Arconte', publicvector: 'PublicVector', stack_modelos: 'Stack de Modelos', arconte_retail: 'Arconte Retail' };
    if (!_projects[pid]) _projects[pid] = { title: PLAN_FRIENDLY[pid] || pid, phases: [], sprint_tasks: {}, acuerdos: [] };

    if (type === 'acuerdo') {
      // Guardar como acuerdo en la sesión del sprint
      const sprintObj = SPRINTS.find(s => s.name === sprint);
      const iso = sprintObj ? sprintObj.start : todayLocalISO();
      if (!_projects[pid].acuerdos) _projects[pid].acuerdos = [];
      let session = _projects[pid].acuerdos.find(a => a.session === sprint);
      if (!session) {
        const d = new Date(iso + 'T12:00:00');
        const display = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
        session = { session: sprint, iso_date: iso, display, hora: '', items: [] };
        _projects[pid].acuerdos.push(session);
      }
      session.items.push({ title, description: desc || '', responsible: resp, status: 'PENDIENTE', date: iso });
    } else if (faseId) {
      // Agregar como tarea a la fase seleccionada. Se le fija start_iso al sprint
      // ACTUAL (el del formulario) para que NO herede la fecha de inicio de la fase
      // —que puede estar en una semana ya cerrada— y así no aparezca como atrasada.
      const phase = (_projects[pid]?.phases || []).find(p => p.id === faseId);
      if (phase) {
        if (!phase.tasks) phase.tasks = [];
        const sprintObj = SPRINTS.find(s => s.name === sprint);
        const startIso  = sprintObj ? sprintObj.start : todayLocalISO();
        const taskId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        phase.tasks.push({ id: taskId, title, description: desc || '', area, responsible: resp, done: false, start_iso: startIso });
      }
    } else {
      // Sin fase: agregar a sprint_tasks (planificador semanal)
      if (!_projects[pid].sprint_tasks) _projects[pid].sprint_tasks = {};
      if (!_projects[pid].sprint_tasks[sprint]) _projects[pid].sprint_tasks[sprint] = [];
      _projects[pid].sprint_tasks[sprint].push({ title, description: desc, area, resp, done: false });
    }

    await savePlatformProject(pid);
    renderPlatformRoadmap(pid);
    renderPlanner();
    refreshWeekView();
    if (type === 'acuerdo') {
      notifyChange('add', 'acuerdo', _projects[pid]?.title || pid, `${sprint}: ${title}${resp ? ' · ' + resp : ''}`);
    } else {
      const faseLabel = faseId ? ((_projects[pid]?.phases || []).find(p => p.id === faseId)?.title || '') : '';
      notifyChange('add', 'tarea', _projects[pid]?.title || pid, `${faseLabel || sprint}: ${title}${resp ? ' · ' + resp : ''}`);
    }
  }

  function startPlanTaskEdit(pid, sprint, idx) {
    _planEditKey = { pid, sprint, idx };
    renderPlanner();
  }

  function cancelPlanTaskEdit() {
    _planEditKey = null;
    renderPlanner();
  }

  async function savePlanTaskEdit(pid, sprint, idx) {
    const task = (_projects[pid]?.sprint_tasks?.[sprint] || [])[idx];
    if (!task) return;
    task.title       = document.getElementById(`plan-edit-title-${idx}`)?.value.trim() || task.title;
    task.description = document.getElementById(`plan-edit-desc-${idx}`)?.value.trim() || '';
    task.area        = document.getElementById(`plan-edit-area-${idx}`)?.value || task.area;
    task.resp        = document.getElementById(`plan-edit-resp-${idx}`)?.value.trim() || '';
    _planEditKey = null;
    await savePlatformProject(pid);
    renderPlanner();
    refreshWeekView();
  }

  // ── CSV Import ────────────────────────────────────────────────────────────

  function splitCSVLine(line) {
    const result = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; } // comilla escapada
        else inQuote = !inQuote;
      } else if (c === ',' && !inQuote) {
        result.push(cur); cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur);
    return result;
  }

  function parseCSV(text) {
    const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = clean.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return [];
    // Detección automática del delimitador: tab o coma
    const isTab = lines[0].includes('\t');
    const splitLine = isTab
      ? (line) => line.split('\t').map(v => v.trim())
      : splitCSVLine;
    const headers = splitLine(lines[0]).map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const vals = splitLine(line);
      const obj = {};
      headers.forEach((h, i) => obj[h] = (vals[i] || '').trim());
      return obj;
    }).filter(r => Object.values(r).some(v => v));
  }

  // Convierte DD/MM/YYYY o DD-MM-YYYY a YYYY-MM-DD; si ya es ISO lo deja igual
  function normalizeDate(s) {
    if (!s) return '';
    // DD/MM/YYYY
    const m4 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m4) return `${m4[3]}-${m4[2].padStart(2,'0')}-${m4[1].padStart(2,'0')}`;
    // DD/MM/YY  → 20YY
    const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
    if (m2) return `20${m2[3]}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
    return s;
  }

  function showImportStatus(msg, ok = true) {
    const el = document.getElementById('import-status');
    if (!el) return;
    el.style.display = 'inline';
    el.style.color = ok ? 'var(--green)' : 'var(--red)';
    el.textContent = msg;
    setTimeout(() => { el.style.display = 'none'; }, 5000);
  }

  async function importUnifiedCSV(file, defaultPid = '') {
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) { showImportStatus('CSV vacío o mal formado', false); return; }

    const PLAN_FRIENDLY = { arconte: 'Arconte', publicvector: 'PublicVector', stack_modelos: 'Stack de Modelos', arconte_retail: 'Arconte Retail' };
    const VALID_STATUS  = new Set(['PENDIENTE', 'EN PROCESO', 'COMPLETADO', 'CANCELADO']);

    // Dado una fecha ISO, devuelve el sprint que la contiene (si existe)
    function resolveSprintByDate(dateStr) {
      if (!dateStr) return null;
      return SPRINTS.find(s => dateStr >= s.start && dateStr <= s.end)?.name || null;
    }

    const phaseGroups  = {}; // key: pid|fase  → tareas de roadmap agrupadas por fase
    const sprintGroups = {}; // key: pid|sprint → tareas del planificador semanal
    const acuerdoGroups = {}; // key: pid|fecha

    rows.forEach(row => {
      const tipo = (row.tipo || '').trim().toLowerCase();
      const pid  = defaultPid || (row.proyecto || '').trim();
      if (!pid) return;

      if (tipo === 'tarea') {
        const title    = (row.titulo || '').trim();
        const desc     = (row.descripcion || '').trim();
        // Acepta columna "fase" o "fases" (plural); si el valor es numérico → "Fase N"
        const faseRaw  = (row.fase || row.fases || '').trim();
        const fase     = faseRaw && /^\d+$/.test(faseRaw) ? `Fase ${faseRaw}` : faseRaw;
        const fechaIni = normalizeDate((row.fecha_inicio || '').trim());
        const fechaFin = normalizeDate((row.fecha_fin || '').trim());
        const area     = (row.area || '').trim();
        const resp     = (row.responsable || '').trim();
        // status de tarea: COMPLETADO → done:true
        const tareaStatus = (row.status || '').toUpperCase().trim();
        const isDone   = tareaStatus === 'COMPLETADO';
        if (!title) return;

        if (fase) {
          // ── Roadmap de fases ──────────────────────────────────────
          const key = `${pid}|${fase}`;
          if (!phaseGroups[key]) {
            phaseGroups[key] = { pid, fase, fecha_inicio: fechaIni, fecha_fin: fechaFin, tasks: [] };
          } else {
            // Amplía el rango de fechas si hay filas con distinto rango para la misma fase
            if (fechaIni && (!phaseGroups[key].fecha_inicio || fechaIni < phaseGroups[key].fecha_inicio))
              phaseGroups[key].fecha_inicio = fechaIni;
            if (fechaFin && (!phaseGroups[key].fecha_fin || fechaFin > phaseGroups[key].fecha_fin))
              phaseGroups[key].fecha_fin = fechaFin;
          }
          phaseGroups[key].tasks.push({ title, description: desc, area, responsible: resp || '—', done: isDone });

        } else {
          // ── Planificador semanal ──────────────────────────────────
          // Resuelve sprint por fecha; si la fecha no encaja en ningún sprint,
          // usa semana_inicio como nombre de sprint custom
          const sprint = resolveSprintByDate(fechaIni)
                      || (row.semana_inicio || '').trim()
                      || (row.sprint || '').trim(); // compat. backwards
          if (!sprint) return;
          const key = `${pid}|${sprint}`;
          if (!sprintGroups[key]) sprintGroups[key] = { pid, sprint, tasks: [] };
          sprintGroups[key].tasks.push({ title, description: desc, area, resp, done: isDone });
        }

      } else if (tipo === 'acuerdo') {
        // fecha_inicio es el campo principal; acepta también "fecha" (compat.)
        const fecha  = (row.fecha_inicio || row.fecha || '').trim();
        // etiqueta de la sesión: semana_inicio, sesion, o la fecha
        const sesion = (row.semana_inicio || row.sesion || '').trim();
        const title  = (row.titulo || '').trim();
        const desc   = (row.descripcion || '').trim();
        if (!fecha || !title) return;
        const key = `${pid}|${fecha}`;
        if (!acuerdoGroups[key]) acuerdoGroups[key] = { pid, sesion: sesion || fecha, fecha_iso: fecha, items: [] };
        const st = (row.status || '').toUpperCase().trim();
        acuerdoGroups[key].items.push({ title, description: desc, responsible: row.responsable || '', status: VALID_STATUS.has(st) ? st : 'PENDIENTE', date: null });
      }
    });

    let countTareas = 0, countFases = 0, countAcuerdos = 0;
    const updated = new Set();
    const uid = () => Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    // ── Fases de roadmap ──────────────────────────────────────────────────────
    Object.values(phaseGroups).forEach(({ pid, fase, fecha_inicio, fecha_fin, tasks }) => {
      if (!_projects[pid]) _projects[pid] = { title: PLAN_FRIENDLY[pid] || pid, phases: [], sprint_tasks: {}, acuerdos: [] };
      if (!_projects[pid].phases) _projects[pid].phases = [];
      let phase = _projects[pid].phases.find(p => p.title === fase && !p.deleted);
      if (!phase) {
        phase = { id: 'ph_' + uid(), title: fase, status: 'active',
                  start_iso: fecha_inicio || null, end_iso: fecha_fin || null, tasks: [] };
        _projects[pid].phases.push(phase);
        countFases++;
      } else {
        if (fecha_inicio) phase.start_iso = fecha_inicio;
        if (fecha_fin)    phase.end_iso   = fecha_fin;
      }
      phase.tasks = tasks.map(t => ({ ...t, id: 't_' + uid() }));
      countTareas += tasks.length;
      updated.add(pid);
    });

    // ── Planificador semanal ──────────────────────────────────────────────────
    Object.values(sprintGroups).forEach(({ pid, sprint, tasks }) => {
      if (!_projects[pid]) _projects[pid] = { title: PLAN_FRIENDLY[pid] || pid, phases: [], sprint_tasks: {}, acuerdos: [] };
      if (!_projects[pid].sprint_tasks) _projects[pid].sprint_tasks = {};
      _projects[pid].sprint_tasks[sprint] = tasks;
      countTareas += tasks.length;
      updated.add(pid);
    });

    // ── Acuerdos ─────────────────────────────────────────────────────────────
    Object.values(acuerdoGroups).forEach(({ pid, sesion, fecha_iso, items }) => {
      if (!_projects[pid]) _projects[pid] = { title: PLAN_FRIENDLY[pid] || pid, phases: [], sprint_tasks: {}, acuerdos: [] };
      if (!_projects[pid].acuerdos) _projects[pid].acuerdos = [];
      const existing = _projects[pid].acuerdos.find(s => s.iso_date === fecha_iso);
      if (existing) { existing.items = items; existing.display = sesion || existing.display; }
      else { _projects[pid].acuerdos.push({ session: sesion, iso_date: fecha_iso, display: sesion, hora: null, items }); }
      countAcuerdos += items.length;
      updated.add(pid);
    });

    const total = countTareas + countAcuerdos;
    if (!total) {
      showImportStatus('Sin filas válidas — columnas: tipo, proyecto (o selector), fecha_inicio, fase, titulo', false);
      return;
    }

    try {
      await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: _projects }) });
      renderPlanner();
      Object.keys(PF_PANEL).forEach(pid => renderPlatformRoadmap(pid));
      refreshWeekView();
      // Abre automáticamente la sección del proyecto si solo hay uno
      if (updated.size === 1) {
        const pid = [...updated][0];
        const sectionMap = { arconte:'rm-arconte', publicvector:'rm-pv', stack_modelos:'rm-stack', arconte_retail:'rm-arconte-retail' };
        const secId = sectionMap[pid];
        if (secId) {
          const el = document.getElementById(secId);
          const btn = el?.previousElementSibling;
          if (el && el.style.display === 'none') {
            el.style.display = 'block';
            el.dataset.loaded = '1';
            if (btn) btn.classList.add('open');
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }
      const parts = [];
      if (countTareas)   parts.push(`${countTareas} tarea${countTareas > 1 ? 's' : ''}`);
      if (countFases)    parts.push(`${countFases} fase${countFases > 1 ? 's' : ''} nuevas`);
      if (countAcuerdos) parts.push(`${countAcuerdos} acuerdo${countAcuerdos > 1 ? 's' : ''}`);
      showImportStatus(`✓ Importado: ${parts.join(', ')} en ${updated.size} proyecto${updated.size > 1 ? 's' : ''}`);
    } catch(e) { showImportStatus('Error al guardar: ' + e.message, false); }
  }

  function handleUnifiedImport(input) {
    if (!input.files?.[0]) return;
    const file = input.files[0];
    input.value = '';
    const selectedPid = document.getElementById('import-project-sel')?.value || '';

    requireAdmin(() => {
      if (selectedPid) {
        // Proyecto seleccionado explícitamente → importar directo, ignorar nombre de archivo
        importUnifiedCSV(file, selectedPid);
      } else {
        // Sin selección → intentar match por nombre de archivo
        const matched = matchFileToProject(file.name);
        if (!matched) {
          showImportStatus(`⚠ Proyecto no encontrado para "${file.name}". Selecciónalo manualmente.`, false);
          return;
        }
        importUnifiedCSV(file, matched);
      }
    });
  }

  function matchFileToProject(filename) {
    // Normaliza el nombre del archivo: sin extensión, minúsculas, sin acentos, tokens por _
    const base = filename
      .replace(/\.(csv|xlsx)$/i, '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const baseTokens = new Set(base.split('_').filter(t => t.length > 1));

    // Itera proyectos de más específico (más tokens en pid) a más general
    const sorted = Object.entries(_projects).sort(
      ([a], [b]) => b.split('_').length - a.split('_').length
    );

    for (const [pid, project] of sorted) {
      // 1. Todos los tokens del pid están en el filename
      const pidTokens = pid.toLowerCase().split('_').filter(t => t.length > 1);
      if (pidTokens.length && pidTokens.every(t => baseTokens.has(t))) return pid;

      // 2. Todos los tokens del título están en el filename
      const titleWords = (project.title || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .split(/[^a-z0-9]+/).filter(w => w.length > 2);
      if (titleWords.length && titleWords.every(w => baseTokens.has(w))) return pid;

      // 3. Abreviatura PascalCase al inicio del filename (ej. "PV" → PublicVector)
      const wordMatches = (project.title || '').match(/[A-Z][a-z]*/g);
      if (wordMatches && wordMatches.length > 1) {
        const abbr = wordMatches.map(w => w[0].toLowerCase()).join('');
        if (abbr.length >= 2 && base.split('_')[0] === abbr) return pid;
      }
    }

    return null;
  }

  async function togglePlanTask(pid, sprint, idx, done) {
    const task = _projects[pid]?.sprint_tasks?.[sprint]?.[idx];
    if (task) { task.done = done; await savePlatformProject(pid); }
    renderPlanner();
    refreshWeekView();
  }

  async function deletePlanTask(pid, sprint, idx) {
    const tasks = _projects[pid]?.sprint_tasks?.[sprint];
    const desc  = tasks?.[idx]?.text || 'tarea';
    requireAdminDelete(`"${desc}" · ${_projects[pid]?.title || pid} · ${sprint}`, async (reason) => {
      const task = tasks?.[idx];
      if (task) {
        task.deleted        = true;
        task.deleted_by     = _currentUser || 'Admin';
        task.deleted_at     = todayLocalISO();
        task.deleted_reason = reason;
        await savePlatformProject(pid);
      }
      renderPlanner();
      refreshWeekView();
      notifyChange('delete', 'tarea', _projects[pid]?.title || pid, `${sprint}: ${desc}${reason ? ' · ' + reason : ''} (por ${_currentUser})`);
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // PLATFORM ROADMAPS (projects.json — sin xlsx)
  // ══════════════════════════════════════════════════════════════════

  const _projects = {};          // { pid: projectData }
  const _pfEditMode = {};        // { pid: bool }

  // IDs de panel para los 4 proyectos estáticos (HTML fijo)
  const PF_PANEL = {
    arconte:        'rm-arconte-panel',
    publicvector:   'rm-pv-panel',
    stack_modelos:  'rm-stack-panel',
    arconte_retail: 'rm-arconte-retail-panel',
  };

  // Extiende PF_PANEL con proyectos dinámicos cargados desde _projects
  function syncPfPanel() {
    Object.keys(_projects).forEach(pid => {
      if (!PF_PANEL[pid]) PF_PANEL[pid] = `dyn-rm-${pid}-panel`;
    });
  }

  async function loadProjects() {
    try {
      const [projData, solData] = await Promise.all([
        fetch('/api/projects').then(r => r.json()),
        fetch('/api/solutions').then(r => r.json()).catch(() => ({})),
      ]);
      Object.assign(_projects, projData);
      Object.assign(_solutionsMeta, solData);
      syncPfPanel();
      const _has = id => !!document.getElementById(id);
      if (_has('dyn-projects-grid')) {            // pagina Proyectos
        renderDynamicProjects();
        mountStaticProjectDocs();
        renderNewProjBtn();
        Object.keys(PF_PANEL).forEach(pid => renderPlatformRoadmap(pid));
        ['arconte','arconte_retail','publicvector'].forEach(applyStaticMetrics);
        ['arconte','arconte_retail'].forEach(applyCamerasCount);
      }
      if (_has('plan-sprints')) {                 // pagina Planificador
        renderPlannerProjectBtns();
        refreshImportProjectSel();
        renderPlanner();
      }
      if (_has('week-dynamic-root')) {            // pagina Tareas por semana
        refreshWeekView();
      }
    } catch(e) {
      Object.keys(PF_PANEL).forEach(pid => {
        const p = document.getElementById(PF_PANEL[pid]);
        if (p) p.innerHTML = '<div class="pf-empty">⚠ Servidor no disponible</div>';
      });
    }
  }

  // ── Proyectos dinámicos ───────────────────────────────────────────────────

  const PROJ_STATUSES = [
    { key: 'dev',        label: 'En desarrollo',    badge: 'waiting' },
    { key: 'production', label: 'En producción',    badge: 'badge-ok' },
    { key: 'paused',     label: 'En pausa',         badge: 'badge-warn' },
    { key: 'research',   label: 'Investigación',    badge: 'badge-purple' },
    { key: 'archived',   label: 'Archivado',        badge: 'badge-muted' },
  ];

  function projStatusLabel(key) { return PROJ_STATUSES.find(s=>s.key===key)?.label || key; }
  function projStatusBadge(key) { return PROJ_STATUSES.find(s=>s.key===key)?.badge || 'waiting'; }

  function dynProjects() {
    return Object.entries(_projects).filter(([, p]) => !p.meta?._static);
  }

  function renderNewProjBtn() {
    const area = document.getElementById('new-proj-btn-area');
    if (!area) return;
    area.innerHTML = isAdmin()
      ? `<button class="rm-tool-btn" style="font-size:11px;padding:4px 14px;" onclick="openNewProjectForm()">＋ Nuevo proyecto</button>`
      : '';
  }

  function renderPlannerProjectBtns() {
    const list = document.getElementById('plan-proj-list');
    if (!list) return;
    const first = Object.keys(_projects)[0] || '';
    list.innerHTML = `<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Proyecto</div>`
      + Object.entries(_projects).map(([pid, p], i) =>
          `<button class="plan-proj-btn${i===0?' active':''}" onclick="selectPlanProject('${pid}',this)">${p.title||pid}</button>`
        ).join('');
  }

  function refreshImportProjectSel() {
    const sel = document.getElementById('import-project-sel');
    if (!sel) return;
    sel.innerHTML = `<option value="" style="background:#141d28;color:var(--text);">— Proyecto (opcional) —</option>`
      + Object.entries(_projects).map(([pid, p]) =>
          `<option value="${pid}" style="background:#141d28;color:var(--text);">${p.title||pid}</option>`
        ).join('');
  }

  function renderDynamicProjects() {
    const container = document.getElementById('dyn-projects-grid');
    if (!container) return;
    const dyn = dynProjects();
    if (!dyn.length) { container.innerHTML = ''; return; }
    container.innerHTML = dyn.map(([pid, project]) => renderDynProjectCard(pid, project)).join('');
  }

  // Sección "Documentación" de la tarjeta de proyecto: enlaces externos
  // (meta.docs) + archivos subidos (reusa el sistema de evidencias con la clave
  // doc_<pid>). Los archivos viven en updates/solutions/ y se sirven en /solutions/.
  function renderProjectDocsHTML(pid, project) {
    const meta     = project.meta || {};
    const docLinks = Array.isArray(meta.docs) ? meta.docs : [];
    const files    = Array.isArray(_solutionsMeta['doc_' + pid]) ? _solutionsMeta['doc_' + pid] : [];
    const admin    = isAdmin();

    const total    = docLinks.length + files.length;

    const linksHTML = docLinks.map((d, i) => `
      <span class="doc-chip doc-chip-link">
        <a href="${esc(d.url)}" target="_blank" title="${esc(d.url)}">📄 ${esc(d.label || d.url)} ↗</a>
        ${admin ? `<button class="doc-chip-x" onclick="removeProjectDocLink('${pid}',${i})" title="Quitar enlace">✕</button>` : ''}
      </span>`).join('');

    const filesHTML = files.map(f => `
      <span class="doc-chip doc-chip-file">
        <a href="${esc(f.url)}" target="_blank" title="Subido por ${esc(f.uploaded_by || '')} · ${esc(f.uploaded_at || '')}">📎 ${esc(f.filename || 'documento')} ↗</a>
        ${admin ? `<button class="doc-chip-x" onclick="removeProjectDoc('${pid}','${(f.url || '').replace(/'/g, "\\'")}')" title="Eliminar archivo">✕</button>` : ''}
      </span>`).join('');

    const cnt = n => n ? ` <span class="doc-count">${n}</span>` : '';

    const linksSection = `
      <div class="doc-subsection">
        <div class="doc-sub-label doc-sub-link">🔗 Enlaces${cnt(docLinks.length)}</div>
        <div class="doc-chip-row">
          ${linksHTML || `<span class="doc-empty">Sin enlaces</span>`}
          ${admin ? `<button class="doc-add-btn" onclick="showProjectDocLinkForm('${pid}')">+ Enlace</button>` : ''}
        </div>
        <div id="proj-doc-linkform-${pid}"></div>
      </div>`;

    const filesSection = `
      <div class="doc-subsection">
        <div class="doc-sub-label doc-sub-file">📁 Archivos${cnt(files.length)}</div>
        <div class="doc-chip-row">
          ${filesHTML || `<span class="doc-empty">Sin archivos</span>`}
          ${admin ? `<label class="doc-add-btn">⬆ Subir<input type="file" style="display:none;" onchange="uploadProjectDoc('${pid}', this)"></label>` : ''}
        </div>
      </div>`;

    return `
      <div class="doc-box">
        <div class="doc-box-header">📚 Documentación${cnt(total)}</div>
        <div class="doc-box-body">
          ${linksSection}
          <div class="doc-divider"></div>
          ${filesSection}
        </div>
      </div>`;
  }

  function renderDynProjectCard(pid, project) {
    const meta    = project.meta || {};
    const title   = project.title || pid;
    const sub     = meta.subtitle || '';
    const status  = meta.status || 'dev';
    const stLabel = projStatusLabel(status);
    const stBadge = projStatusBadge(status);
    const tags    = (meta.tags || []).map(t => `<span class="project-tag ${t.cls||''}">${t.label}</span>`).join('');
    const tech    = (meta.tech || []).map(t => `<span class="tech-badge">${t}</span>`).join('');
    const links   = (meta.links || []).map(l => `
      <a class="link-btn" href="${l.url}" target="_blank">
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2h5v1.5H3.5v9h9V9H14v5H2V2z" fill="currentColor"/><path d="M9 2h5v5h-1.5V4.56L8.06 9 7 7.94 11.44 3.5H9V2z" fill="currentColor"/></svg>
        ${l.label}
      </a>`).join('');
    const desc    = meta.description || '';
    const pipeline= meta.pipeline || [];
    const pCur    = meta.pipeline_current ?? 0;
    const pipelineHTML = pipeline.length ? `
      <div class="project-pipeline" style="margin-bottom:10px;">
        <div class="pipeline-steps">
          ${pipeline.map((s,i) => `
            <span class="pipeline-step${i < pCur ? ' done' : ''}">${s}</span>
            ${i < pipeline.length-1 ? '<span class="pipeline-arrow">›</span>' : ''}
          `).join('')}
        </div>
        <span class="pipeline-status-badge ${stBadge}">🔧 ${stLabel}</span>
      </div>` : '';

    const panelId    = `dyn-rm-${pid}-panel`;
    const contentId  = `dyn-rm-${pid}`;
    const editWrap   = isAdmin() ? `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
        <button class="rm-tool-btn" style="font-size:10px;padding:3px 10px;" onclick="openEditProjectMeta('${pid}')">✏ Editar info</button>
        <button class="rm-tool-btn danger" style="font-size:10px;padding:3px 10px;" onclick="deleteProject('${pid}')">🗑 Eliminar</button>
      </div>` : '';

    return `<div class="project-card project-card-wide" id="dyn-card-${pid}">
      ${pipelineHTML}
      <div class="project-card-header">
        <div>
          <div class="project-card-title">${title}</div>
          ${sub ? `<div class="project-card-subtitle">${sub}</div>` : ''}
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          ${tags}
        </div>
      </div>
      ${desc ? `<div style="font-size:12px;color:var(--text-muted);margin:10px 0 4px;">${desc}</div>` : ''}
      ${tech ? `<div style="margin:8px 0;"><div class="sub-label-sm">Stack</div><div class="project-tech-list">${tech}</div></div>` : ''}
      ${renderProjectDocsHTML(pid, project)}
      ${_renderDynMetricsSectionHTML(pid, project)}
      ${editWrap}
      <div class="rm-section" style="margin-top:14px;">
        <button class="rm-toggle" onclick="toggleRm(this,'${contentId}')">
          <span>📋 Roadmap &amp; Tareas</span>
          <span class="rm-toggle-arrow">▼</span>
        </button>
        <div class="rm-content" id="${contentId}" style="display:none;">
          <div id="${panelId}" class="rm-panel active">
            <div class="rm-loading" style="font-size:12px;color:var(--text-muted);padding:8px 0;">Cargando...</div>
          </div>
        </div>
      </div>
      ${links ? `<div class="project-card-footer">${links}</div>` : ''}
    </div>`;
  }

  // ── Nuevo proyecto form ───────────────────────────────────────────────────

  let _newProjFormOpen = false;
  let _editProjMetaPid = null; // pid en edición de meta

  function openNewProjectForm() {
    _newProjFormOpen = true;
    _editProjMetaPid = null;
    renderNewProjFormWrap();
  }

  function closeNewProjectForm() {
    _newProjFormOpen = false;
    _editProjMetaPid = null;
    renderNewProjFormWrap();
  }

  function renderNewProjFormWrap() {
    const wrap = document.getElementById('new-proj-form-wrap');
    if (!wrap) return;
    if (!_newProjFormOpen && !_editProjMetaPid) { wrap.innerHTML = ''; return; }

    const isEdit = !!_editProjMetaPid;
    const proj   = isEdit ? _projects[_editProjMetaPid] : null;
    const meta   = proj?.meta || {};

    wrap.innerHTML = `<div class="model-form" style="max-width:640px;">
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px;">
        ${isEdit ? `✏ Editar proyecto — ${proj?.title || _editProjMetaPid}` : '＋ Nuevo proyecto'}
      </div>
      <div class="model-form-row">
        <label>Nombre del proyecto *<input id="np-title" placeholder="Ej: Arconte Retail" value="${isEdit ? (proj?.title||'') : ''}"></label>
        <label>Subtítulo<input id="np-subtitle" placeholder="Descripción corta" value="${meta.subtitle||''}"></label>
      </div>
      <div class="model-form-row">
        <label>Estado<select id="np-status">
          ${PROJ_STATUSES.map(s => `<option value="${s.key}"${(meta.status||'dev')===s.key?' selected':''}>${s.label}</option>`).join('')}
        </select></label>
        <label>Etiquetas (comas)<input id="np-tags" placeholder="Retail, IA, Backend" value="${(meta.tags||[]).map(t=>t.label).join(', ')}"></label>
      </div>
      <label>Descripción<textarea id="np-desc" rows="2" placeholder="¿De qué trata el proyecto?">${meta.description||''}</textarea></label>
      <label>Stack tecnológico (comas)<input id="np-tech" placeholder="Python, YOLO, FastAPI…" value="${(meta.tech||[]).join(', ')}"></label>
      <label>Links (formato: Nombre | URL · separados por comas)<input id="np-links" placeholder="GitHub | https://github.com/… , Docs | https://…" value="${(meta.links||[]).map(l=>l.label+'|'+l.url).join(', ')}"></label>
      <label>Pipeline (etapas separadas por comas)<input id="np-pipeline" placeholder="Planeación, Desarrollo, Pruebas, QA, Lanzado" value="${(meta.pipeline||[]).join(', ')}"></label>
      <label style="max-width:180px;">Etapa actual (0 = primera)<input id="np-pipeline-cur" type="number" min="0" value="${meta.pipeline_current ?? 0}"></label>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button class="plan-save-btn" onclick="${isEdit ? `saveEditProjectMeta('${_editProjMetaPid}')` : 'commitNewProject()'}">${isEdit ? 'Guardar cambios' : 'Crear proyecto'}</button>
        <button class="plan-cancel-btn" onclick="closeNewProjectForm()">Cancelar</button>
      </div>
    </div>`;
  }

  function parseProjFormData() {
    const title    = document.getElementById('np-title')?.value.trim();
    const subtitle = document.getElementById('np-subtitle')?.value.trim() || '';
    const status   = document.getElementById('np-status')?.value || 'dev';
    const tagsRaw  = document.getElementById('np-tags')?.value.trim() || '';
    const desc     = document.getElementById('np-desc')?.value.trim() || '';
    const techRaw  = document.getElementById('np-tech')?.value.trim() || '';
    const linksRaw = document.getElementById('np-links')?.value.trim() || '';
    const pipeRaw  = document.getElementById('np-pipeline')?.value.trim() || '';
    const pCur     = parseInt(document.getElementById('np-pipeline-cur')?.value || '0', 10);

    const tags  = tagsRaw  ? tagsRaw.split(',').map(t => ({ label: t.trim(), cls: '' })).filter(t=>t.label) : [];
    const tech  = techRaw  ? techRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
    const links = linksRaw ? linksRaw.split(',').map(s => {
      const [label, url] = s.split('|').map(x => x.trim());
      return label && url ? { label, url } : null;
    }).filter(Boolean) : [];
    const pipeline = pipeRaw ? pipeRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

    return { title, subtitle, status, tags, desc, tech, links, pipeline, pCur };
  }

  async function commitNewProject() {
    const f = parseProjFormData();
    if (!f.title) { document.getElementById('np-title')?.focus(); return; }

    // Slug del ID: lowercase, sin espacios/acentos
    let pid = f.title.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    // Evitar colisión
    let base = pid, n = 2;
    while (_projects[pid]) pid = base + '_' + n++;

    _projects[pid] = {
      title: f.title,
      meta: {
        subtitle: f.subtitle, status: f.status,
        status_label: projStatusLabel(f.status),
        tags: f.tags, description: f.desc, tech: f.tech,
        links: f.links, pipeline: f.pipeline, pipeline_current: f.pCur,
        _static: false,
      },
      phases: [], sprint_tasks: {}, acuerdos: [], models: [],
    };

    syncPfPanel();
    await savePlatformProject(pid);
    _newProjFormOpen = false;
    renderNewProjFormWrap();
    renderDynamicProjects();
    renderPlannerProjectBtns();
    refreshImportProjectSel();
    renderPlatformRoadmap(pid);
    notifyChange('add', 'proyecto', f.title, '');
  }

  function openEditProjectMeta(pid) {
    _editProjMetaPid = pid;
    _newProjFormOpen = false;
    const wrap = document.getElementById('new-proj-form-wrap');
    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    renderNewProjFormWrap();
  }

  async function saveEditProjectMeta(pid) {
    const f = parseProjFormData();
    if (!f.title) { document.getElementById('np-title')?.focus(); return; }
    const proj = _projects[pid];
    if (!proj) return;
    proj.title = f.title;
    if (!proj.meta) proj.meta = {};
    Object.assign(proj.meta, {
      subtitle: f.subtitle, status: f.status,
      status_label: projStatusLabel(f.status),
      tags: f.tags, description: f.desc, tech: f.tech,
      links: f.links, pipeline: f.pipeline, pipeline_current: f.pCur,
    });
    await savePlatformProject(pid);
    _editProjMetaPid = null;
    renderNewProjFormWrap();
    renderDynamicProjects();
    renderPlannerProjectBtns();
    refreshImportProjectSel();
    renderPlatformRoadmap(pid);
  }

  function deleteProject(pid) {
    if (!isAdmin()) return;
    const title = _projects[pid]?.title || pid;
    requireAdminDelete(`proyecto "${title}" y todos sus datos`, async (reason) => {
      delete _projects[pid];
      delete PF_PANEL[pid];
      await savePlatformProject(pid);
      renderDynamicProjects();
      renderPlannerProjectBtns();
      refreshImportProjectSel();
      notifyChange('delete', 'proyecto', title, reason || '');
    });
  }

  // ─────────────────────────────────────────────────────────────────────────

  async function savePlatformProject(pid) {
    try {
      await fetch('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: _projects })
      });
    } catch(e) {}
    renderOverdueBanner();   // mantener el warning al día tras cualquier cambio
  }

  // ── Documentación de proyecto (enlaces + archivos) ────────────────────────
  // Tras cambiar docs hay que reconstruir las tarjetas Y volver a pintar los
  // paneles de roadmap (renderDynamicProjects los deja en "Cargando...").
  function _refreshProjectsPage() {
    renderDynamicProjects();
    Object.keys(PF_PANEL).forEach(p => renderPlatformRoadmap(p));
    mountStaticProjectDocs();
  }

  // Las tarjetas de los proyectos _static viven en proyectos.html (HTML fijo).
  // Cada una tiene un punto de montaje <div class="proj-docs-mount" data-pid="…">
  // debajo de su Stack; aquí inyectamos la sección Documentación dinámica.
  function mountStaticProjectDocs() {
    document.querySelectorAll('.proj-docs-mount').forEach(el => {
      const pid = el.dataset.pid;
      const project = _projects[pid];
      if (project) el.innerHTML = renderProjectDocsHTML(pid, project);
    });
  }

  function showProjectDocLinkForm(pid) {
    const c = document.getElementById('proj-doc-linkform-' + pid);
    if (!c || c.querySelector('.rm-edit-form')) return;
    const form = document.createElement('div');
    form.className = 'rm-edit-form';
    form.style.cssText = 'margin-top:6px;';
    form.innerHTML = `
      <input type="text" class="rm-edit-input" id="pdoc-label-${pid}" placeholder="Etiqueta (ej. README, Manual de despliegue)">
      <input type="text" class="rm-edit-input" id="pdoc-url-${pid}" placeholder="https://…" style="margin-top:4px;">
      <div class="rm-edit-row" style="margin-top:4px;">
        <button class="rm-btn-save" onclick="commitProjectDocLink('${pid}')">+ Guardar</button>
        <button class="rm-btn-cancel" onclick="this.closest('.rm-edit-form').remove()">Cancelar</button>
      </div>`;
    c.appendChild(form);
    document.getElementById('pdoc-label-' + pid)?.focus();
  }

  async function commitProjectDocLink(pid) {
    const label = document.getElementById('pdoc-label-' + pid)?.value.trim() || '';
    let   url   = document.getElementById('pdoc-url-' + pid)?.value.trim() || '';
    if (!url) { document.getElementById('pdoc-url-' + pid)?.focus(); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const proj = _projects[pid];
    if (!proj) return;
    if (!proj.meta) proj.meta = {};
    if (!Array.isArray(proj.meta.docs)) proj.meta.docs = [];
    proj.meta.docs.push({ label: label || url, url });
    await savePlatformProject(pid);
    notifyChange('add', 'documentación', proj.title || pid, `Enlace: ${label || url}`);
    _refreshProjectsPage();
  }

  async function removeProjectDocLink(pid, idx) {
    if (!isAdmin()) return;
    const proj = _projects[pid];
    if (!proj?.meta?.docs?.[idx]) return;
    if (!confirm('¿Quitar este enlace de documentación?')) return;
    const [removed] = proj.meta.docs.splice(idx, 1);
    await savePlatformProject(pid);
    notifyChange('delete', 'documentación', proj.title || pid, `Enlace: ${removed?.label || ''}`);
    _refreshProjectsPage();
  }

  async function uploadProjectDoc(pid, input) {
    const file = input.files[0];
    if (!file) return;
    input.value = '';
    const key = 'doc_' + pid;
    const formData = new FormData();
    formData.append('task_key',    key);
    formData.append('uploaded_by', _currentUser || 'Anónimo');
    formData.append('file',        file);
    try {
      const res  = await fetch('/api/solutions/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.ok) { alert('Error al subir: ' + (data.detail || 'desconocido')); return; }
      if (!Array.isArray(_solutionsMeta[key])) _solutionsMeta[key] = [];
      _solutionsMeta[key].push(data.entry);
      notifyChange('add', 'documentación', _projects[pid]?.title || pid, `Archivo: ${file.name}`);
      _refreshProjectsPage();
    } catch(e) {
      alert('Error de conexión al subir el documento.');
    }
  }

  async function removeProjectDoc(pid, url) {
    if (!isAdmin()) return;
    if (!confirm('¿Eliminar este documento?')) return;
    const key = 'doc_' + pid;
    try {
      const res  = await fetch('/api/solutions/remove', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ task_key: key, url }) });
      const data = await res.json();
      if (data.ok) {
        if (Array.isArray(_solutionsMeta[key])) _solutionsMeta[key] = _solutionsMeta[key].filter(e => e.url !== url);
        notifyChange('delete', 'documentación', _projects[pid]?.title || pid, 'Archivo eliminado');
        _refreshProjectsPage();
      }
    } catch(e) {
      alert('Error al eliminar el documento.');
    }
  }

  const _pfCalState = {}; // { pid: { year, month } }
  const _pfDayMoves = {}; // { pid: { isoOrigen: [{label, days, to, reason, by, at}] } }

  // ══════════════════════════════════════════════════════════════════════════
  // MODEL STACK — CRUD
  // ══════════════════════════════════════════════════════════════════════════

  const MODEL_STATUSES = [
    { key:'poc',        label:'Prueba de concepto', cls:'ms-poc' },
    { key:'dev',        label:'En desarrollo',      cls:'ms-dev' },
    { key:'testing',    label:'En pruebas',          cls:'ms-testing' },
    { key:'production', label:'Producción',          cls:'ms-production' },
    { key:'deprecated', label:'Deprecado',           cls:'ms-deprecated' },
  ];

  function modelStatusCls(status) {
    return (MODEL_STATUSES.find(s => s.key === status) || MODEL_STATUSES[0]).cls;
  }
  function modelStatusLabel(status) {
    return (MODEL_STATUSES.find(s => s.key === status) || MODEL_STATUSES[0]).label;
  }

  function toggleModelEdit(pid) { _modelEditMode[pid] = !_modelEditMode[pid]; renderPlatformRoadmap(pid); }

  function renderModelSection(pid) {
    const project = _projects[pid];
    if (!project) return '';
    const models  = (project.models || []).filter(m => !m.deleted);
    const edit    = !!_modelEditMode[pid];
    const isStack = pid === 'stack_modelos';

    let html = `<div class="model-section">
      <div class="model-section-title">
        🤖 ${isStack ? 'Catálogo de Modelos' : 'Modelos del Proyecto'}
        <span style="font-size:10px;font-weight:400;color:var(--text-muted);">${models.length} modelo${models.length !== 1 ? 's' : ''}</span>
        ${isAdmin() ? `<button class="rm-tool-btn${edit ? ' active' : ''}" style="margin-left:auto;font-size:10px;padding:3px 10px;" onclick="toggleModelEdit('${pid}')">✏ ${edit ? 'Salir edición' : 'Editar modelos'}</button>` : ''}
      </div>`;

    if (models.length) {
      html += `<div class="model-grid">`;
      models.forEach(model => {
        const isEditing = _modelEditId?.pid === pid && _modelEditId?.modelId === model.id;
        const stCls     = modelStatusCls(model.status);
        const stLabel   = modelStatusLabel(model.status);
        const techBadges = (model.tech || '').split(',').map(t => t.trim()).filter(Boolean)
          .map(t => `<span class="tech-badge">${t}</span>`).join('');

        if (isEditing) {
          html += `<div class="model-form" style="grid-column:1/-1;">
            <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px;">Editando: ${model.name}</div>
            <div class="model-form-row">
              <label>Nombre<input id="me-name-${model.id}" value="${(model.name||'').replace(/"/g,'&quot;')}" placeholder="Nombre del modelo"></label>
              <label>Versión<input id="me-ver-${model.id}" value="${(model.version||'').replace(/"/g,'&quot;')}" placeholder="v1.0, POC…"></label>
            </div>
            <div class="model-form-row">
              <label>Estado<select id="me-status-${model.id}">${MODEL_STATUSES.map(s => `<option value="${s.key}"${model.status===s.key?' selected':''}>${s.label}</option>`).join('')}</select></label>
              <label>Responsable<input id="me-resp-${model.id}" value="${(model.responsible||'').replace(/"/g,'&quot;')}" placeholder="Nombre"></label>
            </div>
            <label>Descripción<textarea id="me-desc-${model.id}" rows="2" placeholder="¿Qué hace el modelo?">${(model.description||'').replace(/</g,'&lt;')}</textarea></label>
            <label>Stack tecnológico (separado por comas)<input id="me-tech-${model.id}" value="${(model.tech||'').replace(/"/g,'&quot;')}" placeholder="YOLO11x, ResNet50, CLIP…"></label>
            <label>Notas adicionales<input id="me-notes-${model.id}" value="${(model.notes||'').replace(/"/g,'&quot;')}" placeholder="Observaciones, links…"></label>
            <div style="display:flex;gap:8px;margin-top:4px;">
              <button class="plan-save-btn" onclick="saveModelEdit('${pid}','${model.id}')">Guardar</button>
              <button class="plan-cancel-btn" onclick="cancelModelEdit('${pid}')">Cancelar</button>
            </div>
          </div>`;
        } else {
          html += `<div class="model-card">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
              <div class="model-card-name">${model.name}${model.version ? ` <span style="font-size:10px;color:var(--text-muted);font-weight:400;">${model.version}</span>` : ''}</div>
              <span class="model-status ${stCls}">${stLabel}</span>
            </div>
            ${model.description ? `<div class="model-card-desc">${model.description.replace(/</g,'&lt;')}</div>` : ''}
            ${techBadges ? `<div class="project-tech-list" style="margin-top:2px;">${techBadges}</div>` : ''}
            <div class="model-card-meta">
              ${model.responsible ? `<span>👤 ${model.responsible}</span>` : ''}
              ${model.notes ? `<span style="font-style:italic;">${model.notes.replace(/</g,'&lt;')}</span>` : ''}
            </div>
            ${edit ? `<div class="model-card-actions">
              <button style="flex:1;padding:3px 8px;border-radius:5px;border:none;background:rgba(34,211,238,0.12);color:var(--accent);cursor:pointer;font-size:11px;" onclick="startModelEdit('${pid}','${model.id}')">✏ Editar</button>
              <button style="padding:3px 8px;border-radius:5px;border:none;background:rgba(248,113,113,0.12);color:var(--red);cursor:pointer;font-size:11px;" onclick="deleteModel('${pid}','${model.id}')">✕</button>
            </div>` : ''}
          </div>`;
        }
      });
      html += `</div>`;
    } else {
      html += `<div class="pf-empty">Sin modelos registrados. ${edit ? 'Usa "＋ Agregar modelo" para empezar.' : 'Activa el modo edición para agregar modelos.'}</div>`;
    }

    if (edit && !_modelEditId) {
      if (_modelFormOpen[pid]) {
        html += `<div class="model-form" id="model-add-form-${pid}">
          <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px;">Nuevo modelo</div>
          <div class="model-form-row">
            <label>Nombre *<input id="ma-name-${pid}" placeholder="Ej: Modelo Fardeo"></label>
            <label>Versión<input id="ma-ver-${pid}" placeholder="v1.0, POC…"></label>
          </div>
          <div class="model-form-row">
            <label>Estado<select id="ma-status-${pid}">${MODEL_STATUSES.map(s => `<option value="${s.key}">${s.label}</option>`).join('')}</select></label>
            <label>Responsable<input id="ma-resp-${pid}" placeholder="Nombre"></label>
          </div>
          <label>Descripción<textarea id="ma-desc-${pid}" rows="2" placeholder="¿Qué hace el modelo?"></textarea></label>
          <label>Stack tecnológico (separado por comas)<input id="ma-tech-${pid}" placeholder="YOLO11x, ResNet50, CLIP…"></label>
          <label>Notas adicionales<input id="ma-notes-${pid}" placeholder="Observaciones, links…"></label>
          <div style="display:flex;gap:8px;margin-top:4px;">
            <button class="plan-save-btn" onclick="commitAddModel('${pid}')">Guardar modelo</button>
            <button class="plan-cancel-btn" onclick="closeModelForm('${pid}')">Cancelar</button>
          </div>
        </div>`;
      } else {
        html += `<button class="model-add-btn" onclick="openModelForm('${pid}')">＋ Agregar modelo</button>`;
      }
    }

    html += `</div><hr style="border:none;border-top:1px solid var(--border);margin:16px 0;">`;
    return html;
  }

  function openModelForm(pid)  { _modelFormOpen[pid] = true;  renderPlatformRoadmap(pid); }
  function closeModelForm(pid) { _modelFormOpen[pid] = false; renderPlatformRoadmap(pid); }

  function startModelEdit(pid, modelId) { _modelEditId = { pid, modelId }; renderPlatformRoadmap(pid); }
  function cancelModelEdit(pid)         { _modelEditId = null;             renderPlatformRoadmap(pid); }

  async function saveModelEdit(pid, modelId) {
    const model = (_projects[pid]?.models || []).find(m => m.id === modelId);
    if (!model) return;
    model.name        = document.getElementById(`me-name-${modelId}`)?.value.trim()  || model.name;
    model.version     = document.getElementById(`me-ver-${modelId}`)?.value.trim()   || '';
    model.status      = document.getElementById(`me-status-${modelId}`)?.value       || 'poc';
    model.responsible = document.getElementById(`me-resp-${modelId}`)?.value.trim()  || '';
    model.description = document.getElementById(`me-desc-${modelId}`)?.value.trim()  || '';
    model.tech        = document.getElementById(`me-tech-${modelId}`)?.value.trim()  || '';
    model.notes       = document.getElementById(`me-notes-${modelId}`)?.value.trim() || '';
    _modelEditId = null;
    await savePlatformProject(pid);
    renderPlatformRoadmap(pid);
  }

  async function commitAddModel(pid) {
    const name = document.getElementById(`ma-name-${pid}`)?.value.trim();
    if (!name) { document.getElementById(`ma-name-${pid}`)?.focus(); return; }
    if (!_projects[pid])         _projects[pid] = { title: pid, phases: [], sprint_tasks: {}, acuerdos: [], models: [] };
    if (!_projects[pid].models)  _projects[pid].models = [];
    _projects[pid].models.push({
      id:          `m_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
      name,
      version:     document.getElementById(`ma-ver-${pid}`)?.value.trim()    || '',
      status:      document.getElementById(`ma-status-${pid}`)?.value        || 'poc',
      responsible: document.getElementById(`ma-resp-${pid}`)?.value.trim()   || '',
      description: document.getElementById(`ma-desc-${pid}`)?.value.trim()   || '',
      tech:        document.getElementById(`ma-tech-${pid}`)?.value.trim()   || '',
      notes:       document.getElementById(`ma-notes-${pid}`)?.value.trim()  || '',
      created_at:  todayLocalISO(),
    });
    _modelFormOpen[pid] = false;
    await savePlatformProject(pid);
    renderPlatformRoadmap(pid);
    notifyChange('add', 'modelo', _projects[pid]?.title || pid, name);
  }

  async function deleteModel(pid, modelId) {
    const model = (_projects[pid]?.models || []).find(m => m.id === modelId);
    if (!model) return;
    requireAdminDelete(`modelo "${model.name}"`, async (reason) => {
      model.deleted = true; model.deleted_reason = reason; model.deleted_by = _currentUser || 'Admin';
      await savePlatformProject(pid);
      renderPlatformRoadmap(pid);
      notifyChange('delete', 'modelo', _projects[pid]?.title || pid, `${model.name}${reason ? ' · ' + reason : ''}`);
    });
  }

  function renderProjectModelsInCard(pid) {
    const slot = document.getElementById(`models-direct-${pid}`);
    if (slot) slot.innerHTML = renderModelSection(pid);
  }

  function renderPlatformRoadmap(pid) {
    const panel = document.getElementById(PF_PANEL[pid]);
    if (!panel) return;
    renderProjectModelsInCard(pid);
    const project = _projects[pid] || { title: '', phases: [] };
    const edit = !!_pfEditMode[pid];
    const phases = project.phases || [];
    const datedPhases = phases.filter(p => p.start_iso && p.end_iso && !p.deleted);
    const allTasks   = phases.flatMap(ph => ph.tasks || []).filter(t => !t.deleted);
    const doneCnt    = allTasks.filter(t => t.done).length;
    const pct        = allTasks.length ? Math.round(doneCnt / allTasks.length * 100) : 0;

    const projTitle = project.title || pid;
    let html = `<div class="pf-toolbar">
      ${isAdmin() ? `<button class="rm-tool-btn${edit ? ' active' : ''}" onclick="togglePfEdit('${pid}')">✏ Editar</button>` : ''}
      ${edit && isAdmin() ? `<button class="rm-tool-btn" onclick="showCreatePhaseForm('${pid}')">＋ Nueva fase</button>` : ''}
      ${edit && isAdmin() ? '<span style="font-size:11px;color:var(--accent);margin-left:4px;">— Modo edición</span>' : ''}
      ${isAdmin() ? `<button class="rm-tool-btn danger" onclick="proposeRoadmapDelete('${pid}','${projTitle.replace(/'/g,"\\'")}')" title="Requiere votación 50%+1 del equipo">⚠ Eliminar Roadmap</button>` : ''}
    </div>`;
    // Modelos se muestran en la tarjeta principal (no en el panel de roadmap)
    if (allTasks.length) {
      html += `<div class="pf-progress-bar"><div class="pf-progress-fill" style="width:${pct}%"></div></div>
      <div class="pf-summary">${doneCnt} de ${allTasks.length} tareas activas completadas (${pct}%)</div>`;
    }

    // Mapa fase.id → color (calculado con índice original en phases[])
    const phaseColorMap = {};
    phases.filter(p => !p.deleted).forEach((p, pi) => {
      phaseColorMap[p.id] = phaseCalColor(p, pi, {}, false);
    });

    // ── Calendario (si hay fases con fechas) ──────────────────────────────────
    if (datedPhases.length) {
      const legendHTML = `<div class="rm-cal-legend" style="flex-wrap:wrap;gap:8px;margin-top:8px;">
        ${datedPhases.map(p => `
          <span style="display:inline-flex;align-items:center;gap:4px;">
            <span style="width:10px;height:10px;border-radius:2px;background:${phaseColorMap[p.id]||PHASE_PALETTE[0]};display:inline-block;border:1px solid rgba(255,255,255,0.1);"></span>
            <span style="font-size:10px;color:var(--text-muted);">${p.title}</span>
          </span>`).join('')}
      </div>`;
      html += calWrapHTML(legendHTML) + `<div class="rm-phase-list" style="margin-top:18px;"></div>`;
    }

    if (!phases.length) {
      html += `<div class="pf-empty">Sin fases definidas. ${edit ? 'Usa "Nueva fase" para empezar.' : 'Activa el modo edición para agregar fases.'}</div>`;
    }
    let _visPhi = 0;
    phases.forEach((phase, pi) => {
      if (!phase.deleted) _visPhi++;
      const _phNum = _visPhi;
      const tasks      = phase.tasks || [];
      const activeTasks = tasks.filter(t => !t.deleted);
      const donePh     = activeTasks.filter(t => t.done).length;
      const effSt      = phaseEffectiveStatus(phase, {}, false);
      const statusCls  = { done:'done', active:'active', paused:'paused', continuous:'active' }[effSt] || 'active';
      const phDeleted  = !!phase.deleted;
      const phBlockedBy = getPfPhaseBlockedBy(pid, phase.id);
      const phIsBlocked  = phBlockedBy.length > 0;
      html += `<div class="pf-phase-card${phDeleted ? ' task-deleted' : ''}" id="pf-ph-${pid}-${phase.id}">
        <div class="pf-phase-hdr" onclick="togglePfPhase('${pid}','${phase.id}')">
          <span class="rm-phase-badge ${statusCls}" style="flex-shrink:0;">${PHASE_LABEL[effSt]||effSt}</span>
          <span class="pf-phase-title${phDeleted ? ' task-deleted-text' : ''}">${phase.title}</span>
          ${phase.start_iso ? `<span class="pf-phase-dates">${phase.start_iso} → ${phase.end_iso||'?'}</span>` : ''}
          ${phIsBlocked ? `<span style="font-size:10px;color:#ff6b6b;flex-shrink:0;">⛔ Bloqueada</span>` : ''}
          <span style="font-size:11px;color:var(--text-muted);">${donePh}/${activeTasks.length}</span>
          ${!phDeleted && edit ? `<button class="rm-delete-btn" onclick="event.stopPropagation();deletePfPhase('${pid}','${phase.id}')" title="Eliminar fase">✕</button>` : ''}
        </div>`;
      // Historial de desplazamientos (siempre visible en el roadmap)
      const _shiftLog = Array.isArray(phase.shift_log) ? phase.shift_log
        : (phase.shift_reason ? [{ days: phase.shift_days || 0, reason: phase.shift_reason, by: phase.shifted_by, at: phase.shifted_at }] : []);
      if (!phDeleted && _shiftLog.length) {
        const _total = phase.shift_days != null ? phase.shift_days : _shiftLog.reduce((s, x) => s + (x.days || 0), 0);
        const _items = _shiftLog.map(x => {
          const r = String(x.reason || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const d = (x.days > 0 ? '+' + x.days : x.days) + 'd';
          return `<div style="margin-top:2px;">• <strong>${d}</strong> — ${r}${x.by ? ' · ' + x.by : ''}${x.at ? ' (' + x.at + ')' : ''}</div>`;
        }).join('');
        html += `<div class="rm-shift-notice" style="flex-direction:column;align-items:flex-start;gap:0;">
          <div><strong>⚠ Recorrida ${_total > 0 ? '+' + _total : _total}d en total</strong></div>${_items}
        </div>`;
      }
      if (phDeleted) {
        html += `<div style="padding:6px 10px;"><span class="task-deleted-badge">Eliminada por ${phase.deleted_by}${phase.deleted_at ? ' · ' + phase.deleted_at : ''}${phase.deleted_reason ? ' — ' + phase.deleted_reason : ''}</span></div>`;
      } else {
        html += `<div class="pf-phase-body" id="pf-body-${pid}-${phase.id}">`;
        if (!tasks.length) {
          html += `<div class="pf-empty">Sin tareas.</div>`;
        }
        let _visTi = 0;
        tasks.forEach(task => {
          if (!task.deleted) _visTi++;
          const taskDisplayId = `F${_phNum}·T${_visTi}`;
          const taskLabel  = task.title || task.description || '(sin título)';
          const taskDetail = task.title ? (task.description || '') : '';
          if (task.deleted) {
            html += `<div class="pf-task-row task-deleted">
              <div style="flex:1;">
                <div class="pf-task-desc task-deleted-text">${taskLabel}</div>
                ${taskDetail ? `<div class="pf-task-meta task-deleted-text">${taskDetail}</div>` : ''}
                <div class="task-deleted-badge">Eliminado por ${task.deleted_by}${task.deleted_at ? ' · ' + task.deleted_at : ''}${task.deleted_reason ? ' — ' + task.deleted_reason : ''}</div>
              </div>
            </div>`;
            return;
          }
          const doneCls   = task.done ? ' done-task' : '';
          const deleteBtn = edit ? `<button class="rm-delete-btn" onclick="deletePfTask('${pid}','${phase.id}','${task.id}')" title="Eliminar">✕</button>` : '';
          html += `<div class="pf-task-row">
            <input type="checkbox" ${task.done ? 'checked' : ''} onchange="togglePfTask('${pid}','${phase.id}','${task.id}',this.checked,this)">
            <div style="flex:1;">
              <div class="pf-task-desc${doneCls}">
                <span style="font-size:9px;color:var(--text-muted);font-family:monospace;margin-right:5px;opacity:0.7;">${taskDisplayId}</span>${taskLabel}
              </div>
              ${taskDetail ? `<div class="pf-task-meta">${taskDetail}</div>` : ''}
              <div class="pf-task-meta">
                <span class="rm-area-badge ${AREA_CLASS[task.area]||'active'}">${task.area}</span>
                ${task.responsible ? `<span class="rm-resp"> ${task.responsible}</span>` : ''}
              </div>
            </div>
            ${deleteBtn}
          </div>`;
        });
        if (edit) {
          html += `<button class="rm-add-task-btn" style="margin-top:6px;" onclick="showAddPfTaskForm('${pid}','${phase.id}')">＋ Agregar tarea</button>`;
        }
        html += `</div>`; // close pf-phase-body
      }
      html += `</div>`; // close pf-phase-card
    });

    panel.innerHTML = html;
    // Abre la primera fase por defecto si hay fases
    if (phases.length) {
      const firstBody = document.getElementById(`pf-body-${pid}-${phases[0].id}`);
      if (firstBody) firstBody.classList.add('open');
    }

    // ── Calendario: wiring ────────────────────────────────────────────────────
    if (datedPhases.length) {
      // Construye mapa día → fase (sin fines de semana)
      const dayPhases = {};
      datedPhases.forEach(phase => {
        let cur = new Date(phase.start_iso + 'T12:00:00');
        const end = new Date(phase.end_iso + 'T12:00:00');
        while (cur <= end) {
          const dow = cur.getDay();
          if (dow !== 0 && dow !== 6) {
            const iso = cur.toISOString().slice(0, 10);
            if (!dayPhases[iso]) dayPhases[iso] = [];
            dayPhases[iso].push(phase);
          }
          cur.setDate(cur.getDate() + 1);
        }
      });

      // Añadir fechas individuales de tareas pospostas al calendario
      datedPhases.forEach(phase => {
        (phase.tasks || []).filter(t => !t.deleted && !t.done && t.start_iso).forEach(task => {
          const d = new Date(task.start_iso + 'T12:00:00');
          if (d.getDay() !== 0 && d.getDay() !== 6) {
            if (!dayPhases[task.start_iso]) dayPhases[task.start_iso] = [];
            if (!dayPhases[task.start_iso].find(p => p.id === phase.id)) {
              dayPhases[task.start_iso].push(phase);
            }
          }
        });
      });

      // Añadir días de sprint_tasks al calendario (días de la semana del sprint)
      const daySprintTasks = {};
      Object.entries(_projects[pid]?.sprint_tasks || {}).forEach(([sprintName, spTasks]) => {
        const sprint = SPRINTS.find(s => s.name === sprintName);
        if (!sprint) return;
        const active = (spTasks || []).filter(t => !t.deleted && !t.done);
        if (!active.length) return;
        let cur = new Date(sprint.start + 'T12:00:00');
        const end = new Date(sprint.end + 'T12:00:00');
        while (cur <= end) {
          const dow = cur.getDay();
          if (dow !== 0 && dow !== 6) {
            const iso = cur.toISOString().slice(0, 10);
            daySprintTasks[iso] = (daySprintTasks[iso] || []).concat(active.map(t => ({ ...t, _sprint: sprintName })));
          }
          cur.setDate(cur.getDate() + 1);
        }
      });

      // Días origen desde los que se movió una tarea (para marcar "tareas movidas")
      const dayMoves = {};
      phases.filter(p => !p.deleted).forEach(ph => {
        (ph.tasks || []).forEach(t => {
          (Array.isArray(t.shift_log) ? t.shift_log : []).forEach(x => {
            if (x.from && x.to && x.from !== x.to) {
              (dayMoves[x.from] = dayMoves[x.from] || []).push({
                label: t.title || t.description || '(tarea)',
                days: x.days, to: x.to, reason: x.reason, by: x.by, at: x.at,
              });
            }
          });
        });
      });
      _pfDayMoves[pid] = dayMoves;

      // Mes inicial: primer mes con alguna fase o sprint task
      const allIsoDates = [...new Set([...Object.keys(dayPhases), ...Object.keys(daySprintTasks)])].sort();
      const firstISO = allIsoDates[0] || todayLocalISO();
      const [fy, fm] = firstISO.split('-').map(Number);
      if (!_pfCalState[pid]) _pfCalState[pid] = { year: fy, month: fm - 1 };

      let cy  = _pfCalState[pid].year;
      let cm0 = _pfCalState[pid].month;

      const wrap = panel.querySelector('.rm-cal-wrap');
      if (wrap) {
        const buildPfCell = (d, iso, isToday) => {
          const phList = dayPhases[iso] || [];
          const spList = daySprintTasks[iso] || [];
          const mvList = dayMoves[iso] || [];
          if (!phList.length && !spList.length && !mvList.length) {
            return `<div class="rm-cal-day${isToday ? ' today' : ''}" data-iso="${iso}"><span>${d}</span></div>`;
          }
          const bg = phList.length ? `background:${phaseColorMap[phList[0].id] || PHASE_PALETTE[0]};` : '';
          const extraDots = phList.slice(1, 4).map(ph =>
            `<span style="width:5px;height:5px;border-radius:50%;background:${phaseColorMap[ph.id]||PHASE_PALETTE[0]};display:inline-block;flex-shrink:0;"></span>`
          ).join('');
          const sprintDot = spList.length
            ? `<span style="width:5px;height:5px;border-radius:50%;background:#a3e635;display:inline-block;flex-shrink:0;" title="${spList.length} tarea${spList.length>1?'s':''} del planificador"></span>`
            : '';
          const moveDot = mvList.length
            ? `<span style="width:5px;height:5px;border-radius:50%;background:var(--yellow,#fbbf24);display:inline-block;flex-shrink:0;" title="${mvList.length} tarea(s) movida(s) desde este día"></span>`
            : '';
          const dotsHTML = (extraDots || sprintDot || moveDot) ? `<div style="display:flex;gap:2px;justify-content:center;margin-top:1px;">${extraDots}${sprintDot}${moveDot}</div>` : '';
          return `<div class="rm-cal-day${isToday ? ' today' : ''} has-session" style="${bg}"
              data-phase-ids="${phList.map(p=>p.id).join(',')}" data-iso="${iso}" data-has-sprint="${spList.length > 0 ? '1' : ''}"
              onclick="pfRoadmapDayClick(this,'${pid}')"><span>${d}</span>${dotsHTML}</div>`;
        };

        renderGrid(wrap, cy, cm0, buildPfCell);

        wrap.querySelector('.rm-cal-prev').onclick = () => {
          cm0--; if (cm0 < 0) { cm0 = 11; cy--; }
          _pfCalState[pid] = { year: cy, month: cm0 };
          renderGrid(wrap, cy, cm0, buildPfCell);
        };
        wrap.querySelector('.rm-cal-next').onclick = () => {
          cm0++; if (cm0 > 11) { cm0 = 0; cy++; }
          _pfCalState[pid] = { year: cy, month: cm0 };
          renderGrid(wrap, cy, cm0, buildPfCell);
        };
      }
    }
  }

  function pfRoadmapDayClick(dayEl, pid, _legacyPhaseId) {
    const wrap = dayEl.closest('.rm-cal-wrap');
    if (!wrap) return;
    const detail = wrap.querySelector('.rm-cal-detail');
    if (!detail) return;

    wrap.querySelectorAll('.rm-cal-day.selected').forEach(el => el.classList.remove('selected'));
    dayEl.classList.add('selected');

    // Lee todos los IDs de fases activas ese día (data-phase-ids, comma-separated)
    const rawIds = dayEl.dataset.phaseIds || dayEl.dataset.phaseId || '';
    const phaseIds = rawIds.split(',').map(s => s.trim()).filter(Boolean);
    const allPhases = _projects[pid]?.phases || [];
    const activePhases = phaseIds.map(id => allPhases.find(p => p.id === id)).filter(Boolean);

    const iso      = dayEl.dataset.iso || '';
    // Sprint tasks del planificador para este día
    const clickedSprint = SPRINTS.find(s => iso >= s.start && iso <= s.end);
    const dayPlanTasks  = clickedSprint
      ? (_projects[pid]?.sprint_tasks?.[clickedSprint.name] || []).filter(t => !t.deleted && !t.done)
      : [];

    if (!activePhases.length && !dayPlanTasks.length) { detail.style.display = 'none'; return; }
    const editMode = !!_pfEditMode[pid];
    const phaseColorMap = {};
    allPhases.filter(p => !p.deleted).forEach((p, pi) => {
      phaseColorMap[p.id] = phaseCalColor(p, pi, {}, false);
    });

    // Construye bloque por fase; solo incluye fases con tareas PENDIENTES
    const pfBlocks = [];
    if (iso) pfBlocks.push(`<div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">${iso}</div>`);

    activePhases.forEach((phase, orderI) => {
      const phaseId = phase.id;
      const color   = phaseColorMap[phaseId] || PHASE_PALETTE[0];
      // Solo tareas pendientes: si la tarea tiene start_iso propio, solo aparece en esa fecha
      const pending = (phase.tasks || []).filter(t => {
        if (t.deleted || t.done) return false;
        if (t.start_iso) return t.start_iso === iso;
        return true;
      });
      if (!pending.length) return; // omitir fases sin pendientes

      // Dependencias bloqueantes
      const blockedByIds = getPfPhaseBlockedBy(pid, phaseId);
      const isBlocked    = blockedByIds.length > 0;
      const blockedNames = blockedByIds.map(id => allPhases.find(p => p.id === id)?.title || id).join(', ');

      let block = `<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
        ${phase.title}
        <span style="font-size:10px;color:var(--text-muted);font-weight:400;">${pending.length} pendiente${pending.length>1?'s':''}</span>
        ${isBlocked ? `<span style="font-size:10px;color:#ff6b6b;font-weight:400;">⛔ Bloqueada</span>` : ''}
      </div>`;

      const _dlog = Array.isArray(phase.shift_log) ? phase.shift_log
        : (phase.shift_reason ? [{ days: phase.shift_days || 0, reason: phase.shift_reason, by: phase.shifted_by, at: phase.shifted_at }] : []);
      if (_dlog.length) {
        const sd = phase.shift_days != null ? phase.shift_days : _dlog.reduce((s, x) => s + (x.days || 0), 0);
        const items = _dlog.map(x => {
          const r = String(x.reason || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          return `<div style="margin-top:2px;">• <strong>${x.days > 0 ? '+' + x.days : x.days}d</strong> — ${r}${x.by ? ' · ' + x.by : ''}${x.at ? ' (' + x.at + ')' : ''}</div>`;
        }).join('');
        block += `<div class="rm-shift-notice" style="flex-direction:column;align-items:flex-start;gap:0;"><div><strong>⚠ Recorrida ${sd > 0 ? '+' + sd : sd}d en total</strong></div>${items}</div>`;
      }

      if (isBlocked) {
        block += `<div style="padding:5px 8px;background:rgba(255,60,60,0.08);border-left:2px solid #ff6b6b;border-radius:3px;font-size:11px;color:#ff6b6b;margin-bottom:8px;">
          Bloqueada por: <strong>${blockedNames}</strong> — estas fases deben completarse primero.
        </div>`;
      }

      if (editMode) {
        block += `<div class="rm-shift-bar">
          <span style="font-size:11px;color:var(--text-muted);margin-right:4px;">Desplazar:</span>
          <button class="rm-shift-btn" onclick="shiftPfPhase('${pid}','${phaseId}',-7,'${iso}')">−7d</button>
          <button class="rm-shift-btn" onclick="shiftPfPhase('${pid}','${phaseId}',-1,'${iso}')">−1d</button>
          <button class="rm-shift-btn" onclick="shiftPfPhase('${pid}','${phaseId}',1,'${iso}')">+1d</button>
          <button class="rm-shift-btn" onclick="shiftPfPhase('${pid}','${phaseId}',7,'${iso}')">+7d</button>
          <label class="rm-cascade-label" style="margin-left:auto;">
            <input type="checkbox" id="pf-cascade-cb-${pid}" checked> Cascada
          </label>
        </div>`;
        // Sección de dependencias
        const allNonDelPhases = allPhases.filter(p => !p.deleted);
        const phIdxInAll      = allNonDelPhases.findIndex(p => p.id === phaseId);
        const prevPhases      = allNonDelPhases.slice(0, phIdxInAll);
        const allOtherPhases  = allNonDelPhases.filter(p => p.id !== phaseId);
        const curDeps = phase.depends_on || [];
        const allPrevSelected = prevPhases.length > 0 && prevPhases.every(p => curDeps.includes(p.id));
        const depOpts = allOtherPhases.map(p2 => {
          const chk = curDeps.includes(p2.id) ? 'checked' : '';
          return `<label style="display:inline-flex;align-items:center;gap:3px;cursor:pointer;">
            <input type="checkbox" ${chk} onchange="togglePfPhaseDep('${pid}','${phaseId}','${p2.id}',this.checked)">
            <span>${p2.title}</span>
          </label>`;
        }).join('');
        const prevBtn = prevPhases.length > 0
          ? `<button class="rm-task-shift-btn" style="margin-left:auto;" onclick="setAllPrevDeps('${pid}','${phaseId}')">${allPrevSelected ? '✓ Todas las anteriores' : '← Todas las anteriores'}</button>`
          : '';
        block += `<div class="rm-deps-section">
          <span>Depende de:</span>${depOpts || '<span style="font-style:italic;">ninguna</span>'}${prevBtn}
        </div>`;
      }

      const allNonDelPhasesForId = allPhases.filter(p => !p.deleted);
      const phDisplayNum = allNonDelPhasesForId.findIndex(p => p.id === phaseId) + 1;
      const allNonDelTasks = (phase.tasks || []).filter(t => !t.deleted);
      pending.forEach(task => {
        const taskDisplayNum = allNonDelTasks.findIndex(t => t.id === task.id) + 1;
        const taskDisplayId  = `F${phDisplayNum}·T${taskDisplayNum}`;
        const label   = task.title || task.description || '(sin título)';
        const detail2 = task.title ? (task.description || '') : '';
        const delBtn  = editMode ? `<button class="rm-delete-btn" onclick="deletePfTask('${pid}','${phaseId}','${task.id}')" title="Eliminar">✕</button>` : '';
        const idBadge = `<span style="font-size:9px;color:var(--text-muted);font-family:monospace;margin-right:5px;opacity:0.7;">${taskDisplayId}</span>`;
        const titleEl = editMode
          ? `<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">${idBadge}<input class="rm-task-edit-input" style="flex:1;" type="text" value="${(task.title||label).replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}" onblur="editPfTaskField('${pid}','${phaseId}','${task.id}','title',this.value)"></div>`
          : `<div class="pf-task-desc" style="font-size:11px;${isBlocked?'opacity:0.55;':''}">${idBadge}${label}</div>`;
        const descEl = editMode
          ? `<textarea class="rm-task-edit-input" rows="2" onblur="editPfTaskField('${pid}','${phaseId}','${task.id}','description',this.value)">${(task.description||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>`
          : (detail2 ? `<div class="pf-task-meta" style="font-size:10px;${isBlocked?'opacity:0.55;':''}">${detail2}</div>` : '');
        const taskShiftBar = editMode ? `<div class="rm-task-shift-bar">
          <span style="font-size:10px;color:var(--text-muted);">Desplazar:</span>
          <button class="rm-task-shift-btn" onclick="requireShift('${task.id}','platform','${pid}','${phaseId}','${iso}',-7)">−7d</button>
          <button class="rm-task-shift-btn" onclick="requireShift('${task.id}','platform','${pid}','${phaseId}','${iso}',-1)">−1d</button>
          <button class="rm-task-shift-btn" onclick="requireShift('${task.id}','platform','${pid}','${phaseId}','${iso}',1)">+1d</button>
          <button class="rm-task-shift-btn" onclick="requireShift('${task.id}','platform','${pid}','${phaseId}','${iso}',7)">+7d</button>
          ${task.start_iso ? `<button class="rm-task-shift-btn" onclick="resetPfTaskDate('${pid}','${phaseId}','${task.id}')" title="Quitar fecha personalizada">↺</button><span style="font-size:10px;color:var(--accent);margin-left:2px;">${task.start_iso}</span>` : ''}
        </div>` : (task.start_iso ? `<div style="font-size:10px;color:var(--accent);margin-top:2px;">📅 ${task.start_iso}</div>` : '');
        // Evidencia adjunta a la tarea en el panel del día
        const calKey      = `${pid}_${task.id}`;
        const calSolList  = Array.isArray(_solutionsMeta[calKey]) ? _solutionsMeta[calKey] : (_solutionsMeta[calKey] ? [_solutionsMeta[calKey]] : []);
        const calSolHtml  = calSolList.length
          ? `<div style="margin-top:3px;display:flex;flex-direction:column;gap:1px;">${calSolList.map(e => `<a href="${e.url}" target="_blank" style="font-size:9px;color:var(--green,#4ade80);text-decoration:none;border-bottom:1px dotted rgba(74,222,128,0.4);" title="${(e.uploaded_by||'').replace(/"/g,'&quot;')} · ${e.uploaded_at||''}">📄 ${(e.filename||'Evidencia').replace(/</g,'&lt;')} ↗</a>`).join('')}</div>`
          : '';
        const calUploadBtn = `<label style="cursor:pointer;font-size:9px;color:var(--text-muted);display:inline-flex;align-items:center;gap:2px;margin-top:2px;" title="Agregar evidencia">📎 Evidencia<input type="file" style="display:none;" onchange="uploadTaskSolution('${calKey}',this)"></label>`;
        const calDoneNote  = task.done && task.done_note ? `<div style="font-size:9px;color:var(--accent);border-left:2px solid var(--accent);padding-left:4px;margin-top:2px;">✓ ${task.done_note}${task.done_by?` — ${task.done_by}`:''}</div>` : '';
        // Nota por día: qué se recorrió y por qué (aparece en el día nuevo de la tarea)
        const tShiftLog = Array.isArray(task.shift_log) ? task.shift_log
          : (task.shift_reason ? [{ days: task.shift_days || 0, reason: task.shift_reason, by: task.shifted_by, at: task.shifted_at }] : []);
        const calShiftNote = tShiftLog.length
          ? `<div style="font-size:9px;color:var(--yellow);border-left:2px solid var(--yellow);padding-left:4px;margin-top:2px;">${tShiftLog.map(x => `↳ Recorrida ${x.days>0?'+'+x.days:x.days}d — ${String(x.reason||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}${x.by?' · '+x.by:''}${x.at?' ('+x.at+')':''}`).join('<br>')}</div>`
          : '';
        block += `<div class="pf-task-row" style="padding:4px 0;${isBlocked?'opacity:0.6;':''}">
          <input type="checkbox" ${task.done?'checked':''} ${isBlocked?'disabled title="Fase bloqueada"':''} onchange="togglePfTask('${pid}','${phaseId}','${task.id}',this.checked,this)">
          <div style="flex:1;">
            ${titleEl}
            ${descEl}
            <div class="pf-task-meta" style="font-size:10px;">
              <span class="rm-area-badge ${AREA_CLASS[task.area]||'active'}">${task.area||''}</span>
              ${task.responsible ? `<span class="rm-resp"> ${task.responsible}</span>` : ''}
            </div>
            ${taskShiftBar}
            ${calShiftNote}${calSolHtml}${calDoneNote}${calUploadBtn}
          </div>${delBtn}
        </div>`;
      });
      if (editMode) block += `<button class="rm-add-task-btn" style="margin-top:4px;" onclick="showAddPfTaskForm('${pid}','${phaseId}')">＋ Agregar tarea</button>`;

      pfBlocks.push(block);
    });

    // ── Acuerdos del proyecto para esta fecha ────────────────────────────────
    const dayAcuerdos = (_projects[pid]?.acuerdos || []).filter(s => s.iso_date === iso && !s.deleted);
    if (dayAcuerdos.length || editMode) {
      let acBlock = `<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="width:8px;height:8px;border-radius:50%;background:#4ade80;display:inline-block;flex-shrink:0;"></span>
        Acuerdos · ${iso}
        ${editMode ? `<button class="rm-add-task-btn" style="margin-left:auto;padding:2px 8px;" onclick="showAddPfAcuerdoForm('${pid}','${iso}')">＋ Agregar acuerdo</button>` : ''}
      </div>`;
      if (!dayAcuerdos.length) {
        acBlock += `<div style="font-size:11px;color:var(--text-muted);font-style:italic;margin-bottom:4px;">Sin acuerdos registrados para esta fecha.</div>`;
      }
      dayAcuerdos.forEach(session => {
        const sessionLabel = session.display || session.session || iso;
        acBlock += `<div style="font-size:11px;font-weight:600;color:var(--text-muted);margin:4px 0 2px;">📋 ${sessionLabel}</div>`;
        (session.items || []).filter(it => !it.deleted).forEach((item, idx) => {
          const itemLabel  = item.title || item.text || '(sin texto)';
          const itemDetail = item.title && item.description ? item.description : '';
          const stCls      = { COMPLETADO:'done', 'EN PROCESO':'active', PENDIENTE:'paused', CANCELADO:'' }[item.status] || '';
          // Evidencias del acuerdo (mismo sistema que las tareas)
          const acKey      = `acuerdo_${pid}_${item.id || (iso + '_' + idx)}`;
          const acSolList  = Array.isArray(_solutionsMeta[acKey]) ? _solutionsMeta[acKey] : (_solutionsMeta[acKey] ? [_solutionsMeta[acKey]] : []);
          const acSolHtml  = acSolList.length
            ? `<div style="margin-top:3px;display:flex;flex-direction:column;gap:1px;">${acSolList.map(e => `<a href="${e.url}" target="_blank" style="font-size:9px;color:var(--green,#4ade80);text-decoration:none;border-bottom:1px dotted rgba(74,222,128,0.4);" title="${(e.uploaded_by||'').replace(/"/g,'&quot;')} · ${e.uploaded_at||''}">📄 ${(e.filename||'Evidencia').replace(/</g,'&lt;')} ↗</a>`).join('')}</div>`
            : '';
          const acUploadBtn = `<label style="cursor:pointer;font-size:9px;color:var(--text-muted);display:inline-flex;align-items:center;gap:2px;margin-top:2px;" title="Agregar evidencia al acuerdo">📎 Evidencia<input type="file" style="display:none;" onchange="uploadTaskSolution('${acKey}',this)"></label>`;
          acBlock += `<div class="pf-task-row" style="padding:3px 0;">
            <div style="flex:1;">
              <div style="font-size:11px;">${itemLabel}</div>
              ${itemDetail ? `<div class="pf-task-meta" style="font-size:10px;">${itemDetail}</div>` : ''}
              <div class="pf-task-meta" style="font-size:10px;">
                <span class="rm-phase-badge ${stCls}" style="font-size:9px;padding:1px 5px;">${item.status||'PENDIENTE'}</span>
                ${item.responsible ? `<span class="rm-resp"> ${item.responsible}</span>` : ''}
              </div>
              ${acSolHtml}${acUploadBtn}
            </div>
          </div>`;
        });
      });
      acBlock += `<div id="pf-acuerdo-form-${pid}-${iso.replace(/-/g,'')}"></div>`;
      pfBlocks.push(acBlock);
    }

    // Bloque de sprint tasks del planificador para este día
    if (dayPlanTasks.length) {
      let spBlock = `<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;display:flex;align-items:center;gap:6px;">
        <span style="width:8px;height:8px;border-radius:50%;background:#a3e635;display:inline-block;flex-shrink:0;"></span>
        Planificador · ${clickedSprint.name}
        <span style="font-size:10px;color:var(--text-muted);font-weight:400;">${dayPlanTasks.length} tarea${dayPlanTasks.length>1?'s':''}</span>
      </div>`;
      dayPlanTasks.forEach(t => {
        spBlock += `<div class="pf-task-row" style="padding:3px 0;">
          <div style="flex:1;">
            <div class="pf-task-desc" style="font-size:11px;">${t.title || t.description || '(sin título)'}</div>
            ${t.description && t.title ? `<div class="pf-task-meta" style="font-size:10px;">${t.description}</div>` : ''}
            <div class="pf-task-meta" style="font-size:10px;">
              <span class="rm-area-badge ${AREA_CLASS[t.area]||'active'}">${t.area||''}</span>
              ${t.resp ? `<span class="rm-resp"> ${t.resp}</span>` : ''}
            </div>
          </div>
        </div>`;
      });
      pfBlocks.push(spBlock);
    }

    // ── Tareas movidas DESDE este día (rastro en los días que quedaron vacíos) ──
    const dayMovesList = (_pfDayMoves[pid] || {})[iso] || [];
    if (dayMovesList.length) {
      let mvBlock = `<div style="font-size:12px;font-weight:700;color:var(--yellow);margin-bottom:6px;display:flex;align-items:center;gap:6px;">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--yellow);display:inline-block;flex-shrink:0;"></span>
        Tareas movidas desde este día
      </div>`;
      dayMovesList.forEach(m => {
        const lbl = String(m.label || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const r   = String(m.reason || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        mvBlock += `<div class="pf-task-row" style="padding:3px 0;opacity:0.9;">
          <div style="flex:1;">
            <div style="font-size:11px;color:var(--yellow);">↳ <strong>${lbl}</strong> recorrida ${m.days > 0 ? '+' + m.days : m.days}d → ${m.to}</div>
            ${r ? `<div class="pf-task-meta" style="font-size:10px;">${r}${m.by ? ' · ' + m.by : ''}${m.at ? ' (' + m.at + ')' : ''}</div>` : ''}
          </div>
        </div>`;
      });
      pfBlocks.push(mvBlock);
    }

    if (pfBlocks.length <= (iso ? 1 : 0)) { // solo tiene la línea de fecha → sin pendientes
      detail.style.display = 'none';
      return;
    }
    detail.innerHTML = pfBlocks.join('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:8px 0;">');
    detail.style.display = 'block';
  }

  // Calcula el cierre transitivo de fases que dependen (directa o indirectamente) de phaseId
  function getPfDependentPhaseIds(phases, phaseId) {
    const result = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      for (const ph of phases) {
        if (ph.deleted || result.has(ph.id)) continue;
        const deps = ph.depends_on || [];
        if (deps.includes(phaseId) || deps.some(d => result.has(d))) {
          result.add(ph.id);
          changed = true;
        }
      }
    }
    return result;
  }

  async function shiftPfPhase(pid, phaseId, days, fromIso) {
    requireAdmin(() => {
      const phases = _projects[pid]?.phases || [];
      const phaseIdx = phases.findIndex(p => p.id === phaseId);
      if (phaseIdx === -1) return;
      const phase   = phases[phaseIdx];
      const cascade = document.getElementById(`pf-cascade-cb-${pid}`)?.checked !== false;
      // Ancla: el día donde se hizo clic. Si no hay, se mueve la fase completa.
      const anchor  = fromIso || null;

      function addDays(iso, n) {
        if (!iso) return iso;
        const d = new Date(iso + 'T12:00:00');
        d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
      }

      // Fases de cascada (se mueven completas: ya van enteras después del ancla).
      const cascadePhases = [];
      if (cascade) {
        const depIds = getPfDependentPhaseIds(phases, phaseId);
        if (depIds.size > 0) {
          for (const ph of phases) if (!ph.deleted && ph.id !== phaseId && depIds.has(ph.id)) cascadePhases.push(ph);
        } else {
          for (let i = phaseIdx + 1; i < phases.length; i++) if (!phases[i].deleted) cascadePhases.push(phases[i]);
        }
      }

      // Tareas de la fase origen que se recorren (fecha efectiva >= ancla).
      const movingTasks = (phase.tasks || []).filter(t => {
        if (t.deleted) return false;
        if (!anchor) return !!t.start_iso; // sin ancla = bloque completo (todas con fecha)
        const eff = t.start_iso || phase.start_iso;
        return eff && eff >= anchor;
      });
      const pendMoving = movingTasks.filter(t => !t.done).length
        + cascadePhases.reduce((n, ph) => n + (ph.tasks || []).filter(t => !t.deleted && !t.done).length, 0);

      const dir        = days > 0 ? `+${days}` : `${days}`;
      const cascadeTxt = cascadePhases.length ? ` + ${cascadePhases.length} fase(s) siguiente(s)` : '';
      const info = anchor
        ? `Desde el ${anchor}: se recorrerán ${dir} día(s) las tareas de "${phase.title}" en esa fecha o después${cascadeTxt}. El inicio de la fase (${phase.start_iso}) NO se mueve. ${pendMoving} tarea(s) pendiente(s).`
        : `Se recorrerá ${dir} día(s) la fase completa "${phase.title}"${cascadeTxt}. ${pendMoving} tarea(s) pendiente(s).`;

      // Registra el desplazamiento de una tarea (con día origen y destino).
      function logTask(t, reason, stamp, by) {
        const fromD = t.start_iso || phase.start_iso;
        const toD   = addDays(fromD, days);
        t.start_iso = toD;
        t.shift_days = (t.shift_days || 0) + days;
        if (!Array.isArray(t.shift_log)) t.shift_log = [];
        t.shift_log.push({ days, reason, by, at: stamp, from: fromD, to: toD });
        t.shift_reason = reason; t.shifted_by = by; t.shifted_at = stamp;
      }
      // Mueve una fase COMPLETA (inicio incluido) — para cascada y bloque.
      function shiftWholePhase(ph, reason, stamp, by) {
        const fromStart = ph.start_iso || null;
        if (ph.start_iso) ph.start_iso = addDays(ph.start_iso, days);
        if (ph.end_iso)   ph.end_iso   = addDays(ph.end_iso,   days);
        (ph.tasks || []).forEach(t => {
          if (t.deleted || !t.start_iso) return;
          const fromD = t.start_iso, toD = addDays(t.start_iso, days);
          t.start_iso = toD;
          t.shift_days = (t.shift_days || 0) + days;
          if (!Array.isArray(t.shift_log)) t.shift_log = [];
          t.shift_log.push({ days, reason, by, at: stamp, from: fromD, to: toD });
        });
        ph.shift_days = (ph.shift_days || 0) + days;
        if (!Array.isArray(ph.shift_log)) ph.shift_log = [];
        ph.shift_log.push({ days, reason, by, at: stamp, from: fromStart, to: ph.start_iso || null });
        ph.shift_reason = reason; ph.shifted_by = by; ph.shifted_at = stamp;
      }

      // Motivo obligatorio: modal que dice QUÉ se mueve y pide el PORQUÉ.
      openActionModal({
        title:       `Desplazar ${dir} día(s)`,
        info,
        label:       '¿Por qué se recorre? (requerido)',
        placeholder: 'Ej: cliente pidió más tiempo, bloqueado por dependencia…',
        btnLabel:    `Desplazar ${dir}d`,
        required:    true,
      }, async (reason) => {
        const stamp = todayLocalISO();
        const by    = _currentUser || 'Admin';
        if (anchor) {
          // Fase origen anclada: el inicio NO se mueve; el fin se extiende;
          // se recorren solo las tareas en/después del ancla.
          if (phase.end_iso) phase.end_iso = addDays(phase.end_iso, days);
          movingTasks.forEach(t => logTask(t, reason, stamp, by));
          phase.shift_days = (phase.shift_days || 0) + days;
          if (!Array.isArray(phase.shift_log)) phase.shift_log = [];
          phase.shift_log.push({ days, reason, by, at: stamp, partial: true, anchor });
          phase.shift_reason = reason; phase.shifted_by = by; phase.shifted_at = stamp;
        } else {
          shiftWholePhase(phase, reason, stamp, by);
        }
        cascadePhases.forEach(ph => shiftWholePhase(ph, reason, stamp, by));
        await savePlatformProject(pid);
        const projTitle = _projects[pid]?.title || pid;
        const movedTxt  = anchor ? `desde ${anchor}` : 'bloque completo';
        notifyChange('move', 'fase', projTitle, `${phase.title} (${movedTxt})${cascadeTxt}: ${dir}d — ${reason}`);
        renderPlatformRoadmap(pid);
        refreshWeekView();
      });
    });
  }

  function togglePfEdit(pid) {
    _pfEditMode[pid] = !_pfEditMode[pid];
    renderPlatformRoadmap(pid);
  }

  function togglePfPhase(pid, phId) {
    const body = document.getElementById(`pf-body-${pid}-${phId}`);
    if (body) body.classList.toggle('open');
  }

  async function togglePfTask(pid, phId, taskId, done, cbEl) {
    if (!isAdmin()) { if (cbEl) cbEl.checked = !done; return; }
    if (done) {
      if (cbEl) cbEl.checked = false; // revertir hasta confirmar
      const phase = (_projects[pid]?.phases || []).find(p => p.id === phId);
      const task  = (phase?.tasks || []).find(t => t.id === taskId);
      const label = task?.title || task?.description || taskId;
      openWkCloseModal(label, `pf_${pid}_${taskId}`, 'platform', pid, phId, taskId, 0, '');
    } else {
      const phase = (_projects[pid]?.phases || []).find(p => p.id === phId);
      const task  = (phase?.tasks || []).find(t => t.id === taskId);
      if (task) {
        task.done = false;
        delete task.done_note; delete task.done_by; delete task.done_at;
        await savePlatformProject(pid);
      }
      renderPlatformRoadmap(pid);
      refreshWeekView();
    }
  }

  async function deletePfPhase(pid, phId) {
    const p     = _projects[pid];
    const phase = (p?.phases || []).find(ph => ph.id === phId);
    requireAdminDelete(`fase "${phase?.title || phId}"`, async (reason) => {
      // Soft-delete: marca todas las tareas de la fase como eliminadas
      if (phase) {
        phase.deleted        = true;
        phase.deleted_by     = _currentUser || 'Admin';
        phase.deleted_at     = todayLocalISO();
        phase.deleted_reason = reason;
        (phase.tasks || []).forEach(t => {
          t.deleted = true; t.deleted_by = _currentUser || 'Admin';
          t.deleted_at = phase.deleted_at; t.deleted_reason = reason;
        });
      }
      await savePlatformProject(pid);
      renderPlatformRoadmap(pid);
      refreshWeekView();
      notifyChange('delete', 'fase', p?.title || pid, `${phase?.title || phId}${reason ? ' · ' + reason : ''} (por ${_currentUser})`);
    });
  }

  async function deletePfTask(pid, phId, taskId) {
    const phase = (_projects[pid]?.phases || []).find(p => p.id === phId);
    const task  = (phase?.tasks || []).find(t => t.id === taskId);
    const taskLabel = task?.title || task?.description || taskId;
    requireAdminDelete(`"${taskLabel}"`, async (reason) => {
      if (task) {
        task.deleted        = true;
        task.deleted_by     = _currentUser || 'Admin';
        task.deleted_at     = todayLocalISO();
        task.deleted_reason = reason;
      }
      await savePlatformProject(pid);
      renderPlatformRoadmap(pid);
      refreshWeekView();
      notifyChange('delete', 'tarea', _projects[pid]?.title || pid, `${taskLabel}${reason ? ' · ' + reason : ''} (por ${_currentUser})`);
    });
  }

  function isPfPhaseComplete(pid, phaseId) {
    const phase = (_projects[pid]?.phases || []).find(p => p.id === phaseId);
    if (!phase) return true;
    const active = (phase.tasks || []).filter(t => !t.deleted);
    return active.length > 0 && active.every(t => t.done);
  }

  function getPfPhaseBlockedBy(pid, phaseId) {
    const phase = (_projects[pid]?.phases || []).find(p => p.id === phaseId);
    if (!phase?.depends_on?.length) return [];
    return phase.depends_on.filter(depId => !isPfPhaseComplete(pid, depId));
  }

  async function setAllPrevDeps(pid, phaseId) {
    const nonDel = (_projects[pid]?.phases || []).filter(p => !p.deleted);
    const phIdx  = nonDel.findIndex(p => p.id === phaseId);
    if (phIdx <= 0) return;
    const phase  = (_projects[pid]?.phases || []).find(p => p.id === phaseId);
    if (!phase) return;
    const prevIds = nonDel.slice(0, phIdx).map(p => p.id);
    // Si ya están todas seleccionadas, las desmarca (toggle)
    const already = (phase.depends_on || []);
    if (prevIds.every(id => already.includes(id))) {
      phase.depends_on = already.filter(id => !prevIds.includes(id));
      if (!phase.depends_on.length) delete phase.depends_on;
    } else {
      const merged = [...new Set([...already, ...prevIds])];
      phase.depends_on = merged;
    }
    await savePlatformProject(pid);
    renderPlatformRoadmap(pid);
  }

  async function togglePfPhaseDep(pid, phaseId, depId, checked) {
    const phase = (_projects[pid]?.phases || []).find(p => p.id === phaseId);
    if (!phase) return;
    if (!phase.depends_on) phase.depends_on = [];
    if (checked) {
      if (!phase.depends_on.includes(depId)) phase.depends_on.push(depId);
    } else {
      phase.depends_on = phase.depends_on.filter(d => d !== depId);
      if (!phase.depends_on.length) delete phase.depends_on;
    }
    await savePlatformProject(pid);
    renderPlatformRoadmap(pid);
  }

  // Wrapper genérico para desplazar tareas con razón obligatoria (requiere token)
  function requireShift(taskId, type, pid, phaseId, currentIso, days) {
    if (!isAdmin()) return;
    const dir  = days > 0 ? `+${days}d` : `${days}d`;
    const label = type === 'platform'
      ? ((_projects[pid]?.phases || []).find(p => p.id === phaseId)?.tasks || []).find(t => t.id === taskId)?.title || taskId
      : taskId;
    openActionModal({
      title:       `Desplazar tarea ${dir}`,
      info:        `"${label}"`,
      label:       '¿Por qué se recorre? (requerido)',
      placeholder: 'Ej: cliente pidió más tiempo, bloqueado por dependencia…',
      btnLabel:    `Desplazar ${dir}`,
      required:    true,
    }, async (reason) => {
      if (type === 'platform') {
        const phases = _projects[pid]?.phases || [];
        const phase = phases.find(p => p.id === phaseId);
        const task  = (phase?.tasks || []).find(t => t.id === taskId);
        if (!task) return;
        // Ancla = fecha desde la que se recorre (la fecha de la tarea / día clicado).
        const anchor = task.start_iso || currentIso || phase.start_iso;
        if (!anchor) return;
        const stamp = todayLocalISO();
        const by    = _currentUser || 'Admin';

        function _addDays(iso, n) {
          if (!iso) return iso;
          const dd = new Date(iso + 'T12:00:00');
          dd.setDate(dd.getDate() + n);
          return dd.toISOString().slice(0, 10);
        }
        function _logTaskShift(t) {
          t.shift_days = (t.shift_days || 0) + days;
          if (!Array.isArray(t.shift_log)) t.shift_log = [];
          t.shift_log.push({ days, reason, by, at: stamp });
          t.shift_reason = reason; t.shifted_by = by; t.shifted_at = stamp;
        }
        function _logPhaseShift(ph) {
          ph.shift_days = (ph.shift_days || 0) + days;
          if (!Array.isArray(ph.shift_log)) ph.shift_log = [];
          ph.shift_log.push({ days, reason, by, at: stamp });
          ph.shift_reason = reason; ph.shifted_by = by; ph.shifted_at = stamp;
        }

        // 1) Fase actual: el INICIO no se mueve; se extiende el fin; se recorren
        //    solo las tareas con fecha efectiva >= ancla (las previas quedan en su día).
        if (phase.end_iso) phase.end_iso = _addDays(phase.end_iso, days);
        (phase.tasks || []).forEach(t => {
          if (t.deleted) return;
          if (t.id === taskId) {
            // La tarea seleccionada siempre se recorre desde su día actual.
            t.start_iso = _addDays(task.start_iso || currentIso || phase.start_iso, days);
            _logTaskShift(t);
            return;
          }
          const eff = t.start_iso || phase.start_iso;
          if (eff && eff >= anchor) {
            t.start_iso = _addDays(t.start_iso || phase.start_iso, days);
            _logTaskShift(t);
          }
        });

        // 2) Cascada: las fases que dependen de ésta (o todas las posteriores) se
        //    mueven completas, porque ya van enteras después del ancla.
        const depIds = getPfDependentPhaseIds(phases, phaseId);
        function _shiftPhFull(ph) {
          if (ph.start_iso) ph.start_iso = _addDays(ph.start_iso, days);
          if (ph.end_iso)   ph.end_iso   = _addDays(ph.end_iso,   days);
          (ph.tasks || []).forEach(t => {
            if (!t.deleted && t.start_iso) t.start_iso = _addDays(t.start_iso, days);
          });
          _logPhaseShift(ph);
        }
        if (depIds.size > 0) {
          for (const ph of phases) { if (!ph.deleted && depIds.has(ph.id)) _shiftPhFull(ph); }
        } else {
          const phIdx = phases.findIndex(p => p.id === phaseId);
          for (let i = phIdx + 1; i < phases.length; i++) { if (!phases[i].deleted) _shiftPhFull(phases[i]); }
        }
        await savePlatformProject(pid);
        notifyChange('move', 'tarea', _projects[pid]?.title || pid, `${label}: ${dir} — ${reason}`);
        renderPlatformRoadmap(pid); refreshWeekView();
      } else {
        // retail: delegar a shiftTask con el motivo ya capturado (evita doble modal)
        await shiftTask(taskId, null, days, reason);
      }
    });
  }

  async function shiftPfTask(pid, phaseId, taskId, currentIso, days) {
    const phase = (_projects[pid]?.phases || []).find(p => p.id === phaseId);
    if (!phase) return;
    const task = (phase.tasks || []).find(t => t.id === taskId);
    if (!task) return;
    const base = task.start_iso || currentIso || phase.start_iso;
    if (!base) return;
    const d = new Date(base + 'T12:00:00');
    d.setDate(d.getDate() + days);
    task.start_iso = d.toISOString().slice(0, 10);
    await savePlatformProject(pid);
    renderPlatformRoadmap(pid);
  }

  async function resetPfTaskDate(pid, phaseId, taskId) {
    const phase = (_projects[pid]?.phases || []).find(p => p.id === phaseId);
    if (!phase) return;
    const task = (phase.tasks || []).find(t => t.id === taskId);
    if (!task) return;
    delete task.start_iso;
    await savePlatformProject(pid);
    renderPlatformRoadmap(pid);
  }

  async function editPfTaskField(pid, phaseId, taskId, field, value) {
    const phase = (_projects[pid]?.phases || []).find(p => p.id === phaseId);
    if (!phase) return;
    const task = (phase.tasks || []).find(t => t.id === taskId);
    if (!task) return;
    task[field] = value.trim();
    await savePlatformProject(pid);
    notifyChange('edit', 'tarea', _projects[pid]?.title || pid, `${field} de "${task.title || taskId}": "${value.trim()}"`);
    renderPlatformRoadmap(pid);
  }

  function showCreatePhaseForm(pid) {
    const panel = document.getElementById(PF_PANEL[pid]);
    if (!panel || document.getElementById('pf-new-phase-form')) return;
    const form = document.createElement('div');
    form.id = 'pf-new-phase-form';
    form.className = 'rm-edit-form';
    form.style.cssText = 'margin-bottom:12px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px;';
    form.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:6px;">+ Nueva fase</div>
      <input type="text" class="rm-edit-input" id="pf-nt-title" placeholder="Título de la fase (ej: Fase 1 — Planeación)">
      <div class="rm-edit-row" style="margin-top:6px;">
        <input type="date" class="rm-edit-input-sm" id="pf-nt-start" placeholder="Inicio">
        <input type="date" class="rm-edit-input-sm" id="pf-nt-end" placeholder="Fin">
        <select class="rm-edit-select" id="pf-nt-status">
          <option value="active">En curso</option>
          <option value="paused">En pausa</option>
          <option value="done">Completada</option>
          <option value="continuous">Continuo</option>
        </select>
      </div>
      <div class="rm-edit-row" style="margin-top:6px;">
        <button class="rm-btn-save" onclick="commitCreatePhase('${pid}')">+ Crear fase</button>
        <button class="rm-btn-cancel" onclick="document.getElementById('pf-new-phase-form').remove()">Cancelar</button>
      </div>`;
    panel.insertBefore(form, panel.firstChild.nextSibling); // after toolbar
    document.getElementById('pf-nt-title').focus();
  }

  async function commitCreatePhase(pid) {
    const title = document.getElementById('pf-nt-title').value.trim();
    if (!title) { document.getElementById('pf-nt-title').focus(); return; }
    const start = document.getElementById('pf-nt-start').value || null;
    const end   = document.getElementById('pf-nt-end').value || null;
    const status = document.getElementById('pf-nt-status').value;
    if (!_projects[pid]) _projects[pid] = { title: pid, phases: [], acuerdos: [] };
    _projects[pid].phases.push({
      id: 'ph_' + Date.now(),
      title, status,
      start_iso: start, end_iso: end,
      tasks: []
    });
    await savePlatformProject(pid);
    document.getElementById('pf-new-phase-form')?.remove();
    renderPlatformRoadmap(pid);
    refreshWeekView();
  }

  function showAddPfTaskForm(pid, phId) {
    const bodyEl = document.getElementById(`pf-body-${pid}-${phId}`);
    if (!bodyEl || document.getElementById('pf-new-task-form')) return;
    const phaseTitle = (_projects[pid]?.phases || []).find(p => p.id === phId)?.title || 'Fase';
    const form = document.createElement('div');
    form.id = 'pf-new-task-form';
    form.className = 'rm-edit-form';
    form.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:2px;">
        + Nueva tarea · <span style="color:var(--text-muted);font-weight:400;">${phaseTitle}</span>
      </div>
      <input type="text" class="rm-edit-input" id="pf-nt-title" placeholder="Título (breve)">
      <textarea class="rm-edit-input" rows="2" placeholder="Descripción / detalle (opcional)" id="pf-nt-desc" style="margin-top:4px;"></textarea>
      <div class="rm-edit-row">
        <select class="rm-edit-select" id="pf-nt-area">
          <option>AI Eng</option><option>Infra</option><option>PM</option>
          <option>Frontend</option><option>Datos</option><option>QA</option><option>Ciclo</option>
        </select>
        <input type="text" class="rm-edit-input-sm" id="pf-nt-resp" placeholder="Responsable">
      </div>
      <div class="rm-edit-row">
        <button class="rm-btn-save" onclick="commitAddPfTask('${pid}','${phId}')">+ Agregar</button>
        <button class="rm-btn-cancel" onclick="document.getElementById('pf-new-task-form').remove()">Cancelar</button>
      </div>`;
    bodyEl.appendChild(form);
    document.getElementById('pf-nt-title').focus();
  }

  async function commitAddPfTask(pid, phId) {
    const title = document.getElementById('pf-nt-title').value.trim();
    const desc  = document.getElementById('pf-nt-desc').value.trim();
    if (!title) { document.getElementById('pf-nt-title').focus(); return; }
    const area = document.getElementById('pf-nt-area').value;
    const resp = document.getElementById('pf-nt-resp').value.trim();
    const phase = (_projects[pid]?.phases || []).find(p => p.id === phId);
    if (phase) {
      phase.tasks.push({ id: 't_' + Date.now(), title, description: desc, area, responsible: resp || '—', done: false });
    }
    await savePlatformProject(pid);
    document.getElementById('pf-new-task-form')?.remove();
    renderPlatformRoadmap(pid);
    refreshWeekView();
  }

  // ══════════════════════════════════════════════════════════════════
  // SEMANA DINÁMICA (sección 04)
  // ══════════════════════════════════════════════════════════════════

  const SPRINTS = [
    { name:'S3',  start:'2026-04-20', end:'2026-04-24' },
    { name:'S4',  start:'2026-04-27', end:'2026-05-01' },
    { name:'S5',  start:'2026-05-04', end:'2026-05-08' },
    { name:'S6',  start:'2026-05-11', end:'2026-05-15' },
    { name:'S7',  start:'2026-05-18', end:'2026-05-22' },
    { name:'S8',  start:'2026-05-25', end:'2026-05-29' },
    { name:'S9',  start:'2026-06-01', end:'2026-06-05' },
    { name:'S10', start:'2026-06-08', end:'2026-06-12' },
    { name:'S11', start:'2026-06-15', end:'2026-06-19' },
    { name:'S12', start:'2026-06-22', end:'2026-06-26' },
  ];

  function getCurrentAndNextSprints(n = 4) {
    const today = todayLocalISO();
    let curIdx = SPRINTS.findIndex(s => today >= s.start && today <= s.end);
    if (curIdx < 0) curIdx = SPRINTS.findIndex(s => today < s.start);
    if (curIdx < 0) curIdx = SPRINTS.length - 1;
    return SPRINTS.slice(curIdx, curIdx + n);
  }

  function fmtDateRange(start, end) {
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const s = new Date(start + 'T12:00:00');
    const e = new Date(end   + 'T12:00:00');
    const sm = months[s.getMonth()], em = months[e.getMonth()];
    return sm === em
      ? `${s.getDate()} – ${e.getDate()} ${sm} ${e.getFullYear()}`
      : `${s.getDate()} ${sm} – ${e.getDate()} ${em} ${e.getFullYear()}`;
  }

  // Devuelve el nombre del sprint al que pertenece una fecha ISO.
  // Si la fecha cae entre sprints, retorna el siguiente sprint.
  function getSprintForDate(dateStr) {
    for (const s of SPRINTS) {
      if (dateStr >= s.start && dateStr <= s.end) return s.name;
    }
    // Entre sprints: asignar al siguiente
    for (const s of SPRINTS) {
      if (dateStr < s.start) return s.name;
    }
    return SPRINTS[SPRINTS.length - 1].name;
  }

  function getTasksForSprint(sprint) {
    const tasks = [];
    // Mapa global id->done / id->título de tareas de plataforma, para detectar
    // bloqueo por DEPENDENCIAS a nivel tarea (task.deps). Las dependencias se
    // referencian por id de tarea (igual que en el dashboard).
    const doneById = {}, titleById = {};
    Object.entries(_projects).forEach(([pid, project]) => {
      (project.phases || []).forEach(ph => (ph.tasks || []).forEach(t => {
        if (t.deleted || !t.id) return;
        const k = `${pid}_${t.id}`;
        doneById[t.id]  = (_rm.estado && k in _rm.estado) ? !!_rm.estado[k] : !!(t.done ?? t.done_xlsx);
        titleById[t.id] = t.title || t.description || t.id;
      }));
    });
    // Dado un task, calcula qué dependencias suyas siguen sin completarse.
    const depState = (task) => {
      const unmet = (task.deps || []).filter(d => doneById[d] === false);
      return { depBlocked: unmet.length > 0, depBlockedBy: unmet.map(d => titleById[d] || d) };
    };
    // Arconte Retail (xlsx)
    if (_rm.rawData) {
      const applied = applyEdits(_rm.rawData);
      applied.phases.forEach((phase, pi) => {
        if (!phase.start_iso) return;
        // Verificar si la fase está bloqueada por dependencias
        const deps       = phase._phase_deps || [];
        const isBlocked  = deps.some(depIdx => !isPhaseComplete(depIdx));
        const blockedBy  = deps.filter(depIdx => !isPhaseComplete(depIdx)).map(i => `Fase ${i + 1}`);
        // Las fases bloqueadas no se muestran en la vista semanal (sí en el calendario).
        if (isBlocked) return;
        phase.tasks.forEach(task => {
          const key        = 'retail_' + task.id;
          const done       = _rm.estado && key in _rm.estado ? _rm.estado[key] : task.done_xlsx;
          const phaseShift = phase._phase_shift || 0;
          const taskShift  = task._shift_days   || 0;
          const today      = todayLocalISO();
          // Fecha natural de la tarea, sin recorridos manuales (fase ni tarea).
          const naturalStart = shiftDate(phase.start_iso, -phaseShift);
          // Cada tarea cae en UN solo sprint:
          //   - Vencida (fecha natural < hoy) → se ancla a la semana actual.
          //   - Futura → conserva su fecha natural.
          // El recorrido manual (fase + tarea) la mueve RELATIVO a ese ancla,
          // así "mover 1 semana" siempre la corre un sprint, sin importar
          // cuánto lleve vencida.
          const anchor     = naturalStart < today ? today : naturalStart;
          const bucketDate = shiftDate(anchor, phaseShift + taskShift);
          if (getSprintForDate(bucketDate) !== sprint.name) return;
          tasks.push({ project: 'Arconte Retail', phase: phase.title, task, done, key, type: 'retail', isBlocked, blockedBy, ...depState(task) });
        });
      });
    }
    // Platform projects (phase-based roadmap)
    Object.entries(_projects).forEach(([pid, project]) => {
      (project.phases || []).forEach(phase => {
        if (!phase.start_iso) return;

        // Estado bloqueado de la fase
        const phBlockedIds = getPfPhaseBlockedBy(pid, phase.id);
        const phIsBlocked  = phBlockedIds.length > 0;
        const phBlockedBy  = phBlockedIds.map(id =>
          (project.phases || []).find(p => p.id === id)?.title || id
        );
        // Las fases bloqueadas no se muestran en la vista semanal (sí en el calendario).
        if (phIsBlocked) return;

        (phase.tasks || []).forEach(task => {
          if (task.deleted) return;

          const todayPl  = todayLocalISO();
          const taskStart = task.start_iso || phase.start_iso;
          const taskEnd   = task.start_iso ? task.start_iso : (phase.end_iso || phase.start_iso);

          // Tareas que no tienen traslape con este sprint: ignorar
          if (taskEnd < sprint.start || taskStart > sprint.end) return;
          // Fecha efectiva: si ya venció o ya empezó → hoy (queda en sprint actual),
          // si aún no empieza → su fecha de inicio
          const effDate = taskStart < todayPl ? todayPl : taskStart;
          if (getSprintForDate(effDate) !== sprint.name) return;

          tasks.push({
            project:   project.title || pid,
            phase:     phase.title,
            task,
            done:      task.done,
            key:       `${pid}_${task.id}`,
            type:      'platform',
            pid,
            phaseId:   phase.id,
            isBlocked: phIsBlocked,
            blockedBy: phBlockedBy,
            ...depState(task),
          });
        });
      });
      // Planner sprint tasks (excluye eliminadas)
      const planTasks = project.sprint_tasks?.[sprint.name] || [];
      planTasks.forEach((task, idx) => {
        if (task.deleted) return;
        tasks.push({
          project:  project.title || pid,
          phase:    sprint.name,
          task: {
            id:          `plan_${idx}`,
            title:       task.title || '',
            description: task.description || '',
            responsible: task.resp || task.responsible || '',
          },
          done:      task.done,
          key:       `plan_${pid}_${sprint.name}_${idx}`,
          type:      'plan',
          pid,
          sprintName: sprint.name,
          planIdx:   idx,
        });
      });
    });
    return tasks;
  }

  async function uploadTaskSolution(key, input) {
    const file = input.files[0];
    if (!file) return;
    input.value = '';

    const formData = new FormData();
    formData.append('task_key',    key);
    formData.append('uploaded_by', _currentUser || 'Anónimo');
    formData.append('file',        file);

    try {
      const res  = await fetch('/api/solutions/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.ok) { alert('Error al subir: ' + (data.detail || 'desconocido')); return; }
      // Agregar al historial local (array)
      if (!Array.isArray(_solutionsMeta[key])) _solutionsMeta[key] = [];
      _solutionsMeta[key].push(data.entry);
      notifyChange('evidence', key.startsWith('acuerdo_') ? 'acuerdo' : 'tarea', '', `Evidencia: ${file.name} (${key})`);
      refreshWeekView();
      renderOverdueBanner();   // evidencia agregada -> recalcular warning
      window.open(data.url, '_blank');
    } catch(e) {
      alert('Error de conexión al subir la evidencia.');
    }
  }

  async function movePlanTaskSprint(pid, currentSprint, idx, delta) {
    if (!isAdmin()) return;
    const curIdx = SPRINTS.findIndex(s => s.name === currentSprint);
    if (curIdx < 0) return;
    const newIdx = curIdx + delta;
    if (newIdx < 0 || newIdx >= SPRINTS.length) return;
    const newSprint = SPRINTS[newIdx].name;
    const task = (_projects[pid]?.sprint_tasks?.[currentSprint] || [])[idx];
    if (!task) return;
    openActionModal({
      title:       `Mover a ${newSprint}`,
      info:        `"${task.title || task.description || ''}"`,
      label:       '¿Por qué se mueve? (requerido)',
      placeholder: 'Ej: no se completó esta semana, bloqueado por dependencia…',
      btnLabel:    `Mover a ${newSprint}`,
      required:    true,
    }, async (reason) => {
      const tasks = _projects[pid].sprint_tasks[currentSprint];
      const [moved] = tasks.splice(idx, 1);
      moved.shift_reason = reason;
      moved.shifted_by   = _currentUser || 'Admin';
      moved.shifted_at   = todayLocalISO();
      if (!_projects[pid].sprint_tasks[newSprint]) _projects[pid].sprint_tasks[newSprint] = [];
      _projects[pid].sprint_tasks[newSprint].push(moved);
      await savePlatformProject(pid);
      renderPlanner();
      refreshWeekView();
      renderOverdueBanner();
    });
  }

  function startWkEdit(key, type, pid, phaseId, taskId, planIdx, sprintName) {
    _wkEditKey = key;
    refreshWeekView();
  }

  function cancelWkEdit() {
    _wkEditKey = null;
    refreshWeekView();
  }

  async function saveWkEdit(key, type, pid, phaseId, taskId, planIdx, sprintName) {
    const title = document.getElementById(`wk-edit-title-${key}`)?.value.trim();
    const desc  = document.getElementById(`wk-edit-desc-${key}`)?.value.trim();
    const resp  = document.getElementById(`wk-edit-resp-${key}`)?.value.trim();

    if (type === 'platform') {
      const phase = (_projects[pid]?.phases || []).find(p => p.id === phaseId);
      const task  = (phase?.tasks || []).find(t => t.id === taskId);
      if (task) {
        if (title !== undefined) task.title       = title;
        if (desc  !== undefined) task.description = desc;
        if (resp  !== undefined) task.responsible = resp;
      }
      await savePlatformProject(pid);
      renderPlatformRoadmap(pid);
    } else if (type === 'plan') {
      const task = (_projects[pid]?.sprint_tasks?.[sprintName] || [])[planIdx];
      if (task) {
        if (title !== undefined) task.title       = title;
        if (desc  !== undefined) task.description = desc;
        if (resp  !== undefined) task.resp        = resp;
      }
      await savePlatformProject(pid);
      renderPlanner();
    }
    _wkEditKey = null;
    refreshWeekView();
  }

  async function deleteWkTask(key, type, pid, phaseId, taskId, planIdx, sprintName) {
    let taskLabel = key;
    if (type === 'platform') {
      const phase = (_projects[pid]?.phases || []).find(p => p.id === phaseId);
      taskLabel = (phase?.tasks || []).find(t => t.id === taskId)?.title || taskId;
    } else if (type === 'plan') {
      taskLabel = (_projects[pid]?.sprint_tasks?.[sprintName] || [])[planIdx]?.title || key;
    }
    requireAdminDelete(`"${taskLabel}"`, async (reason) => {
      if (type === 'platform') {
        const phase = (_projects[pid]?.phases || []).find(p => p.id === phaseId);
        const task  = (phase?.tasks || []).find(t => t.id === taskId);
        if (task) {
          task.deleted = true; task.deleted_by = _currentUser || 'Admin';
          task.deleted_at = todayLocalISO();
          task.deleted_reason = reason;
        }
        await savePlatformProject(pid);
        renderPlatformRoadmap(pid);
      } else if (type === 'plan') {
        const task = (_projects[pid]?.sprint_tasks?.[sprintName] || [])[planIdx];
        if (task) {
          task.deleted = true; task.deleted_by = _currentUser || 'Admin';
          task.deleted_at = todayLocalISO();
          task.deleted_reason = reason;
        }
        await savePlatformProject(pid);
        renderPlanner();
      }
      _wkEditKey = null;
      refreshWeekView();
      notifyChange('delete', 'tarea', pid, `${taskLabel}${reason ? ' · ' + reason : ''} (por ${_currentUser})`);
    });
  }

  function getAcuerdosForSprint(sprint) {
    const entries = [];
    // Arconte Retail (xlsx + edits)
    if (_rm.rawData) {
      const applied = applyAcuerdoEdits(_rm.rawData.acuerdos);
      applied.forEach(session => {
        if (!session.iso_date) return;
        if (session.iso_date < sprint.start || session.iso_date > sprint.end) return;
        const label = session.display || session.session;
        if (!session.items || session.items.length === 0) {
          entries.push({ session: label, iso: session.iso_date, item: null });
        } else {
          session.items.forEach(item => entries.push({ session: label, iso: session.iso_date, item }));
        }
      });
    }
    // Proyectos plataforma (acuerdos importados o creados)
    Object.entries(_projects).forEach(([pid, project]) => {
      (project.acuerdos || []).forEach(session => {
        if (!session.iso_date) return;
        if (session.iso_date < sprint.start || session.iso_date > sprint.end) return;
        const prefix = project.title || pid;
        const label = `${prefix} · ${session.display || session.session}`;
        if (!session.items || session.items.length === 0) {
          entries.push({ session: label, iso: session.iso_date, item: null });
        } else {
          session.items.forEach(item => entries.push({ session: label, iso: session.iso_date, item }));
        }
      });
    });
    return entries;
  }

  // Interceptor del checkbox: uncheck inmediato, abre modal de visto bueno si checked
  function onWkCheckChange(key, type, pid, phaseId, taskId, planIdx, sprintName, el) {
    if (!isAdmin()) { el.checked = !el.checked; return; }
    const checked = el.checked;
    if (checked) {
      el.checked = false; // revertir visualmente hasta confirmar
      let taskLabel = key;
      if (type === 'platform') {
        const ph = (_projects[pid]?.phases || []).find(p => p.id === phaseId);
        taskLabel = (ph?.tasks || []).find(t => t.id === taskId)?.title || key;
      } else if (type === 'plan') {
        taskLabel = (_projects[pid]?.sprint_tasks?.[sprintName] || [])[planIdx]?.title || key;
      } else if (type === 'retail') {
        const taskIdRaw = key.replace('retail_', '');
        const phase = (_rm.rawData?.arconte_retail?.phases || []).find(p => (p.tasks||[]).some(t => t.id === taskIdRaw));
        taskLabel = (phase?.tasks || []).find(t => t.id === taskIdRaw)?.description || key;
      }
      openWkCloseModal(taskLabel, key, type, pid, phaseId, taskId, planIdx, sprintName);
    } else {
      _applyToggleWeekTask(key, false, type, pid, phaseId, taskId, planIdx, sprintName, null);
    }
  }

  // ── Modal cierre de tarea semanal ────────────────────────────────────────
  let _wkCloseState = null;

  function openWkCloseModal(taskLabel, key, type, pid, phaseId, taskId, planIdx, sprintName, mode = 'close') {
    _wkCloseState = { key, type, pid, phaseId, taskId, planIdx, sprintName, mode };
    const isEvidence = mode === 'evidence';
    document.querySelector('#wk-close-overlay h3').textContent = isEvidence ? '📎 Agregar evidencia' : '✓ Cerrar tarea';
    document.getElementById('wk-close-comment-wrap').style.display = isEvidence ? 'block' : 'block';
    document.getElementById('wk-close-req-label').style.display    = isEvidence ? 'none' : 'inline';
    const confirmBtn = document.getElementById('wk-close-confirm-btn');
    confirmBtn.textContent = isEvidence ? 'Guardar' : 'Marcar completada';
    document.getElementById('wk-close-task-info').textContent = taskLabel;

    const solList = Array.isArray(_solutionsMeta[key]) ? _solutionsMeta[key] : (_solutionsMeta[key] ? [_solutionsMeta[key]] : []);
    const evSec   = document.getElementById('wk-close-evidence-section');
    if (solList.length) {
      evSec.innerHTML = `<div style="font-size:11px;margin-bottom:10px;padding:6px 10px;background:rgba(74,222,128,0.07);border-radius:6px;border:1px solid rgba(74,222,128,0.2);">
        <span style="color:var(--green,#4ade80);">✓ Evidencia adjunta (${solList.length} archivo${solList.length > 1 ? 's' : ''}):</span>
        ${solList.map(e => `<div style="padding-left:8px;"><a href="${e.url}" target="_blank" style="font-size:10px;color:var(--green,#4ade80);text-decoration:none;opacity:.85;">📄 ${(e.filename||'Archivo').replace(/</g,'&lt;')}</a></div>`).join('')}
      </div>`;
    } else {
      evSec.innerHTML = '';
    }

    const hasExistingEv = solList.length > 0;
    document.getElementById('wk-close-req-label').textContent =
      hasExistingEv ? '(opcional — ya hay evidencia adjunta)' : '(requerido si no adjuntas archivo)';

    const ta = document.getElementById('wk-close-comment');
    ta.value = '';
    document.getElementById('wk-close-word-count').textContent = '0 / 150 palabras';
    document.getElementById('wk-close-word-count').style.color = 'var(--text-muted)';
    document.getElementById('wk-close-file').value = '';
    document.getElementById('wk-close-file-name').textContent = '';
    document.getElementById('wk-close-err').textContent = '';
    document.getElementById('wk-close-overlay').classList.add('open');
    setTimeout(() => ta.focus(), 60);
  }

  function closeWkCloseModal() {
    document.getElementById('wk-close-overlay').classList.remove('open');
    _wkCloseState = null;
  }

  function updateWkCloseWordCount() {
    const ta    = document.getElementById('wk-close-comment');
    const raw   = ta.value.trim();
    const words = raw ? raw.split(/\s+/) : [];
    if (words.length > 150) {
      ta.value = words.slice(0, 150).join(' ');
    }
    const cnt   = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
    const el    = document.getElementById('wk-close-word-count');
    el.textContent = `${cnt} / 150 palabras`;
    el.style.color = cnt >= 150 ? 'var(--red)' : cnt >= 130 ? 'var(--yellow)' : 'var(--text-muted)';
  }

  function onWkCloseFileChange(input) {
    const f = input.files[0];
    document.getElementById('wk-close-file-name').textContent = f ? f.name : '';
  }

  async function confirmWkClose() {
    if (!_wkCloseState) return;
    const { key, type, pid, phaseId, taskId, planIdx, sprintName, mode } = _wkCloseState;
    const comment   = document.getElementById('wk-close-comment').value.trim();
    const fileInput = document.getElementById('wk-close-file');
    const file      = fileInput.files[0] || null;
    const errEl     = document.getElementById('wk-close-err');

    if (!comment && !file) {
      errEl.textContent = 'Agrega un comentario o adjunta un archivo de evidencia.';
      return;
    }
    errEl.textContent = '';

    // Subir archivo si hay
    if (file) {
      const formData = new FormData();
      formData.append('task_key',    key);
      formData.append('uploaded_by', _currentUser || 'Admin');
      formData.append('file',        file);
      try {
        const res  = await fetch('/api/solutions/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!data.ok) { errEl.textContent = 'Error al subir archivo: ' + (data.detail || 'desconocido'); return; }
        if (!Array.isArray(_solutionsMeta[key])) _solutionsMeta[key] = [];
        _solutionsMeta[key].push(data.entry);
      } catch(e) {
        errEl.textContent = 'Error de conexión al subir la evidencia.';
        return;
      }
    }

    // Si es solo evidencia/comentario (sin marcar como completada)
    if (mode === 'evidence') {
      if (comment && !file) {
        // Guardar comentario de texto como entrada de solución sin archivo
        if (!Array.isArray(_solutionsMeta[key])) _solutionsMeta[key] = [];
        const entry = { url: null, filename: '(comentario)', comment, uploaded_by: _currentUser || 'Usuario', uploaded_at: new Date().toISOString().slice(0,16).replace('T',' ') };
        _solutionsMeta[key].push(entry);
        // Persistir en servidor como meta adicional (sin archivo físico)
        try {
          await fetch('/api/solutions/upload', { method: 'POST', body: (() => { const fd = new FormData(); fd.append('task_key', key); fd.append('uploaded_by', _currentUser||'Usuario'); fd.append('file', new File([comment], '(comentario).txt', {type:'text/plain'})); return fd; })() }).then(async r => { const d = await r.json(); if (d.ok) _solutionsMeta[key][_solutionsMeta[key].length-1] = d.entry; });
        } catch(e) {}
      }
      closeWkCloseModal();
      refreshWeekView();
      return;
    }

    // Modo 'close': marcar como completada
    closeWkCloseModal();
    await _applyToggleWeekTask(key, true, type, pid, phaseId, taskId, planIdx, sprintName, comment || null);
  }

  async function removeTaskEvidence(key, url) {
    if (!isAdmin()) return;
    if (!confirm('¿Eliminar este archivo de evidencia?')) return;
    try {
      const res  = await fetch('/api/solutions/remove', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ task_key: key, url }) });
      const data = await res.json();
      if (data.ok) {
        if (Array.isArray(_solutionsMeta[key])) {
          _solutionsMeta[key] = _solutionsMeta[key].filter(e => e.url !== url);
        }
        refreshWeekView();
      }
    } catch(e) { alert('Error al eliminar el archivo.'); }
  }

  async function _applyToggleWeekTask(key, done, type, pid, phaseId, taskId, planIdx, sprintName, note) {
    const now = todayLocalISO();
    if (type === 'retail') {
      const taskIdRaw = key.replace('retail_', '');
      if (!_rm.estado) _rm.estado = {};
      _rm.estado[key] = done;
      try {
        await fetch('/api/estado/' + taskIdRaw, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ done })
        });
      } catch(e) {}
      refreshWeekView();
      renderRoadmap(_rm.rawData, _rm.estado);
    } else if (type === 'plan') {
      const planTasks = _projects[pid]?.sprint_tasks?.[sprintName];
      if (planTasks?.[planIdx] !== undefined) {
        planTasks[planIdx].done = done;
        if (done && note) { planTasks[planIdx].done_note = note; planTasks[planIdx].done_by = _currentUser || 'Admin'; planTasks[planIdx].done_at = now; }
        else if (!done)   { delete planTasks[planIdx].done_note; delete planTasks[planIdx].done_by; delete planTasks[planIdx].done_at; }
        await savePlatformProject(pid);
      }
      refreshWeekView(); renderPlanner();
    } else {
      const phase = (_projects[pid]?.phases || []).find(p => p.id === phaseId);
      const task  = (phase?.tasks || []).find(t => t.id === taskId);
      if (task) {
        task.done = done;
        if (done && note) { task.done_note = note; task.done_by = _currentUser || 'Admin'; task.done_at = now; }
        else if (!done)   { delete task.done_note; delete task.done_by; delete task.done_at; }
        await savePlatformProject(pid);
      }
      refreshWeekView(); renderPlatformRoadmap(pid);
    }
    // Registrar la terminación/reapertura en la bitácora
    const _doneVerb = done ? 'completó' : 'reabrió';
    const _proj = type === 'retail' ? 'Arconte Retail' : (_projects[pid]?.title || pid);
    let _lbl = taskId || key;
    if (type === 'plan') _lbl = (_projects[pid]?.sprint_tasks?.[sprintName]?.[planIdx]?.title) || _lbl;
    else if (type === 'platform') _lbl = (((_projects[pid]?.phases || []).find(p => p.id === phaseId)?.tasks) || []).find(t => t.id === taskId)?.title || _lbl;
    notifyChange('edit', 'tarea', _proj, `${_doneVerb} "${_lbl}"${done && note ? ' — ' + note : ''}`);
  }

  // Alias para compatibilidad con código existente que llame toggleWeekTask
  async function toggleWeekTask(key, done, type, pid, phaseId, taskId, planIdx, sprintName) {
    await _applyToggleWeekTask(key, done, type, pid, phaseId, taskId, planIdx, sprintName, null);
  }

  function refreshWeekView() {
    const root = document.getElementById('week-dynamic-root');
    if (!root) return;
    const sprints = getWeekSprints();
    if (!sprints.length) { root.innerHTML = '<div class="wk-empty">Sin sprints definidos.</div>'; return; }

    const today = todayLocalISO();
    // Barra de navegación de sprints
    const canPrev = _weekSprintOffset > -(SPRINTS.indexOf(sprints[0]));
    const canNext = sprints[sprints.length - 1] !== SPRINTS[SPRINTS.length - 1];
    const isHome  = _weekSprintOffset === 0;
    let html = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <button onclick="navWeekView(-4)" ${canPrev ? '' : 'disabled'} style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;font-size:12px;">◀ 4 sprints</button>
      <button onclick="navWeekView(-1)" ${canPrev ? '' : 'disabled'} style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;font-size:12px;">◀ 1</button>
      ${!isHome ? `<button onclick="navWeekViewHome()" style="padding:4px 10px;border-radius:6px;border:1px solid var(--accent);background:rgba(34,211,238,0.12);color:var(--accent);cursor:pointer;font-size:12px;">● Hoy</button>` : ''}
      <button onclick="navWeekView(1)"  ${canNext ? '' : 'disabled'} style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;font-size:12px;">1 ▶</button>
      <button onclick="navWeekView(4)"  ${canNext ? '' : 'disabled'} style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;font-size:12px;">4 sprints ▶</button>
      <span style="font-size:10px;color:var(--text-muted);margin-left:4px;">${sprints[0].name}–${sprints[sprints.length-1].name}</span>
    </div>`;
    sprints.forEach((sprint, si) => {
      const isCurrent = today >= sprint.start && today <= sprint.end;
      const tasks = getTasksForSprint(sprint);
      const acuerdos = getAcuerdosForSprint(sprint);

      // Separar bloqueadas; las completadas se muestran igual (con palomita)
      const activeTasks  = tasks.filter(t => !t.isBlocked);
      const blockedTasks = tasks.filter(t => !t.done && t.isBlocked);
      const pendingCount = activeTasks.filter(t => !t.done).length;
      const doneCount    = activeTasks.filter(t =>  t.done).length;

      // Agrupa por responsable (pending + done juntos)
      const byPerson = {};
      activeTasks.forEach(t => {
        // Responsable combinado -> la tarea va a cada persona.
        splitPeople(t.task.responsible).forEach(person => {
          if (!byPerson[person]) byPerson[person] = [];
          byPerson[person].push(t);
        });
      });

      html += `<div class="wk-card${isCurrent ? ' current' : ''}">
        <div class="wk-header">
          <span class="wk-label${isCurrent ? ' cur' : ''}">${isCurrent ? '● Semana actual · ' : ''}${fmtDateRange(sprint.start, sprint.end)}</span>
          <span style="font-size:10px;color:var(--text-muted);margin-left:6px;">${sprint.name}</span>
        </div>`;

      if (!activeTasks.length && !blockedTasks.length && !acuerdos.length) {
        html += `<div class="wk-empty">Sin tareas ni reuniones para esta semana.</div>`;
      }

      if (activeTasks.length > 0) {
        const doneLabel = doneCount > 0 ? ` · <span style="color:var(--green,#4ade80);">✓ ${doneCount} lista${doneCount !== 1 ? 's' : ''}</span>` : '';
        html += `<div class="wk-total-bar"><span class="wk-total-badge">${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}${doneLabel}</span></div>`;
      }

      // Ordenar: personas individuales primero (alfabético), "Equipo" al final
      const sortedPeople = Object.keys(byPerson).sort((a, b) => {
        if (a === 'Equipo') return 1;
        if (b === 'Equipo') return -1;
        return a.localeCompare(b, 'es');
      });

      sortedPeople.forEach((person, pi) => {
        const tlist = byPerson[person];
        const personCount = tlist.length;
        const grpId = `wk-grp-${si}-${pi}`;
        const open  = _wkEditKey !== null && tlist.some(t => t.key === _wkEditKey);
        html += `<div class="wk-group">
          <div class="wk-person-header" onclick="(function(h){var b=document.getElementById('${grpId}');if(!b)return;var isOpen=b.style.display!=='none';b.style.display=isOpen?'none':'block';h.querySelector('.wk-chevron').style.transform=isOpen?'rotate(0deg)':'rotate(90deg)';})(this)">
            <div style="display:flex;align-items:center;gap:0;">
              <span class="wk-chevron" style="transform:rotate(${open ? 90 : 0}deg)">▸</span>
              <span class="wk-group-title">${person}</span>
            </div>
            <span class="wk-person-count">${tlist.filter(t=>!t.done).length > 0 ? tlist.filter(t=>!t.done).length + ' pendiente' + (tlist.filter(t=>!t.done).length !== 1 ? 's' : '') : ''}${tlist.filter(t=>t.done).length > 0 ? (tlist.filter(t=>!t.done).length > 0 ? ' · ' : '') + '✓ ' + tlist.filter(t=>t.done).length : ''}</span>
          </div>
          <div id="${grpId}" style="display:${open ? 'block' : 'none'};">`;
        tlist.forEach(({ task, done, key, type, pid, phaseId, sprintName, planIdx, project, phase, depBlocked, depBlockedBy }) => {
          const taskId   = task.id;
          // Checkbox usa onWkCheckChange (requiere admin + visto bueno)
          const extra    = type === 'retail'
            ? `onWkCheckChange('${key}','retail','','','',0,'',this)`
            : type === 'plan'
              ? `onWkCheckChange('${key}','plan','${pid}','','',${planIdx},'${sprintName}',this)`
              : `onWkCheckChange('${key}','platform','${pid}','${phaseId}','${taskId}',0,'',this)`;
          const taskShiftRaw = ((_rm.edits?.arconte_retail?.task_shifts) || {})[taskId];
          const taskShift    = typeof taskShiftRaw === 'object' && taskShiftRaw ? (taskShiftRaw.shift || 0) : (taskShiftRaw || 0);
          const taskShiftRsn = typeof taskShiftRaw === 'object' && taskShiftRaw ? (taskShiftRaw.reason || '') : '';
          const shiftBadge = taskShift
            ? `<span style="font-size:9px;color:var(--yellow);margin-left:2px;" title="${taskShiftRsn.replace(/"/g,'&quot;')}">${taskShift > 0 ? '+' : ''}${taskShift}d</span>` : '';
          // Shift: solo admin, con razón obligatoria
          const shiftBtns = !isAdmin() ? '' :
            type === 'retail' ? `<span class="wk-task-shifts">
              <button class="wk-shift-btn" onclick="requireShift('${taskId}','retail','','',null,-7)" title="−7d">◀◀</button>
              <button class="wk-shift-btn" onclick="requireShift('${taskId}','retail','','',null,-1)" title="−1d">◀</button>
              <button class="wk-shift-btn" onclick="requireShift('${taskId}','retail','','',null,1)"  title="+1d">▶</button>
              <button class="wk-shift-btn" onclick="requireShift('${taskId}','retail','','',null,7)"  title="+7d">▶▶</button>
            </span>`
            : type === 'platform' ? `<span class="wk-task-shifts">
              <button class="wk-shift-btn" onclick="requireShift('${taskId}','platform','${pid}','${phaseId}','${task.start_iso||''}',-7)" title="−7d">◀◀</button>
              <button class="wk-shift-btn" onclick="requireShift('${taskId}','platform','${pid}','${phaseId}','${task.start_iso||''}',-1)" title="−1d">◀</button>
              <button class="wk-shift-btn" onclick="requireShift('${taskId}','platform','${pid}','${phaseId}','${task.start_iso||''}',1)"  title="+1d">▶</button>
              <button class="wk-shift-btn" onclick="requireShift('${taskId}','platform','${pid}','${phaseId}','${task.start_iso||''}',7)"  title="+7d">▶▶</button>
            </span>`
            : type === 'plan' ? `<span class="wk-task-shifts">
              <button class="wk-shift-btn" onclick="movePlanTaskSprint('${pid}','${sprintName}',${planIdx},-1)" title="Sprint anterior">◀</button>
              <button class="wk-shift-btn" onclick="movePlanTaskSprint('${pid}','${sprintName}',${planIdx},1)"  title="Sprint siguiente">▶</button>
            </span>` : '';
          const taskLabel = task.title || task.description || '';
          const taskSub   = task.title && task.description ? `<br><span style="font-size:10px;color:var(--text-muted);">${task.description}</span>` : '';
          // Badge de proyecto/fase con hipervínculo al roadmap
          const navCall = type === 'retail'
            ? `navigateToPhase('retail','arconte_retail','')`
            : type === 'platform'
              ? `navigateToPhase('platform','${pid}','${phaseId}')`
              : `navigateToPhase('plan','${pid}','')`;
          const phaseLabel = [project, phase].filter(Boolean).join(' · ');
          const phaseBadge = phaseLabel
            ? `<div style="margin-top:3px;"><a href="#" onclick="${navCall};return false;" style="font-size:9px;color:var(--text-muted);text-decoration:none;border-bottom:1px dotted rgba(255,255,255,0.2);cursor:pointer;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-muted)'">${phaseLabel} ↗</a></div>`
            : '';
          const delArgs  = `'${key}','${type}','${pid || ''}','${phaseId || ''}','${taskId}',${planIdx || 0},'${sprintName || ''}'`;
          const editArgs = `'${key}','${type}','${pid || ''}','${phaseId || ''}','${taskId}',${planIdx || 0},'${sprintName || ''}'`;
          const isEditing = _wkEditKey === key;
          if (isEditing) {
            html += `<div class="wk-task" style="flex-direction:column;align-items:stretch;gap:5px;background:rgba(255,255,255,0.04);border-radius:6px;padding:6px;">
              <input class="plan-input" id="wk-edit-title-${key}" value="${(task.title || '').replace(/"/g,'&quot;')}" placeholder="Título" style="font-size:11px;">
              <input class="plan-input" id="wk-edit-desc-${key}" value="${(task.description || '').replace(/"/g,'&quot;')}" placeholder="Descripción" style="font-size:11px;">
              <input class="plan-input" id="wk-edit-resp-${key}" value="${(task.responsible || task.resp || '').replace(/"/g,'&quot;')}" placeholder="Responsable" style="font-size:11px;">
              <div style="display:flex;gap:5px;">
                <button class="plan-save-btn" style="flex:1;font-size:10px;" onclick="saveWkEdit(${editArgs})">Guardar</button>
                <button class="plan-cancel-btn" style="font-size:10px;" onclick="cancelWkEdit()">Cancelar</button>
              </div>
            </div>`;
          } else {
          const solList     = Array.isArray(_solutionsMeta[key]) ? _solutionsMeta[key] : (_solutionsMeta[key] ? [_solutionsMeta[key]] : []);
          const hasEvidence = solList.length > 0;
          const solBadge    = hasEvidence
            ? `<div style="margin-top:4px;display:flex;flex-direction:column;gap:2px;">${solList.map((e,i) => {
                const urlEsc = (e.url||'').replace(/'/g,"\\'");
                const keyEsc = key.replace(/'/g,"\\'");
                const delBtn = isAdmin() ? `<button onclick="removeTaskEvidence('${keyEsc}','${urlEsc}')" style="background:none;border:none;color:rgba(248,113,113,0.7);cursor:pointer;font-size:9px;padding:0 2px;line-height:1;" title="Eliminar archivo">✕</button>` : '';
                return `<span style="display:inline-flex;align-items:center;gap:2px;"><a href="${e.url||'#'}" target="_blank" style="font-size:9px;color:var(--green,#4ade80);text-decoration:none;border-bottom:1px dotted rgba(74,222,128,0.4);cursor:pointer;" title="Subido por ${(e.uploaded_by||'').replace(/"/g,'&quot;')} · ${e.uploaded_at||''}">${e.url?'📄':'💬'} ${(e.filename||('Evidencia '+(i+1))).replace(/</g,'&lt;')}${e.url?' ↗':''}</a>${delBtn}</span>`;
              }).join('')}</div>`
            : `<div style="margin-top:3px;font-size:9px;color:var(--text-muted);font-style:italic;">Sin evidencia adjunta</div>`;
          // Nota de cierre (visto bueno)
          const doneNote = done && task.done_note
            ? `<div style="margin-top:3px;font-size:9px;color:var(--accent);border-left:2px solid var(--accent);padding-left:5px;">✓ ${task.done_note}${task.done_by ? ` <span style="color:var(--text-muted);">— ${task.done_by}</span>` : ''}</div>` : '';
          // Bloqueo por dependencia: no se puede marcar completada ni subir
          // evidencia hasta que sus dependencias estén listas (afecta el flujo).
          const depTip = depBlocked
            ? `Bloqueada por: ${(depBlockedBy || []).join(', ')} — debe${(depBlockedBy || []).length !== 1 ? 'n' : ''} completarse primero`.replace(/"/g, '&quot;')
            : '';
          const blockedBadge = depBlocked
            ? `<span style="font-size:9px;color:#f87171;border:1px solid rgba(248,113,113,0.4);background:rgba(248,113,113,0.12);border-radius:3px;padding:1px 4px;margin-left:4px;white-space:nowrap;" title="${depTip}">⛔ bloqueada</span>`
            : '';
          // Checkbox: solo admin puede marcar (comentario o archivo requerido, se valida en el modal)
          const cbDisabled = done
            ? (isAdmin() ? '' : 'disabled title="Solo admin puede cambiar el estado"')
            : (depBlocked ? `disabled title="${depTip}"`
               : (!isAdmin() ? 'disabled title="Solo admin puede marcar como completada"' : ''));
          const cbStyle    = ((!isAdmin() || depBlocked) && !done) ? 'opacity:.35;cursor:not-allowed;' : '';
          const _tlEsc = taskLabel.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,' ');
          const uploadBtn  = depBlocked
            ? `<button disabled title="${depTip}" style="flex-shrink:0;width:18px;height:18px;display:flex;align-items:center;justify-content:center;border-radius:4px;background:rgba(255,255,255,0.04);font-size:11px;line-height:1;border:1px solid rgba(255,255,255,0.1);color:inherit;opacity:.4;cursor:not-allowed;">📎</button>`
            : `<button style="flex-shrink:0;cursor:pointer;width:18px;height:18px;display:flex;align-items:center;justify-content:center;border-radius:4px;background:rgba(74,222,128,${hasEvidence ? '0.18' : '0.07'});font-size:11px;line-height:1;border:1px solid rgba(74,222,128,${hasEvidence ? '0.4' : '0.15'});color:inherit;" title="Agregar evidencia / comentario" onclick="openWkCloseModal('${_tlEsc}','${key}','${type}','${pid||''}','${phaseId||''}','${taskId}',${planIdx||0},'${sprintName||''}','evidence')">📎</button>`;
          html += `<div class="wk-task${done ? ' done-wk' : ''}" id="wk-${key}" style="${depBlocked ? 'opacity:.7;' : ''}">
              <input type="checkbox" ${done ? 'checked' : ''} ${cbDisabled} onchange="${extra}" style="${cbStyle}">
              <div style="flex:1;">${taskLabel}${blockedBadge}${taskSub}${shiftBadge}${phaseBadge}${solBadge}${doneNote}</div>
              ${shiftBtns}
              ${uploadBtn}
              ${type !== 'retail' && isAdmin() ? `
              <button style="flex-shrink:0;width:18px;height:18px;border-radius:4px;border:none;background:rgba(34,211,238,0.1);color:var(--accent);cursor:pointer;font-size:11px;line-height:1;" onclick="startWkEdit(${editArgs})" title="Editar">✏</button>
              <button style="flex-shrink:0;width:18px;height:18px;border-radius:4px;border:none;background:rgba(248,113,113,0.1);color:var(--red);cursor:pointer;font-size:11px;line-height:1;" onclick="deleteWkTask(${delArgs})" title="Eliminar">✕</button>
              ` : ''}
            </div>`;
          }
        });
        html += `</div></div>`; // close collapsible + wk-group
      });

      if (acuerdos.length) {
        // Agrupa por sesión para no repetir el nombre de la reunión
        const bySession = {};
        acuerdos.forEach(e => {
          if (!bySession[e.iso]) bySession[e.iso] = { label: e.session, items: [] };
          if (e.item) bySession[e.iso].items.push(e.item);
        });
        html += `<div class="wk-group"><div class="wk-group-title">Reuniones / Acuerdos</div>`;
        Object.values(bySession).forEach(({ label, items }) => {
          html += `<div style="margin-bottom:6px;">
            <div style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:3px;">📅 ${label}</div>`;
          if (!items.length) {
            html += `<div style="font-size:11px;color:var(--text-muted);padding-left:14px;font-style:italic;">Sin acuerdos registrados</div>`;
          } else {
            items.forEach(item => {
              const cls = item.status.replace(' ', '-');
              const itemLabel  = item.title || item.text || '(sin título)';
              const itemDetail = item.title ? (item.description || '') : '';
              html += `<div class="wk-acuerdo" style="padding-left:14px;">
                <span class="wk-acuerdo-badge ${cls}">${item.status}</span>
                <span style="flex:1;">${itemLabel}${itemDetail ? `<br><span style="font-size:10px;color:var(--text-muted);">${itemDetail}</span>` : ''}</span>
              </div>`;
            });
          }
          html += `</div>`;
        });
        html += `</div>`;
      }

      // Tareas bloqueadas (mostrar al final como nota agrupada por proyecto + bloqueante)
      if (blockedTasks.length) {
        const blockedGroups = {};
        blockedTasks.forEach(t => {
          const key = `${t.project}||${(t.blockedBy||[]).join(', ') || 'desconocido'}`;
          if (!blockedGroups[key]) blockedGroups[key] = { project: t.project, by: (t.blockedBy||[]).join(', ') || 'desconocido', count: 0, phase: t.phase || '' };
          blockedGroups[key].count++;
        });
        Object.values(blockedGroups).forEach(({ project, by, count, phase }) => {
          const phaseHint = phase ? ` · ${phase}` : '';
          html += `<div class="wk-blocked-note">⛔ <strong>${project}${phaseHint}</strong> — ${count} tarea${count !== 1 ? 's' : ''} bloqueada${count !== 1 ? 's' : ''} · espera: ${by}</div>`;
        });
      }

      html += `</div>`; // wk-card
    });
    root.innerHTML = html;
    renderOverdueBanner();   // refresca el warning al resolver/recorrer tareas
  }

  function showAddPfAcuerdoForm(pid, iso) {
    const container = document.getElementById(`pf-acuerdo-form-${pid}-${iso.replace(/-/g,'')}`);
    if (!container || container.querySelector('.rm-edit-form')) return;
    const form = document.createElement('div');
    form.className = 'rm-edit-form';
    form.style.cssText = 'margin-top:6px;';
    form.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:#4ade80;margin-bottom:4px;">+ Nuevo acuerdo · ${iso}</div>
      <input type="text" class="rm-edit-input" id="pf-ac-session-${iso}" placeholder="Nombre de sesión / reunión" value="Reunión ${iso}">
      <input type="text" class="rm-edit-input" id="pf-ac-title-${iso}" placeholder="Título del acuerdo" style="margin-top:4px;">
      <textarea class="rm-edit-input" rows="2" id="pf-ac-desc-${iso}" placeholder="Detalle (opcional)" style="margin-top:4px;"></textarea>
      <div class="rm-edit-row">
        <input type="text" class="rm-edit-input-sm" id="pf-ac-resp-${iso}" placeholder="Responsable">
        <select class="rm-edit-select" id="pf-ac-status-${iso}">
          <option value="PENDIENTE">PENDIENTE</option>
          <option value="EN PROCESO">EN PROCESO</option>
          <option value="COMPLETADO">COMPLETADO</option>
          <option value="CANCELADO">CANCELADO</option>
        </select>
      </div>
      <div class="rm-edit-row">
        <button class="rm-btn-save" onclick="commitAddPfAcuerdo('${pid}','${iso}')">+ Guardar</button>
        <button class="rm-btn-cancel" onclick="this.closest('.rm-edit-form').remove()">Cancelar</button>
      </div>`;
    container.appendChild(form);
    document.getElementById(`pf-ac-title-${iso}`)?.focus();
  }

  async function commitAddPfAcuerdo(pid, iso) {
    const sessionName = document.getElementById(`pf-ac-session-${iso}`)?.value.trim() || `Reunión ${iso}`;
    const title       = document.getElementById(`pf-ac-title-${iso}`)?.value.trim();
    const desc        = document.getElementById(`pf-ac-desc-${iso}`)?.value.trim() || '';
    const resp        = document.getElementById(`pf-ac-resp-${iso}`)?.value.trim() || '—';
    const status      = document.getElementById(`pf-ac-status-${iso}`)?.value || 'PENDIENTE';
    if (!title) { document.getElementById(`pf-ac-title-${iso}`)?.focus(); return; }

    if (!_projects[pid]) _projects[pid] = { title: pid, phases: [], sprint_tasks: {}, acuerdos: [] };
    if (!_projects[pid].acuerdos) _projects[pid].acuerdos = [];

    // Buscar sesión existente para esa fecha o crear una nueva
    let session = _projects[pid].acuerdos.find(s => s.iso_date === iso && !s.deleted);
    if (!session) {
      session = { session: sessionName, iso_date: iso, display: sessionName, hora: null, items: [] };
      _projects[pid].acuerdos.push(session);
    }
    if (!session.items) session.items = [];
    session.items.push({ id: 'ac_' + Date.now(), title, description: desc, responsible: resp, status, date: iso });

    await savePlatformProject(pid);
    notifyChange('add', 'acuerdo', _projects[pid]?.title || pid, `${sessionName}: ${title}${resp && resp !== '—' ? ' · ' + resp : ''}`);
    renderPlatformRoadmap(pid);
    refreshWeekView();
  }

  function navigateToPhase(type, pid, phaseId) {
    const sectionMap = {
      arconte:        'rm-arconte',
      publicvector:   'rm-pv',
      stack_modelos:  'rm-stack',
      arconte_retail: 'rm-arconte-retail',
    };
    // Proyectos dinámicos tienen su propio contentId
    const dynContentId = (!sectionMap[pid] && pid) ? `dyn-rm-${pid}` : null;
    const contentId = type === 'retail' ? 'rm-arconte-retail' : (sectionMap[pid] || dynContentId || null);

    // 1. Abrir sección si está colapsada
    const section = contentId ? document.getElementById(contentId) : null;
    if (section && section.style.display === 'none') {
      section.style.display = 'block';
      section.dataset.loaded = '1';
      const btn = section.previousElementSibling;
      if (btn?.classList.contains('rm-toggle')) btn.classList.add('open');
    }

    // 2. Navegar al card de la fase (plataforma) o a la sección (retail/plan)
    const doScroll = () => {
      if (type === 'platform' && pid && phaseId) {
        const phCard = document.getElementById(`pf-ph-${pid}-${phaseId}`);
        if (phCard) {
          phCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Expandir el cuerpo de la fase si está cerrado
          const body = document.getElementById(`pf-body-${pid}-${phaseId}`);
          if (body && !body.classList.contains('open')) body.classList.add('open');
          // Flash visual para ubicar
          phCard.style.transition = 'box-shadow .3s';
          phCard.style.boxShadow  = '0 0 0 2px var(--accent)';
          setTimeout(() => { phCard.style.boxShadow = ''; }, 1200);
          return;
        }
      }
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // Pequeño delay para que el DOM se actualice si la sección estaba cerrada
    setTimeout(doScroll, section?.style.display === 'none' ? 120 : 0);
  }

  // ══════════════════════════════════════════════════════════════════
  // EDITOR DE CÁMARAS PROBADAS (solo admin)
  // ══════════════════════════════════════════════════════════════════

  function applyCamerasCount(pid) {
    const box = document.getElementById(`cameras-box-${pid}`);
    if (!box) return;
    const val = _projects[pid]?.cameras_tested || '—';
    box.innerHTML = `
      <div class="stat-label">Cámaras probadas</div>
      <div class="stat-value" id="cameras-val-${pid}">${val}</div>`;
  }

  function editCamerasCount(pid) {
    if (!isAdmin()) return;
    const box = document.getElementById(`cameras-box-${pid}`);
    if (!box) return;
    const current = _projects[pid]?.cameras_tested || '';
    box.innerHTML = `
      <div class="stat-label">Cámaras probadas</div>
      <div style="display:flex;align-items:center;gap:5px;margin-top:3px;">
        <input id="cameras-input-${pid}" type="text" value="${current}" placeholder="0"
          style="width:56px;padding:3px 5px;background:rgba(255,255,255,0.07);border:1px solid rgba(34,211,238,0.4);border-radius:5px;color:var(--accent);font-size:18px;font-weight:700;text-align:center;font-family:inherit;"
          onkeydown="if(event.key==='Enter')saveCamerasCount('${pid}');if(event.key==='Escape')applyCamerasCount('${pid}')">
        <div style="display:flex;flex-direction:column;gap:3px;">
          <button onclick="saveCamerasCount('${pid}')" style="padding:2px 6px;background:rgba(34,211,238,0.2);border:1px solid rgba(34,211,238,0.4);border-radius:4px;color:var(--accent);font-size:10px;cursor:pointer;font-weight:700;">✓</button>
          <button onclick="applyCamerasCount('${pid}')" style="padding:2px 6px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);border-radius:4px;color:var(--red);font-size:10px;cursor:pointer;font-weight:700;">✕</button>
        </div>
      </div>`;
    const inp = document.getElementById(`cameras-input-${pid}`);
    inp?.focus(); inp?.select();
  }

  async function saveCamerasCount(pid) {
    const input = document.getElementById(`cameras-input-${pid}`);
    const val = input?.value.trim() || '';
    if (!_projects[pid]) _projects[pid] = {};
    _projects[pid].cameras_tested = val || null;
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: _projects }),
      });
    } catch(e) { console.error('Error guardando cámaras:', e); }
    applyCamerasCount(pid);
  }

  // ══════════════════════════════════════════════════════════════════
  // EDITOR DE MÉTRICAS (solo admin) — estáticos y proyectos dinámicos
  // ══════════════════════════════════════════════════════════════════

  const SM_FIELDS = ['version','accuracy','recall','fps','gflops','vram'];
  const _smEditMode = {};

  // Proyectos dinámicos = los creados via UI, sin meta._static
  function _isDynProject(pid) {
    return !_projects[pid]?.meta?._static;
  }

  function _smVersionBadge(val) {
    if (!val || val === '—') return '<span class="mv-pend">—</span>';
    const v = val.toLowerCase();
    const cls = v.includes('no') ? 'mv-nodev'
              : v.includes('real') ? 'mv-ver-rw'
              : 'mv-ver';
    return `<span class="${cls}">${val}</span>`;
  }

  // ── Proyectos con tabla hardcodeada en HTML (arconte, arconte_retail, publicvector) ──

  function applyStaticMetrics(pid) {
    const table = document.getElementById(`sm-table-${pid}`);
    if (!table) return;
    const metrics = _projects[pid]?.static_metrics || {};
    table.querySelectorAll('tr[data-sm-key]').forEach(tr => {
      const stored = metrics[tr.dataset.smKey] || {};
      SM_FIELDS.forEach(f => {
        const td = tr.querySelector(`td[data-sm="${f}"]`);
        if (!td) return;
        const val = stored[f] !== undefined ? stored[f] : '—';
        if (f === 'version') {
          td.innerHTML = _smVersionBadge(val);
        } else {
          td.textContent = val;
          td.className = val === '—' ? 'mv-pend' : 'mv-good';
          td.setAttribute('data-sm', f);
        }
      });
    });
  }

  function _enterStaticMetricsEdit(pid) {
    const table = document.getElementById(`sm-table-${pid}`);
    if (!table) return;
    _smEditMode[pid] = true;
    table.classList.add('sm-edit-mode');
    const btn = document.getElementById(`sm-edit-btn-${pid}`);
    if (btn) { btn.textContent = '💾 Guardar'; btn.classList.add('active'); }

    const metrics = _projects[pid]?.static_metrics || {};
    table.querySelectorAll('tr[data-sm-key]').forEach(tr => {
      const stored = metrics[tr.dataset.smKey] || {};
      SM_FIELDS.forEach(f => {
        const td = tr.querySelector(`td[data-sm="${f}"]`);
        if (!td) return;
        const val = stored[f] !== undefined ? stored[f] : '—';
        const extraCls = f === 'version' ? ' sm-ver-input' : '';
        td.innerHTML = `<input class="sm-edit-input${extraCls}" data-sm-field="${f}" value="${val.replace(/"/g,'&quot;')}" placeholder="—">`;
      });
    });
  }

  async function _saveStaticMetrics(pid) {
    const table = document.getElementById(`sm-table-${pid}`);
    if (!table) return;

    if (!_projects[pid]) _projects[pid] = {};
    if (!_projects[pid].static_metrics) _projects[pid].static_metrics = {};

    table.querySelectorAll('tr[data-sm-key]').forEach(tr => {
      const key = tr.dataset.smKey;
      if (!_projects[pid].static_metrics[key]) _projects[pid].static_metrics[key] = {};
      SM_FIELDS.forEach(f => {
        const input = tr.querySelector(`input[data-sm-field="${f}"]`);
        if (input) _projects[pid].static_metrics[key][f] = input.value.trim() || '—';
      });
    });

    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: _projects }),
      });
    } catch(e) { console.error('Error guardando métricas:', e); }

    cancelStaticMetricsEdit(pid);
  }

  // ── Proyectos dinámicos (tabla generada desde datos) ─────────────────────

  function _renderDynMetricsTableHTML(pid, metrics) {
    const rows = Object.entries(metrics || {}).filter(([, r]) => r && r.name);
    if (!rows.length) {
      return `<div style="font-size:11px;color:var(--text-muted);padding:6px 0;font-style:italic;">Sin modelos registrados${isAdmin() ? ' — usa "Editar métricas" para agregar' : ''}.</div>`;
    }
    const rowsHTML = rows.map(([key, row]) => `
      <tr data-sm-project="${pid}" data-sm-key="${key}">
        <td>${row.name}</td>
        <td data-sm="version">${_smVersionBadge(row.version || '—')}</td>
        <td class="${(row.accuracy||'—')==='—'?'mv-pend':'mv-good'}" data-sm="accuracy">${row.accuracy||'—'}</td>
        <td class="${(row.recall||'—')==='—'?'mv-pend':'mv-good'}" data-sm="recall">${row.recall||'—'}</td>
        <td class="${(row.fps||'—')==='—'?'mv-pend':'mv-good'}" data-sm="fps">${row.fps||'—'}</td>
        <td class="${(row.gflops||'—')==='—'?'mv-pend':'mv-good'}" data-sm="gflops">${row.gflops||'—'}</td>
        <td class="${(row.vram||'—')==='—'?'mv-pend':'mv-good'}" data-sm="vram">${row.vram||'—'}</td>
      </tr>`).join('');
    return `<div class="metrics-table-wrap">
      <table id="sm-table-${pid}" class="metrics-table">
        <thead><tr>
          <th>Modelo</th><th>Versión</th><th>Accuracy</th><th>Recall</th><th>FPS</th><th>GFLOPS</th><th>VRAM</th>
        </tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>`;
  }

  function _renderDynMetricsSectionHTML(pid, project) {
    const metrics = project.static_metrics || {};
    const editBtn = isAdmin()
      ? `<button id="sm-edit-btn-${pid}" class="rm-tool-btn" style="font-size:10px;padding:3px 10px;" onclick="toggleStaticMetricsEdit('${pid}')">✏ Editar métricas</button>`
      : '';
    return `<div id="sm-wrap-${pid}" style="margin:14px 0 0;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <div class="sub-label-sm" style="margin-bottom:0;">Modelos · Métricas</div>
        ${editBtn}
      </div>
      <div id="sm-table-wrap-${pid}">${_renderDynMetricsTableHTML(pid, metrics)}</div>
    </div>`;
  }

  function _enterDynMetricsEdit(pid) {
    const wrap = document.getElementById(`sm-table-wrap-${pid}`);
    if (!wrap) return;
    _smEditMode[pid] = true;
    const btn = document.getElementById(`sm-edit-btn-${pid}`);
    if (btn) { btn.textContent = '💾 Guardar'; btn.classList.add('active'); }

    const metrics = _projects[pid]?.static_metrics || {};
    const rowsHTML = Object.entries(metrics).filter(([,r]) => r && r.name).map(([key, row]) => `
      <tr data-sm-project="${pid}" data-sm-key="${key}">
        <td style="text-align:left;"><input class="sm-edit-input" style="width:140px;text-align:left;" data-sm-field="name" value="${(row.name||'').replace(/"/g,'&quot;')}" placeholder="Nombre modelo"></td>
        <td><input class="sm-edit-input sm-ver-input" data-sm-field="version" value="${(row.version||'—').replace(/"/g,'&quot;')}" placeholder="—"></td>
        <td><input class="sm-edit-input" data-sm-field="accuracy" value="${(row.accuracy||'—').replace(/"/g,'&quot;')}" placeholder="—"></td>
        <td><input class="sm-edit-input" data-sm-field="recall" value="${(row.recall||'—').replace(/"/g,'&quot;')}" placeholder="—"></td>
        <td><input class="sm-edit-input" data-sm-field="fps" value="${(row.fps||'—').replace(/"/g,'&quot;')}" placeholder="—"></td>
        <td><input class="sm-edit-input" data-sm-field="gflops" value="${(row.gflops||'—').replace(/"/g,'&quot;')}" placeholder="—"></td>
        <td><input class="sm-edit-input" data-sm-field="vram" value="${(row.vram||'—').replace(/"/g,'&quot;')}" placeholder="—"></td>
        <td style="text-align:center;border-right:none;"><button class="rm-tool-btn danger" style="font-size:10px;padding:2px 7px;" onclick="removeDynMetricRow('${pid}','${key}')">✕</button></td>
      </tr>`).join('');

    wrap.innerHTML = `<div class="metrics-table-wrap">
      <table id="sm-table-${pid}" class="metrics-table">
        <thead><tr>
          <th style="text-align:left;">Modelo</th><th>Versión</th><th>Accuracy</th><th>Recall</th><th>FPS</th><th>GFLOPS</th><th>VRAM</th><th></th>
        </tr></thead>
        <tbody id="sm-tbody-${pid}">${rowsHTML}</tbody>
      </table>
    </div>
    <div style="margin-top:8px;display:flex;gap:6px;">
      <button class="rm-tool-btn" style="font-size:10px;" onclick="addDynMetricRow('${pid}')">＋ Agregar modelo</button>
      <button class="rm-tool-btn" style="font-size:10px;" onclick="cancelStaticMetricsEdit('${pid}')">✕ Cancelar</button>
    </div>`;
  }

  async function _saveDynMetrics(pid) {
    const table = document.getElementById(`sm-table-${pid}`);
    if (!table) return;

    if (!_projects[pid]) _projects[pid] = {};
    _projects[pid].static_metrics = {};

    table.querySelectorAll('tr[data-sm-key]').forEach(tr => {
      const key = tr.dataset.smKey;
      const nameInput = tr.querySelector('input[data-sm-field="name"]');
      const name = nameInput?.value.trim();
      if (!name) return;
      _projects[pid].static_metrics[key] = { name };
      ['version','accuracy','recall','fps','gflops','vram'].forEach(f => {
        const input = tr.querySelector(`input[data-sm-field="${f}"]`);
        if (input) _projects[pid].static_metrics[key][f] = input.value.trim() || '—';
      });
    });

    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: _projects }),
      });
    } catch(e) { console.error('Error guardando métricas:', e); }

    _smEditMode[pid] = false;
    const btn = document.getElementById(`sm-edit-btn-${pid}`);
    if (btn) { btn.textContent = '✏ Editar métricas'; btn.classList.remove('active'); }
    const wrap = document.getElementById(`sm-table-wrap-${pid}`);
    if (wrap) wrap.innerHTML = _renderDynMetricsTableHTML(pid, _projects[pid].static_metrics || {});
  }

  function addDynMetricRow(pid) {
    const tbody = document.getElementById(`sm-tbody-${pid}`);
    if (!tbody) return;
    const newKey = `m_${Date.now()}`;
    const tr = document.createElement('tr');
    tr.dataset.smProject = pid;
    tr.dataset.smKey = newKey;
    tr.innerHTML = `
      <td style="text-align:left;"><input class="sm-edit-input" style="width:140px;text-align:left;" data-sm-field="name" value="" placeholder="Nombre modelo"></td>
      <td><input class="sm-edit-input sm-ver-input" data-sm-field="version" value="—" placeholder="—"></td>
      <td><input class="sm-edit-input" data-sm-field="accuracy" value="—" placeholder="—"></td>
      <td><input class="sm-edit-input" data-sm-field="recall" value="—" placeholder="—"></td>
      <td><input class="sm-edit-input" data-sm-field="fps" value="—" placeholder="—"></td>
      <td><input class="sm-edit-input" data-sm-field="gflops" value="—" placeholder="—"></td>
      <td><input class="sm-edit-input" data-sm-field="vram" value="—" placeholder="—"></td>
      <td style="text-align:center;border-right:none;"><button class="rm-tool-btn danger" style="font-size:10px;padding:2px 7px;" onclick="removeDynMetricRow('${pid}','${newKey}')">✕</button></td>`;
    tbody.appendChild(tr);
    tr.querySelector('input').focus();
  }

  function removeDynMetricRow(pid, key) {
    const tr = document.querySelector(`#sm-table-${pid} tr[data-sm-key="${key}"]`);
    if (tr) tr.remove();
  }

  // ── Punto de entrada unificado ────────────────────────────────────────────

  function toggleStaticMetricsEdit(pid) {
    if (!isAdmin()) return;
    if (_smEditMode[pid]) {
      _isDynProject(pid) ? _saveDynMetrics(pid) : _saveStaticMetrics(pid);
    } else {
      _isDynProject(pid) ? _enterDynMetricsEdit(pid) : _enterStaticMetricsEdit(pid);
    }
  }

  function cancelStaticMetricsEdit(pid) {
    _smEditMode[pid] = false;
    const btn = document.getElementById(`sm-edit-btn-${pid}`);
    if (btn) { btn.textContent = '✏ Editar métricas'; btn.classList.remove('active'); }
    if (_isDynProject(pid)) {
      const wrap = document.getElementById(`sm-table-wrap-${pid}`);
      if (wrap) wrap.innerHTML = _renderDynMetricsTableHTML(pid, _projects[pid]?.static_metrics || {});
    } else {
      const table = document.getElementById(`sm-table-${pid}`);
      if (table) table.classList.remove('sm-edit-mode');
      applyStaticMetrics(pid);
    }
  }

  

(function(){

// ═══════════════════════════════════════════════════════════════════════
//  CV Celestial — Dashboard (solo lectura)
//  Consume los mismos endpoints /api/* que index.html. No escribe nada.
// ═══════════════════════════════════════════════════════════════════════

const SPRINTS = [
  { name:'S3',  start:'2026-04-20', end:'2026-04-24' },
  { name:'S4',  start:'2026-04-27', end:'2026-05-01' },
  { name:'S5',  start:'2026-05-04', end:'2026-05-08' },
  { name:'S6',  start:'2026-05-11', end:'2026-05-15' },
  { name:'S7',  start:'2026-05-18', end:'2026-05-22' },
  { name:'S8',  start:'2026-05-25', end:'2026-05-29' },
  { name:'S9',  start:'2026-06-01', end:'2026-06-05' },
  { name:'S10', start:'2026-06-08', end:'2026-06-12' },
  { name:'S11', start:'2026-06-15', end:'2026-06-19' },
  { name:'S12', start:'2026-06-22', end:'2026-06-26' },
  { name:'S13', start:'2026-06-29', end:'2026-07-03' },
  { name:'S14', start:'2026-07-06', end:'2026-07-10' },
  { name:'S15', start:'2026-07-13', end:'2026-07-17' },
  { name:'S16', start:'2026-07-20', end:'2026-07-24' },
  { name:'S17', start:'2026-07-27', end:'2026-07-31' },
];
const DOMAIN_START = SPRINTS[0].start;
const DOMAIN_END   = SPRINTS[SPRINTS.length - 1].end;

const AREA_COLORS = {
  'PM':       '#22d3ee',  // cyan
  'Infra':    '#2dd4bf',  // teal
  'AI Eng':   '#a3e635',  // lima
  'Datos':    '#4ade80',  // verde
  'Frontend': '#fbbf24',  // ámbar
  'Ciclo':    '#f472b6',  // magenta
  'QA':       '#f87171',  // rojo
};
const areaColor = a => AREA_COLORS[a] || '#8892b0';

// color distintivo por proyecto (para dividir roadmap y sprint board)
const PROJ_PALETTE = ['#22d3ee', '#a3e635', '#2dd4bf', '#f472b6', '#fbbf24', '#60a5fa', '#34d399'];
const projColor = i => PROJ_PALETTE[i % PROJ_PALETTE.length];

const PROJ_STATUS = {
  dev:        { label:'En desarrollo', cls:'b-dev' },
  production: { label:'En producción', cls:'b-prod' },
  paused:     { label:'En pausa',      cls:'b-paused' },
  research:   { label:'Investigación', cls:'b-research' },
  archived:   { label:'Archivado',     cls:'b-archived' },
};
const PHASE_COLORS = {
  done:'#4ade80', active:'#22d3ee', paused:'#fbbf24', continuous:'#a3e635',
};
const PLAN_FRIENDLY = { arconte:'Arconte', publicvector:'PublicVector', stack_modelos:'Stack de Modelos', arconte_retail:'Arconte Retail' };

// ── helpers de fecha ──────────────────────────────────────────────────
const TODAY = todayLocalISO();
function dayNum(iso) { return Math.floor(new Date(iso + 'T12:00:00').getTime() / 86400000); }
function addDaysISO(iso, days) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function pctOfDomain(iso) {
  const a = dayNum(DOMAIN_START), b = dayNum(DOMAIN_END), x = dayNum(iso);
  return Math.max(0, Math.min(100, ((x - a) / (b - a)) * 100));
}
function fmtRange(s, e) {
  const M = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  if (!s) return '';
  const sd = new Date(s + 'T12:00:00');
  if (!e) return `${sd.getDate()} ${M[sd.getMonth()]}`;
  const ed = new Date(e + 'T12:00:00');
  return sd.getMonth() === ed.getMonth()
    ? `${sd.getDate()}–${ed.getDate()} ${M[ed.getMonth()]}`
    : `${sd.getDate()} ${M[sd.getMonth()]} – ${ed.getDate()} ${M[ed.getMonth()]}`;
}
function sprintForDate(iso) {
  for (const s of SPRINTS) if (iso >= s.start && iso <= s.end) return s.name;
  for (const s of SPRINTS) if (iso < s.start) return s.name;
  return SPRINTS[SPRINTS.length - 1].name;
}
function currentSprint() {
  let i = SPRINTS.findIndex(s => TODAY >= s.start && TODAY <= s.end);
  if (i < 0) i = SPRINTS.findIndex(s => TODAY < s.start);
  if (i < 0) i = SPRINTS.length - 1;
  return i;
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── estado global ─────────────────────────────────────────────────────
let DATA = { roadmap:{}, projects:{}, estado:{tasks:{}}, votes:{proposals:[]} };

async function getJSON(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return await r.json(); }
  catch { return null; }
}

async function loadAll() {
  const [rm, pr, es, vo] = await Promise.all([
    getJSON('/api/roadmap'), getJSON('/api/projects'),
    getJSON('/api/estado'), getJSON('/api/votes'),
  ]);
  DATA.roadmap  = rm || {};
  DATA.projects = pr || {};
  DATA.estado   = es || { tasks:{} };
  DATA.votes    = vo || { proposals:[] };
}

// ── normalización: lista unificada de "proyectos" con fases y tareas ──
// Cada proyecto: { id, title, status, phases:[{title,status,start,end,tasks:[{desc,area,resp,done}]}], sprintTasks:[{...,sprint}], acuerdos:[] }
function buildModel() {
  const estado = DATA.estado.tasks || {};
  const out = [];

  // Arconte Retail desde roadmap.json (fuente xlsx)
  const retail = DATA.roadmap.arconte_retail;
  if (retail && (retail.phases || []).length) {
    const phases = (retail.phases || []).filter(p => !p.deleted).map(p => ({
      title: p.title, status: p.status, start: p.start_iso, end: p.end_iso,
      depends_on: [], blocked: false,
      tasks: (p.tasks || []).filter(t => !t.deleted).map(t => {
        const key = 'retail_' + t.id;
        const done = key in estado ? !!estado[key] : !!t.done_xlsx;
        return { desc: t.description, area: t.area, resp: t.responsible, done };
      }),
    }));
    out.push({ id:'arconte_retail', title:'Arconte Retail', status:'dev', source:'roadmap', phases, sprintTasks: [], acuerdos: retail.acuerdos || [] });
  }

  // Proyectos desde projects.json (incluye los _static: ahí vive el roadmap real)
  for (const [pid, p] of Object.entries(DATA.projects || {})) {
    if (!p) continue;
    if (pid === 'arconte_retail' && out.some(o => o.id === 'arconte_retail')) {
      // ya cargado desde roadmap; usar projects.json solo si roadmap vacío
    }
    const phases = (p.phases || []).filter(ph => !ph.deleted).map(ph => ({
      id: ph.id, title: ph.title, status: ph.status, start: ph.start_iso, end: ph.end_iso,
      depends_on: ph.depends_on || [],
      tasks: (ph.tasks || []).filter(t => !t.deleted).map(t => {
        const key = `${pid}_${t.id}`;
        const done = key in estado ? !!estado[key] : !!(t.done ?? t.done_xlsx);
        return { id: t.id, deps: t.deps || [], desc: t.description || t.title, area: t.area, resp: t.responsible || t.resp, done, status: t.status || '' };
      }),
    }));
    // Bloqueo por dependencias (igual que la app: una fase con depends_on cuya
    // dependencia no está completa queda bloqueada → se oculta en "Tareas por semana").
    const phComplete = {};
    phases.forEach(ph => { phComplete[ph.id] = ph.tasks.length > 0 && ph.tasks.every(t => t.done); });
    phases.forEach(ph => { ph.blocked = (ph.depends_on || []).some(dep => !phComplete[dep]); });
    const sprintTasks = [];
    for (const [sp, arr] of Object.entries(p.sprint_tasks || {})) {
      (arr || []).filter(t => !t.deleted).forEach(t => sprintTasks.push({
        desc: t.title || t.description, area: t.area, resp: t.resp || t.responsible, done: !!t.done, sprint: sp,
      }));
    }
    const existing = out.find(o => o.id === pid);
    if (existing) { existing.sprintTasks.push(...sprintTasks); continue; }
    out.push({
      id: pid, title: p.title || PLAN_FRIENDLY[pid] || pid,
      status: p.status || p.meta?.status || 'dev', source:'projects',
      phases, sprintTasks, acuerdos: p.acuerdos || [],
    });
  }
  return out;
}

function projStats(p) {
  let total = 0, done = 0;
  p.phases.forEach(ph => ph.tasks.forEach(t => { total++; if (t.done) done++; }));
  p.sprintTasks.forEach(t => { total++; if (t.done) done++; });
  return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
}

// ════════════════════════ RENDER ═══════════════════════════════════════
function render() {
  const model = buildModel();
  const root = document.getElementById('dash-root');
  root.innerHTML =
    renderResumen(model) +
    renderProyectos(model) +
    renderRoadmap(model) +
    renderWeekly(model) +
    renderAreasAcuerdos(model);

  document.getElementById('last-update').textContent =
    'Actualizado ' + new Date().toLocaleString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
  document.getElementById('foot-stamp').textContent = new Date().toLocaleString('es-MX');
  initNavSpy();
}

// ── 01 Resumen / KPIs ─────────────────────────────────────────────────
function renderResumen(model) {
  let total = 0, done = 0, activePhases = 0, donePhases = 0;
  model.forEach(p => {
    const s = projStats(p); total += s.total; done += s.done;
    p.phases.forEach(ph => {
      const allDone = ph.tasks.length && ph.tasks.every(t => t.done);
      if (allDone || ph.status === 'done') donePhases++;
      else if (ph.status !== 'paused') activePhases++;
    });
  });
  const pct = total ? Math.round(done / total * 100) : 0;
  const csIdx = currentSprint();
  const cs = SPRINTS[csIdx];

  let acTotal = 0, acDone = 0;
  model.forEach(p => (p.acuerdos || []).forEach(a => (a.items || []).forEach(it => {
    acTotal++; if ((it.status || '').toUpperCase() === 'COMPLETADO') acDone++;
  })));

  // ring
  const R = 56, C = 2 * Math.PI * R;
  const off = C * (1 - pct / 100);
  const ringColor = pct >= 100 ? 'var(--green)' : 'var(--accent)';

  const kpis = [
    { ico:'📁', val: model.length,        lbl:'Proyectos activos',  c:'var(--accent)',  bg:'rgba(34,211,238,0.13)',  bd:'rgba(34,211,238,0.3)' },
    { ico:'🧩', val: total,               lbl:'Tareas totales',     c:'var(--accent2)', bg:'rgba(163,230,53,0.13)',  bd:'rgba(163,230,53,0.3)' },
    { ico:'✅', val: done,                lbl:'Tareas completadas', c:'var(--green)',   bg:'rgba(74,222,128,0.13)',  bd:'rgba(74,222,128,0.3)' },
    { ico:'⚡', val: activePhases,        lbl:'Fases en curso',     c:'var(--blue)',    bg:'rgba(45,212,191,0.13)',  bd:'rgba(45,212,191,0.3)' },
    { ico:'🗓️', val: cs.name, lbl:'Sprint actual', c:'var(--yellow)', bg:'rgba(251,191,36,0.13)', bd:'rgba(251,191,36,0.3)' },
    { ico:'🤝', val: acTotal, lbl:'Acuerdos registrados', c:'var(--pink)', bg:'rgba(244,114,182,0.13)', bd:'rgba(244,114,182,0.3)' },
  ];

  const kpiHTML = kpis.map(k => `
    <div class="kpi" style="--kc:${k.c}">
      <div class="kpi-ico" style="--kbg:${k.bg};--kbd:${k.bd}">${k.ico}</div>
      <div class="kpi-val">${k.val}</div>
      <div class="kpi-lbl">${k.lbl}</div>
    </div>`).join('');

  const overall = `
    <div class="card overall" style="margin-top:14px">
      <div class="ring">
        <svg width="132" height="132" viewBox="0 0 132 132">
          <circle cx="66" cy="66" r="${R}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="11"/>
          <circle cx="66" cy="66" r="${R}" fill="none" stroke="${ringColor}" stroke-width="11"
                  stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
        </svg>
        <div class="ring-label"><div><b>${pct}%</b><span>completado</span></div></div>
      </div>
      <div class="overall-stats">
        <div class="ostat"><b>${done}<i style="color:var(--text-dim);font-weight:600">/${total}</i></b><span>Tareas hechas</span></div>
        <div class="ostat"><b>${donePhases}</b><span>Fases completadas</span></div>
        <div class="ostat"><b>${acDone}<i style="color:var(--text-dim);font-weight:600">/${acTotal}</i></b><span>Acuerdos cerrados</span></div>
        <div class="ostat"><b>${cs.name}</b><span>${fmtRange(cs.start, cs.end)}</span></div>
      </div>
    </div>`;

  return `
  <section class="block" id="b-resumen">
    <div class="block-head">
      <span class="block-num">01</span><span class="block-title">Resumen general</span>
      <span class="block-desc">Estado consolidado del equipo</span>
    </div>
    <div class="kpi-grid">${kpiHTML}</div>
    ${overall}
  </section>`;
}

// ── 02 Proyectos ──────────────────────────────────────────────────────
function renderProyectos(model) {
  let body;
  if (!model.length) {
    body = `<div class="empty"><b>Aún no hay proyectos con datos</b>
      Importa el roadmap (xlsx/CSV) o crea proyectos desde la <a href="/index.html" style="color:var(--accent)">vista clásica</a>.</div>`;
  } else {
    body = `<div class="proj-grid">` + model.map(p => {
      const s = projStats(p);
      const st = PROJ_STATUS[p.status] || PROJ_STATUS.dev;
      // distribución por área
      const areaCount = {};
      const addArea = a => { if (a) areaCount[a] = (areaCount[a] || 0) + 1; };
      p.phases.forEach(ph => ph.tasks.forEach(t => addArea(t.area)));
      p.sprintTasks.forEach(t => addArea(t.area));
      const chips = Object.entries(areaCount).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([a,n]) =>
        `<span class="chip"><span class="dot" style="background:${areaColor(a)}"></span>${esc(a)} ${n}</span>`).join('');
      const phaseTxt = p.phases.length ? `${p.phases.length} fase${p.phases.length!==1?'s':''}` : 'Sin fases';
      // Clic en la tarjeta -> roadmap del proyecto en la página Proyectos.
      // Solo si tiene roadmap (fases); si no, no es clicable (no hace nada).
      const hasRoadmap = p.phases.length > 0;
      const clickAttrs = hasRoadmap
        ? `onclick="location.href='/proyectos.html?proj=${encodeURIComponent(p.id)}'" style="cursor:pointer" title="Ver roadmap de ${esc(p.title)}"`
        : '';
      return `
      <div class="proj" ${clickAttrs}>
        <div class="proj-top">
          <div>
            <div class="proj-name">${esc(p.title)}</div>
            <div class="proj-meta">${phaseTxt} · ${s.total} tarea${s.total!==1?'s':''}</div>
          </div>
          <span class="badge ${st.cls}">${st.label}</span>
        </div>
        <div>
          <div class="proj-row" style="margin-bottom:6px">
            <span class="muted">Progreso</span>
            <span style="font-weight:700;color:#fff">${s.pct}%</span>
          </div>
          <div class="pbar"><div class="pbar-fill ${s.pct>=100?'done':''}" style="width:${s.pct}%"></div></div>
          <div class="proj-row" style="margin-top:7px">
            <span class="muted">${s.done} de ${s.total} completadas</span>
          </div>
        </div>
        ${chips ? `<div class="chips">${chips}</div>` : ''}
      </div>`;
    }).join('') + `</div>`;
  }
  return `
  <section class="block" id="b-proyectos">
    <div class="block-head">
      <span class="block-num">02</span><span class="block-title">Proyectos</span>
      <span class="block-desc">${model.length} en seguimiento</span>
    </div>
    ${body}
  </section>`;
}

// ── 03 Roadmap (gantt por proyecto) ───────────────────────────────────
function renderRoadmap(model) {
  let _rid = 0;   // ids únicos para el contenido (tooltip) de cada fase

  function roadmapRows(p) {
    // Recorrido automático: una fase INCOMPLETA cuyo inicio quedó en el pasado se
    // ancla a la semana actual (hoy) conservando su duración; las fases que
    // dependen de ella se recorren por igual (heredan el mayor desplazamiento).
    // Las fases ya completadas no se mueven (son historia).
    const byId = {};
    p.phases.forEach(ph => { if (ph.id) byId[ph.id] = ph; });
    const isDone = ph => ph.tasks.length && ph.tasks.every(t => t.done);
    // Dependencia implícita "fase anterior": si una fase no declara depends_on,
    // se asume que depende de la fase previa por fecha de inicio. Así toda la
    // secuencia se recorre por el MISMO desplazamiento y conserva su forma de
    // ESCALERA (los escalones entre fases) en vez de encimarse en la semana actual.
    const ordered = p.phases.filter(ph => ph.start).slice().sort((a, b) => a.start.localeCompare(b.start));
    const prevOf = new Map();
    ordered.forEach((ph, i) => { if (i > 0) prevOf.set(ph, ordered[i - 1]); });
    const memo = new Map(), inProg = new Set();
    function shiftOf(ph) {
      if (memo.has(ph)) return memo.get(ph);
      if (isDone(ph)) { memo.set(ph, 0); return 0; }   // completadas no se mueven (son historia)
      if (inProg.has(ph)) return 0;                     // guarda contra ciclos
      inProg.add(ph);
      // desplazamiento propio: si está atrasada e incompleta, anclar a hoy
      let d = (ph.start && ph.start < TODAY) ? (dayNum(TODAY) - dayNum(ph.start)) : 0;
      // dependencias explícitas; si no hay, la fase anterior (escalera)
      const deps = (ph.depends_on && ph.depends_on.length)
        ? ph.depends_on.map(id => byId[id]).filter(Boolean)
        : (prevOf.has(ph) ? [prevOf.get(ph)] : []);
      deps.forEach(dep => { d = Math.max(d, shiftOf(dep)); });  // recorrerse junto a la dependencia
      inProg.delete(ph);
      memo.set(ph, d);
      return d;
    }

    const rows = [];
    p.phases.forEach(ph => {
      if (!ph.start) return;
      const allDone = isDone(ph);
      const sh    = shiftOf(ph);
      const start = sh ? addDaysISO(ph.start, sh) : ph.start;
      const end   = sh ? addDaysISO(ph.end || ph.start, sh) : (ph.end || ph.start);
      rows.push({ title: ph.title, start, end,
        status: allDone ? 'done' : ph.status, blocked: !!ph.blocked && !allDone,
        done: ph.tasks.filter(t => t.done).length, total: ph.tasks.length,
        shifted: sh > 0, origStart: ph.start, origEnd: ph.end || ph.start,
        tasks: ph.tasks.map(t => ({ desc: t.desc, done: !!t.done })) });
    });
    return rows.sort((a, b) => a.start.localeCompare(b.start));
  }

  // Filas (ya recorridas) de todos los proyectos.
  const projRows = model.map((p, pi) => ({ p, pi, rows: roadmapRows(p) }))
                        .filter(x => x.rows.length);

  // Ventana del roadmap:
  //  · Inicio: la fase más temprana de TODAS (incluye completadas), para que se
  //    vean las semanas anteriores ya cumplidas.
  //  · Fin: semana actual + 6 (o más, si alguna fase se extiende más allá, para
  //    no recortarla). Con el ancho fijo por semana hay scroll horizontal.
  let earliestStart = null, latestEnd = null;
  projRows.forEach(({ rows }) => rows.forEach(r => {
    if (!earliestStart || r.start < earliestStart) earliestStart = r.start;
    if (!latestEnd     || r.end   > latestEnd)     latestEnd     = r.end;
  }));
  let startIdx = earliestStart ? SPRINTS.findIndex(s => earliestStart <= s.end) : 0;
  if (startIdx < 0) startIdx = 0;
  let endIdx = currentSprint() + 6;                             // semana actual + 6 → S17
  if (latestEnd) {
    const lastPhaseIdx = SPRINTS.findIndex(s => latestEnd <= s.end);
    if (lastPhaseIdx >= 0) endIdx = Math.max(endIdx, lastPhaseIdx);  // no recortar
  }
  endIdx = Math.min(endIdx, SPRINTS.length - 1);
  if (endIdx < startIdx) endIdx = startIdx;
  const WINDOW = SPRINTS.slice(startIdx, endIdx + 1);
  if (!WINDOW.length) WINDOW.push(SPRINTS[SPRINTS.length - 1]);
  const winStart = WINDOW[0].start;
  const winEnd   = WINDOW[WINDOW.length - 1].end;
  const winSpan  = Math.max(1, dayNum(winEnd) - dayNum(winStart));
  const pct = iso => Math.max(0, Math.min(100, ((dayNum(iso) - dayNum(winStart)) / winSpan) * 100));
  const todayLeft = pct(TODAY);
  const ticks = WINDOW.map(s => `<div class="tl-tick">${s.name}</div>`).join('');

  function roadmapHTML(rows) {
    // Solo las fases que tocan la ventana (las totalmente pasadas se omiten).
    const visible = rows.filter(r => r.end >= winStart);
    if (!visible.length) return '';
    const bars = visible.map(r => {
      const left = pct(r.start);
      const width = Math.max(2.5, pct(r.end) - left);
      const col = PHASE_COLORS[r.status] || PHASE_COLORS.active;
      const prog = r.total ? `${r.done}/${r.total}` : '';
      // etiqueta de estado: bloqueada / en pausa (visible en el roadmap)
      const tag = r.blocked ? `<span class="tl-tag blk">⛔ bloqueada</span>`
        : r.status === 'paused' ? `<span class="tl-tag pau">⏸ pausa</span>` : '';
      const barStyle = r.blocked
        ? `background:repeating-linear-gradient(45deg, ${col}55, ${col}55 6px, transparent 6px, transparent 12px);border:1px dashed ${col}aa;`
        : `background:linear-gradient(90deg, ${col}, ${col}cc);`;
      // Contenido del tooltip que aparece al PASAR EL CURSOR (sin clic).
      const rid = `tlrow-${_rid++}`;
      const taskRowsHTML = (r.tasks && r.tasks.length)
        ? r.tasks.map(t => `<div style="display:flex;align-items:center;gap:7px;font-size:11px;padding:2px 0;">
            <span style="color:${t.done ? 'var(--green,#4ade80)' : 'var(--text-muted)'};font-weight:700;width:12px;text-align:center;">${t.done ? '✓' : '○'}</span>
            <span style="${t.done ? 'color:var(--text-muted);text-decoration:line-through;' : 'color:var(--text);'}">${esc(t.desc || '(sin título)')}</span>
          </div>`).join('')
        : `<div style="font-size:11px;color:var(--text-muted);">Sin tareas en esta fase.</div>`;
      return `
      <div class="tl-row">
        <div class="tl-lbl"${r.shifted ? ` title="Recorrida a la semana actual (plan original: ${fmtRange(r.origStart, r.origEnd)})"` : ''}><b>${esc(r.title)}</b><small>${fmtRange(r.start, r.end)}${tag}</small></div>
        <div class="tl-track">
          <div class="tl-today" style="left:${todayLeft}%"></div>
          <div class="tl-bar${r.blocked ? ' blocked' : ''}" style="left:${left}%;width:${width}%;${barStyle}cursor:help;"
               onmouseenter="showPhaseTip(event,'${rid}')" onmousemove="movePhaseTip(event)" onmouseleave="hidePhaseTip()">
            ${esc(r.title)} ${prog ? `<small>${prog}</small>` : ''}
          </div>
        </div>
      </div>
      <div id="${rid}" class="tl-tip-src" style="display:none;">
        <div style="font-size:11.5px;font-weight:700;color:#fff;margin-bottom:4px;">${esc(r.title)} · ${prog || '0'} hechas${r.blocked ? ' · <span style="color:#f87171;">⛔ bloqueada</span>' : ''}${r.shifted ? ' · <span style="color:var(--accent);">recorrida</span>' : ''}</div>
        <div style="font-size:9.5px;color:var(--text-muted);margin-bottom:7px;">${fmtRange(r.start, r.end)}</div>
        ${taskRowsHTML}
      </div>`;
    }).join('');
    // Ancho total de la pista = ancho de semana × nº de columnas de la ventana;
    // con esto el contenido excede el contenedor y aparece la barra de scroll.
    return `<div class="card tl-wrap" style="--tl-track-w: calc(var(--tl-week-w) * ${WINDOW.length});"><div class="tl-head">${ticks}</div>${bars}</div>`;
  }

  const blocks = projRows.map(({ p, pi, rows }) => {
    const html = roadmapHTML(rows);
    if (!html) return null;                                  // proyecto sin fases en la ventana
    const st = projStats(p);
    const visibleCount = rows.filter(r => r.end >= winStart).length;
    return `
      <div class="pdetail">
        <div class="pdetail-head">
          <span class="dot" style="background:${projColor(pi)}"></span>${esc(p.title)}
          <span class="meta">${st.pct}% · ${visibleCount} fase${visibleCount !== 1 ? 's' : ''}</span>
        </div>
        ${html}
      </div>`;
  }).filter(Boolean).join('');

  const inner = blocks || `<div class="empty"><b>Sin fases por completar en el rango</b>
    Importa el roadmap o crea fases desde la app editable.</div>`;
  const legend = `
    <div style="display:flex;gap:16px;margin:2px 0 18px;flex-wrap:wrap;font-size:11px;color:var(--text-mut)">
      ${Object.entries(PHASE_COLORS).map(([k,c]) =>
        `<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:11px;height:11px;border-radius:3px;background:${c}"></span>${ {done:'Completada',active:'En curso',paused:'En pausa',continuous:'Continuo'}[k] }</span>`).join('')}
    </div>`;

  const rangeDesc = `${fmtRange(winStart, winEnd)} (${WINDOW[0].name}–${WINDOW[WINDOW.length - 1].name})`;

  return `
  <section class="block" id="b-roadmap">
    <div class="block-head">
      <span class="block-num">03</span><span class="block-title">Roadmap por proyecto</span>
      <span class="block-desc">${rangeDesc}</span>
    </div>
    ${legend}
    ${inner}
  </section>`;
}

// ── Tooltip de fase del roadmap (hover, sin clic) ─────────────────────
function _ensurePhaseTip() {
  let tip = document.getElementById('tl-tip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'tl-tip'; document.body.appendChild(tip); }
  return tip;
}
function showPhaseTip(ev, srcId) {
  const src = document.getElementById(srcId);
  if (!src) return;
  const tip = _ensurePhaseTip();
  tip.innerHTML = src.innerHTML;
  tip.style.display = 'block';
  movePhaseTip(ev);
}
function movePhaseTip(ev) {
  const tip = document.getElementById('tl-tip');
  if (!tip || tip.style.display !== 'block') return;
  const pad = 16, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + w > window.innerWidth)  x = ev.clientX - w - pad;
  if (y + h > window.innerHeight) y = Math.max(8, window.innerHeight - h - 8);
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}
function hidePhaseTip() {
  const tip = document.getElementById('tl-tip');
  if (tip) tip.style.display = 'none';
}
window.showPhaseTip = showPhaseTip;
window.movePhaseTip = movePhaseTip;
window.hidePhaseTip = hidePhaseTip;

// ── 04 Tareas por semana (portado fiel de la plataforma) ──────────────
let _wkGid = 0;
function renderWeekly(model) {
  const csIdx = currentSprint();
  const weeks = SPRINTS.slice(csIdx, csIdx + 4);
  if (!weeks.length) weeks.push(SPRINTS[SPRINTS.length - 1]);

  // misma lógica de recolección que "Tareas por semana" de la app:
  //  · fases en pausa fuera · solo tareas cuya fase traslapa la semana
  //  · vencidas pero vigentes se anclan al sprint actual
  function tasksForWeek(sprint) {
    const out = [];
    model.forEach(p => {
      p.phases.forEach(ph => {
        if (!ph.start || ph.status === 'paused') return;  // solo en pausa queda fuera (bloqueadas SÍ se ven)
        const phStart = ph.start;
        // Si la fase ya empezó o venció, sus tareas pendientes se anclan a HOY
        // (semana actual); si es futura, a su semana de inicio. Así una tarea sin
        // hacer de una fase pasada NO desaparece: sigue pendiente hasta cerrarse.
        const effDate = phStart < TODAY ? TODAY : phStart;
        if (sprintForDate(effDate) !== sprint.name) return;
        ph.tasks.forEach(t => out.push({ ...t, pid: p.id, project: p.title, phase: ph.title, blocked: !!ph.blocked }));
      });
      p.sprintTasks.forEach(t => { if (t.sprint === sprint.name) out.push({ ...t, pid: p.id, project: p.title, phase: '', blocked: false }); });
    });
    return out;
  }

  // Mapas id->done e id->título de TODAS las tareas, para detectar dependencias sin cumplir.
  const doneById = {}, titleById = {};
  model.forEach(p => (p.phases || []).forEach(ph => (ph.tasks || []).forEach(t => {
    if (t.id) { doneById[t.id] = !!t.done; titleById[t.id] = t.desc || t.id; }
  })));
  const unmetOf = t => (t.deps || []).filter(d => doneById[d] === false);   // deps existentes y NO hechas

  // Una fila de tarea. mode: 'active' | 'blocked' (dependencia sin cumplir).
  // En 'blocked' la fila es CLICABLE: revela qué dependencia(s) la bloquean
  // (oculto por defecto; tampoco se muestra en hover/tooltip).
  function taskRow(t, mode) {
    const areaTag = t.area ? `<span class="area-tag" style="background:${areaColor(t.area)}22;color:${areaColor(t.area)};border:1px solid ${areaColor(t.area)}55">${esc(t.area)}</span>` : '';
    const label   = `<div style="flex:1;">${esc(t.desc || '(sin descripción)')}${(t.project || t.phase) ? `<div class="wk-phase">${esc([t.project, t.phase].filter(Boolean).join(' · '))}</div>` : ''}</div>`;
    if (mode === 'blocked') {
      const names  = unmetOf(t).map(d => titleById[d] || d);
      const plural = names.length !== 1;
      const detail = `<div class="wk-dep-detail" style="display:none;flex-basis:100%;width:100%;margin-top:6px;padding:6px 9px;background:rgba(248,113,113,0.08);border-left:2px solid #f87171;border-radius:4px;font-size:11px;color:#f87171;line-height:1.45;">⛔ Bloqueada por ${plural ? 'las tareas' : 'la tarea'}: <strong>${esc(names.join(', '))}</strong> — debe${plural ? 'n' : ''} completarse primero.</div>`;
      return `
        <div class="wk-task" style="cursor:pointer;flex-wrap:wrap;" title="Clic para ver qué la bloquea"
             onclick="(function(el){var d=el.querySelector('.wk-dep-detail');if(!d)return;var c=el.querySelector('.wk-dep-caret');var open=d.style.display!=='none';d.style.display=open?'none':'block';if(c)c.style.transform=open?'rotate(0deg)':'rotate(90deg)';})(this)">
          <span class="wk-dep-caret" style="display:inline-block;transition:transform .15s;color:#f87171;font-size:10px;align-self:center;">▸</span>
          <span class="wk-bullet" style="background:${areaColor(t.area)}"></span>
          ${label}
          <span class="area-tag" style="background:rgba(248,113,113,0.15);color:#f87171;border:1px solid rgba(248,113,113,0.4)">⛔ bloqueada</span>
          ${areaTag}
          ${detail}
        </div>`;
    }
    // Activa: clic lleva a la página "Tareas por semana" (con foco en esta tarea)
    // para subir evidencia o editar. Si la tarea tiene id+pid usamos su key.
    const key  = (t.pid && t.id) ? `${t.pid}_${t.id}` : '';
    const href = key ? `/tareas.html?focus=${encodeURIComponent(key)}` : '/tareas.html';
    return `
      <div class="wk-task" style="cursor:pointer;" title="Ir a Tareas por semana para agregar evidencia o editar"
           onclick="location.href='${href}'">
        <span class="wk-bullet" style="background:${areaColor(t.area)}"></span>
        ${label}
        ${areaTag}
        <span style="color:var(--text-muted);font-size:11px;align-self:center;margin-left:2px;">↗</span>
      </div>`;
  }
  // Sección colapsable genérica (bloqueadas / en espera).
  function collapsible(titleHTML, count, rowsHTML) {
    const gid = `wkg-${_wkGid++}`;
    return `<div class="wk-group">
      <div class="wk-person-header" onclick="(function(h){var b=document.getElementById('${gid}');if(!b)return;var o=b.style.display!=='none';b.style.display=o?'none':'block';h.querySelector('.wk-chevron').style.transform=o?'rotate(0deg)':'rotate(90deg)';})(this)">
        <div style="display:flex;align-items:center;"><span class="wk-chevron" style="transform:rotate(0deg)">▸</span><span class="wk-group-title" style="margin:0;">${titleHTML}</span></div>
        <span class="wk-person-count">${count}</span>
      </div>
      <div id="${gid}" style="display:none;">${rowsHTML}</div>
    </div>`;
  }

  const cards = weeks.map(sprint => {
    const isCurrent = TODAY >= sprint.start && TODAY <= sprint.end;
    const all = tasksForWeek(sprint);
    const pending = all.filter(t => !t.done);
    const doneN = all.length - pending.length;
    // Clasificación SOLO por dependencias: si tiene una dependencia sin terminar →
    // bloqueada; si no (incl. dependencia N/A) → activa. El status manual no afecta.
    const blocked = pending.filter(t => unmetOf(t).length > 0);
    const active  = pending.filter(t => unmetOf(t).length === 0);

    // agrupar las ACTIVAS por responsable
    const byPerson = {};
    active.forEach(t => {
      // Responsable combinado -> la tarea va a cada persona.
      splitPeople(t.resp).forEach(person => {
        (byPerson[person] = byPerson[person] || []).push(t);
      });
    });
    const people = Object.keys(byPerson).sort((a, b) =>
      a === 'Equipo' ? 1 : b === 'Equipo' ? -1 : a.localeCompare(b, 'es'));

    let body;
    if (!pending.length) {
      body = `<div class="wk-empty">Sin tareas pendientes${doneN ? ` · ✓ ${doneN} lista${doneN !== 1 ? 's' : ''}` : ''} esta semana.</div>`;
    } else {
      const bits = [];
      if (active.length)  bits.push(`${active.length} activa${active.length !== 1 ? 's' : ''}`);
      if (blocked.length) bits.push(`⛔ ${blocked.length} bloqueada${blocked.length !== 1 ? 's' : ''}`);
      if (doneN)          bits.push(`✓ ${doneN} lista${doneN !== 1 ? 's' : ''}`);
      const totalBar = `<div class="wk-total-bar"><span class="wk-total-badge">${bits.join(' · ')}</span></div>`;
      const groups = people.map(person => {
        const tl = byPerson[person];
        const gid = `wkg-${_wkGid++}`;
        const tasksHTML = tl.map(t => taskRow(t, 'active')).join('');
        return `<div class="wk-group">
          <div class="wk-person-header" onclick="(function(h){var b=document.getElementById('${gid}');if(!b)return;var o=b.style.display!=='none';b.style.display=o?'none':'block';h.querySelector('.wk-chevron').style.transform=o?'rotate(0deg)':'rotate(90deg)';})(this)">
            <div style="display:flex;align-items:center;"><span class="wk-chevron" style="transform:rotate(0deg)">▸</span><span class="wk-group-title" style="margin:0;">${esc(person)}</span></div>
            <span class="wk-person-count">${tl.length} activa${tl.length !== 1 ? 's' : ''}</span>
          </div>
          <div id="${gid}" style="display:none;">${tasksHTML}</div>
        </div>`;
      }).join('');
      const blockedHTML = blocked.length
        ? collapsible(`<span style="color:#f87171;">⛔ Bloqueadas por dependencia</span>`, blocked.length, blocked.map(t => taskRow(t, 'blocked')).join(''))
        : '';
      body = totalBar + groups + blockedHTML;
    }

    return `<div class="wk-card${isCurrent ? ' current' : ''}">
      <div class="wk-header">
        <span class="wk-label${isCurrent ? ' cur' : ''}">${isCurrent ? '● Semana actual · ' : ''}${fmtRange(sprint.start, sprint.end)}</span>
        <span style="font-size:10px;color:var(--text-mut);">${sprint.name}</span>
      </div>
      ${body}
    </div>`;
  }).join('');

  return `
  <section class="block" id="b-weekly">
    <div class="block-head">
      <span class="block-num">04</span><span class="block-title">Tareas por semana</span>
      <span class="block-desc">Solo pendientes · agrupadas por responsable</span>
      <a href="/planificador.html?add=1" class="wk-add-btn" title="Ir al Planificador Semanal a agregar una tarea" style="margin-left:auto;align-self:center;display:inline-flex;align-items:center;gap:5px;padding:5px 12px;font-size:11px;font-weight:600;border:1px solid var(--accent);color:var(--accent);background:rgba(34,211,238,0.08);border-radius:7px;text-decoration:none;white-space:nowrap;">＋ Agregar tarea</a>
    </div>
    <div class="wk-grid">${cards}</div>
  </section>`;
}

// ── 05 Áreas & Acuerdos ───────────────────────────────────────────────
function renderAreasAcuerdos(model) {
  // carga por área y por responsable
  const byArea = {}, byResp = {};
  model.forEach(p => {
    const all = [...p.phases.flatMap(ph => ph.tasks), ...p.sprintTasks];
    all.forEach(t => {
      if (t.area) byArea[t.area] = (byArea[t.area] || 0) + 1;
      if (t.resp) byResp[t.resp] = (byResp[t.resp] || 0) + 1;
    });
  });
  const areaMax = Math.max(1, ...Object.values(byArea));
  const respMax = Math.max(1, ...Object.values(byResp));
  const areaRows = Object.entries(byArea).sort((a,b)=>b[1]-a[1]);
  const respRows = Object.entries(byResp).sort((a,b)=>b[1]-a[1]).slice(0, 8);

  const areaPanel = areaRows.length ? `
    <div class="barlist">${areaRows.map(([a,n]) => `
      <div class="barrow">
        <div class="name"><span class="dot" style="background:${areaColor(a)}"></span>${esc(a)}</div>
        <div class="bartrack"><div class="barfill" style="width:${n/areaMax*100}%;background:${areaColor(a)}"></div></div>
        <div class="num">${n}</div>
      </div>`).join('')}</div>`
    : `<div class="scol-empty">Sin tareas con área asignada</div>`;

  const respPanel = respRows.length ? `
    <div class="barlist">${respRows.map(([r,n]) => `
      <div class="barrow">
        <div class="name">${esc(r)}</div>
        <div class="bartrack"><div class="barfill" style="width:${n/respMax*100}%;background:linear-gradient(90deg,var(--accent),var(--accent2))"></div></div>
        <div class="num">${n}</div>
      </div>`).join('')}</div>`
    : `<div class="scol-empty">Sin responsables asignados</div>`;

  // acuerdos por estado
  const ST = { COMPLETADO:{c:'var(--green)',l:'Completados'}, 'EN PROCESO':{c:'var(--yellow)',l:'En proceso'},
               PENDIENTE:{c:'var(--blue)',l:'Pendientes'}, CANCELADO:{c:'var(--red)',l:'Cancelados'} };
  const acCount = { COMPLETADO:0, 'EN PROCESO':0, PENDIENTE:0, CANCELADO:0 };
  model.forEach(p => (p.acuerdos||[]).forEach(a => (a.items||[]).forEach(it => {
    const k = (it.status||'PENDIENTE').toUpperCase();
    if (k in acCount) acCount[k]++; else acCount.PENDIENTE++;
  })));
  const acTotal = Object.values(acCount).reduce((a,b)=>a+b,0);
  const acPanel = acTotal ? `
    <div class="ac-stat">${Object.entries(ST).map(([k,v]) => `
      <div class="acbox">
        <b style="color:${v.c}">${acCount[k]}</b>
        <span><span class="dot" style="background:${v.c}"></span>${v.l}</span>
      </div>`).join('')}</div>`
    : `<div class="scol-empty">Sin acuerdos registrados todavía</div>`;

  return `
  <section class="block" id="b-areas">
    <div class="block-head">
      <span class="block-num">05</span><span class="block-title">Áreas, carga y acuerdos</span>
    </div>
    <div class="twocol">
      <div class="card panel"><div class="panel-h">Tareas por área</div>${areaPanel}</div>
      <div class="card panel"><div class="panel-h">Carga por responsable</div>${respPanel}</div>
    </div>
    <div class="card panel" style="margin-top:16px"><div class="panel-h">Estado de acuerdos</div>${acPanel}</div>
  </section>`;
}

// ── 06 Equipo / organigrama ───────────────────────────────────────────
function renderEquipo() {
  return `
  <section class="block" id="b-equipo">
    <div class="block-head">
      <span class="block-num">06</span><span class="block-title">Equipo</span>
      <span class="block-desc">Computer Vision · Celestial Dynamics</span>
    </div>
    <div class="card org-card">
      <svg viewBox="0 0 820 460" xmlns="http://www.w3.org/2000/svg"
           font-family="'Segoe UI',system-ui,sans-serif"
           style="display:block;min-width:580px;width:100%;max-width:820px;margin:0 auto;">
        <rect x="305" y="14" width="210" height="50" rx="9" fill="rgba(34,211,238,0.14)" stroke="#22d3ee" stroke-width="2"/>
        <text x="410" y="34" text-anchor="middle" fill="#fff" font-size="13" font-weight="700">Abelardo Cruz</text>
        <text x="410" y="52" text-anchor="middle" fill="#22d3ee" font-size="10" font-weight="700" letter-spacing="0.8">JEFE DE SECCIÓN</text>
        <line x1="410" y1="64" x2="410" y2="96" stroke="#21303c" stroke-width="1.5"/>
        <line x1="145" y1="96" x2="675" y2="96" stroke="#21303c" stroke-width="1.5"/>
        <line x1="145" y1="96" x2="145" y2="126" stroke="#21303c" stroke-width="1.5"/>
        <line x1="675" y1="96" x2="675" y2="126" stroke="#21303c" stroke-width="1.5"/>
        <rect x="52" y="126" width="186" height="50" rx="8" fill="rgba(34,211,238,0.10)" stroke="#22d3ee" stroke-width="2"/>
        <text x="145" y="147" text-anchor="middle" fill="#dbe7ec" font-size="13" font-weight="700">Jonathan Flores</text>
        <text x="145" y="164" text-anchor="middle" fill="#22d3ee" font-size="10" font-weight="700" letter-spacing="0.5">HEAD OF COMPUTER VISION</text>
        <rect x="582" y="126" width="186" height="50" rx="8" fill="rgba(45,212,191,0.08)" stroke="#2dd4bf" stroke-width="2"/>
        <text x="675" y="147" text-anchor="middle" fill="#dbe7ec" font-size="13" font-weight="700">Juan Camacho</text>
        <text x="675" y="164" text-anchor="middle" fill="#2dd4bf" font-size="10" font-weight="700" letter-spacing="0.5">BACKEND &amp; ENGINEER SYSTEMS</text>
        <line x1="145" y1="176" x2="145" y2="214" stroke="#21303c" stroke-width="1.5"/>
        <line x1="95" y1="214" x2="428" y2="214" stroke="#21303c" stroke-width="1.5"/>
        <line x1="95" y1="214" x2="95" y2="247" stroke="#21303c" stroke-width="1.5"/>
        <line x1="265" y1="214" x2="265" y2="247" stroke="#21303c" stroke-width="1.5"/>
        <line x1="428" y1="214" x2="428" y2="247" stroke="#21303c" stroke-width="1.5"/>
        <line x1="675" y1="176" x2="675" y2="199" stroke="#2dd4bf" stroke-width="1.5" stroke-dasharray="5,3"/>
        <line x1="428" y1="199" x2="720" y2="199" stroke="#2dd4bf" stroke-width="1.5" stroke-dasharray="5,3"/>
        <line x1="428" y1="199" x2="428" y2="214" stroke="#2dd4bf" stroke-width="1" stroke-dasharray="3,2"/>
        <line x1="720" y1="199" x2="720" y2="247" stroke="#21303c" stroke-width="1.5"/>
        <rect x="14" y="247" width="162" height="50" rx="8" fill="#141d28" stroke="#a3e635" stroke-width="1.5"/>
        <text x="95" y="268" text-anchor="middle" fill="#dbe7ec" font-size="13" font-weight="600">Rodrigo Flores</text>
        <text x="95" y="285" text-anchor="middle" fill="#a3e635" font-size="10" font-weight="700" letter-spacing="0.8">AI ENGINEER</text>
        <rect x="189" y="247" width="152" height="50" rx="8" fill="#141d28" stroke="#a3e635" stroke-width="1.5"/>
        <text x="265" y="268" text-anchor="middle" fill="#dbe7ec" font-size="13" font-weight="600">Israel Mendoza</text>
        <text x="265" y="285" text-anchor="middle" fill="#a3e635" font-size="10" font-weight="700" letter-spacing="0.8">AI ENGINEER</text>
        <rect x="352" y="247" width="152" height="50" rx="8" fill="#141d28" stroke="#2dd4bf" stroke-width="1.5"/>
        <text x="428" y="268" text-anchor="middle" fill="#dbe7ec" font-size="13" font-weight="600">Adrian Medina</text>
        <text x="428" y="285" text-anchor="middle" fill="#2dd4bf" font-size="10" font-weight="700" letter-spacing="0.8">ENGINEER SYSTEMS</text>
        <rect x="644" y="247" width="152" height="50" rx="8" fill="#141d28" stroke="#fbbf24" stroke-width="1.5"/>
        <text x="720" y="268" text-anchor="middle" fill="#dbe7ec" font-size="13" font-weight="600">Selene Ventura</text>
        <text x="720" y="285" text-anchor="middle" fill="#fbbf24" font-size="10" font-weight="700" letter-spacing="0.8">FRONTEND</text>
        <line x1="95" y1="297" x2="95" y2="325" stroke="#21303c" stroke-width="1.5"/>
        <line x1="265" y1="297" x2="265" y2="325" stroke="#21303c" stroke-width="1.5"/>
        <line x1="428" y1="297" x2="428" y2="325" stroke="#21303c" stroke-width="1.5"/>
        <line x1="720" y1="297" x2="720" y2="325" stroke="#21303c" stroke-width="1.5"/>
        <line x1="95" y1="325" x2="720" y2="325" stroke="#21303c" stroke-width="1.5"/>
        <line x1="410" y1="325" x2="410" y2="370" stroke="#21303c" stroke-width="1.5"/>
        <rect x="218" y="370" width="384" height="56" rx="8" fill="rgba(125,147,160,0.06)" stroke="#21303c" stroke-width="1.5" stroke-dasharray="5,3"/>
        <text x="410" y="391" text-anchor="middle" fill="#7d93a0" font-size="11" font-weight="700" letter-spacing="1.5">SS — BECARIOS</text>
        <text x="410" y="411" text-anchor="middle" fill="#dbe7ec" font-size="13">Gael · Litzi · Paola</text>
        <line x1="540" y1="446" x2="562" y2="446" stroke="#2dd4bf" stroke-width="1.5" stroke-dasharray="5,3"/>
        <text x="568" y="450" fill="#7d93a0" font-size="10">también reporta a Juan Camacho</text>
      </svg>
    </div>
  </section>`;
}

// ── nav spy ───────────────────────────────────────────────────────────
function initNavSpy() {
  const links = [...document.querySelectorAll('.subnav a')];
  const onScroll = () => {
    const y = window.scrollY + 90;
    let active = links[0]?.getAttribute('href');
    document.querySelectorAll('.block').forEach(sec => {
      if (sec.offsetTop <= y) active = '#' + sec.id;
    });
    links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === active));
  };
  window.removeEventListener('scroll', window.__navspy || (()=>{}));
  window.__navspy = onScroll;
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ── boot ──────────────────────────────────────────────────────────────
(async function () {
  if (!document.getElementById('dash-root')) return;
  await loadAll();
  render();
  // refresco suave cada 60 s (la plataforma puede actualizar datos)
  setInterval(async () => { await loadAll(); render(); }, 60000);
})();

})();
  
