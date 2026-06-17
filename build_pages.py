# -*- coding: utf-8 -*-
"""
build_pages.py — Parte main.html (una sola página con scroll) en una NUEVA versión
multipágina: una página .html por sección, con estilo y lógica compartidos.

Genera:
  assets/app.css      estilos (compartido)
  assets/app.js       lógica (compartido) con init defensivo por sección
  assets/chrome.html  header + nav + modales + footer (fuente única, se inyecta)
  inicio.html organigrama.html vision.html proyectos.html
  tareas.html planificador.html bitacora.html

No toca index.html, app.html ni main.html (quedan como respaldo).
"""
import io, re

def read(p):
    return io.open(p, 'r', encoding='utf-8').read()

def write(p, s):
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)

src = read('main.html')

# ── 1) CSS ────────────────────────────────────────────────────────────────
css = src[src.index('<style>')+len('<style>'): src.index('</style>')]

# ── 2) Scripts (hay 3 bloques <script>) ────────────────────────────────────
scripts = re.findall(r'<script>(.*?)</script>', src, flags=re.S)
assert len(scripts) == 3, f"esperaba 3 <script>, hay {len(scripts)}"
s1, s2, s3 = scripts   # s1: fecha footer · s2: app · s3: dashboard (IIFE)

# ── 3) Chrome: modales + header + nav  y  footer ───────────────────────────
top = src[src.index('<!-- Soft-delete modal -->'): src.index('</nav>')+len('</nav>')]
footer = src[src.index('<footer class="page-footer">'): src.index('</footer>')+len('</footer>')]

# reescribir enlaces del nav: #sec-X  ->  /pagina.html
NAV_MAP = {
    '#sec-dashboard':    '/inicio.html',
    '#sec-organigrama':  '/organigrama.html',
    '#sec-vision':       '/vision.html',
    '#sec-proyectos':    '/proyectos.html',
    '#sec-tareas':       '/tareas.html',
    '#sec-planificador': '/planificador.html',
    '#sec-bitacora':     '/bitacora.html',
}
for a, b in NAV_MAP.items():
    top = top.replace('href="%s"' % a, 'href="%s"' % b)

chrome_html = top + '\n\n<!-- @FOOT -->\n' + footer + '\n'

# ── 4) Extraer cada sección (div balanceado) ───────────────────────────────
def extract_div(html, start_idx):
    """Devuelve el <div ...>...</div> balanceado que empieza en start_idx."""
    toks = list(re.finditer(r'<div\b|</div>', html[start_idx:]))
    depth = 0
    for m in toks:
        depth += 1 if m.group() == '<div' else -1
        if depth == 0:
            return html[start_idx: start_idx + m.end()]
    raise RuntimeError('div no balanceado')

SECTIONS = {}
for sid in ['sec-dashboard','sec-organigrama','sec-vision','sec-proyectos',
            'sec-tareas','sec-planificador','sec-bitacora']:
    i = src.index('<div class="section" id="%s"' % sid)
    SECTIONS[sid] = extract_div(src, i)

# ── 5) app.js: concatenar + ediciones de init defensivo ────────────────────
# 5a) footer-date (s1): guardar por si el elemento no existe aún
s1 = s1.replace(
    "document.getElementById('footer-date').textContent = fmt.format(now);",
    "var _fdEl = document.getElementById('footer-date'); if (_fdEl) _fdEl.textContent = fmt.format(now);")

# 5b) orquestación de loadProjects: ejecutar solo el render de la sección presente
old_orch = """      syncPfPanel();
      renderDynamicProjects();
      renderPlannerProjectBtns();
      refreshImportProjectSel();
      renderNewProjBtn();
      Object.keys(PF_PANEL).forEach(pid => renderPlatformRoadmap(pid));
      renderPlanner();
      refreshWeekView();
      ['arconte','arconte_retail','publicvector'].forEach(applyStaticMetrics);
      ['arconte','arconte_retail'].forEach(applyCamerasCount);"""
