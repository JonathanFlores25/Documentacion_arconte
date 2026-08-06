// ════════════════════════════════════════════════════════════════════
//  CV Celestial — "El librito": Documentación de Visión por Computadora
// ════════════════════════════════════════════════════════════════════
//  Lee /api/docs/catalog (README + CONTRATO que viven junto al código de
//  cada modelo en ArconteDetection_DebugTools) y los presenta como un
//  libro: portada, capítulos, ficha-receta por modelo y lector.
//
//  Sin dependencias externas: el renderer de markdown está aquí abajo.
//  Solo lectura — la fuente de verdad es el repo de modelos.
// ════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════
  //  1 · Renderer de Markdown (subset suficiente para nuestros docs)
  //     Soporta: encabezados, párrafos, hr, listas anidadas y de tareas,
  //     tablas con alineación, code fences, blockquotes, énfasis, código
  //     inline, links (incl. relativos entre docs del libro) y autolink.
  // ══════════════════════════════════════════════════════════════════

  const NUL = '\u0000';   // marcador de placeholder (no aparece en los .md)

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Slug estilo GitHub: conserva acentos, tira puntuación. */
  function slugify(s) {
    return String(s)
      .toLowerCase()
      .replace(/`/g, '')
      .replace(/[^\p{L}\p{N}\s·-]/gu, '')
      .trim()
      .replace(/[\s·]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'seccion';
  }

  /** Quita marcas de markdown de un texto (para TOC y snippets). */
  function stripMd(s) {
    return String(s)
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*([^*]*)\*\*/g, '$1')
      .replace(/\*([^*]*)\*/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .trim();
  }

  // ── Inline ────────────────────────────────────────────────────────

  function renderInline(src, ctx) {
    const store = [];
    const keep = html => { store.push(html); return `${NUL}${store.length - 1}${NUL}`; };

    let s = escHtml(src);

    // Código inline primero: dentro de él nada más se interpreta
    s = s.replace(/``([^`]+)``|`([^`]+)`/g, (m, a, b) =>
      keep(`<code>${a != null ? a : b}</code>`));

    // Imágenes y links
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (m, alt, src2) =>
      keep(`<img src="${resolveHref(src2, ctx).href}" alt="${alt}" loading="lazy">`));
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (m, text, href) => {
      const r = resolveHref(href, ctx);
      return keep(`<a ${r.attrs}>${text}</a>`);
    });

    // Autolink de URLs sueltas (los docs pegan el repo directo)
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<>()]+[^\s<>().,;:])/g, (m, pre, url) =>
      pre + keep(`<a href="${url}" target="_blank" rel="noopener">${url}</a>`));

    // Énfasis
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
         .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
         .replace(/(^|[\s(—·])_([^_]+)_(?=$|[\s).,;:!?—·])/g, '$1<em>$2</em>')
         .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
         .replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Restaurar placeholders
    s = s.replace(new RegExp(`${NUL}(\\d+)${NUL}`, 'g'), (m, i) => store[+i]);
    return s;
  }

  /**
   * Resuelve un href de markdown en el contexto del libro:
   *   #ancla        → scroll interno
   *   otro.md       → otro documento del libro (o GitHub si no está)
   *   archivo.py    → GitHub (blob)
   *   http(s)://    → externo
   */
  function resolveHref(href, ctx) {
    const raw = String(href || '').replace(/&amp;/g, '&');

    if (raw.startsWith('#')) {
      const target = raw.slice(1);
      return { href: raw, attrs: `href="#" data-anchor="${escHtml(target)}" class="bk-a-anchor"` };
    }
    if (/^(https?:|mailto:)/i.test(raw)) {
      return { href: raw, attrs: `href="${escHtml(raw)}" target="_blank" rel="noopener" class="bk-a-ext"` };
    }

    // Ruta relativa al directorio del documento actual
    const [path, hash] = raw.split('#');
    const resolved = normalizePath((ctx && ctx.dir ? ctx.dir + '/' : '') + path);

    if (/\.md$/i.test(path) && BK.byId[resolved]) {
      const suffix = hash ? `::${hash}` : '';
      return {
        href: `#doc/${encodeURIComponent(resolved)}${suffix}`,
        attrs: `href="#doc/${encodeURIComponent(resolved)}${suffix}" class="bk-a-int"`,
      };
    }
    const gh = `${(BK.book && BK.book.repo_url) || ''}/${resolved}`.replace('/tree/', '/blob/');
    return {
      href: gh,
      attrs: `href="${escHtml(gh)}" target="_blank" rel="noopener" class="bk-a-repo" title="No está en el librito — se abre en el repositorio"`,
    };
  }

  function normalizePath(p) {
    const out = [];
    String(p).split('/').forEach(part => {
      if (!part || part === '.') return;
      if (part === '..') out.pop();
      else out.push(part);
    });
    return out.join('/');
  }

  // ── Bloques ───────────────────────────────────────────────────────

  const RE_ITEM   = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const RE_HEAD   = /^(#{1,6})\s+(.*?)\s*#*$/;
  const RE_HR     = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
  const RE_FENCE  = /^\s{0,3}(```+|~~~+)\s*([\w+-]*)\s*$/;

  /** Markdown → { html, toc }. `ctx` = { dir } del documento, para links. */
  function mdToHtml(src, ctx) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    const out   = [];
    const toc   = [];
    const used  = {};
    let i = 0;

    const slugOnce = text => {
      const base = slugify(text);
      used[base] = (used[base] || 0) + 1;
      return used[base] > 1 ? `${base}-${used[base] - 1}` : base;
    };

    while (i < lines.length) {
      const line = lines[i];

      // Code fence
      const fence = line.match(RE_FENCE);
      if (fence) {
        const close = fence[1][0].repeat(3);
        const lang  = fence[2] || '';
        const buf   = [];
        i++;
        while (i < lines.length && !new RegExp(`^\\s{0,3}${close}+\\s*$`).test(lines[i])) {
          buf.push(lines[i]); i++;
        }
        i++;  // cierre
        const label = lang ? `<span class="bk-code-lang">${escHtml(lang)}</span>` : '';
        out.push(`<div class="bk-code">${label}<button class="bk-code-copy" type="button" title="Copiar al portapapeles">copiar</button>` +
                 `<pre><code${lang ? ` class="lang-${escHtml(lang)}"` : ''}>${escHtml(buf.join('\n'))}</code></pre></div>`);
        continue;
      }

      if (!line.trim()) { i++; continue; }

      if (RE_HR.test(line)) { out.push('<hr>'); i++; continue; }

      // Encabezado
      const h = line.match(RE_HEAD);
      if (h) {
        const level = h[1].length;
        const text  = h[2];
        const slug  = slugOnce(stripMd(text));
        // El H1 del .md es el título del documento (ya va en la cabecera del
        // lector): el índice de la página arranca en las secciones ## y ###.
        if (level >= 2 && level <= 3) toc.push({ level, text: stripMd(text), slug });
        out.push(`<h${level} id="${slug}" class="bk-h bk-h${level}">` +
                 `<a class="bk-anchor" href="#${slug}" aria-label="Enlace a esta sección">#</a>` +
                 `${renderInline(text, ctx)}</h${level}>`);
        i++;
        continue;
      }

      // Tabla: fila con pipes + fila delimitadora
      if (line.includes('|') && i + 1 < lines.length && isTableDelim(lines[i + 1])) {
        const head  = splitRow(line);
        const align = splitRow(lines[i + 1]).map(c =>
          /^:-+:$/.test(c.trim()) ? 'center' : /-+:$/.test(c.trim()) ? 'right' : '');
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
          rows.push(splitRow(lines[i])); i++;
        }
        const th = head.map((c, k) =>
          `<th${align[k] ? ` style="text-align:${align[k]}"` : ''}>${renderInline(c, ctx)}</th>`).join('');
        const tb = rows.map(r =>
          `<tr>${head.map((_, k) =>
            `<td${align[k] ? ` style="text-align:${align[k]}"` : ''}>${renderInline(r[k] || '', ctx)}</td>`
          ).join('')}</tr>`).join('');
        out.push(`<div class="bk-table-wrap"><table class="bk-table"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`);
        continue;
      }

      // Blockquote
      if (/^\s{0,3}>/.test(line)) {
        const buf = [];
        while (i < lines.length && (/^\s{0,3}>/.test(lines[i]) || (buf.length && lines[i].trim() && !RE_ITEM.test(lines[i])))) {
          buf.push(lines[i].replace(/^\s{0,3}>\s?/, '')); i++;
        }
        const inner = mdToHtml(buf.join('\n'), ctx);
        out.push(`<blockquote class="bk-quote">${inner.html}</blockquote>`);
        continue;
      }

      // Listas
      if (RE_ITEM.test(line)) {
        const items = [];
        while (i < lines.length) {
          const m = lines[i].match(RE_ITEM);
          if (m) {
            items.push({ indent: m[1].replace(/\t/g, '  ').length,
                         ordered: /\d/.test(m[2]), lines: [m[3]] });
            i++;
            continue;
          }
          if (!lines[i].trim()) {
            // Línea vacía: sigue la lista solo si lo que viene está indentado
            const next = lines[i + 1] || '';
            if (next.trim() && (RE_ITEM.test(next) || /^\s{2,}/.test(next))) { i++; continue; }
            break;
          }
          if (items.length && /^\s{2,}/.test(lines[i])) {          // continuación
            items[items.length - 1].lines.push(lines[i].trim()); i++; continue;
          }
          break;
        }
        out.push(buildList(items, 0, items.length, items[0].indent, ctx).html);
        continue;
      }

      // Párrafo
      const buf = [];
      while (i < lines.length && lines[i].trim() && !RE_HR.test(lines[i]) &&
             !RE_HEAD.test(lines[i]) && !RE_FENCE.test(lines[i]) && !RE_ITEM.test(lines[i]) &&
             !/^\s{0,3}>/.test(lines[i]) &&
             !(lines[i].includes('|') && isTableDelim(lines[i + 1] || ''))) {
        buf.push(lines[i]); i++;
      }
      if (buf.length) out.push(`<p>${renderInline(buf.join('\n'), ctx)}</p>`);
      else i++;
    }

    return { html: out.join('\n'), toc };
  }

  function isTableDelim(l) {
    return /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(l) && l.includes('-') && l.includes('|');
  }

  function splitRow(l) {
    return l.replace(/^\s*\|/, '').replace(/\|\s*$/, '')
            .split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
  }

  /** Construye listas anidadas por indentación. */
  function buildList(items, from, to, indent, ctx) {
    const ordered = items[from] && items[from].ordered;
    const tag  = ordered ? 'ol' : 'ul';
    const html = [];
    let k = from;
    while (k < to) {
      const it = items[k];
      let body = it.lines.join('\n');
      let cls  = '';
      const task = body.match(/^\[([ xX])\]\s+(.*)$/);
      if (task) {
        cls  = ' class="bk-task"';
        body = `<span class="bk-check${/[xX]/.test(task[1]) ? ' on' : ''}"></span>${renderInline(task[2], ctx)}`;
      } else {
        body = renderInline(body, ctx);
      }
      // Sub-lista: ítems siguientes con mayor indentación
      let j = k + 1;
      while (j < to && items[j].indent > it.indent) j++;
      const sub = j > k + 1 ? buildList(items, k + 1, j, items[k + 1].indent, ctx).html : '';
      html.push(`<li${cls}>${body}${sub}</li>`);
      k = j;
    }
    return { html: `<${tag} class="bk-list">${html.join('')}</${tag}>` };
  }

  // ══════════════════════════════════════════════════════════════════
  //  2 · Estado del libro
  // ══════════════════════════════════════════════════════════════════

  const BK = {
    book:     null,
    byId:     {},     // doc_id → { doc, model, chapter }
    flat:     [],     // orden de lectura: [{ id, model, chapter }]
    rendered: {},     // doc_id → { html, toc }
    q:        '',     // búsqueda activa
    view:     'cover',
    docId:    null,
    raw:      false,
  };

  const STAGE_LABEL = {
    production: { label: 'En producción', cls: 'ok' },
    piloto:     { label: 'Piloto',        cls: 'warn' },
    debug:      { label: 'Debug',         cls: 'muted' },
    research:   { label: 'Investigación', cls: 'purple' },
    framework:  { label: 'Framework',     cls: 'info' },
  };

  function el(id) { return document.getElementById(id); }

  // Tipo de documento sintético: no viene de un .md, se arma con las constantes
  // que el backend leyó del código del modelo.
  const SPEC_KIND = {
    kind: 'spec', kind_label: 'Ficha técnica', kind_icon: '⚙',
    kind_hint: 'Qué modelo y pesos usa, cómo procesa los frames y con qué umbrales ' +
               'decide — leído directamente del código, no escrito a mano.',
  };

  function indexBook(book) {
    BK.byId = {}; BK.flat = []; BK.rendered = {};
    book.bodies = book.bodies || {};
    (book.chapters || []).forEach(ch => {
      (ch.models || []).forEach(m => {
        // La ficha técnica se agrega como un doc más del modelo (pestaña,
        // índice, búsqueda y paginador funcionan igual que con los .md).
        const spec = m.spec;
        if (spec && (spec.params || (spec.stack || []).length)) {
          const main = (spec.scripts || [])[0];
          const id   = `spec:${m.dir}`;
          if (!m.docs.some(d => d.id === id)) {
            m.docs.push({
              ...SPEC_KIND,
              id,
              filename: main ? main.file : `${m.short}/*.py`,
              title:    `Ficha técnica — ${m.title}`,
              bytes:    0,
              mtime:    '',
              repo_url: main ? `${m.repo_url}/${main.file}`.replace('/tree/', '/blob/') : m.repo_url,
            });
          }
          // Texto plano equivalente: hace la ficha buscable con el mismo motor
          book.bodies[id] = specSearchText(m);
        }
        (m.docs || []).forEach(d => {
          BK.byId[d.id] = { doc: d, model: m, chapter: ch };
          BK.flat.push({ id: d.id, model: m, chapter: ch });
        });
      });
    });
  }

  /** ¿Este modelo tiene documentación escrita (no solo la ficha automática)? */
  function hasWrittenDocs(m) {
    return (m.docs || []).some(d => d.kind !== 'spec');
  }

  function specSearchText(m) {
    const sp = m.spec || {};
    const out = [m.title, m.tagline, m.detects, (sp.stack || []).join(' ')];
    (sp.scripts || []).forEach(s => {
      out.push(s.file, s.docstring || '');
      (s.constants || []).forEach(c => out.push(`${c.name} = ${c.value}  ${c.comment || ''}`));
      (s.arguments || []).forEach(a => out.push(`${a.flag} ${a.alias} ${a.type} ${a.default}  ${a.help || ''}`));
    });
    out.push((sp.others || []).join(' '));
    return out.filter(Boolean).join('\n');
  }

  function docBody(id) { return (BK.book && BK.book.bodies && BK.book.bodies[id]) || ''; }

  function renderDoc(id) {
    if (!BK.rendered[id]) {
      const info = BK.byId[id];
      if (id.startsWith('spec:')) {
        BK.rendered[id] = renderSpec(info.model);
      } else {
        const dir = id.split('/').slice(0, -1).join('/');
        const res = mdToHtml(docBody(id), { dir, model: info && info.model });
        // El primer H1 se muestra como título del lector: no repetirlo en el cuerpo
        res.html = res.html.replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*/, '');
        BK.rendered[id] = res;
      }
    }
    return BK.rendered[id];
  }

  // ══════════════════════════════════════════════════════════════════
  //  6b · Ficha técnica (generada de las constantes del código)
  // ══════════════════════════════════════════════════════════════════

  /** Devuelve { html, toc } con la ficha técnica del modelo. */
  function renderSpec(m) {
    const sp     = m.spec || {};
    const groups = (BK.book.spec_groups || []).map(g => g);
    const toc    = [];
    const parts  = [];

    parts.push(`<p class="bk-spec-intro">
      Esta ficha se genera <b>leyendo el código del modelo</b> (las constantes de
      configuración declaradas en cada script), no se escribe a mano: si el código
      cambia, la ficha cambia con él. Para el <i>por qué</i> de cada valor, ver la
      guía y el contrato del modelo.</p>`);

    // Stack: modelos y librerías detectadas
    if ((sp.stack || []).length) {
      toc.push({ level: 2, text: 'Modelos y librerías que usa', slug: 'spec-stack' });
      parts.push(`<h2 id="spec-stack" class="bk-h bk-h2">Modelos y librerías que usa</h2>
        <div class="bk-spec-stack">${sp.stack.map(x => `<span class="bk-chip strong">${escHtml(x)}</span>`).join('')}</div>`);
    }

    // Hardware medido (curado en main.py cuando la doc lo reporta)
    if (m.hardware) {
      toc.push({ level: 2, text: 'Hardware y rendimiento', slug: 'spec-hw' });
      parts.push(`<h2 id="spec-hw" class="bk-h bk-h2">Hardware y rendimiento</h2>
        <p>${escHtml(m.hardware)}</p>`);
    }

    // Constantes por script
    (sp.scripts || []).forEach((script, si) => {
      const slug = `spec-${si}-${slugify(script.file)}`;
      toc.push({ level: 2, text: script.file, slug });
      parts.push(`<h2 id="${slug}" class="bk-h bk-h2">${escHtml(script.file)}</h2>`);
      if (script.docstring) parts.push(`<p class="bk-spec-doc">${escHtml(script.docstring)}</p>`);
      const args = script.arguments || [];
      parts.push(`<p class="bk-spec-meta">${script.lines} líneas ·
        ${args.length ? `${args.length} parámetros de arranque · ` : ''}
        ${script.constants.length} constantes
        ${script.skipped ? `· ${script.skipped} valores no literales omitidos` : ''}</p>`);

      // Parámetros de arranque (los detectores del framework Base exponen aquí
      // el modelo, la resolución, las ventanas de frames y los umbrales)
      if (args.length) {
        const aslug = `${slug}-args`;
        toc.push({ level: 3, text: 'Parámetros de arranque (CLI)', slug: aslug });
        parts.push(`<h3 id="${aslug}" class="bk-h bk-h3">Parámetros de arranque (CLI)</h3>
          <div class="bk-table-wrap"><table class="bk-table bk-spec-table bk-spec-args">
            <thead><tr><th>Flag</th><th>Tipo</th><th>Default</th><th>Qué hace</th></tr></thead>
            <tbody>${args.map(a => `<tr>
              <td><code>${escHtml(a.flag)}</code>${a.alias ? ` <span class="bk-spec-alias">${escHtml(a.alias)}</span>` : ''}</td>
              <td><span class="bk-spec-type">${escHtml(a.type || '—')}</span></td>
              <td class="bk-spec-val"><code>${escHtml(a.default)}</code></td>
              <td>${a.help ? escHtml(a.help) : '<span class="bk-spec-nc">sin ayuda en el código</span>'}
                  ${a.choices ? `<div class="bk-spec-choices">opciones: <code>${escHtml(a.choices)}</code></div>` : ''}</td>
            </tr>`).join('')}</tbody>
          </table></div>`);
      }

      groups.forEach(g => {
        const rows = script.constants.filter(c => c.group === g.key);
        if (!rows.length) return;
        const gslug = `${slug}-${g.key}`;
        toc.push({ level: 3, text: g.title, slug: gslug });
        parts.push(`<h3 id="${gslug}" class="bk-h bk-h3">${escHtml(g.title)}</h3>
          <div class="bk-table-wrap"><table class="bk-table bk-spec-table">
            <thead><tr><th>Parámetro</th><th>Valor</th><th>Qué es</th></tr></thead>
            <tbody>${rows.map(c => `<tr>
              <td>${c.scope ? `<span class="bk-spec-scope">${escHtml(c.scope)}.</span>` : ''}<code>${escHtml(c.name)}</code></td>
              <td class="bk-spec-val"><code>${escHtml(c.value)}</code></td>
              <td>${c.comment ? escHtml(c.comment) : '<span class="bk-spec-nc">sin comentario en el código</span>'}</td>
            </tr>`).join('')}</tbody>
          </table></div>`);
      });
    });

    if ((sp.others || []).length) {
      toc.push({ level: 2, text: 'Otros archivos del modelo', slug: 'spec-others' });
      parts.push(`<h2 id="spec-others" class="bk-h bk-h2">Otros archivos del modelo</h2>
        <p class="bk-spec-meta">Scripts de la misma carpeta cuya configuración no se
        desglosa aquí (versiones anteriores, utilidades, entrenamiento):</p>
        <div class="bk-scripts">${sp.others.map(f =>
          `<a href="${escHtml(`${m.repo_url}/${f}`.replace('/tree/', '/blob/'))}"
              target="_blank" rel="noopener"><code>${escHtml(f)}</code></a>`).join('')}</div>`);
    }

    if (!sp.params) {
      parts.push(`<p class="bk-spec-nc">Este modelo no declara constantes de
        configuración en el nivel superior de sus scripts (se configura por
        argumentos de línea de comandos o desde el panel web).</p>`);
    }

    return { html: parts.join('\n'), toc };
  }

  /**
   * Etiqueta de un documento dentro de su modelo. Cuando un modelo tiene dos
   * docs del mismo tipo (p. ej. dos guías), añade el archivo para distinguirlos.
   */
  function docLabel(doc, model) {
    const same = (model.docs || []).filter(d => d.kind === doc.kind);
    if (same.length < 2) return doc.kind_label;
    const stem = doc.filename.replace(/\.md$/i, '');
    return `${doc.kind_label} · ${stem.slice(0, 18)}`;
  }

  function readingMinutes(id) {
    const words = docBody(id).split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 190));
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(iso));
    } catch (e) { return iso.slice(0, 10); }
  }

  function fmtDateTime(iso) {
    if (!iso) return 'nunca';
    try {
      return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
    } catch (e) { return iso; }
  }

  function fmtKB(bytes) {
    if (!bytes) return '—';
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
  }

  // ══════════════════════════════════════════════════════════════════
  //  3 · Búsqueda
  // ══════════════════════════════════════════════════════════════════

  /**
   * Min\u00fasculas sin acentos MANTENIENDO la longitud, para que los \u00edndices del
   * texto plegado sirvan tal cual sobre el original. (normalize('NFD') suelto
   * alarga la cadena por cada acento y desplazaba el resaltado.)
   */
  function fold(s) {
    let out = '';
    for (const ch of String(s)) {
      if (ch.length > 1) { out += ch; continue; }       // par surrogate (emoji): igual
      const base = ch.normalize('NFD')[0] || ch;
      const low  = base.toLowerCase();
      out += low.length === 1 ? low : low[0];
    }
    return out;
  }

  const norm = fold;     // alias para comparaciones de t\u00edtulos y filtros

  function searchBook(q) {
    const needle = norm(q).trim();
    if (needle.length < 2) return [];
    const results = [];
    BK.flat.forEach(({ id, model, chapter }) => {
      const doc  = BK.byId[id].doc;
      const body = docBody(id);
      const hay  = norm(body);
      let hits = 0, from = 0, idx;
      const snippets = [];
      while ((idx = hay.indexOf(needle, from)) !== -1) {
        hits++;
        if (snippets.length < 2) snippets.push(snippetAt(body, idx, needle.length));
        from = idx + needle.length;
        if (hits > 400) break;
      }
      const inTitle = norm(`${model.title} ${doc.title} ${model.tagline} ${chapter.title}`).includes(needle);
      if (hits || inTitle) results.push({ id, model, chapter, doc, hits, snippets, inTitle });
    });
    results.sort((a, b) => (b.inTitle - a.inTitle) || (b.hits - a.hits));
    return results;
  }

  /** Limpia marcas de markdown del contexto del snippet (no del término). */
  function snippetClean(s) {
    return s.replace(/\s+/g, ' ')
            .replace(/[*`#>]+/g, '')
            .replace(/-{3,}/g, '—')
            .replace(/\s*\|\s*/g, ' · ');
  }

  function snippetAt(text, idx, len) {
    const start  = Math.max(0, idx - 70);
    const end    = Math.min(text.length, idx + len + 90);
    const pre    = start > 0 ? '…' : '';
    const post   = end < text.length ? '…' : '';
    const before = snippetClean(text.slice(start, idx));
    const hit    = text.substr(idx, len);          // índices ya alineados por fold()
    const after  = snippetClean(text.slice(idx + len, end));
    return `${escHtml(pre + before)}<mark>${escHtml(hit)}</mark>${escHtml(after + post)}`;
  }

  /** Resalta el término buscado en el documento ya renderizado. */
  function highlightTerm(root, q) {
    const needle = norm(q).trim();
    if (needle.length < 2) return 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.nodeValue.trim() && !/^(MARK|SCRIPT|STYLE)$/.test(n.parentNode.nodeName))
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const targets = [];
    while (walker.nextNode()) targets.push(walker.currentNode);
    let count = 0;
    targets.forEach(node => {
      const raw = node.nodeValue;
      const hay = norm(raw);                     // misma longitud que raw
      if (!hay.includes(needle)) return;
      const frag = document.createDocumentFragment();
      let pos = 0, idx;
      while ((idx = hay.indexOf(needle, pos)) !== -1) {
        if (idx > pos) frag.appendChild(document.createTextNode(raw.slice(pos, idx)));
        const mark = document.createElement('mark');
        mark.className = 'bk-hit';
        mark.textContent = raw.substr(idx, needle.length);
        frag.appendChild(mark);
        count++;
        pos = idx + needle.length;
      }
      frag.appendChild(document.createTextNode(raw.slice(pos)));
      node.parentNode.replaceChild(frag, node);
    });
    return count;
  }

  // ══════════════════════════════════════════════════════════════════
  //  4 · Sidebar (índice del libro)
  // ══════════════════════════════════════════════════════════════════

  function renderSidebar() {
    const box = el('bk-index');
    if (!box || !BK.book) return;
    const needle = norm(BK.q).trim();
    const match  = txt => !needle || norm(txt).includes(needle);
    // Un doc también "coincide" si el término está en su TEXTO, no solo en el
    // título: si no, el índice quedaba vacío mientras había resultados.
    const inBody = needle.length >= 2
      ? new Set(searchBook(BK.q).map(r => r.id))
      : new Set();

    const html = (BK.book.chapters || []).map(ch => {
      const models = (ch.models || []).filter(m =>
        match(`${m.title} ${m.short} ${m.tagline} ${ch.title}`) ||
        (m.docs || []).some(d => match(d.title + ' ' + d.filename) || inBody.has(d.id)));
      if (!models.length) return '';
      return `<div class="bk-idx-chapter">
        <div class="bk-idx-ch-title"><span>${ch.icon}</span>${escHtml(ch.title)}</div>
        ${models.map(m => renderIdxModel(m, ch)).join('')}
      </div>`;
    }).join('');

    box.innerHTML = html || `<div class="bk-idx-empty">Sin resultados para “${escHtml(BK.q)}”</div>`;
  }

  function renderIdxModel(m, ch) {
    const active = BK.docId && (m.docs || []).some(d => d.id === BK.docId);
    if (!m.docs.length) {
      return `<div class="bk-idx-model pending" title="Documentación pendiente">
        <span class="bk-idx-dot"></span>${escHtml(m.short)}
        <span class="bk-idx-pending">pendiente</span></div>`;
    }
    const docs = m.docs.map(d => `
      <a class="bk-idx-doc${d.id === BK.docId ? ' active' : ''}${d.kind === 'spec' ? ' spec' : ''}"
         href="#doc/${encodeURIComponent(d.id)}" title="${escHtml(d.filename)}">
        <span class="bk-idx-kind">${d.kind_icon}</span>${escHtml(docLabel(d, m))}
      </a>`).join('');
    const falta = !hasWrittenDocs(m)
      ? '<span class="bk-idx-pending">guía pendiente</span>' : '';
    return `<div class="bk-idx-model${active ? ' active' : ''}">
      <a class="bk-idx-model-title" href="#doc/${encodeURIComponent(m.docs[0].id)}">${escHtml(m.title)}</a>
      <div class="bk-idx-docs">${docs}${falta}</div>
    </div>`;
  }

  // ══════════════════════════════════════════════════════════════════
  //  5 · Portada + índice general
  // ══════════════════════════════════════════════════════════════════

  function renderCover() {
    const st = BK.book.stats || {};
    const stale = !BK.book.ok;
    el('bk-stage').innerHTML = `
      <div class="bk-cover">
        <div class="bk-cover-plate">
          <div class="bk-cover-kicker">Celestial Dynamics AI · Equipo de Computer Vision</div>
          <h1 class="bk-cover-title">Documentación<br><span>Visión por Computadora</span></h1>
          <div class="bk-cover-sub">
            El recetario de los modelos de Arconte: qué detecta cada uno, con qué
            ingredientes está hecho, qué recibe y qué entrega.
          </div>
          <div class="bk-cover-stats">
            <div class="bk-stat"><b>${st.chapters || 0}</b><span>capítulos</span></div>
            <div class="bk-stat"><b>${st.models || 0}</b><span>modelos</span></div>
            <div class="bk-stat"><b>${st.documents || 0}</b><span>documentos</span></div>
            <div class="bk-stat"><b>${st.specs || 0}</b><span>fichas técnicas</span></div>
            <div class="bk-stat"><b>${st.params || 0}</b><span>parámetros leídos del código</span></div>
          </div>
          <div class="bk-cover-foot">
            ${stale
              ? `<span class="bk-warn">⚠ Repo de modelos no accesible — se muestra el último snapshot (${fmtDateTime(BK.book.synced_at)})</span>`
              : `<span class="bk-sync">● Sincronizado con el repo de modelos · ${fmtDateTime(BK.book.synced_at)}</span>`}
          </div>
        </div>
      </div>

      <div class="bk-toc-general">
        <div class="bk-section-label">Índice</div>
        ${(BK.book.chapters || []).map((ch, ci) => renderChapterCard(ch, ci)).join('')}
      </div>

      <div class="bk-howto">
        <div class="bk-section-label">Cómo leer este librito</div>
        <div class="bk-howto-grid">
          ${Object.entries(BK.book.kinds || {}).map(([k, v]) => `
            <div class="bk-howto-card">
              <div class="bk-howto-h">${v.icon} ${escHtml(v.label)}</div>
              <p>${escHtml(v.hint)}</p>
            </div>`).join('')}
          <div class="bk-howto-card">
            <div class="bk-howto-h">${SPEC_KIND.kind_icon} ${SPEC_KIND.kind_label}</div>
            <p>${escHtml(SPEC_KIND.kind_hint)}</p>
          </div>
          <div class="bk-howto-card">
            <div class="bk-howto-h">🧪 Receta</div>
            <p>Cada modelo abre con su receta: qué detecta, ingredientes (modelos que
               lo componen), entradas y salidas. Es el resumen de una hoja.</p>
          </div>
        </div>
      </div>`;
  }

  function renderChapterCard(ch, ci) {
    const num = String(ci + 1).padStart(2, '0');
    return `<div class="bk-ch-card">
      <div class="bk-ch-head">
        <div class="bk-ch-num">${num}</div>
        <div>
          <div class="bk-ch-title">${ch.icon} ${escHtml(ch.title)}</div>
          <div class="bk-ch-blurb">${escHtml(ch.blurb)}</div>
        </div>
      </div>
      <div class="bk-ch-models">
        ${(ch.models || []).map(m => renderModelRow(m)).join('')}
      </div>
    </div>`;
  }

  function renderModelRow(m) {
    const stage = STAGE_LABEL[m.stage] || STAGE_LABEL.research;
    const badges = (m.docs || []).map(d =>
      `<a class="bk-badge kind-${d.kind}" href="#doc/${encodeURIComponent(d.id)}"
          title="${escHtml(d.kind_hint)}">${d.kind_icon} ${escHtml(docLabel(d, m))}</a>`).join('');
    const pending = !hasWrittenDocs(m);
    // La fila NO puede ser <a>: contiene los enlaces de cada doc y un <a> dentro
    // de otro <a> es HTML inválido (el parser parte el elemento en dos y el
    // layout se rompe). Se usa un div con "enlace extendido": el título cubre
    // toda la fila con ::after y los badges quedan por encima, clicables.
    const title = m.docs.length
      ? `<a class="bk-model-link" href="#doc/${encodeURIComponent(m.docs[0].id)}">${escHtml(m.title)}</a>`
      : escHtml(m.title);
    return `<div class="bk-model-row${pending ? ' pending' : ''}">
      <div class="bk-model-main">
        <div class="bk-model-title">${title}
          <span class="bk-stage ${stage.cls}">${stage.label}</span></div>
        <div class="bk-model-tag">${escHtml(m.tagline || m.detects || 'Sin descripción curada todavía.')}</div>
      </div>
      <div class="bk-model-badges">
        ${badges}${pending ? '<span class="bk-badge pending">guía pendiente</span>' : ''}
      </div>
    </div>`;
  }

  // ══════════════════════════════════════════════════════════════════
  //  6 · Lector de documento
  // ══════════════════════════════════════════════════════════════════

  function renderReader(id, anchor) {
    const info = BK.byId[id];
    if (!info) { location.hash = ''; return; }
    const { doc, model, chapter } = info;
    const stage = STAGE_LABEL[model.stage] || STAGE_LABEL.research;
    const pos   = BK.flat.findIndex(f => f.id === id);
    const prev  = pos > 0 ? BK.flat[pos - 1] : null;
    const next  = pos < BK.flat.length - 1 ? BK.flat[pos + 1] : null;
    const { html, toc } = renderDoc(id);

    const tabs = model.docs.length > 1 ? `<div class="bk-doc-tabs">
      ${model.docs.map(d => `<a class="bk-doc-tab${d.id === id ? ' active' : ''}"
         href="#doc/${encodeURIComponent(d.id)}" title="${escHtml(d.kind_hint)}">
         ${d.kind_icon} ${escHtml(d.kind_label)}
         <span class="bk-doc-tab-file">${escHtml(d.filename)}</span></a>`).join('')}
    </div>` : '';

    // Título: el H1 del propio .md (más específico que el nombre curado, que
    // pasa a ser el "kicker" del capítulo). Ej: "CONTRATO — CONTADOR_V2 · v1.0".
    const headTitle = doc.title && doc.title.length > 3 ? doc.title : model.title;

    el('bk-stage').innerHTML = `
      <div class="bk-progress"><div class="bk-progress-bar" id="bk-progress-bar"></div></div>

      <article class="bk-reader" id="bk-reader">
        <div class="bk-crumb">
          <a href="#">Índice</a> <span>›</span>
          <span>${chapter.icon} ${escHtml(chapter.title)}</span> <span>›</span>
          <b>${escHtml(model.short)}</b>
        </div>

        <header class="bk-doc-head">
          <div class="bk-doc-kicker">${escHtml(model.title)}</div>
          <h1>${escHtml(headTitle)}</h1>
          ${model.tagline ? `<p class="bk-doc-tagline">${escHtml(model.tagline)}</p>` : ''}
          <div class="bk-doc-meta">
            <span class="bk-stage ${stage.cls}">${stage.label}</span>
            <span>${doc.kind_icon} ${escHtml(doc.kind_label)}</span>
            <span title="Archivo en el repo de modelos">📄 ${escHtml(doc.filename)}</span>
            <span>⏱ ${readingMinutes(id)} min de lectura</span>
            ${doc.mtime
              ? `<span title="Última modificación del archivo">🕗 ${fmtDate(doc.mtime)}</span>`
              : '<span title="Se genera leyendo el código, no hay archivo .md">⚙ generada del código</span>'}
          </div>
        </header>

        ${renderRecipe(model)}
        ${tabs}

        <div class="bk-doc-actions">
          <button class="bk-btn" type="button" data-act="copy-link">🔗 Copiar enlace</button>
          <button class="bk-btn" type="button" data-act="print">🖨 Imprimir / PDF</button>
          <button class="bk-btn" type="button" data-act="raw">${BK.raw ? '📖 Ver formateado' : '&lt;/&gt; Ver markdown'}</button>
          <a class="bk-btn" href="${escHtml(doc.repo_url)}" target="_blank" rel="noopener">↗ Ver en el repositorio</a>
        </div>

        ${toc.length > 2 ? `<nav class="bk-inpage">
          <div class="bk-inpage-title">En esta página</div>
          <ol>${toc.map(t => `<li class="lvl${t.level}"><a href="#" data-anchor="${escHtml(t.slug)}">${escHtml(t.text)}</a></li>`).join('')}</ol>
        </nav>` : ''}

        <div class="bk-body${BK.raw ? ' raw' : ''}" id="bk-body">
          ${BK.raw ? `<pre class="bk-raw">${escHtml(docBody(id))}</pre>` : html}
        </div>

        <nav class="bk-pager">
          ${prev ? pagerLink(prev, 'Anterior', '‹') : '<span></span>'}
          ${next ? pagerLink(next, 'Siguiente', '›') : '<span></span>'}
        </nav>
      </article>`;

    if (BK.q && !BK.raw) {
      const n = highlightTerm(el('bk-body'), BK.q);
      if (n) {
        const first = el('bk-body').querySelector('mark.bk-hit');
        if (first && !anchor) setTimeout(() => first.scrollIntoView({ block: 'center' }), 40);
      }
    }
    wireReader();
    if (anchor) scrollToAnchor(anchor);
    else if (!BK.q) window.scrollTo({ top: 0 });
  }

  function pagerLink(f, label, chev) {
    const d = BK.byId[f.id].doc;
    const right = label === 'Siguiente';
    return `<a class="bk-pager-link${right ? ' right' : ''}" href="#doc/${encodeURIComponent(f.id)}">
      <span class="bk-pager-label">${right ? `${label} ${chev}` : `${chev} ${label}`}</span>
      <span class="bk-pager-title">${escHtml(f.model.short)} · ${escHtml(d.kind_label)}</span>
    </a>`;
  }

  /** La "receta" del modelo: resumen de una hoja antes del documento. */
  function renderRecipe(m) {
    const rows = [
      ['Qué detecta', m.detects],
      ['Entradas',    m.inputs],
      ['Salidas',     m.outputs],
    ].filter(r => r[1]);
    if (!rows.length && !(m.ingredients || []).length) return '';
    return `<section class="bk-recipe">
      <div class="bk-recipe-label">Ficha del modelo</div>
      <div class="bk-recipe-grid">
        ${rows.map(([k, v]) => `<div class="bk-recipe-row">
          <div class="bk-recipe-k">${k}</div><div class="bk-recipe-v">${escHtml(v)}</div></div>`).join('')}
        ${(m.ingredients || []).length ? `<div class="bk-recipe-row">
          <div class="bk-recipe-k">Ingredientes</div>
          <div class="bk-recipe-v">${m.ingredients.map(g => `<span class="bk-chip">${escHtml(g)}</span>`).join('')}</div>
        </div>` : ''}
        ${(m.scripts || []).length ? `<div class="bk-recipe-row">
          <div class="bk-recipe-k">Scripts</div>
          <div class="bk-recipe-v bk-scripts">${m.scripts.map(s => `<code>${escHtml(s)}</code>`).join('')}</div>
        </div>` : ''}
      </div>
    </section>`;
  }

  function wireReader() {
    const stage = el('bk-stage');

    stage.querySelectorAll('[data-anchor]').forEach(a => {
      a.addEventListener('click', ev => {
        ev.preventDefault();
        scrollToAnchor(a.dataset.anchor);
      });
    });

    stage.querySelectorAll('.bk-code-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.parentNode.querySelector('code');
        navigator.clipboard.writeText(code.textContent).then(() => {
          btn.textContent = '✓ copiado';
          setTimeout(() => { btn.textContent = 'copiar'; }, 1200);
        }).catch(() => {});
      });
    });

    stage.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'print') window.print();
        if (act === 'copy-link') {
          navigator.clipboard.writeText(location.href).then(() => {
            btn.textContent = '✓ Copiado';
            setTimeout(() => { btn.textContent = '🔗 Copiar enlace'; }, 1400);
          }).catch(() => {});
        }
        if (act === 'raw') { BK.raw = !BK.raw; renderReader(BK.docId); }
      });
    });

    // Barra de progreso de lectura
    const bar = el('bk-progress-bar');
    if (bar) {
      const onScroll = () => {
        const h = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = `${h > 0 ? Math.min(100, (window.scrollY / h) * 100) : 0}%`;
      };
      window.removeEventListener('scroll', BK._onScroll || (() => {}));
      BK._onScroll = onScroll;
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  /** Scroll a un heading por slug, tolerante a acentos/variantes del .md. */
  function scrollToAnchor(slug) {
    const body = el('bk-body');
    if (!body) return;
    let target = body.querySelector(`[id="${CSS.escape(slug)}"]`);
    if (!target) {
      const want = norm(slug).replace(/-/g, '');
      target = Array.from(body.querySelectorAll('.bk-h')).find(h => {
        const id = norm(h.id).replace(/-/g, '');
        return id === want || id.endsWith(want) || id.includes(want);
      });
    }
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 78;
    window.scrollTo({ top, behavior: 'smooth' });
    target.classList.add('bk-flash');
    setTimeout(() => target.classList.remove('bk-flash'), 1400);
  }

  // ══════════════════════════════════════════════════════════════════
  //  7 · Vista de resultados de búsqueda
  // ══════════════════════════════════════════════════════════════════

  function renderSearch() {
    const results = searchBook(BK.q);
    const total   = results.reduce((a, r) => a + r.hits, 0);
    el('bk-stage').innerHTML = `
      <div class="bk-search-head">
        <div class="bk-section-label">Búsqueda</div>
        <h2>“${escHtml(BK.q)}”</h2>
        <p>${results.length
              ? `${total} coincidencia${total === 1 ? '' : 's'} en ${results.length} documento${results.length === 1 ? '' : 's'}`
              : 'Sin coincidencias en el librito.'}</p>
      </div>
      <div class="bk-results">
        ${results.map(r => `
          <a class="bk-result" href="#doc/${encodeURIComponent(r.id)}">
            <div class="bk-result-top">
              <span class="bk-result-model">${escHtml(r.model.title)}</span>
              <span class="bk-badge kind-${r.doc.kind}">${r.doc.kind_icon} ${escHtml(r.doc.kind_label)}</span>
              <span class="bk-result-hits">${r.hits ? `${r.hits} coincidencia${r.hits === 1 ? '' : 's'}` : 'coincide el título'}</span>
            </div>
            ${r.snippets.map(s => `<div class="bk-result-snippet">${s}</div>`).join('')}
          </a>`).join('')}
      </div>`;
    window.scrollTo({ top: 0 });
  }

  // ══════════════════════════════════════════════════════════════════
  //  8 · Ruteo por hash + arranque
  // ══════════════════════════════════════════════════════════════════

  function applyRoute() {
    if (!BK.book) return;
    const hash = decodeURIComponent((location.hash || '').replace(/^#/, ''));

    if (hash.startsWith('doc/')) {
      const rest = hash.slice(4);
      const [id, anchor] = rest.split('::');
      if (BK.byId[id]) {
        BK.view = 'doc'; BK.docId = id;
        renderReader(id, anchor);
        renderSidebar();
        closeSidebarOnMobile();
        return;
      }
    }
    // #modelo/<dir> — abre el primer doc de ese modelo. Lo usa la seccion de
    // Requerimientos para enlazar cada caso de uso con su modelo.
    if (hash.startsWith('modelo/')) {
      const dir  = hash.slice(7);
      const hit  = BK.flat.find(f => f.model.dir === dir);
      if (hit) { location.replace(`#doc/${encodeURIComponent(hit.id)}`); return; }
    }

    // #buscar/<término> — resultados enlazables (se puede compartir la URL)
    if (hash === 'buscar' || hash.startsWith('buscar/')) {
      const q = hash.startsWith('buscar/') ? hash.slice(7) : BK.q;
      if (q) {
        BK.q = q;
        const input = el('bk-search');
        if (input && input.value !== q) input.value = q;
        BK.view = 'search'; BK.docId = null;
        renderSearch(); renderSidebar();
        return;
      }
    }
    BK.view = 'cover'; BK.docId = null; BK.raw = false;
    renderCover(); renderSidebar();
  }

  function closeSidebarOnMobile() {
    if (window.matchMedia('(max-width: 900px)').matches) {
      document.body.classList.remove('bk-side-open');
    }
  }

  function wireShell() {
    const input = el('bk-search');
    if (input) {
      let t = null;
      input.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          BK.q = input.value.trim();
          renderSidebar();
          const target = `#buscar/${encodeURIComponent(BK.q)}`;
          if (BK.q.length >= 2) {
            if (location.hash.startsWith('#doc/')) applyRoute();   // re-resalta en el doc abierto
            else if (location.hash !== target) location.hash = target;
            else renderSearch();
          } else if (location.hash.startsWith('#buscar')) {
            location.hash = '';
          } else if (location.hash.startsWith('#doc/')) {
            applyRoute();
          }
        }, 180);
      });
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') {
          input.value = ''; BK.q = ''; renderSidebar();
          if (location.hash.startsWith('#buscar')) location.hash = '';
        }
      });
    }

    const toggle = el('bk-side-toggle');
    if (toggle) toggle.addEventListener('click', () => document.body.classList.toggle('bk-side-open'));

    const refresh = el('bk-refresh');
    if (refresh) refresh.addEventListener('click', () => loadBook(true));

    document.addEventListener('keydown', ev => {
      const tag = (ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (ev.key === '/') { ev.preventDefault(); const i = el('bk-search'); if (i) i.focus(); }
      if (BK.view === 'doc' && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
        const pos = BK.flat.findIndex(f => f.id === BK.docId);
        if (ev.key === 'ArrowLeft'  && pos > 0) location.hash = `doc/${encodeURIComponent(BK.flat[pos - 1].id)}`;
        if (ev.key === 'ArrowRight' && pos > -1 && pos < BK.flat.length - 1) location.hash = `doc/${encodeURIComponent(BK.flat[pos + 1].id)}`;
      }
    });

    window.addEventListener('hashchange', applyRoute);
  }

  async function loadBook(refresh) {
    const stage = el('bk-stage');
    if (stage && !BK.book) stage.innerHTML = '<div class="bk-loading">Abriendo el librito…</div>';
    try {
      const res  = await fetch(`/api/docs/catalog?refresh=${refresh ? 1 : 0}`);
      const book = await res.json();
      BK.book = book;
      indexBook(book);
      renderStatus();
      applyRoute();
    } catch (e) {
      if (stage) stage.innerHTML = `<div class="bk-loading err">⚠ No se pudo cargar la documentación.<br>
        <small>${escHtml(e.message || e)}</small></div>`;
    }
  }

  function renderStatus() {
    const box = el('bk-status-text');
    if (!box || !BK.book) return;
    const st = BK.book.stats || {};
    box.innerHTML = BK.book.ok
      ? `<span class="bk-sync-dot ok"></span>${st.documents || 0} docs · ${fmtDateTime(BK.book.synced_at)}`
      : `<span class="bk-sync-dot bad"></span>snapshot del ${fmtDateTime(BK.book.synced_at)}`;
    box.parentNode.title = BK.book.ok
      ? `Leído en vivo de ${BK.book.source}`
      : `Repo de modelos no accesible: ${BK.book.error || 'desconocido'}`;
  }

  // Handle de depuración desde la consola del navegador (y para tests headless):
  //   CVBook.mdToHtml('# hola')  ·  CVBook.BK.book.stats
  window.CVBook = { BK, mdToHtml, slugify, searchBook, indexBook, loadBook, renderDoc, renderSpec };

  window.addEventListener('DOMContentLoaded', () => {
    if (!el('bk-stage')) return;      // no es la página del librito
    wireShell();
    loadBook(false);
  });
})();
