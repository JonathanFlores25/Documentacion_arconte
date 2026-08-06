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
    if (typeof _projects !== 'undefined') {
      Object.keys(_projects).forEach(pid => {
        try { renderPlatformRoadmap(pid); } catch(e) {}
      });
    }
    try { renderNewProjBtn(); } catch(e) {}
    try { renderDynamicProjects(); } catch(e) {}
    try { _infraEditMode = false; _infraEditId = null; renderInfra(); } catch(e) {}
    // Cancelar cualquier edición de métricas activa si el admin cierra sesión
    Object.keys(_smEditMode).forEach(pid => {
      if (_smEditMode[pid]) cancelStaticMetricsEdit(pid);
    });
  }

  let _pendingAdminCb     = null;
  let _softDeleteCallback = null;
  // Siempre pide razón al eliminar
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

  window.addEventListener('DOMContentLoaded', async () => {
    await injectChrome();
    updateAdminUI();
    const page = (document.body.dataset.page) || '';
    if (document.getElementById('infra-root')) {
      await loadInfra();
      renderInfra();
    }
    await loadProjects();
    if (page === 'proyectos') {
      const pid = new URLSearchParams(location.search).get('proj');
      if (pid) openProjectRoadmapById(pid);
    }
  });

  function switchRmTab(btn, panelId, sectionId) {
    const section = document.getElementById(sectionId);
    section.querySelectorAll('.rm-tab').forEach(t => t.classList.remove('active'));
    section.querySelectorAll('.rm-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(panelId).classList.add('active');
  }


  let _modelEditId        = null;  // { pid, modelId } — modelo en edición
  let _modelFormOpen      = {};    // pid → bool (formulario add abierto)
  let _modelEditMode      = {};    // pid → bool (modo edición independiente de modelos)
  let _solutionsMeta      = {};    // task_key → [{ url, filename, uploaded_by, uploaded_at }]

  // ══════════════════════════════════════════════════════════════════
  // PLATFORM ROADMAPS (projects.json — sin xlsx)
  // ══════════════════════════════════════════════════════════════════

  const _projects = {};          // { pid: projectData }
  const _pfEditMode = {};        // { pid: bool }
  let _fullcvCatalog = null;     // snapshot de /api/fullcv/catalog (models + profiles)

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
      const [projData, solData, fcvData] = await Promise.all([
        fetch('/api/projects').then(r => r.json()),
        fetch('/api/solutions').then(r => r.json()).catch(() => ({})),
        fetch('/api/fullcv/catalog').then(r => r.json()).catch(() => null),
      ]);
      Object.assign(_projects, projData);
      Object.assign(_solutionsMeta, solData);
      _fullcvCatalog = fcvData;
      syncPfPanel();
      const _has = id => !!document.getElementById(id);
      if (_has('dyn-projects-grid')) {            // pagina Proyectos
        renderDynamicProjects();
        renderNewProjBtn();
        Object.keys(PF_PANEL).forEach(pid => renderPlatformRoadmap(pid));
        ['arconte','arconte_retail','publicvector'].forEach(applyStaticMetrics);
        ['arconte','arconte_retail'].forEach(applyCamerasCount);
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


  function renderDynamicProjects() {
    const container = document.getElementById('dyn-projects-grid');
    if (!container) return;
    const dyn = dynProjects();
    if (!dyn.length) { container.innerHTML = ''; return; }
    container.innerHTML = dyn.map(([pid, project]) => renderDynProjectCard(pid, project)).join('');
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
    renderPlatformRoadmap(pid);
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
    });
  }

  // ─────────────────────────────────────────────────────────────────────────

  async function savePlatformProject(pid) {
    try {
      await fetch('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: _projects, token: _adminToken })
      });
    } catch(e) {}
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

  // ── Integración Full_CV (catálogo vivo) ────────────────────────────────────

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fullcvModel(id)   { return (_fullcvCatalog?.models || []).find(m => m.id === id) || null; }
  function fullcvProfile(id) { return (_fullcvCatalog?.profiles || {})[id] || null; }

  function fmtPct(v) {
    const n = Number(v);
    if (!isFinite(n)) return '—';
    const pct = n <= 1 ? n * 100 : n;
    return `${pct % 1 ? pct.toFixed(1) : pct.toFixed(0)}%`;
  }
  function metricCls(v) {
    const n = Number(v) <= 1 ? Number(v) : Number(v) / 100;
    return n >= 0.8 ? ' mm-good' : n >= 0.6 ? ' mm-warn' : '';
  }
  function fmtMB(mb) {
    const n = Number(mb);
    if (!isFinite(n) || n <= 0) return '—';
    return n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${Math.round(n)} MB`;
  }
  function syncAgeLabel(iso) {
    if (!iso) return '';
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1)  return 'hace instantes';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `hace ${hrs} h`;
    return `el ${iso.slice(0, 10)}`;
  }

  async function refreshFullcvCatalog(pid) {
    try { _fullcvCatalog = await fetch('/api/fullcv/catalog?refresh=1').then(r => r.json()); }
    catch { /* se mantiene el snapshot previo */ }
    renderPlatformRoadmap(pid);
  }

  // URL de la web de Full_CV vista desde el BROWSER: mismo host que la doc,
  // puerto reportado por el backend (default 8000).
  function fullcvWebUrl() {
    const port = _fullcvCatalog?.web_port || 8000;
    return `${location.protocol}//${location.hostname}:${port}/`;
  }

  const _modelDetailOpen = {};   // `${pid}:${modelId}` → bool
  function toggleModelDetail(pid, modelId) {
    const k = `${pid}:${modelId}`;
    _modelDetailOpen[k] = !_modelDetailOpen[k];
    renderPlatformRoadmap(pid);
  }

  // Chip de estado del sync para el header de la sección de modelos
  function fullcvSyncChip() {
    const cat = _fullcvCatalog;
    if (!cat) return '';
    if (cat.ok && cat.synced_at) {
      return `<span class="model-sync-chip sync-ok" title="Catálogo sincronizado con Full_CV">⟳ Full_CV ${syncAgeLabel(cat.synced_at)}</span>`;
    }
    if (cat.synced_at) {
      return `<span class="model-sync-chip sync-stale" title="${escHtml(cat.error || 'Full_CV no disponible')}">⚠ caché del ${escHtml(cat.synced_at.slice(0, 10))}</span>`;
    }
    return `<span class="model-sync-chip sync-stale" title="${escHtml(cat.error || '')}">⚠ Full_CV sin conexión</span>`;
  }

  // <select> de vínculo para los formularios de modelo (edición y alta)
  function fullcvLinkSelect(selectId, currentId) {
    const models = _fullcvCatalog?.models || [];
    if (!models.length) {
      return `<label>Vínculo Full_CV<select id="${selectId}" disabled title="Catálogo Full_CV no disponible"><option value="">— Manual (sin vínculo) —</option>${currentId ? `<option value="${escHtml(currentId)}" selected>${escHtml(currentId)}</option>` : ''}</select></label>`;
    }
    let opts = models.map(fm =>
      `<option value="${escHtml(fm.id)}"${currentId === fm.id ? ' selected' : ''}>${escHtml(fm.name)}${fm.task ? ` (${escHtml(fm.task)})` : ''}</option>`).join('');
    // Vínculo existente que ya no está en el catálogo: conservarlo visible
    if (currentId && !models.some(fm => fm.id === currentId)) {
      opts += `<option value="${escHtml(currentId)}" selected>${escHtml(currentId)} (no encontrado)</option>`;
    }
    return `<label>Vínculo Full_CV<select id="${selectId}"><option value="">— Manual (sin vínculo) —</option>${opts}</select></label>`;
  }

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
        ${fullcvSyncChip()}
        ${isAdmin() ? `<button class="rm-tool-btn" style="margin-left:auto;font-size:10px;padding:3px 10px;" title="Actualizar catálogo desde Full_CV" onclick="refreshFullcvCatalog('${pid}')">⟳ Sync</button>
        <button class="rm-tool-btn${edit ? ' active' : ''}" style="font-size:10px;padding:3px 10px;" onclick="toggleModelEdit('${pid}')">✏ ${edit ? 'Salir edición' : 'Editar modelos'}</button>` : ''}
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
            ${fullcvLinkSelect(`me-fullcv-${model.id}`, model.fullcv_id || '')}
            <div style="display:flex;gap:8px;margin-top:4px;">
              <button class="plan-save-btn" onclick="saveModelEdit('${pid}','${model.id}')">Guardar</button>
              <button class="plan-cancel-btn" onclick="cancelModelEdit('${pid}')">Cancelar</button>
            </div>
          </div>`;
        } else {
          // Datos vivos de Full_CV si el modelo está vinculado (merge solo en render)
          const live = model.fullcv_id ? fullcvModel(model.fullcv_id) : null;
          const prof = model.fullcv_id ? fullcvProfile(model.fullcv_id) : null;
          const dispName = live?.name || model.name;
          const dispVer  = live?.info?.version || model.version;
          const dispDesc = live?.description || model.description;

          let liveBadge = '';
          if (model.fullcv_id) {
            liveBadge = live
              ? `<a class="model-live-badge" href="${fullcvWebUrl()}" target="_blank" rel="noopener" title="Vinculado a Full_CV (${escHtml(model.fullcv_id)}) — click para abrir la plataforma de demos">🔗 Full_CV ↗</a>`
              : `<span class="model-live-badge mlb-missing" title="No encontrado en Full_CV (último sync: ${escHtml(_fullcvCatalog?.synced_at || 'nunca')})">🔗 sin datos</span>`;
          }

          let metricChips = '';
          if (live?.metrics) {
            metricChips = [['precision','Precisión'], ['recall','Recall'], ['mAP50','mAP50']]
              .filter(([k]) => Number(live.metrics[k]) > 0)
              .map(([k, l]) => `<span class="model-metric-chip${metricCls(live.metrics[k])}">${l}: ${fmtPct(live.metrics[k])}</span>`)
              .join('');
          }
          const classes = Array.isArray(live?.info?.classes) ? live.info.classes : [];
          if (classes.length) {
            metricChips += `<span class="model-metric-chip" title="${escHtml(classes.join(', '))}">${classes.length} clase${classes.length !== 1 ? 's' : ''}</span>`;
          }

          const benchRow = prof
            ? `<div class="model-bench-row" title="Benchmark de ${escHtml(prof.saved_by || '')} (${escHtml((prof.ts || '').slice(0, 10))})">⚡ VRAM base ${fmtMB(prof.base_mb)} · +${fmtMB(prof.per_flow_mb)}/flujo · máx ${Number(prof.max_flows_vram) || '—'} flujos</div>`
            : '';

          // Panel de detalles desplegable (solo modelos con datos vivos)
          const detailOpen = !!_modelDetailOpen[`${pid}:${model.id}`];
          let detailBtn = '', detailPanel = '';
          if (live) {
            detailBtn = `<button class="model-detail-btn" onclick="toggleModelDetail('${pid}','${model.id}')">${detailOpen ? '▾ Ocultar detalles' : '▸ Ver detalles'}</button>`;
            if (detailOpen) {
              const info  = live.info || {};
              const rows  = [];
              if (info.about)    rows.push(`<div class="model-detail-row"><b>¿Cómo funciona?</b> ${escHtml(info.about)}</div>`);
              if (live.task)     rows.push(`<div class="model-detail-row"><b>Categoría:</b> ${escHtml(live.task)}${live.modality ? ` · ${escHtml(live.modality)}` : ''}</div>`);
              if (info.input)    rows.push(`<div class="model-detail-row"><b>Entrada:</b> ${escHtml(info.input)}</div>`);
              if (info.output)   rows.push(`<div class="model-detail-row"><b>Salida:</b> ${escHtml(info.output)}</div>`);
              if (classes.length) rows.push(`<div class="model-detail-row"><b>Clases:</b> ${classes.map(c => `<span class="tech-badge">${escHtml(c)}</span>`).join(' ')}</div>`);
              if (Array.isArray(info.tutorial) && info.tutorial.length) {
                rows.push(`<div class="model-detail-row"><b>Cómo probarlo:</b><ol class="model-detail-steps">${info.tutorial.map(s => `<li>${escHtml(s)}</li>`).join('')}</ol></div>`);
              }
              if (model.linked_at) rows.push(`<div class="model-detail-row" style="color:var(--text-muted);">Vinculado por ${escHtml(model.linked_by || 'Admin')} el ${escHtml(model.linked_at)}</div>`);
              detailPanel = `<div class="model-detail">
                ${rows.join('')}
                <a class="model-demo-btn" href="${fullcvWebUrl()}" target="_blank" rel="noopener">▶ Abrir demo en Full_CV ↗</a>
              </div>`;
            }
          }

          html += `<div class="model-card">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
              <div class="model-card-name">${escHtml(dispName)}${dispVer ? ` <span style="font-size:10px;color:var(--text-muted);font-weight:400;">${escHtml(dispVer)}</span>` : ''}</div>
              <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">
                ${liveBadge}<span class="model-status ${stCls}">${stLabel}</span>
              </div>
            </div>
            ${dispDesc ? `<div class="model-card-desc">${escHtml(dispDesc)}</div>` : ''}
            ${metricChips ? `<div class="model-metric-row">${metricChips}</div>` : ''}
            ${benchRow}
            ${detailBtn}${detailPanel}
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
          ${fullcvLinkSelect(`ma-fullcv-${pid}`, '')}
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
    const fcvSel = document.getElementById(`me-fullcv-${modelId}`);
    if (fcvSel && !fcvSel.disabled) {
      const fcvId = fcvSel.value.trim();
      if (fcvId) {
        if (model.fullcv_id !== fcvId) {
          model.linked_by = _currentUser || 'Admin';
          model.linked_at = todayLocalISO();
        }
        model.fullcv_id = fcvId;
      } else {
        delete model.fullcv_id; delete model.linked_by; delete model.linked_at;
      }
    }
    _modelEditId = null;
    await savePlatformProject(pid);
    renderPlatformRoadmap(pid);
  }

  async function commitAddModel(pid) {
    const fcvSel = document.getElementById(`ma-fullcv-${pid}`);
    const fcvId  = (fcvSel && !fcvSel.disabled) ? fcvSel.value.trim() : '';
    let name = document.getElementById(`ma-name-${pid}`)?.value.trim();
    // Con vínculo Full_CV el nombre puede precargarse del catálogo
    if (!name && fcvId) name = fullcvModel(fcvId)?.name || '';
    if (!name) { document.getElementById(`ma-name-${pid}`)?.focus(); return; }
    if (!_projects[pid])         _projects[pid] = { title: pid, phases: [], sprint_tasks: {}, acuerdos: [], models: [] };
    if (!_projects[pid].models)  _projects[pid].models = [];
    const newModel = {
      id:          `m_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
      name,
      version:     document.getElementById(`ma-ver-${pid}`)?.value.trim()    || '',
      status:      document.getElementById(`ma-status-${pid}`)?.value        || 'poc',
      responsible: document.getElementById(`ma-resp-${pid}`)?.value.trim()   || '',
      description: document.getElementById(`ma-desc-${pid}`)?.value.trim()   || '',
      tech:        document.getElementById(`ma-tech-${pid}`)?.value.trim()   || '',
      notes:       document.getElementById(`ma-notes-${pid}`)?.value.trim()  || '',
      created_at:  todayLocalISO(),
    };
    if (fcvId) {
      newModel.fullcv_id = fcvId;
      newModel.linked_by = _currentUser || 'Admin';
      newModel.linked_at = todayLocalISO();
    }
    _projects[pid].models.push(newModel);
    _modelFormOpen[pid] = false;
    await savePlatformProject(pid);
    renderPlatformRoadmap(pid);
  }

  async function deleteModel(pid, modelId) {
    const model = (_projects[pid]?.models || []).find(m => m.id === modelId);
    if (!model) return;
    requireAdminDelete(`modelo "${model.name}"`, async (reason) => {
      model.deleted = true; model.deleted_reason = reason; model.deleted_by = _currentUser || 'Admin';
      await savePlatformProject(pid);
      renderPlatformRoadmap(pid);
    });
  }

  function renderProjectModelsInCard(pid) {
    const slot = document.getElementById(`models-direct-${pid}`);
    if (slot) slot.innerHTML = renderModelSection(pid);
  }

  // ══════════════════════════════════════════════════════════════════
  // INFRAESTRUCTURA (infra.json — página infraestructura.html)
  // ══════════════════════════════════════════════════════════════════

  let _infra          = null;   // { servers[], deployments[], cameras[] }
  let _infraEditMode  = false;
  let _infraEditId    = null;   // { section, itemId }
  let _infraFormOpen  = {};     // section → bool

  const INFRA_STATUS = {
    servers:     [ { key:'online',  label:'En línea',  cls:'ms-production' },
                   { key:'offline', label:'Apagado',   cls:'ms-deprecated' },
                   { key:'planned', label:'Planeado',  cls:'ms-poc' } ],
    deployments: [ { key:'active',   label:'Activo',   cls:'ms-production' },
                   { key:'inactive', label:'Inactivo', cls:'ms-deprecated' },
                   { key:'planned',  label:'Planeado', cls:'ms-poc' } ],
    cameras:     [ { key:'connected', label:'Conectadas', cls:'ms-production' },
                   { key:'tested',    label:'Probadas',   cls:'ms-dev' },
                   { key:'pending',   label:'Pendiente',  cls:'ms-poc' } ],
  };

  // Definición de campos por sección (para render + formularios genéricos)
  const INFRA_SECTIONS = [
    { key:'servers', icon:'🖥', title:'Servidores y servicios', addLabel:'＋ Agregar servidor',
      fields:[
        { k:'name',     label:'Nombre *',    type:'text',     ph:'Ej: Servidor de Producción' },
        { k:'role',     label:'Rol',         type:'text',     ph:'¿Para qué se usa?' },
        { k:'host',     label:'Host / IP',   type:'text',     ph:'192.168.x.x, hostname…' },
        { k:'status',   label:'Estado',      type:'status' },
        { k:'gpu',      label:'GPU',         type:'text',     ph:'NVIDIA RTX 3050…' },
        { k:'vram',     label:'VRAM',        type:'text',     ph:'6 GB' },
        { k:'cpu',      label:'CPU',         type:'text',     ph:'' },
        { k:'ram',      label:'RAM',         type:'text',     ph:'32 GB' },
        { k:'services', label:'Servicios (uno por línea: nombre :puerto — estado)', type:'textarea', ph:'CV Docs :8090 — activo' },
        { k:'notes',    label:'Notas',       type:'text',     ph:'' },
      ] },
    { key:'deployments', icon:'⬡', title:'Despliegues', addLabel:'＋ Agregar despliegue',
      fields:[
        { k:'name',    label:'Nombre *', type:'text', ph:'Ej: Pod Cisco' },
        { k:'project', label:'Proyecto', type:'text', ph:'Arconte, Arconte Retail…' },
        { k:'status',  label:'Estado',   type:'status' },
        { k:'note',    label:'Nota',     type:'text', ph:'Estado, bloqueos, pendientes…' },
      ] },
    { key:'cameras', icon:'📷', title:'Cámaras', addLabel:'＋ Agregar registro de cámaras',
      fields:[
        { k:'project',  label:'Proyecto *', type:'text', ph:'Arconte Retail…' },
        { k:'location', label:'Ubicación',  type:'text', ph:'Sucursal, zona…' },
        { k:'count',    label:'Cantidad',   type:'text', ph:'Ej: 12' },
        { k:'status',   label:'Estado',     type:'status' },
        { k:'notes',    label:'Notas',      type:'text', ph:'Modelo de cámara, RTSP, pendientes…' },
      ] },
  ];

  function infraStatusMeta(section, key) {
    const list = INFRA_STATUS[section];
    return list.find(s => s.key === key) || list[0];
  }

  async function loadInfra() {
    try { _infra = await fetch('/api/infra').then(r => r.json()); }
    catch { _infra = null; }
  }

  async function saveInfra() {
    try {
      await fetch('/api/infra', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: _infra, token: _adminToken })
      });
    } catch(e) {}
  }

  function toggleInfraEdit()      { _infraEditMode = !_infraEditMode; _infraEditId = null; _infraFormOpen = {}; renderInfra(); }
  function openInfraForm(section) { _infraFormOpen[section] = true;  renderInfra(); }
  function closeInfraForm(section){ _infraFormOpen[section] = false; renderInfra(); }
  function startInfraEdit(section, itemId) { _infraEditId = { section, itemId }; renderInfra(); }
  function cancelInfraEdit()      { _infraEditId = null; renderInfra(); }

  // Form genérico (edición o alta). item = null → alta.
  function infraFormHtml(sec, item) {
    const idSuffix = item ? item.id : `new-${sec.key}`;
    const rows = sec.fields.map(f => {
      const val = item ? (item[f.k] || '') : '';
      if (f.type === 'status') {
        const opts = INFRA_STATUS[sec.key].map(s =>
          `<option value="${s.key}"${val === s.key ? ' selected' : ''}>${s.label}</option>`).join('');
        return `<label>${f.label}<select id="inf-${f.k}-${idSuffix}">${opts}</select></label>`;
      }
      if (f.type === 'textarea') {
        return `<label>${f.label}<textarea id="inf-${f.k}-${idSuffix}" rows="3" placeholder="${f.ph}">${escHtml(val)}</textarea></label>`;
      }
      return `<label>${f.label}<input id="inf-${f.k}-${idSuffix}" value="${escHtml(val)}" placeholder="${f.ph}"></label>`;
    }).join('');
    const action = item
      ? `commitInfraEdit('${sec.key}','${item.id}')`
      : `commitInfraAdd('${sec.key}')`;
    const cancel = item ? `cancelInfraEdit()` : `closeInfraForm('${sec.key}')`;
    return `<div class="model-form" style="grid-column:1/-1;">
      <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px;">${item ? `Editando: ${escHtml(item.name || item.project || '')}` : 'Nuevo registro'}</div>
      ${rows}
      <div style="display:flex;gap:8px;margin-top:4px;">
        <button class="plan-save-btn" onclick="${action}">Guardar</button>
        <button class="plan-cancel-btn" onclick="${cancel}">Cancelar</button>
      </div>
    </div>`;
  }

  function readInfraForm(sec, idSuffix) {
    const out = {};
    sec.fields.forEach(f => {
      out[f.k] = document.getElementById(`inf-${f.k}-${idSuffix}`)?.value.trim() || '';
    });
    return out;
  }

  async function commitInfraEdit(sectionKey, itemId) {
    const sec  = INFRA_SECTIONS.find(s => s.key === sectionKey);
    const item = (_infra[sectionKey] || []).find(i => i.id === itemId);
    if (!sec || !item) return;
    Object.assign(item, readInfraForm(sec, itemId));
    _infraEditId = null;
    await saveInfra();
    renderInfra();
  }

  async function commitInfraAdd(sectionKey) {
    const sec  = INFRA_SECTIONS.find(s => s.key === sectionKey);
    if (!sec) return;
    const vals = readInfraForm(sec, `new-${sectionKey}`);
    const req  = sec.fields.find(f => f.label.includes('*'));
    if (req && !vals[req.k]) { document.getElementById(`inf-${req.k}-new-${sectionKey}`)?.focus(); return; }
    if (!_infra[sectionKey]) _infra[sectionKey] = [];
    _infra[sectionKey].push({ id: `i_${Date.now()}_${Math.random().toString(36).slice(2,5)}`, ...vals });
    _infraFormOpen[sectionKey] = false;
    await saveInfra();
    renderInfra();
  }

  async function deleteInfraItem(sectionKey, itemId) {
    const item = (_infra[sectionKey] || []).find(i => i.id === itemId);
    if (!item) return;
    requireAdminDelete(`registro "${item.name || item.project || itemId}"`, async () => {
      _infra[sectionKey] = _infra[sectionKey].filter(i => i.id !== itemId);
      await saveInfra();
      renderInfra();
    });
  }

  // Tarjeta por tipo de sección
  function infraCardHtml(sec, item) {
    const st = infraStatusMeta(sec.key, item.status);
    let body = '';
    if (sec.key === 'servers') {
      const specs = [
        item.gpu  ? `<span class="model-metric-chip">GPU: ${escHtml(item.gpu)}</span>` : '',
        item.vram ? `<span class="model-metric-chip">VRAM: ${escHtml(item.vram)}</span>` : '',
        item.cpu  ? `<span class="model-metric-chip">CPU: ${escHtml(item.cpu)}</span>` : '',
        item.ram  ? `<span class="model-metric-chip">RAM: ${escHtml(item.ram)}</span>` : '',
      ].filter(Boolean).join('');
      const services = (item.services || '').split('\n').map(s => s.trim()).filter(Boolean)
        .map(s => `<span class="infra-svc${/activo|online|corriendo/i.test(s) ? ' svc-on' : ''}">${escHtml(s)}</span>`).join('');
      body = `
        ${item.role ? `<div class="model-card-desc">${escHtml(item.role)}</div>` : ''}
        ${specs ? `<div class="model-metric-row">${specs}</div>` : ''}
        ${services ? `<div class="infra-svc-list">${services}</div>` : ''}
        <div class="model-card-meta">
          ${item.host ? `<span>🌐 ${escHtml(item.host)}</span>` : ''}
          ${item.notes ? `<span style="font-style:italic;">${escHtml(item.notes)}</span>` : ''}
        </div>`;
    } else if (sec.key === 'deployments') {
      body = `
        ${item.project ? `<div class="model-card-desc">Proyecto: ${escHtml(item.project)}</div>` : ''}
        ${item.note ? `<div class="model-card-meta"><span style="font-style:italic;">${escHtml(item.note)}</span></div>` : ''}`;
    } else {
      body = `
        ${item.location ? `<div class="model-card-desc">📍 ${escHtml(item.location)}</div>` : ''}
        <div class="model-card-meta">
          ${item.count ? `<span>🎥 ${escHtml(item.count)} cámara${item.count === '1' ? '' : 's'}</span>` : ''}
          ${item.notes ? `<span style="font-style:italic;">${escHtml(item.notes)}</span>` : ''}
        </div>`;
    }
    const title = sec.key === 'cameras' ? (item.project || '—') : (item.name || '—');
    return `<div class="model-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
        <div class="model-card-name">${escHtml(title)}</div>
        <span class="model-status ${st.cls}">${st.label}</span>
      </div>
      ${body}
      ${_infraEditMode ? `<div class="model-card-actions">
        <button style="flex:1;padding:3px 8px;border-radius:5px;border:none;background:rgba(34,211,238,0.12);color:var(--accent);cursor:pointer;font-size:11px;" onclick="startInfraEdit('${sec.key}','${item.id}')">✏ Editar</button>
        <button style="padding:3px 8px;border-radius:5px;border:none;background:rgba(248,113,113,0.12);color:var(--red);cursor:pointer;font-size:11px;" onclick="deleteInfraItem('${sec.key}','${item.id}')">✕</button>
      </div>` : ''}
    </div>`;
  }

  function renderInfra() {
    const root = document.getElementById('infra-root');
    if (!root) return;
    if (!_infra) {
      root.innerHTML = '<div class="pf-empty">⚠ No se pudo cargar la infraestructura.</div>';
      return;
    }
    let html = '';
    if (isAdmin()) {
      html += `<div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
        <button class="rm-tool-btn${_infraEditMode ? ' active' : ''}" style="font-size:10px;padding:3px 10px;" onclick="toggleInfraEdit()">✏ ${_infraEditMode ? 'Salir edición' : 'Editar infraestructura'}</button>
      </div>`;
    }
    INFRA_SECTIONS.forEach(sec => {
      const items = _infra[sec.key] || [];
      html += `<div class="model-section">
        <div class="model-section-title">${sec.icon} ${sec.title}
          <span style="font-size:10px;font-weight:400;color:var(--text-muted);">${items.length}</span>
        </div>`;
      if (items.length) {
        html += `<div class="model-grid">`;
        items.forEach(item => {
          if (_infraEditId?.section === sec.key && _infraEditId?.itemId === item.id) {
            html += infraFormHtml(sec, item);
          } else {
            html += infraCardHtml(sec, item);
          }
        });
        html += `</div>`;
      } else {
        html += `<div class="pf-empty">Sin registros.</div>`;
      }
      if (_infraEditMode && !_infraEditId) {
        html += _infraFormOpen[sec.key]
          ? infraFormHtml(sec, null)
          : `<button class="model-add-btn" onclick="openInfraForm('${sec.key}')">${sec.addLabel}</button>`;
      }
      html += `</div>`;
    });
    root.innerHTML = html;
  }

  function renderPlatformRoadmap(pid) {
    const panel = document.getElementById(PF_PANEL[pid]);
    if (!panel) return;
    renderProjectModelsInCard(pid);
    const project = _projects[pid] || { title: '', phases: [] };
    const phases = project.phases || [];
    const datedPhases = phases.filter(p => p.start_iso && p.end_iso && !p.deleted);
    const allTasks   = phases.flatMap(ph => ph.tasks || []).filter(t => !t.deleted);
    const doneCnt    = allTasks.filter(t => t.done).length;
    const pct        = allTasks.length ? Math.round(doneCnt / allTasks.length * 100) : 0;

    let html = '';
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
      html += `<div class="pf-empty">Sin fases definidas.</div>`;
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
          html += `<div class="pf-task-row">
            <span style="width:14px;text-align:center;flex-shrink:0;font-weight:700;color:${task.done ? 'var(--green,#4ade80)' : 'var(--text-muted)'};">${task.done ? '✓' : '○'}</span>
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
          </div>`;
        });
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

      // Mes inicial: primer mes con alguna fase
      const allIsoDates = [...new Set(Object.keys(dayPhases))].sort();
      const firstISO = allIsoDates[0] || todayLocalISO();
      const [fy, fm] = firstISO.split('-').map(Number);
      if (!_pfCalState[pid]) _pfCalState[pid] = { year: fy, month: fm - 1 };

      let cy  = _pfCalState[pid].year;
      let cm0 = _pfCalState[pid].month;

      const wrap = panel.querySelector('.rm-cal-wrap');
      if (wrap) {
        const buildPfCell = (d, iso, isToday) => {
          const phList = dayPhases[iso] || [];
          const mvList = dayMoves[iso] || [];
          if (!phList.length && !mvList.length) {
            return `<div class="rm-cal-day${isToday ? ' today' : ''}" data-iso="${iso}"><span>${d}</span></div>`;
          }
          const bg = phList.length ? `background:${phaseColorMap[phList[0].id] || PHASE_PALETTE[0]};` : '';
          const extraDots = phList.slice(1, 4).map(ph =>
            `<span style="width:5px;height:5px;border-radius:50%;background:${phaseColorMap[ph.id]||PHASE_PALETTE[0]};display:inline-block;flex-shrink:0;"></span>`
          ).join('');
          const moveDot = mvList.length
            ? `<span style="width:5px;height:5px;border-radius:50%;background:var(--yellow,#fbbf24);display:inline-block;flex-shrink:0;" title="${mvList.length} tarea(s) movida(s) desde este día"></span>`
            : '';
          const dotsHTML = (extraDots || moveDot) ? `<div style="display:flex;gap:2px;justify-content:center;margin-top:1px;">${extraDots}${moveDot}</div>` : '';
          return `<div class="rm-cal-day${isToday ? ' today' : ''} has-session" style="${bg}"
              data-phase-ids="${phList.map(p=>p.id).join(',')}" data-iso="${iso}"
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

    renderProjectEvidence(pid);
  }

  // ── Documentación de avances: evidencias de solutions/ por proyecto ───────
  function renderProjectEvidence(pid) {
    const panel = document.getElementById(PF_PANEL[pid]);
    if (!panel) return;
    const esc2 = s => String(s == null ? '' : s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const pids = Object.keys(_projects);

    // pid dueño de una clave de solutions_meta (elige la coincidencia más larga
    // para no confundir p.ej. "arconte" con "arconte_retail")
    const keyPid = key => {
      const k = key.replace(/^acuerdo_/, '').replace(/^plan_/, '');
      let best = '';
      pids.forEach(p => { if (k.startsWith(p + '_') && p.length > best.length) best = p; });
      return best;
    };

    const entries = [];
    Object.entries(_solutionsMeta || {}).forEach(([key, list]) => {
      if (keyPid(key) !== pid) return;
      const arr = Array.isArray(list) ? list : (list ? [list] : []);
      if (!arr.length) return;
      // Etiqueta legible: título de la tarea/acuerdo si aún existe en projects.json
      let label = '';
      const rest = key.replace(/^acuerdo_/, '').replace(/^plan_/, '').slice(pid.length + 1);
      if (key.startsWith('acuerdo_')) {
        label = 'Acuerdo';
        (_projects[pid]?.acuerdos || []).forEach(s => (s.items || []).forEach(it => {
          if (String(it.id) === rest) label = `Acuerdo · ${it.title || it.text || rest}`;
        }));
      } else if (key.startsWith('plan_')) {
        label = `Sprint ${rest.split('_')[0] || ''}`.trim();
      } else {
        label = rest;
        (_projects[pid]?.phases || []).forEach(ph => (ph.tasks || []).forEach(t => {
          if (String(t.id) === rest) label = t.title || t.description || rest;
        }));
      }
      arr.forEach(e => entries.push({ label, ...e }));
    });
    if (!entries.length) return;

    const rows = entries.map(e => `
      <div class="pf-task-row" style="padding:4px 0;">
        <span style="flex-shrink:0;">📄</span>
        <div style="flex:1;">
          <a href="${e.url}" target="_blank" style="font-size:12px;color:var(--green,#4ade80);text-decoration:none;border-bottom:1px dotted rgba(74,222,128,0.4);">${esc2(e.filename || 'Evidencia')} ↗</a>
          <div class="pf-task-meta" style="font-size:10px;">
            ${esc2(e.label)}${e.uploaded_by ? ` · ${esc2(e.uploaded_by)}` : ''}${e.uploaded_at ? ` · ${esc2(e.uploaded_at)}` : ''}
          </div>
        </div>
      </div>`).join('');

    const div = document.createElement('div');
    div.className = 'pf-phase-card';
    div.style.marginTop = '14px';
    div.innerHTML = `
      <div class="pf-phase-hdr" onclick="this.nextElementSibling.classList.toggle('open')">
        <span class="rm-phase-badge done" style="flex-shrink:0;">📂</span>
        <span class="pf-phase-title">Documentación de avances</span>
        <span style="font-size:11px;color:var(--text-muted);">${entries.length} archivo${entries.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="pf-phase-body">${rows}</div>`;
    panel.appendChild(div);
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

    if (!activePhases.length) { detail.style.display = 'none'; return; }
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

      const allNonDelPhasesForId = allPhases.filter(p => !p.deleted);
      const phDisplayNum = allNonDelPhasesForId.findIndex(p => p.id === phaseId) + 1;
      const allNonDelTasks = (phase.tasks || []).filter(t => !t.deleted);
      pending.forEach(task => {
        const taskDisplayNum = allNonDelTasks.findIndex(t => t.id === task.id) + 1;
        const taskDisplayId  = `F${phDisplayNum}·T${taskDisplayNum}`;
        const label   = task.title || task.description || '(sin título)';
        const detail2 = task.title ? (task.description || '') : '';
        const idBadge = `<span style="font-size:9px;color:var(--text-muted);font-family:monospace;margin-right:5px;opacity:0.7;">${taskDisplayId}</span>`;
        const titleEl = `<div class="pf-task-desc" style="font-size:11px;${isBlocked?'opacity:0.55;':''}">${idBadge}${label}</div>`;
        const descEl  = detail2 ? `<div class="pf-task-meta" style="font-size:10px;${isBlocked?'opacity:0.55;':''}">${detail2}</div>` : '';
        const taskShiftBar = task.start_iso ? `<div style="font-size:10px;color:var(--accent);margin-top:2px;">📅 ${task.start_iso}</div>` : '';
        // Evidencia adjunta a la tarea en el panel del día
        const calKey      = `${pid}_${task.id}`;
        const calSolList  = Array.isArray(_solutionsMeta[calKey]) ? _solutionsMeta[calKey] : (_solutionsMeta[calKey] ? [_solutionsMeta[calKey]] : []);
        const calSolHtml  = calSolList.length
          ? `<div style="margin-top:3px;display:flex;flex-direction:column;gap:1px;">${calSolList.map(e => `<a href="${e.url}" target="_blank" style="font-size:9px;color:var(--green,#4ade80);text-decoration:none;border-bottom:1px dotted rgba(74,222,128,0.4);" title="${(e.uploaded_by||'').replace(/"/g,'&quot;')} · ${e.uploaded_at||''}">📄 ${(e.filename||'Evidencia').replace(/</g,'&lt;')} ↗</a>`).join('')}</div>`
          : '';
        const calDoneNote  = task.done && task.done_note ? `<div style="font-size:9px;color:var(--accent);border-left:2px solid var(--accent);padding-left:4px;margin-top:2px;">✓ ${task.done_note}${task.done_by?` — ${task.done_by}`:''}</div>` : '';
        // Nota por día: qué se recorrió y por qué (aparece en el día nuevo de la tarea)
        const tShiftLog = Array.isArray(task.shift_log) ? task.shift_log
          : (task.shift_reason ? [{ days: task.shift_days || 0, reason: task.shift_reason, by: task.shifted_by, at: task.shifted_at }] : []);
        const calShiftNote = tShiftLog.length
          ? `<div style="font-size:9px;color:var(--yellow);border-left:2px solid var(--yellow);padding-left:4px;margin-top:2px;">${tShiftLog.map(x => `↳ Recorrida ${x.days>0?'+'+x.days:x.days}d — ${String(x.reason||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}${x.by?' · '+x.by:''}${x.at?' ('+x.at+')':''}`).join('<br>')}</div>`
          : '';
        block += `<div class="pf-task-row" style="padding:4px 0;${isBlocked?'opacity:0.6;':''}">
          <span style="width:14px;text-align:center;flex-shrink:0;font-weight:700;color:${task.done ? 'var(--green,#4ade80)' : 'var(--text-muted)'};">${task.done ? '✓' : '○'}</span>
          <div style="flex:1;">
            ${titleEl}
            ${descEl}
            <div class="pf-task-meta" style="font-size:10px;">
              <span class="rm-area-badge ${AREA_CLASS[task.area]||'active'}">${task.area||''}</span>
              ${task.responsible ? `<span class="rm-resp"> ${task.responsible}</span>` : ''}
            </div>
            ${taskShiftBar}
            ${calShiftNote}${calSolHtml}${calDoneNote}
          </div>
        </div>`;
      });

      pfBlocks.push(block);
    });

    // ── Acuerdos del proyecto para esta fecha ────────────────────────────────
    const dayAcuerdos = (_projects[pid]?.acuerdos || []).filter(s => s.iso_date === iso && !s.deleted);
    if (dayAcuerdos.length) {
      let acBlock = `<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="width:8px;height:8px;border-radius:50%;background:#4ade80;display:inline-block;flex-shrink:0;"></span>
        Acuerdos · ${iso}
      </div>`;
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
          acBlock += `<div class="pf-task-row" style="padding:3px 0;">
            <div style="flex:1;">
              <div style="font-size:11px;">${itemLabel}</div>
              ${itemDetail ? `<div class="pf-task-meta" style="font-size:10px;">${itemDetail}</div>` : ''}
              <div class="pf-task-meta" style="font-size:10px;">
                <span class="rm-phase-badge ${stCls}" style="font-size:9px;padding:1px 5px;">${item.status||'PENDIENTE'}</span>
                ${item.responsible ? `<span class="rm-resp"> ${item.responsible}</span>` : ''}
              </div>
              ${acSolHtml}
            </div>
          </div>`;
        });
      });
      pfBlocks.push(acBlock);
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

  function togglePfPhase(pid, phId) {
    const body = document.getElementById(`pf-body-${pid}-${phId}`);
    if (body) body.classList.toggle('open');
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
        body: JSON.stringify({ data: _projects, token: _adminToken }),
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
        body: JSON.stringify({ data: _projects, token: _adminToken }),
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
        body: JSON.stringify({ data: _projects, token: _adminToken }),
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
function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── estado global ─────────────────────────────────────────────────────
let DATA = { projects:{} };

async function getJSON(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return await r.json(); }
  catch { return null; }
}