new_orch = """      syncPfPanel();
      const _has = id => !!document.getElementById(id);
      if (_has('dyn-projects-grid')) {            // pagina Proyectos
        renderDynamicProjects();
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
      }"""
assert old_orch in s2, "no encontré la orquestación de loadProjects"
s2 = s2.replace(old_orch, new_orch, 1)

# 5c) boot: inyectar chrome (header/nav/modales/footer) y despachar por pagina
old_boot = """  window.addEventListener('DOMContentLoaded', () => {
    updateAdminUI();
    loadProjects();
    loadVotes();
    initNavSpy();
  });"""
new_boot = """  async function injectChrome() {
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
    const path = (location.pathname || '').replace(/\\/+$/, '');
    document.querySelectorAll('.page-nav a').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (href === path || ((path === '' || path === '/index.html') && href === '/inicio.html')) {
        a.classList.add('nav-active');
      }
    });
  }

  window.addEventListener('DOMContentLoaded', async () => {
    await injectChrome();
    updateAdminUI();
    loadVotes();
    const page = (document.body.dataset.page) || '';
    if (page === 'proyectos' || page === 'tareas' || page === 'planificador') loadProjects();
  });"""
assert old_boot in s2, "no encontré el bloque DOMContentLoaded original"
s2 = s2.replace(old_boot, new_boot, 1)

# 5d) dashboard (s3): quitar Equipo del render (ya está en Organigrama)
s3 = s3.replace("    renderAreasAcuerdos(model) +\n    renderEquipo();",
                "    renderAreasAcuerdos(model);")
assert "renderEquipo()" not in s3.split('function renderEquipo')[0], "renderEquipo aún se llama"

# 5e) dashboard (s3): arrancar SOLO si existe #dash-root (pagina Inicio)
s3 = s3.replace("(async function () {\n  await loadAll();\n  render();",
                "(async function () {\n  if (!document.getElementById('dash-root')) return;\n  await loadAll();\n  render();")

app_js = ("// ════════════════════════════════════════════════════════════════════\n"
          "//  CV Celestial — lógica compartida (multipágina). Generado por build_pages.py\n"
          "// ════════════════════════════════════════════════════════════════════\n"
          + s1 + "\n" + s2 + "\n" + s3 + "\n")

# ── 6) escribir assets ─────────────────────────────────────────────────────
import os
os.makedirs('assets', exist_ok=True)
write('assets/app.css', css)
write('assets/app.js', app_js)
write('assets/chrome.html', chrome_html)

# ── 7) páginas ─────────────────────────────────────────────────────────────
PAGES = [
    ('inicio',       'Inicio',              'sec-dashboard'),
    ('organigrama',  'Organigrama',         'sec-organigrama'),
    ('vision',       'Visión',              'sec-vision'),
    ('proyectos',    'Proyectos',           'sec-proyectos'),
    ('tareas',       'Tareas por semana',   'sec-tareas'),
    ('planificador', 'Planificador Semanal','sec-planificador'),
    ('bitacora',     'Bitácora',            'sec-bitacora'),
]
PAGE_TMPL = """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CV Celestial — {title}</title>
  <link rel="stylesheet" href="/assets/app.css" />
</head>
<body data-page="{page}">
  <div id="app-top"></div>

  <div class="container">
{section}
  </div><!-- /container -->

  <div id="app-foot"></div>

  <script src="/assets/app.js"></script>
</body>
</html>
"""
for page, title, sid in PAGES:
    write('%s.html' % page, PAGE_TMPL.format(title=title, page=page, section=SECTIONS[sid]))

print('OK — generado:')
print('  assets/app.css   ', len(css), 'bytes')
print('  assets/app.js    ', len(app_js), 'bytes')
print('  assets/chrome.html', len(chrome_html), 'bytes')
for page, _, sid in PAGES:
    print('  %-16s sección %-16s %d bytes' % (page+'.html', sid, len(SECTIONS[sid])))
