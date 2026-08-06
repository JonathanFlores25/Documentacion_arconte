// ════════════════════════════════════════════════════════════════════
//  CV Celestial — Requerimientos (machote de pre-ingeniería)
// ════════════════════════════════════════════════════════════════════
//  Lee /api/requisitos (el machote parseado a bloques) y lo presenta con
//  el estilo de la plataforma: apartados, preguntas, criterios de
//  aceptación, precisiones y los umbrales por caso de uso enlazados con
//  el librito de modelos.
//
//  El machote original se sigue sirviendo tal cual para llenarlo e
//  imprimirlo: esta vista es de consulta, no un formulario.
// ════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const RQ = { data: null, active: 0 };

  const el = id => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** El HTML inline viene del machote (archivo propio) ya saneado por el
   *  backend: solo strong/em/code/br/span. Se inserta tal cual. */
  const inline = html => html || '';

  function slug(text, i) {
    const base = String(text).toLowerCase()
      .replace(/[^\p{L}\p{N}\s.-]/gu, '').trim()
      .replace(/\s+/g, '-').replace(/\.+/g, '-').replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return `ap-${i}-${base || 'seccion'}`;
  }

  function fmtDateTime(iso) {
    if (!iso) return 'nunca';
    try {
      return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
        .format(new Date(iso));
    } catch (e) { return iso; }
  }

  // ══════════════════════════════════════════════════════════════════
  //  Bloques
  // ══════════════════════════════════════════════════════════════════

  const TABLE_META = {
    preguntas:       { label: 'Preguntas al cliente',        cls: 'rq-t-preg'  },
    criterio:        { label: 'Criterio de aceptación',      cls: 'rq-t-crit'  },
    casos:           { label: 'Selector de casos de uso',    cls: 'rq-t-casos' },
    estados:         { label: 'Estados del modelo',          cls: 'rq-t-est'   },
    calibracion:     { label: 'Qué se calibra',              cls: ''           },
    etapas:          { label: 'Etapas',                      cls: ''           },
    material:        { label: 'Material requerido',          cls: 'rq-t-mat'   },
    viabilidad:      { label: 'Resultado de viabilidad',     cls: ''           },
    consideraciones: { label: 'Consideraciones',             cls: ''           },
    acuse:           { label: 'Acuse',                       cls: ''           },
    camaras:         { label: 'Ficha por cámara',            cls: 'rq-t-cam'   },
    contactos:       { label: 'Contactos requeridos',        cls: ''           },
    ficha:           { label: 'Datos del documento',         cls: 'rq-t-ficha' },
  };

  function renderBlock(b, i) {
    switch (b.type) {
      case 'heading':  return renderHeading(b, i);
      // El subtítulo del machote ya se muestra en la portada de la sección
      case 'p':        return (b.classes || []).includes('subtitulo') ? '' :
                       `<p class="rq-p${(b.classes || []).includes('opcional') ? ' rq-opcional' : ''}">${inline(b.html)}</p>`;
      case 'aviso':    return `<div class="rq-aviso">
                                ${b.title ? `<div class="rq-aviso-t">⚠ ${esc(b.title)}</div>` : ''}
                                <div>${inline(b.html)}</div>${renderItems(b)}</div>`;
      case 'nota':     return `<div class="rq-nota"><div>${inline(b.html)}</div>${renderItems(b)}</div>`;
      case 'instrucciones': return `<div class="rq-instr"><div>${inline(b.html)}</div>${renderItems(b)}</div>`;
      case 'list':     return `<${b.ordered ? 'ol' : 'ul'} class="rq-list">
                                ${b.items.map(it => `<li>${inline(it)}</li>`).join('')}</${b.ordered ? 'ol' : 'ul'}>`;
      case 'table':    return renderTable(b, i);
      default:         return '';
    }
  }

  function renderItems(b) {
    if (!(b.items || []).length) return '';
    return `<ul class="rq-list">${b.items.map(it => `<li>${inline(it)}</li>`).join('')}</ul>`;
  }

  function renderHeading(b, i) {
    if (b.level === 1) return '';                 // el título va en la portada
    if (b.level === 2) {
      const id = slug(b.text, i);
      const num = (b.text.match(/^(\d+)\./) || [])[1] || '';
      const txt = b.text.replace(/^\d+\.\s*/, '');
      return `<h2 class="rq-h2" id="${id}">
        ${num ? `<span class="rq-h2-num">${num}</span>` : ''}${esc(txt)}</h2>`;
    }
    if (b.level === 3) {
      const id = slug(b.text, i);
      return `<h3 class="rq-h3" id="${id}">${esc(b.text)}</h3>`;
    }
    return `<h4 class="rq-h4">${esc(b.text)}</h4>`;
  }

  function renderTable(b, i) {
    const meta = TABLE_META[b.role] || { label: '', cls: '' };
    // Si el machote ya puso un encabezado justo antes (h3/h4), la etiqueta de
    // rol sobra: repetía el mismo texto dos veces.
    const prev = (RQ.data.blocks || [])[i - 1];
    const label = (prev && prev.type === 'heading' && prev.level >= 3) ? '' : meta.label;
    const head = (b.head || []).length
      ? `<thead><tr>${b.head.map(c => cell(c, 'th', b.role)).join('')}</tr></thead>` : '';
    const body = `<tbody>${(b.rows || []).map(r =>
      `<tr>${r.map(c => cell(c, 'td', b.role)).join('')}</tr>`).join('')}</tbody>`;
    return `<div class="rq-table-box">
      ${label ? `<div class="rq-table-label">${label}</div>` : ''}
      <div class="rq-table-wrap"><table class="rq-table ${meta.cls}">${head}${body}</table></div>
    </div>`;
  }

  function cell(c, tag, role) {
    const cls = [
      c.num ? 'rq-num' : '',
      c.porque ? 'rq-porque' : '',
      (role === 'ficha' && tag === 'td' && !c.html.includes('rq-field') ? 'rq-key' : ''),
    ].filter(Boolean).join(' ');
    const attrs = [
      c.colspan > 1 ? `colspan="${c.colspan}"` : '',
      c.align ? `style="text-align:${c.align}"` : '',
      cls ? `class="${cls}"` : '',
    ].filter(Boolean).join(' ');
    return `<${tag}${attrs ? ' ' + attrs : ''}>${fields(c.html)}</${tag}>`;
  }

  /** Los campos rellenables del machote se muestran como espacios marcados:
   *  esta vista es de consulta; para llenarlos se abre el machote. */
  function fields(html) {
    return String(html || '')
      .replace(/<span class="rq-field rq-field-textarea"[^>]*><\/span>/g,
               '<span class="rq-blank rq-blank-area">respuesta del cliente</span>')
      .replace(/<span class="rq-field rq-field-checkbox"[^>]*><\/span>/g,
               '<span class="rq-blank rq-blank-check"></span>')
      .replace(/<span class="rq-field rq-field-text"(?:\s+data-hint="([^"]*)")?[^>]*><\/span>/g,
               (m, hint) => `<span class="rq-blank">${hint ? esc(hint) : '&nbsp;'}</span>`);
  }

  // ══════════════════════════════════════════════════════════════════
  //  Vista
  // ══════════════════════════════════════════════════════════════════

  function render() {
    const d  = RQ.data;
    const st = d.stats || {};
    const machote = d.machote_url || '';

    el('rq-stage').innerHTML = `
      <div class="rq-cover">
        <div class="rq-cover-kicker">Celestial Dynamics AI · Antes de comprometer alcance</div>
        <h1 class="rq-cover-title">Requerimientos<br><span>de pre-ingeniería</span></h1>
        <p class="rq-cover-sub">${esc(d.subtitle || '')}</p>
        <div class="rq-cover-stats">
          <div class="rq-stat"><b>${st.apartados || 0}</b><span>apartados</span></div>
          <div class="rq-stat"><b>${st.casos || 0}</b><span>casos de uso</span></div>
          <div class="rq-stat"><b>${st.preguntas || 0}</b><span>preguntas</span></div>
          <div class="rq-stat"><b>${st.criterios || 0}</b><span>criterios de aceptación</span></div>
          <div class="rq-stat"><b>${st.avisos || 0}</b><span>precisiones de alcance</span></div>
        </div>
        <div class="rq-cover-actions">
          ${machote ? `<a class="rq-btn primary" href="${esc(machote)}" target="_blank" rel="noopener">
              📝 Abrir el machote en blanco</a>
            <a class="rq-btn" href="${esc(machote)}" target="_blank" rel="noopener">
              🖨 Llenar e imprimir / PDF</a>` : ''}
          <a class="rq-btn" href="/documentacion.html">📖 Ver el librito de modelos</a>
        </div>
        <div class="rq-cover-foot">
          ${d.ok
            ? `<span class="rq-sync">● Leído de <code>${esc((d.source || '').split('/').pop())}</code> · actualizado ${fmtDateTime(d.mtime)}</span>`
            : `<span class="rq-warn">⚠ Machote no accesible — se muestra el último snapshot (${fmtDateTime(d.synced_at)})</span>`}
        </div>
      </div>

      ${renderCasos(d.casos || [])}

      <div class="rq-doc">
        <div class="rq-doc-label">El cuestionario completo</div>
        ${(d.blocks || []).map(renderBlock).join('\n')}
      </div>`;

    wireSpy();
  }

  /** Panel de umbrales: es el puente entre el machote y el librito. */
  function renderCasos(casos) {
    if (!casos.length) return '';
    return `<section class="rq-casos">
      <div class="rq-doc-label">Umbrales por caso de uso</div>
      <p class="rq-casos-intro">Lo que debe cumplir la cámara para que el caso de uso sea
        alcanzable. Cada caso enlaza con el modelo que lo implementa en el librito.</p>
      <div class="rq-table-wrap"><table class="rq-table rq-t-casos">
        <thead><tr>
          <th>Caso de uso</th>
          <th>Píxeles mínimos sobre el objetivo</th>
          <th>Ángulo requerido</th>
          <th>¿Sirve cámara de techo?</th>
          <th>Modelo en el librito</th>
        </tr></thead>
        <tbody>${casos.map(c => {
          const dedicada = /^no$/i.test(c.techo.trim());
          return `<tr class="${dedicada ? 'rq-row-warn' : ''}">
            <td><b>${esc(c.caso)}</b></td>
            <td>${esc(c.px)}</td>
            <td>${esc(c.angulo)}</td>
            <td class="${dedicada ? 'rq-no' : 'rq-si'}">${esc(c.techo)}</td>
            <td>${(c.models || []).map(m =>
                  `<a class="rq-model-link" href="/documentacion.html#modelo/${encodeURIComponent(m.dir)}"
                      title="Abrir la documentación de este modelo">${esc(m.title)}</a>`).join('') ||
                  '<span class="rq-nc">—</span>'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </section>`;
  }

  function renderSidebar() {
    const d = RQ.data;
    el('rq-index').innerHTML = (d.indice || []).map((a, i) => {
      const num = (a.text.match(/^(\d+)\./) || [])[1] || '';
      const txt = a.text.replace(/^\d+\.\s*/, '');
      return `<div class="rq-idx-item" data-target="${slug(a.text, a.index)}">
        <a href="#${slug(a.text, a.index)}">
          <span class="rq-idx-num">${num}</span>${esc(txt)}</a>
        ${(a.subs || []).length ? `<div class="rq-idx-subs">${a.subs.map(s =>
          `<a href="#${slug(s.text, s.index)}">${esc(s.text)}</a>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
  }

  /** Resalta en el índice el apartado que se está leyendo. */
  function wireSpy() {
    const items = Array.from(document.querySelectorAll('.rq-idx-item'));
    if (!items.length || !('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        items.forEach(it => it.classList.toggle('active', it.dataset.target === e.target.id));
      });
    }, { rootMargin: '-70px 0px -70% 0px' });
    items.forEach(it => {
      const h = document.getElementById(it.dataset.target);
      if (h) obs.observe(h);
    });
  }

  function renderStatus() {
    const box = el('rq-status-text');
    if (!box || !RQ.data) return;
    const st = RQ.data.stats || {};
    box.innerHTML = RQ.data.ok
      ? `<span class="bk-sync-dot ok"></span>${st.preguntas || 0} preguntas · ${fmtDateTime(RQ.data.mtime)}`
      : `<span class="bk-sync-dot bad"></span>snapshot del ${fmtDateTime(RQ.data.synced_at)}`;
    box.parentNode.title = RQ.data.ok
      ? `Leído de ${RQ.data.source}`
      : `Machote no accesible: ${RQ.data.error || 'desconocido'}`;
  }

  async function load(refresh) {
    const stage = el('rq-stage');
    if (stage && !RQ.data) stage.innerHTML = '<div class="bk-loading">Cargando el cuestionario…</div>';
    try {
      const res = await fetch(`/api/requisitos?refresh=${refresh ? 1 : 0}`);
      RQ.data = await res.json();
      render();
      renderSidebar();
      renderStatus();
      if (location.hash) {
        const t = document.getElementById(location.hash.slice(1));
        if (t) setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      }
    } catch (e) {
      if (stage) stage.innerHTML = `<div class="bk-loading err">⚠ No se pudo cargar el cuestionario.<br>
        <small>${esc(e.message || e)}</small></div>`;
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    if (!el('rq-stage')) return;
    const r = el('rq-refresh');
    if (r) r.addEventListener('click', () => load(true));
    const t = el('bk-side-toggle');
    if (t) t.addEventListener('click', () => document.body.classList.toggle('bk-side-open'));
    load(false);
  });

  window.CVReqs = { RQ, load };
})();