async function loadAll() {
  const pr = await getJSON('/api/projects');
  DATA.projects = pr || {};
}

// ── normalización: lista unificada de "proyectos" con fases y tareas ──
// Cada proyecto: { id, title, status, phases:[{title,status,start,end,tasks:[{desc,area,resp,done}]}], sprintTasks:[{...,sprint}], acuerdos:[] }
function buildModel() {
  const out = [];

  // Proyectos desde projects.json (incluye los _static: ahí vive el roadmap real)
  for (const [pid, p] of Object.entries(DATA.projects || {})) {
    if (!p) continue;
    const phases = (p.phases || []).filter(ph => !ph.deleted).map(ph => ({
      id: ph.id, title: ph.title, status: ph.status, start: ph.start_iso, end: ph.end_iso,
      depends_on: ph.depends_on || [],
      tasks: (ph.tasks || []).filter(t => !t.deleted).map(t => {
        const done = !!(t.done ?? t.done_xlsx);
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
    renderAreasAcuerdos(model);

  document.getElementById('last-update').textContent =
    'Actualizado ' + new Date().toLocaleString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
  document.getElementById('foot-stamp').textContent = new Date().toLocaleString('es-MX');
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
    body = `<div class="empty"><b>Aún no hay proyectos con datos</b></div>`;
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
  const todayLeft = pctOfDomain(TODAY);
  const ticks = SPRINTS.map(s => `<div class="tl-tick">${s.name}</div>`).join('');
  let _rid = 0;   // ids únicos para los paneles de tareas que se despliegan al hacer clic

  function roadmapRows(p) {
    const rows = [];
    p.phases.forEach(ph => {
      if (!ph.start) return;
      const allDone = ph.tasks.length && ph.tasks.every(t => t.done);
      rows.push({ title: ph.title, start: ph.start, end: ph.end || ph.start,
        status: allDone ? 'done' : ph.status, blocked: !!ph.blocked && !allDone,
        done: ph.tasks.filter(t => t.done).length, total: ph.tasks.length,
        tasks: ph.tasks.map(t => ({ desc: t.desc, done: !!t.done })) });
    });
    return rows.sort((a, b) => a.start.localeCompare(b.start));
  }
  function roadmapHTML(rows) {
    const bars = rows.map(r => {
      const left = pctOfDomain(r.start);
      const width = Math.max(2.5, pctOfDomain(r.end) - left);
      const col = PHASE_COLORS[r.status] || PHASE_COLORS.active;
      const prog = r.total ? `${r.done}/${r.total}` : '';
      // etiqueta de estado: bloqueada / en pausa (visible en el roadmap)
      const tag = r.blocked ? `<span class="tl-tag blk">⛔ bloqueada</span>`
        : r.status === 'paused' ? `<span class="tl-tag pau">⏸ pausa</span>` : '';
      const barStyle = r.blocked
        ? `background:repeating-linear-gradient(45deg, ${col}55, ${col}55 6px, transparent 6px, transparent 12px);border:1px dashed ${col}aa;`
        : `background:linear-gradient(90deg, ${col}, ${col}cc);`;
      // Panel de tareas que se despliega al hacer CLIC en la barra.
      const rid = `tlrow-${_rid++}`;
      const taskRowsHTML = (r.tasks && r.tasks.length)
        ? r.tasks.map(t => `<div style="display:flex;align-items:center;gap:7px;font-size:11px;padding:2px 0;">
            <span style="color:${t.done ? 'var(--green,#4ade80)' : 'var(--text-muted)'};font-weight:700;width:12px;text-align:center;">${t.done ? '✓' : '○'}</span>
            <span style="${t.done ? 'color:var(--text-muted);text-decoration:line-through;' : 'color:var(--text);'}">${esc(t.desc || '(sin título)')}</span>
          </div>`).join('')
        : `<div style="font-size:11px;color:var(--text-muted);">Sin tareas en esta fase.</div>`;
      return `
      <div class="tl-row" style="cursor:pointer;" title="Clic para ver las tareas de esta fase"
           onclick="(function(){var d=document.getElementById('${rid}');if(d)d.style.display=d.style.display==='none'?'block':'none';})()">
        <div class="tl-lbl"><b>${esc(r.title)}</b><small>${fmtRange(r.start, r.end)}${tag}</small></div>
        <div class="tl-track">
          <div class="tl-today" style="left:${todayLeft}%"></div>
          <div class="tl-bar${r.blocked ? ' blocked' : ''}" style="left:${left}%;width:${width}%;${barStyle}cursor:pointer;">
            ${esc(r.title)} ${prog ? `<small>${prog}</small>` : ''}
          </div>
        </div>
      </div>
      <div id="${rid}" style="display:none;margin:1px 0 9px 0;padding:8px 12px;background:rgba(255,255,255,0.03);border-left:3px solid ${col};border-radius:5px;">
        <div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:5px;">${esc(r.title)} · ${prog || '0'} hechas${r.blocked ? ' · <span style="color:#f87171;">⛔ bloqueada</span>' : ''}</div>
        ${taskRowsHTML}
      </div>`;
    }).join('');
    return `<div class="card tl-wrap"><div class="tl-head">${ticks}</div>${bars}</div>`;
  }

  const blocks = model.map((p, pi) => {
    const rows = roadmapRows(p);
    if (!rows.length) return null;
    const st = projStats(p);
    return `
      <div class="pdetail">
        <div class="pdetail-head">
          <span class="dot" style="background:${projColor(pi)}"></span>${esc(p.title)}
          <span class="meta">${st.pct}% · ${rows.length} fase${rows.length !== 1 ? 's' : ''}</span>
        </div>
        ${roadmapHTML(rows)}
      </div>`;
  }).filter(Boolean).join('');

  const inner = blocks || `<div class="empty"><b>Sin fases con fechas</b>
    Importa el roadmap o crea fases desde la app editable.</div>`;
  const legend = `
    <div style="display:flex;gap:16px;margin:2px 0 18px;flex-wrap:wrap;font-size:11px;color:var(--text-mut)">
      ${Object.entries(PHASE_COLORS).map(([k,c]) =>
        `<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:11px;height:11px;border-radius:3px;background:${c}"></span>${ {done:'Completada',active:'En curso',paused:'En pausa',continuous:'Continuo'}[k] }</span>`).join('')}
    </div>`;

  return `
  <section class="block" id="b-roadmap">
    <div class="block-head">
      <span class="block-num">03</span><span class="block-title">Roadmap por proyecto</span>
      <span class="block-desc">Abr 20 → Jun 27 (S3–S12)</span>
    </div>
    ${legend}
    ${inner}
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

// ── boot ──────────────────────────────────────────────────────────────
(async function () {
  if (!document.getElementById('dash-root')) return;
  await loadAll();
  render();
  // refresco suave cada 60 s (la plataforma puede actualizar datos)
  setInterval(async () => { await loadAll(); render(); }, 60000);
})();

})();
  
